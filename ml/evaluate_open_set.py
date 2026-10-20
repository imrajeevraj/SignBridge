"""Audit held-out unsupported source glosses; never adjust thresholds using test data."""
import argparse
import json
from pathlib import Path
import numpy as np
import torch
from backend.app.inference.registry import ModelRegistry
from backend.app.inference.contracts import ModelState
from .dataset import load_dataset


def evaluate(known_path, unknown_path, model_path):
    known,known_clips,known_sha=load_dataset(known_path)
    unknown,clips,unknown_sha=load_dataset(unknown_path,required_splits=('validation','test'),require_class_coverage=False)
    if set(known['labels']) & set(unknown['labels']):raise ValueError('Unknown labels overlap trained vocabulary.')
    for key in ('language','feature_schema','preprocessing','extractor_sha256','sampling_hz'):
        if known.get(key)!=unknown.get(key):raise ValueError(f'Unknown preprocessing mismatch: {key}')
    known_groups={key:{c[key]:c['split'] for c in known_clips} for key in ('signer_id','duplicate_group','source_sha256')}
    known_windows={x.tobytes() for c in known_clips for x in c['x']}
    for clip in clips:
        if clip['split']=='train':raise ValueError('Open-set evaluation cannot contain training clips.')
        for key,groups in known_groups.items():
            if key=='signer_id':
                if clip[key] in groups and groups[clip[key]]!=clip['split']:raise ValueError('Cross-split signer leakage.')
            elif clip[key] in groups:raise ValueError('Known/unknown source duplication.')
        if any(x.tobytes() in known_windows for x in clip['x']):raise ValueError('Known/unknown window duplication.')
    registry=ModelRegistry(Path(model_path));registry.load()
    if registry.state!=ModelState.READY:raise ValueError(registry.message)
    metadata=registry.adapter.metadata
    if metadata.dataset_sha256!=known_sha:raise ValueError('Known dataset differs from trained package.')
    reports={}
    try:
        for split in ('validation','test'):
            rows=[];accepted_count=0;studio_count=0;total=0
            for clip in [c for c in clips if c['split']==split]:
                with torch.inference_mode():
                    probabilities=(registry.adapter.model(torch.from_numpy(clip['x']))/metadata.temperature).softmax(-1)
                confidence,predicted=probabilities.max(-1)
                accepted=confidence>=metadata.confidence_threshold
                studio_accepted=confidence>=max(.8,metadata.confidence_threshold)
                if metadata.neutral_label is not None:accepted &= predicted != metadata.labels.index(metadata.neutral_label)
                if metadata.neutral_label is not None:studio_accepted &= predicted != metadata.labels.index(metadata.neutral_label)
                accepted_count+=int(accepted.sum());total+=len(accepted)
                studio_count+=int(studio_accepted.sum())
                rows.append(dict(id=clip['id'],source_gloss=clip['label'],signer_id=clip['signer_id'],windows=len(accepted),
                    accepted_windows=int(accepted.sum()),studio_default_accepted_windows=int(studio_accepted.sum()),confidences=confidence.tolist(),predicted_labels=[metadata.labels[i] for i in predicted.tolist()]))
            reports[split]=dict(clips=len(rows),windows=total,accepted_windows=accepted_count,
                window_false_acceptance_rate=accepted_count/total if total else None,
                studio_default_window_false_acceptance_rate=studio_count/total if total else None,
                clip_any_false_acceptance_rate=sum(row['accepted_windows']>0 for row in rows)/len(rows) if rows else None,
                observations=rows)
        return dict(known_dataset_sha256=known_sha,unknown_dataset_sha256=unknown_sha,
            checkpoint_sha256=metadata.checkpoint_sha256,threshold=metadata.confidence_threshold,
            studio_default_threshold=max(.8,metadata.confidence_threshold),
            studio_scope='Per-window threshold only; does not simulate stability/cooldown or claim physical-camera false-positive rate.',
            scope='Unsupported ISL glosses; correlated windows. Threshold frozen from closed-set validation. Not an all-unknown guarantee.',
            neutral_behavior='No genuine neutral activity corpus; absent-hand protocol tests are separate.',splits=reports)
    finally:registry.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('known');parser.add_argument('unknown');parser.add_argument('model');parser.add_argument('output',type=Path)
    args=parser.parse_args();report=evaluate(args.known,args.unknown,args.model)
    with args.output.open('x',encoding='utf-8') as file:json.dump(report,file,indent=2)
    print(json.dumps({split:{k:v for k,v in data.items() if k!='observations'} for split,data in report['splits'].items()}))
