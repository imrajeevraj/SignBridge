"""Reproduce the pinned, research-only ISL pilot downloads. No training execution."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
    spec=json.loads(Path(__file__).with_name('isl500-pilot-sources.json').read_text(encoding='utf-8'))
    base=spec['source'].replace('/tree/','/resolve/')
    for sample in spec['samples']:
        name=sample['video_path']
        if Path(name).name!=name or not name.endswith('.mp4') or not 0<sample['bytes']<100_000_000:
            raise ValueError('Invalid pinned source path/size.')
        with urllib.request.urlopen(base+'/'+sample['duplicate_group'],timeout=60) as response:
            data=response.read(sample['bytes']+1)
        if len(data)!=sample['bytes'] or hashlib.sha256(data).hexdigest()!=sample['source_sha256']:
            raise ValueError(f'Source integrity failure: {name}')
        (args.output/name).write_bytes(data)
        print('Verified',sample['id'],flush=True)
    for group in ('known','unknown'):
        metadata={k:v for k,v in spec.items() if k not in ('samples','unknown_labels')}
        if group=='unknown':metadata['labels']=spec['unknown_labels']
        metadata['dataset_id']=f'ISL500-{group}-research-v2-native30'
        metadata['samples']=[{k:v for k,v in s.items() if k not in ('group','bytes')} for s in spec['samples'] if s['group']==group]
        (args.output/(group+'-catalog.json')).write_text(json.dumps(metadata,indent=2),encoding='utf-8')
        if group == 'known':
            # The original feasibility plan is preserved above. This revision
            # was frozen before training because Goodmorning had no test windows.
            metadata['labels']=['Family','Goodafternoon']
            metadata['samples']=[s for s in metadata['samples'] if s['label'] in metadata['labels']]
            metadata['dataset_id']='ISL500-two-class-research-v2'
            (args.output/'known-two-class-catalog.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
