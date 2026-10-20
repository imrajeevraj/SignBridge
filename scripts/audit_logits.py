import json, torch
from ml.dataset import load_dataset
from backend.app.inference.registry import ModelRegistry
from pathlib import Path

reg = ModelRegistry(Path('ml/runs/isl500-v2-pilot'))
reg.load()
model = reg.adapter.model
meta = reg.adapter.metadata

print('=== KNOWN CLIPS LOGITS ===')
known, known_clips, _ = load_dataset(Path('.cache/phase3-completion/isl500-known-merged/manifest.json'))
for c in known_clips:
    if c['split'] in ('validation', 'test'):
        with torch.inference_mode():
            logits = model(torch.from_numpy(c['x']))
            mean_logits = logits.mean(0).tolist()
            probs = (logits / meta.temperature).softmax(-1).mean(0).tolist()
            energy = -torch.logsumexp(logits, dim=-1).mean().item()
            diff = abs(mean_logits[0] - mean_logits[1])
            print(f"{c['split']:10} {c['id']:24} true:{c['label']:14} logits:[{mean_logits[0]:.2f}, {mean_logits[1]:.2f}] diff:{diff:.2f} energy:{energy:.2f}")

print('\n=== UNKNOWN CLIPS LOGITS ===')
unknown, unk_clips, _ = load_dataset(Path('.cache/phase3-completion/isl500-unknown-merged/manifest.json'), required_splits=('validation', 'test'), require_class_coverage=False)
for c in unk_clips:
    with torch.inference_mode():
        logits = model(torch.from_numpy(c['x']))
        mean_logits = logits.mean(0).tolist()
        probs = (logits / meta.temperature).softmax(-1).mean(0).tolist()
        energy = -torch.logsumexp(logits, dim=-1).mean().item()
        diff = abs(mean_logits[0] - mean_logits[1])
        print(f"{c['split']:10} {c['id']:24} true:{c['label']:14} logits:[{mean_logits[0]:.2f}, {mean_logits[1]:.2f}] diff:{diff:.2f} energy:{energy:.2f}")
