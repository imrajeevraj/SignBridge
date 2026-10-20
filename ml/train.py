"""Train on audited local clips; export safetensors with held-out signer evidence."""
import argparse
import copy
import json
from pathlib import Path
import random
import time
import numpy as np
import torch
from safetensors.torch import save_file
from backend.app.inference.contracts import GRUConfig, ModelMetadata, SCHEMA_WIDTHS, labels_hash
from backend.app.inference.gru import SignGRU
from .dataset import load_dataset, digest, statistics
from .metrics import classification_metrics, calibration_metrics


def clip_logits(model, clips, device, *, aggregate=True):
    # Average window logits within each clip; do not inflate test count with overlaps.
    values = []; targets = []; times = []
    model.eval()
    with torch.inference_mode():
        for clip in clips:
            per_window = []
            for window in clip['x']:
                start = time.perf_counter()
                value = model(torch.from_numpy(window[None]).to(device))
                if device.type == 'cuda': torch.cuda.synchronize()
                times.append((time.perf_counter()-start)*1000)
                per_window.append(value.cpu())
            if aggregate:
                values.append(torch.cat(per_window).mean(0)); targets.append(clip['target'])
            else:
                values.extend(torch.cat(per_window)); targets.extend([clip['target']]*len(per_window))
    return torch.stack(values), torch.tensor(targets), times


