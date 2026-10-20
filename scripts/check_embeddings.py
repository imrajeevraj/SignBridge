import torch
from ml.dataset import load_dataset
from backend.app.inference.registry import ModelRegistry
from pathlib import Path

reg = ModelRegistry(Path('ml/runs/isl500-v2-pilot'))
reg.load()
model = reg.adapter.model

# Hook the 64-dim embedding before the final Linear
embeddings = {}
def get_embedding(x):
    with torch.inference_mode():
        _, hidden = model.gru(torch.from_numpy(x))
        # self.head is Sequential(Linear(128,64), ReLU(), Linear(64,classes))
        e = model.head[1](model.head[0](hidden[-1])) # after ReLU
        return e

known, known_clips, _ = load_dataset(Path('.cache/phase3-completion/isl500-known-merged/manifest.json'))
family_embs = []
ga_embs = []
for c in known_clips:
    if c['split'] == 'train':
        e = get_embedding(c['x'])
        if c['label'] == 'Family': family_embs.append(e)
        elif c['label'] == 'Goodafternoon': ga_embs.append(e)

family_centroid = torch.cat(family_embs).mean(0)
ga_centroid = torch.cat(ga_embs).mean(0)
print('Family centroid norm:', family_centroid.norm().item())
print('Goodafternoon centroid norm:', ga_centroid.norm().item())
print('Centroid distance:', (family_centroid - ga_centroid).norm().item())

print('\nDistance of KNOWN test to centroids:')
for c in known_clips:
    if c['split'] in ('validation', 'test'):
        e = get_embedding(c['x']).mean(0)
        d_fam = (e - family_centroid).norm().item()
        d_ga = (e - ga_centroid).norm().item()
        print(f"{c['split']:10} {c['id']:24} true:{c['label']:14} d_fam:{d_fam:.2f} d_ga:{d_ga:.2f}")

print('\nDistance of UNKNOWN clips to centroids:')
unknown, unk_clips, _ = load_dataset(Path('.cache/phase3-completion/isl500-unknown-merged/manifest.json'), required_splits=('validation', 'test'), require_class_coverage=False)
for c in unk_clips:
    e = get_embedding(c['x']).mean(0)
    d_fam = (e - family_centroid).norm().item()
    d_ga = (e - ga_centroid).norm().item()
    print(f"{c['split']:10} {c['id']:24} true:{c['label']:14} d_fam:{d_fam:.2f} d_ga:{d_ga:.2f}")

