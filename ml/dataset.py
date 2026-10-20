"""Strict loader for locally extracted, labeled video windows (never legacy poses)."""
import hashlib
import json
from pathlib import Path
import numpy as np
from backend.app.inference.contracts import PredictRequest, PROTOCOL, SCHEMA, SCHEMA_V2, SCHEMA_WIDTHS

PREPROCESSING = 'tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v1'
PREPROCESSING_BY_SCHEMA = {SCHEMA: PREPROCESSING, SCHEMA_V2: 'tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30'}


def digest(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def validate_window(window, schema=SCHEMA):
    values = window['features']
    width = SCHEMA_WIDTHS[schema]
    PredictRequest.model_validate(dict(type='predict', protocol=PROTOCOL, request_id='dataset',
        model_id='dataset', schema_version=schema, sequence_id=0, sequence_shape=[32, width], sampling_hz=30 if schema == SCHEMA_V2 else 15,
        captured_at_ms=0, sent_at_ms=0, features=values))
    times = np.asarray(window['timestamps'], dtype=np.float64)
    if times.shape != (32,) or not np.isfinite(times).all() or times[0] < 0 or np.any(np.diff(times) <= 0) or np.any(np.diff(times) > 250):
        raise ValueError('Invalid timestamps: no padding, duplicates or gaps >250 ms.')
    x = np.asarray(values, dtype=np.float32).reshape(32, width)
    if np.any(x[:, 159:161].sum(1) == 0):
        raise ValueError('Unusable no-hands windows must be discarded by the extractor.')
    return x


def load_dataset(path, *, allow_test_fixture=False, required_splits=('train','validation','test'), require_class_coverage=True):
    path = Path(path).resolve()
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if manifest.get('purpose') != 'real_labeled_data' and not (allow_test_fixture and manifest.get('purpose') == 'test_fixture'):
        raise ValueError('Real labeled data with provenance is required.')
    schema = manifest.get('feature_schema')
    if manifest.get('language') not in ('ISL', 'ASL') or schema not in SCHEMA_WIDTHS or manifest.get('preprocessing') != PREPROCESSING_BY_SCHEMA[schema]:
        raise ValueError('Language or preprocessing/schema mismatch.')
    if manifest.get('sampling_hz',15) != (30 if schema == SCHEMA_V2 else 15):
        raise ValueError('Dataset sampling policy mismatch.')
    for key in ('dataset_id', 'source', 'license', 'extractor_sha256'):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError(f'Missing provenance: {key}')
    labels = manifest['labels']
    if not 2 <= len(labels) <= 512 or len(set(labels)) != len(labels) or any(not isinstance(x, str) or not x or len(x)>100 for x in labels):
        raise ValueError('Invalid label map.')
    groups = {name: {} for name in ('signer_id', 'duplicate_group', 'source_sha256', 'window_hash')}
    clips = []; ids = set()
    for sample in manifest['samples']:
        split = sample['split']
        if split not in ('train', 'validation', 'test') or sample['label'] not in labels or sample['id'] in ids:
            raise ValueError('Invalid split, label or duplicate sample ID.')
        ids.add(sample['id'])
        for key in ('signer_id', 'duplicate_group', 'source_sha256'):
            value = sample.get(key)
            if not isinstance(value, str) or not value:
                raise ValueError(f'Explicit pseudonymous {key} is required; unknown signers cannot be split safely.')
            previous = groups[key].setdefault(value, split)
            if previous != split:
                raise ValueError(f'Cross-split leakage: {key}')
        feature_path = (path.parent / sample['feature_path']).resolve()
        if not feature_path.is_relative_to(path.parent) or feature_path.stat().st_size > 128 * 1024 * 1024:
            raise ValueError('Feature file outside dataset or too large.')
        if digest(feature_path) != sample['feature_sha256']:
            raise ValueError('Feature checksum mismatch.')
        data = json.loads(feature_path.read_text(encoding='utf-8'))
        if data.get('sampling_hz',15) != manifest.get('sampling_hz',15):raise ValueError('Feature sampling policy mismatch.')
        if data.get('feature_schema') != schema or data.get('preprocessing') != PREPROCESSING_BY_SCHEMA[schema] or data.get('extractor_sha256') != manifest['extractor_sha256'] or data.get('source_sha256') != sample['source_sha256']:
            raise ValueError('Feature provenance mismatch.')
        if not 1 <= len(data['windows']) <= 1024:
            raise ValueError('A clip must contain 1..1024 complete windows.')
        windows = [validate_window(window, schema) for window in data['windows']]
        for window in windows:
            fingerprint = hashlib.sha256(window.tobytes()).hexdigest()
            if groups['window_hash'].setdefault(fingerprint, split) != split:
                raise ValueError('Duplicate feature window across splits.')
        clips.append({**sample, 'x': np.stack(windows), 'target': labels.index(sample['label'])})
    for split in required_splits:
        present = {clip['label'] for clip in clips if clip['split'] == split}
        neutral = manifest.get('neutral_label')
        expected = set(labels) if neutral is None or split != 'test' else set(labels) - {neutral}
        if not present or (require_class_coverage and not expected.issubset(present)):
            raise ValueError(f'Every selected class needs genuine examples in {split}.')
    return manifest, clips, digest(path)


def statistics(manifest, clips):
    return {split: {'clips': sum(c['split'] == split for c in clips),
        'windows': sum(len(c['x']) for c in clips if c['split'] == split),
        'signers': len({c['signer_id'] for c in clips if c['split'] == split}),
        'classes': {label: sum(c['split']==split and c['label']==label for c in clips) for label in manifest['labels']}}
        for split in ('train', 'validation', 'test')}
