"""Reproduce the inspected OpenHands INCLUDE LSTM on published pose test data.

Architecture/preprocessing adapted from AI4Bharat/OpenHands (Apache-2.0),
commit b9ccf9eaf2a71301fc4601a64a6af06fdef04c9b. See docs/PHASE-3-MODEL-AUDIT.md.
Preserves upstream batch_first=False behavior; this is NOT a live GRU adapter.
"""
import argparse
import csv
import hashlib
import io
import json
import pickle
from pathlib import Path
import time
import zipfile
import urllib.request
import struct

import numpy as np
import torch
from torch import nn

JOINTS = [0, 2, 5, 11, 12, 13, 14, 33, 37, 38, 41, 42, 45, 46, 49, 50, 53, 54, 58, 59, 62, 63, 66, 67, 70, 71, 74]
CHECKPOINT_ZIP_SHA = '22e3b923fa066dd37c7ae44899fe00dacc737df61f00c730853b77f7ab58018d'
POSE_ZIP_MD5 = 'f99f6f3ea50d5d94e0ffae44130a6672'


class RangeArchive(io.RawIOBase):
    """Read a published archive using HTTP ranges; validate each ZIP member CRC.

    A partial local prefix is usable, but is NOT represented as a verified full
    archive. Every evaluated member receives its own SHA-256 in the report.
    """
    size = 662887244
    url = 'https://zenodo.org/records/6674324/files/INCLUDE.zip?download=1'

    def __init__(self, prefix):
        self.file = prefix.open('rb'); self.prefix_size = prefix.stat().st_size; self.position = 0

    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position+offset if whence == 1 else self.size+offset
        return self.position

    def read(self, length=-1):
        length = min(self.size-self.position, length if length>=0 else self.size)
        if length <= 0: return b''
        if self.position+length <= self.prefix_size:
            self.file.seek(self.position); data=self.file.read(length)
        else:
            end=self.position+length-1
            request=urllib.request.Request(self.url, headers={'Range':f'bytes={self.position}-{end}'})
            with urllib.request.urlopen(request,timeout=60) as response:
                if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {self.position}-{end}/{self.size}':
                    raise ValueError('Server did not honor exact archive range.')
                data=response.read(length+1)
            if len(data)!=length: raise ValueError('Truncated archive range.')
        self.position+=len(data); return data

    def close(self):
        self.file.close(); super().close()


class SliceArchive(io.RawIOBase):
    def __init__(self, parent, start, size): self.parent=parent; self.start=start; self.size=size; self.position=0
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self,offset,whence=0):
        self.position=offset if whence==0 else self.position+offset if whence==1 else self.size+offset
        return self.position
    def read(self,length=-1):
        length=min(self.size-self.position,length if length>=0 else self.size)
        if length<=0:return b''
        self.parent.seek(self.start+self.position);data=self.parent.read(length);self.position+=len(data);return data


class CallbackMetadata:
    """Inert dictionary key for legacy Lightning metadata; no upstream code runs."""
    pass


class EarlyStopMetadata:
    pass


def load_native_weights(payload):
    # These two inspected globals are callback-type dictionary keys. Replace them
    # with inert local classes, not imported/executable Lightning callbacks.
    with torch.serialization.safe_globals([
        (CallbackMetadata, 'pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint'),
        (EarlyStopMetadata, 'pytorch_lightning.callbacks.early_stopping.EarlyStopping'),
    ]):
        return torch.load(io.BytesIO(payload), map_location='cpu', weights_only=True)


class NumericUnpickler(pickle.Unpickler):
    """Read only primitive containers and numpy arrays, never arbitrary globals."""
    def find_class(self, module, name):
        if (module, name) in {('numpy', 'ndarray'), ('numpy', 'dtype')}:
            return getattr(np, name)
        if module in {'numpy.core.multiarray', 'numpy._core.multiarray'} and name in {'_reconstruct', 'scalar'}:
            return getattr(np._core.multiarray, name)
        raise pickle.UnpicklingError(f'Forbidden data global: {module}.{name}')


