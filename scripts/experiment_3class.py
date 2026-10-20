import json
from pathlib import Path
import numpy as np
import torch
from backend.app.inference.contracts import GRUConfig, SCHEMA_WIDTHS
from backend.app.inference.gru import SignGRU
from ml.dataset import validate_window

def load_clip(path, schema='signbridge.custom-gru.v2'):
    data = json.load(open(path))
    windows = [validate_window(w, schema) for w in data['windows']]
    return np.stack(windows)

def run():
    known = json.load(open('.cache/phase3-completion/isl500-known-merged/manifest.json'))
    known_dir = Path('.cache/phase3-completion/isl500-known-merged')
    clips = []
    for s in known['samples']:
        x = load_clip(known_dir / s['feature_path'])
        clips.append({
            'id': s['id'], 'label': s['label'], 'signer_id': s['signer_id'],
            'duplicate_group': s['duplicate_group'], 'split': s['split'],
            'x': x, 'target': 0 if s['label'] == 'Family' else 1
        })

    # NO_SIGN train: User001-Sit, User001-Water, User003-Goodmorning, User005-Goodmorning
    for p, sid in [
        ('.cache/phase3-sit-water/clip-0.json', 'User001-Sit'),
        ('.cache/phase3-sit-water/clip-1.json', 'User001-Water'),
        ('.cache/phase3-goodmorning-train/clip-1.json', 'User003-Goodmorning'),
        ('.cache/phase3-goodmorning-train/clip-3.json', 'User005-Goodmorning'),
    ]:
        x = load_clip(p)
        clips.append({
            'id': sid, 'label': 'NO_SIGN', 'signer_id': sid.split('-')[0],
            'duplicate_group': f'negative/{sid}', 'split': 'train',
            'x': x, 'target': 2
        })

    # NO_SIGN validation: User010-Goodmorning, User012-Goodmorning
    for p, sid in [
        ('.cache/phase3-goodmorning-eval/clip-1.json', 'User010-Goodmorning'),
        ('.cache/phase3-goodmorning-eval/clip-3.json', 'User012-Goodmorning'),
    ]:
        x = load_clip(p)
        clips.append({
            'id': sid, 'label': 'NO_SIGN', 'signer_id': sid.split('-')[0],
            'duplicate_group': f'negative/{sid}', 'split': 'validation',
            'x': x, 'target': 2
        })

    splits = {sp: [c for c in clips if c['split'] == sp] for sp in ('train', 'validation', 'test')}
    for sp, cs in splits.items():
        print(f"Split {sp}: {len(cs)} clips, {sum(len(c['x']) for c in cs)} windows")

    # Train model with class-balanced weights
    torch.manual_seed(42)
    np.random.seed(42)
    config = GRUConfig(hidden_size=128, num_layers=2, dropout=0.2)
    model = SignGRU(3, config, input_size=172)
    
    training = splits['train']
    x_train = torch.from_numpy(np.concatenate([c['x'] for c in training]))
    y_train = torch.tensor([c['target'] for c in training for _ in c['x']])
    
    # Class weights: inverse frequency
    counts = [(y_train == i).sum().item() for i in range(3)]
    weights = torch.tensor([max(counts) / c for c in counts], dtype=torch.float32)
    print(f"Class counts: {counts}, weights: {weights.tolist()}")
    
    loader = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(x_train, y_train),
        batch_size=32, shuffle=True
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)

    for epoch in range(80):
        model.train()
        for bx, by in loader:
            optimizer.zero_grad()
            loss = torch.nn.functional.cross_entropy(model(bx), by, weight=weights)
            loss.backward()
            optimizer.step()

    model.eval()
    with torch.inference_mode():
        # Centroids in penultimate 64-d space
        penultimate = model.head[:2] # Linear(128, 64), ReLU
        def get_features(x_np):
            with torch.inference_mode():
                _, h = model.gru(torch.from_numpy(x_np))
                return penultimate(h[-1])

        train_feats = {i: [] for i in range(3)}
        for c in training:
            f = get_features(c['x'])
            train_feats[c['target']].append(f)
        centroids = {i: torch.cat(train_feats[i]).mean(0) for i in range(3)}
        labels = ['Family', 'Goodafternoon', 'NO_SIGN']
        for i in range(3):
            # compute max distance in training set
            dists = [torch.norm(f - centroids[i], dim=-1).max().item() for f in train_feats[i]]
            print(f'Train class {i} ({labels[i]}) max centroid dist: {max(dists):.2f}, mean dist: {np.mean(dists):.2f}')

        print("\n--- TEST KNOWN CLIPS DISTANCES ---")
        for c in splits['test']:
            feats = get_features(c['x'])
            logits = model(torch.from_numpy(c['x']))
            probs = logits.softmax(-1)
            pred = probs.argmax(-1)
            for j, p in enumerate(pred):
                d = torch.norm(feats[j] - centroids[p.item()]).item()
                print(f"  {c['id']} w{j} (true {c['label']}) -> pred {labels[p.item()]} prob {probs[j, p]:.2f} dist_to_pred_centroid {d:.2f}")

        from ml.train import clip_logits
        test_logits, test_targets, _ = clip_logits(model, splits['test'], torch.device('cpu'))
        test_preds = test_logits.argmax(-1)
        print("\n--- CLIP LEVEL TEST METRICS ---")
        for i, c in enumerate(splits['test']):
            print(f"Clip {c['id']}: true {c['label']} -> pred {labels[test_preds[i]]} (logits: {test_logits[i].tolist()})")
        
        acc = (test_preds == test_targets).float().mean().item()
        print(f"Top-1 Accuracy on Held-Out Test: {acc * 100:.1f}%")



if __name__ == '__main__':
    run()
