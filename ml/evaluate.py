"""Re-evaluate a local package on the exact audited held-out dataset."""
import argparse
import json
from pathlib import Path
import torch
from backend.app.inference.registry import ModelRegistry
from backend.app.inference.contracts import ModelState
from .dataset import load_dataset
from .train import clip_logits
from .metrics import classification_metrics

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest'); parser.add_argument('model',type=Path); parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(); manifest,clips,checksum=load_dataset(args.manifest)
    registry=ModelRegistry(args.model); registry.load()
    if registry.state!=ModelState.READY: raise ValueError(registry.message)
    metadata=registry.adapter.metadata
    if metadata.dataset_sha256!=checksum or metadata.labels!=manifest['labels'] or metadata.language!=manifest['language']:
        raise ValueError('Dataset/label/language provenance mismatch.')
    logits,targets,times=clip_logits(registry.adapter.model,[c for c in clips if c['split']=='test'],torch.device('cpu'))
    report=classification_metrics(targets.tolist(),logits.argmax(-1).tolist(),metadata.labels)
    report.update(dataset_sha256=checksum,checkpoint_sha256=metadata.checkpoint_sha256,window_inference_ms=times)
    with args.output.open('x',encoding='utf-8') as handle: json.dump(report,handle,indent=2)
    registry.close()