class Attention(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(256, 256, bias=False)
        self.fc2 = nn.Linear(512, 256, bias=False)

    def forward(self, x):
        last = x[:, -1, :]
        scores = torch.bmm(self.fc1(x), last.unsqueeze(2)).squeeze(2)
        context = torch.bmm(x.permute(0, 2, 1), scores.softmax(1).unsqueeze(2)).squeeze(2)
        return torch.tanh(self.fc2(torch.cat((context, last), dim=1)))


class NativeOpenHands(nn.Module):
    def __init__(self):
        super().__init__()
        self.rnn = nn.LSTM(54, 128, num_layers=4, bidirectional=True)  # upstream, NOT batch_first
        self.attn_block = Attention()
        self.fc = nn.Linear(256, 263)

    def forward(self, frames):
        flat = frames.permute(0, 2, 1, 3).flatten(2)
        output, _ = self.rnn(flat)
        return self.fc(self.attn_block(output))


def preprocess(keypoints):
    x = torch.as_tensor(np.asarray(keypoints, dtype=np.float32)[:, JOINTS, :2]).clone()
    if x.ndim != 3 or x.shape[1:] != (27, 2) or not torch.isfinite(x).all():
        raise ValueError('Malformed native pose')
    center = ((x[:, 3] + x[:, 4]) / 2).mean(0)
    distance = ((x[:, 3] - x[:, 4]).square().sum(-1).sqrt()).mean()
    if distance > 0:
        x = (x - center) / distance
    return x.permute(2, 0, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', type=Path, default=Path('.cache/phase3-audit'))
    parser.add_argument('--output', type=Path, default=Path('docs/phase-3-native-results.json'))
    parser.add_argument('--limit', type=int, default=32)
    parser.add_argument('--partial-archive', action='store_true', help='Use HTTP ranges plus local prefix; full archive MD5 remains UNVERIFIED.')
    args = parser.parse_args()
    root = args.assets
    torch.set_num_threads(2)
    torch.manual_seed(0)
    archive = root / 'openhands_include_lstm.zip'
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == CHECKPOINT_ZIP_SHA
    with zipfile.ZipFile(archive) as z:
        weights = z.read('include/lstm/epoch=294-step=63719.ckpt')
        checkpoint = load_native_weights(weights)
    state = checkpoint['state_dict']
    state = {key.removeprefix('model.decoder.'): value for key, value in state.items() if key.startswith('model.decoder.')}
    model = NativeOpenHands().eval()
    model.load_state_dict(state, strict=True)
    data_file = root / 'INCLUDE-poses.zip'
    if not args.partial_archive:
        with data_file.open('rb') as handle:
            assert hashlib.file_digest(handle, 'md5').hexdigest() == POSE_ZIP_MD5
    csv_path = root / 'OpenHands/openhands/datasets/assets/include_metadata/Train_Test_Split/test_include.csv'
    rows = list(csv.DictReader(csv_path.open(encoding='utf-8-sig')))
    labels = sorted({row['Word'] for row in rows})
    assert len(labels) == 263
    outcomes = []
    skipped = []
    outer_source = RangeArchive(data_file) if args.partial_archive else data_file.open('rb')
    with zipfile.ZipFile(outer_source) as outer:
        entry = outer.getinfo('INCLUDE/Pose_Signs.zip')
        if entry.compress_type != zipfile.ZIP_STORED: raise ValueError('Nested archive must be stored for ranged access.')
        outer_source.seek(entry.header_offset)
        header=outer_source.read(30)
        name_length, extra_length=struct.unpack_from('<HH',header,26)
        source=SliceArchive(outer_source,entry.header_offset+30+name_length+extra_length,entry.file_size)
    with zipfile.ZipFile(source) as z, torch.inference_mode():
        names = z.namelist()
        for row in rows:
            if len(outcomes) >= args.limit:
                break
            suffix = str(Path(row['FilePath']).with_suffix('.pkl')).replace('\\', '/')
            matches = [name for name in names if name.endswith(suffix)]
            if len(matches) != 1:
                skipped.append(suffix)
                continue
            payload = z.read(matches[0])
            data = NumericUnpickler(io.BytesIO(payload)).load()
            frames = preprocess(data['keypoints']).unsqueeze(0)
            started = time.perf_counter()
            probabilities = model(frames).softmax(-1)[0]
            elapsed = (time.perf_counter() - started) * 1000
            predicted = int(probabilities.argmax())
            outcomes.append({'sample': suffix, 'sample_sha256': hashlib.sha256(payload).hexdigest(),
                'expected': row['Word'], 'predicted': labels[predicted], 'confidence': float(probabilities[predicted]),
                'correct': labels[predicted] == row['Word'], 'frames': frames.shape[2], 'inference_ms': elapsed})
    if not outcomes:
        raise RuntimeError('No labeled test samples matched; no inference claim is possible.')
    times = [row['inference_ms'] for row in outcomes]
    report = {'model': 'OpenHands INCLUDE LSTM', 'language': 'ISL', 'classes': labels,
        'checkpoint_sha256': hashlib.sha256(weights).hexdigest(), 'archive_sha256': CHECKPOINT_ZIP_SHA,
        'published_data_md5': POSE_ZIP_MD5, 'full_data_md5_verified': not args.partial_archive,
        'data_integrity': 'ZIP member CRC validated; per-sample SHA-256 recorded', 'schema': 'openhands.native.holistic27.xy.clip.v1',
        'method': 'First matching test CSV rows; CPU batch 1; native batch_first=False preserved. Not signer-independent or paper reproduction.',
        'samples': len(outcomes), 'top1': sum(row['correct'] for row in outcomes) / len(outcomes),
        'cold_first_ms': times[0], 'steady_median_ms': float(np.median(times[1:])) if len(times)>1 else None,
        'steady_p95_ms': float(np.percentile(times[1:], 95)) if len(times)>1 else None,
        'torch': torch.__version__, 'skipped': skipped, 'results': outcomes}
    from ml.metrics import classification_metrics
    report['classification'] = classification_metrics([labels.index(r['expected']) for r in outcomes], [labels.index(r['predicted']) for r in outcomes], labels)
    report['unknown_rejection'] = None
    report['unseen_signer_accuracy'] = None
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['samples','top1','cold_first_ms','steady_median_ms','steady_p95_ms']}))


if __name__ == '__main__':
    main()
