"""Fetch two pinned research-only videos; never a training-ready dataset."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

REVISION = 'bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32'
BASE = f'https://huggingface.co/datasets/ISL500/ISL-DATA/resolve/{REVISION}'
FILES = [
    ('Water', 'Water__session117__clip006.mp4', 21684603, '2b0cdf026855d56bebeb1202c444e555f48a211e94109dd9dd69e03d91b6f0cc'),
    ('Sit', 'Sit__session119__clip011.mp4', 18797843, '50dce7dc498caa7a4d177cd9eb3c55491b7cae3c35815b247363090afff8efcf'),
]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
    samples=[]
    for label,name,size,digest in FILES:
        remote=f'Videos/User001/{name}'
        with urllib.request.urlopen(f'{BASE}/{remote}',timeout=60) as response:
            data=response.read(size+1)
        if len(data)!=size or hashlib.sha256(data).hexdigest()!=digest:
            raise ValueError(f'Source size/hash mismatch: {name}')
        (args.output/name).write_bytes(data)
        samples.append(dict(id=f'User001-{label}',label=label,signer_id='User001',
            duplicate_group=remote,split='train',video_path=name,source_sha256=digest))
    catalog=dict(purpose='real_labeled_data',dataset_id='ISL500-probe-only',language='ISL',
        source=f'https://huggingface.co/datasets/ISL500/ISL-DATA/tree/{REVISION}',
        license='Research and academic use only; dataset card; no commercial permission',
        labels=[row[0] for row in FILES],samples=samples)
    (args.output/'catalog.json').write_text(json.dumps(catalog,indent=2),encoding='utf-8')
    print('Two genuine research probes downloaded. No validation/test coverage; DO NOT TRAIN.')


if __name__=='__main__': main()
