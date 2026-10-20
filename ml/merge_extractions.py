"""Merge audited extraction batches against one frozen catalog; reject drift."""
import argparse
import json
from pathlib import Path
from .dataset import digest, PREPROCESSING_BY_SCHEMA


def merge(catalog_path, manifests, output):
    catalog=json.loads(Path(catalog_path).read_text(encoding='utf-8'))
    schema=catalog.get('feature_schema','signbridge.custom-gru.v1')
    expected={s['id']:s for s in catalog['samples']}
    if len(expected)!=len(catalog['samples']):raise ValueError('Duplicate catalog IDs.')
    samples=[];files=[];seen=set();extractor=None
    for path in map(Path,manifests):
        manifest=json.loads(path.read_text(encoding='utf-8'))
        for key in ('purpose','language','labels','source','license','sampling_hz'):
            if manifest.get(key,15 if key=='sampling_hz' else None)!=catalog.get(key,15 if key=='sampling_hz' else None):raise ValueError(f'Catalog drift: {key}')
        if manifest['feature_schema']!=schema or manifest['preprocessing']!=PREPROCESSING_BY_SCHEMA[schema]:
            raise ValueError('Extraction schema/preprocessing drift.')
        if extractor is not None and extractor!=manifest['extractor_sha256']:raise ValueError('Extractor drift.')
        extractor=manifest['extractor_sha256']
        for sample in manifest['samples']:
            if sample['id'] in seen or sample['id'] not in expected:raise ValueError('Duplicate or unexpected sample.')
            seen.add(sample['id']);original=expected[sample['id']]
            for key in ('label','signer_id','duplicate_group','split','source_sha256'):
                if sample[key]!=original[key]:raise ValueError(f'Sample provenance drift: {key}')
            file=(path.parent/sample['feature_path']).resolve()
            if not file.is_relative_to(path.parent.resolve()) or digest(file)!=sample['feature_sha256']:
                raise ValueError('Feature path/hash mismatch.')
            filename=f'{len(samples):04}.json'
            samples.append({**sample,'feature_path':filename});files.append((file,filename))
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    for file,name in files:(output/name).write_bytes(file.read_bytes())
    metadata={k:v for k,v in catalog.items() if k!='samples'}
    (output/'manifest.json').write_text(json.dumps({**metadata,'feature_schema':schema,
        'preprocessing':PREPROCESSING_BY_SCHEMA[schema],'extractor_sha256':extractor,'samples':samples},indent=2),encoding='utf-8')
    (output/'attrition.json').write_text(json.dumps({'catalog_clips':len(expected),'usable_clips':len(samples),
        'rejected_or_unprocessed_ids':sorted(set(expected)-seen)},indent=2),encoding='utf-8')
    print(f'Merged {len(samples)}/{len(expected)} clips. Run ml.inspect_dataset before training.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog');parser.add_argument('output');parser.add_argument('manifests',nargs='+')
    args=parser.parse_args();merge(args.catalog,args.manifests,args.output)