def train(manifest_path, output, *, epochs=100, batch_size=32, patience=12, seed=42,
          learning_rate=0.001, device='cpu', config=None, allow_test_fixture=False, neutral_label=None):
    if epochs < 1 or batch_size < 1 or patience < 1 or learning_rate <= 0:
        raise ValueError('Invalid training configuration.')
    manifest, clips, dataset_sha = load_dataset(manifest_path, allow_test_fixture=allow_test_fixture)
    output = Path(output)
    if output.exists(): raise ValueError('Use a new output directory; existing model packages are never overwritten.')
    if neutral_label is not None and neutral_label not in manifest['labels']: raise ValueError('Unknown neutral label.')
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    torch.set_num_threads(2); torch.use_deterministic_algorithms(True)
    target_device = torch.device(device)
    if target_device.type not in ('cpu', 'cuda') or (target_device.type == 'cuda' and not torch.cuda.is_available()):
        raise ValueError('Requested device unavailable; CPU is supported.')
    config = config or GRUConfig()
    schema = manifest['feature_schema']; width = SCHEMA_WIDTHS[schema]
    model = SignGRU(len(manifest['labels']), config, width).to(target_device)
    training = [c for c in clips if c['split']=='train']
    x = torch.from_numpy(np.concatenate([c['x'] for c in training]))
    y = torch.tensor([c['target'] for c in training for _ in c['x']])
    counts = torch.bincount(y, minlength=len(manifest['labels'])).float()
    weights = (len(y) / (len(manifest['labels']) * torch.clamp(counts, min=1.0))).to(target_device)
    loader = torch.utils.data.DataLoader(torch.utils.data.TensorDataset(x,y), batch_size=batch_size, shuffle=True,
        generator=torch.Generator().manual_seed(seed), num_workers=0)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=0.0001)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=4, factor=0.5)
    best = float('inf'); best_state = None; stale = 0; history=[]
    for epoch in range(epochs):
        model.train(); total = 0.0
        for features, target in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = torch.nn.functional.cross_entropy(model(features.to(target_device)), target.to(target_device), weight=weights)
            if not torch.isfinite(loss): raise ValueError('Non-finite training loss.')
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimizer.step()
            total += float(loss.detach()) * len(target)
        logits, targets, _ = clip_logits(model, [c for c in clips if c['split']=='validation'], target_device)
        validation_loss = float(torch.nn.functional.cross_entropy(logits, targets))
        history.append({'epoch': epoch+1, 'train_loss': total/len(y), 'validation_loss': validation_loss})
        scheduler.step(validation_loss)
        if validation_loss < best:
            best = validation_loss; best_state = copy.deepcopy(model.cpu().state_dict()); model.to(target_device); stale = 0
        else: stale += 1
        if stale >= patience: break
    model.load_state_dict(best_state)
    validation, targets, _ = clip_logits(model, [c for c in clips if c['split']=='validation'], target_device, aggregate=False)
    # Finite deterministic temperature grid fits validation NLL only; never test data.
    temperatures = np.geomspace(0.5, 5, 41)
    temperature = float(min(temperatures, key=lambda t: float(torch.nn.functional.cross_entropy(validation/float(t), targets))))
    probabilities = (validation/temperature).softmax(-1)
    confidence, predicted = probabilities.max(-1)
    threshold = 0.8; calibrated = False
    neutral_idx = manifest['labels'].index(neutral_label) if neutral_label else None
    for candidate in np.arange(0.8, 1.0, 0.01):
        is_acc = (confidence >= candidate)
        if neutral_idx is not None: is_acc &= (predicted != neutral_idx)
        if int(is_acc.sum()) >= 5 and float((predicted[is_acc]==targets[is_acc]).float().mean()) >= 0.9:
            threshold = float(candidate); calibrated = True; break
    test, targets, times = clip_logits(model, [c for c in clips if c['split']=='test'], target_device)
    probabilities = (test/temperature).softmax(-1); confidence, predicted = probabilities.max(-1)
    evaluation = classification_metrics(targets.tolist(), predicted.tolist(), manifest['labels'])
    window_test,window_targets,_=clip_logits(model,[c for c in clips if c['split']=='test'],target_device,aggregate=False)
    window_probabilities=(window_test/temperature).softmax(-1)
    evaluation['window_metrics']=classification_metrics(window_targets.tolist(),window_probabilities.argmax(-1).tolist(),manifest['labels'])
    evaluation['clip_calibration']=calibration_metrics(probabilities.numpy(),targets.numpy())
    evaluation['window_calibration']=calibration_metrics(window_probabilities.numpy(),window_targets.numpy())
    evaluation['feature_schema']=schema
    evaluation['preprocessing']=manifest['preprocessing']
    evaluation['sampling_hz']=manifest.get('sampling_hz',15)
    evaluation['extractor_sha256']=manifest['extractor_sha256']
    evaluation['test_predictions']=[dict(id=clip['id'],signer_id=clip['signer_id'],truth=clip['label'],
        predicted=manifest['labels'][int(predicted[i])],confidence=float(confidence[i]))
        for i,clip in enumerate(c for c in clips if c['split']=='test')]
    accepted = confidence >= threshold
    neutral_index = manifest['labels'].index(neutral_label) if neutral_label else None
    if neutral_index is not None: accepted &= predicted != neutral_index
    neutral = targets == neutral_index if neutral_index is not None else torch.zeros_like(targets, dtype=torch.bool)
    evaluation.update(dataset_sha256=dataset_sha, labels_sha256=labels_hash(manifest['labels']), signer_independent=True,
        test_samples=len(targets), unit='clips; mean logits across overlapping windows', dataset_statistics=statistics(manifest,clips),
        purpose=manifest['purpose'], history=history, seed=seed, device=str(target_device), torch=torch.__version__,
        temperature=temperature, confidence_threshold=threshold, calibrated=calibrated,
        calibration_scope='Closed-set validation windows (correlated within clips), matching live window logits. Unknown signs have not been calibrated.',
        accepted_coverage=float(accepted.float().mean()), accepted_accuracy=float((predicted[accepted]==targets[accepted]).float().mean()) if accepted.any() else None,
        unknown_rejection=None, neutral_false_positive_rate=float(accepted[neutral].float().mean()) if neutral.any() else None,
        inference_median_ms=float(np.median(times)), inference_p95_ms=float(np.percentile(times,95)),
        training_config={'epochs': epochs,'batch_size':batch_size,'patience':patience,'learning_rate':learning_rate,'gru':config.model_dump()})
    output.mkdir(parents=True)
    (output/'evaluation.json').write_text(json.dumps(evaluation,indent=2),encoding='utf-8')
    save_file({k:v.cpu().contiguous() for k,v in model.state_dict().items()}, output/'weights.safetensors',
              metadata={'feature_schema':schema, 'labels_sha256':labels_hash(manifest['labels'])})
    metadata = ModelMetadata(model_id='signbridge-custom-gru',model_version='1',architecture='custom_gru',language=manifest['language'],
        feature_schema=schema,shape=(32,width),sampling_hz=manifest.get('sampling_hz',15),config=config.model_dump(),labels=manifest['labels'],labels_sha256=labels_hash(manifest['labels']),
        checkpoint_sha256=digest(output/'weights.safetensors'), evaluation_sha256=digest(output/'evaluation.json'),dataset_sha256=dataset_sha,
        source=manifest['source'],license=manifest['license'],purpose='test_fixture' if manifest['purpose']=='test_fixture' else 'trained',
        neutral_label=neutral_label,confidence_threshold=threshold,temperature=temperature,calibrated=calibrated)
    (output/'metadata.json').write_text(metadata.model_dump_json(indent=2),encoding='utf-8')
    (output/'labels.json').write_text(json.dumps(manifest['labels'],indent=2),encoding='utf-8')
    (output/'LICENSE-NOTES.md').write_text(
        '# Local model provenance\n\nSource: '+manifest['source']+'\n\nDataset terms: '+manifest['license']+
        '\n\nPurpose: '+metadata.purpose+'. Dataset terms remain applicable; no additional redistribution or commercial permission is granted.\n',encoding='utf-8')
    (output/'CHECKSUMS.sha256').write_text(''.join(
        f'{digest(output/name)}  {name}\n' for name in
        ('weights.safetensors','metadata.json','evaluation.json','labels.json','LICENSE-NOTES.md')),encoding='utf-8')
    return evaluation


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest',type=Path); parser.add_argument('output',type=Path)
    parser.add_argument('--epochs',type=int,default=100); parser.add_argument('--batch-size',type=int,default=32)
    parser.add_argument('--patience',type=int,default=12); parser.add_argument('--seed',type=int,default=42)
    parser.add_argument('--learning-rate',type=float,default=.001); parser.add_argument('--device',choices=['cpu','cuda'],default='cpu')
    parser.add_argument('--hidden-size',type=int,default=128); parser.add_argument('--layers',type=int,default=2)
    parser.add_argument('--dropout',type=float,default=.2); parser.add_argument('--neutral-label')
    args=parser.parse_args(); values=vars(args)
    config=GRUConfig(hidden_size=values.pop('hidden_size'),num_layers=values.pop('layers'),dropout=values.pop('dropout'))
    report=train(values.pop('manifest'),values.pop('output'),config=config,**values)
    print(json.dumps({k:report[k] for k in ('test_samples','top1','macro_f1','calibrated')}))


if __name__=='__main__': main()
