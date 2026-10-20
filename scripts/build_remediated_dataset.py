import json
import hashlib
import shutil
import os
from pathlib import Path
from ml.dataset import digest

def main():
    out_dir = Path('.cache/phase3-completion/isl500-remediated-v2')
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    samples = []
    clip_counter = 0

    extractor_hash = '103b76cc71ca73ca511cdf694812d5839df6bbb7f8158277b351a195c5bae5da'

    def copy_clip(src_path, sample_meta, split):
        nonlocal clip_counter
        fname = f'{clip_counter:04d}.json'
        dest = out_dir / fname
        data = json.load(open(src_path, 'r', encoding='utf-8'))
        data['extractor_sha256'] = extractor_hash
        dest.write_text(json.dumps(data, indent=2), encoding='utf-8')
        feat_sha = digest(dest)
        clip_counter += 1
        return {
            'id': sample_meta['id'],
            'label': sample_meta['label'],
            'signer_id': sample_meta['signer_id'],
            'duplicate_group': sample_meta['duplicate_group'],
            'split': split,
            'source_sha256': data['source_sha256'],
            'feature_path': fname,
            'feature_sha256': feat_sha
        }

    # 1. Known clips from isl500-known-merged
    known_m = json.load(open('.cache/phase3-completion/isl500-known-merged/manifest.json'))
    known_dir = Path('.cache/phase3-completion/isl500-known-merged')
    for s in known_m['samples']:
        samples.append(copy_clip(known_dir / s['feature_path'], s, s['split']))

    # 2. Train NO_SIGN clips: Sit (User001), Water (User001), Goodmorning (User003, User005)
    sit_water_m = json.load(open('.cache/phase3-sit-water/manifest.json'))
    for s in sit_water_m['samples']:
        meta = {
            'id': f"{s['signer_id']}-NO_SIGN-{s['label']}",
            'label': 'NO_SIGN',
            'signer_id': s['signer_id'],
            'duplicate_group': f"Videos/{s['signer_id']}/{s['label']}.mp4",
        }
        samples.append(copy_clip(Path('.cache/phase3-sit-water') / s['feature_path'], meta, 'train'))

    gm_train_m = json.load(open('.cache/phase3-goodmorning-train/manifest.json'))
    for s in gm_train_m['samples']:
        meta = {
            'id': f"{s['signer_id']}-NO_SIGN-Goodmorning",
            'label': 'NO_SIGN',
            'signer_id': s['signer_id'],
            'duplicate_group': f"Videos/{s['signer_id']}/Goodmorning.mp4",
        }
        samples.append(copy_clip(Path('.cache/phase3-goodmorning-train') / s['feature_path'], meta, 'train'))

    # 3. Validation NO_SIGN clips: Goodmorning (User010, User012)
    gm_eval_m = json.load(open('.cache/phase3-goodmorning-eval/manifest.json'))
    for s in gm_eval_m['samples']:
        if s['split'] == 'validation':
            meta = {
                'id': f"{s['signer_id']}-NO_SIGN-Goodmorning",
                'label': 'NO_SIGN',
                'signer_id': s['signer_id'],
                'duplicate_group': f"Videos/{s['signer_id']}/Goodmorning.mp4",
            }
            samples.append(copy_clip(Path('.cache/phase3-goodmorning-eval') / s['feature_path'], meta, 'validation'))

    manifest = {
        'purpose': 'real_labeled_data',
        'dataset_id': 'ISL500-remediated-v2',
        'language': 'ISL',
        'source': 'https://huggingface.co/datasets/ISL500/ISL-DATA/tree/bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32',
        'license': 'Research and academic use only; dataset card; no commercial permission',
        'labels': ['Family', 'Goodafternoon', 'NO_SIGN'],
        'neutral_label': 'NO_SIGN',
        'feature_schema': 'signbridge.custom-gru.v2',
        'sampling_hz': 30,
        'preprocessing': 'tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30',
        'extractor_sha256': extractor_hash,
        'samples': samples
    }

    with open(out_dir / 'manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f'Built remediated dataset with {len(samples)} clips in {out_dir}')

if __name__ == '__main__':
    main()
