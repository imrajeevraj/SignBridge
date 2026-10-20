"""Strict loading audit only, NOT a recognition benchmark or live adapter.

Architecture adapted from AI4Bharat/INCLUDE (MIT), commit
df348f4a640060d4d39f02556d9f96851e8c46c7. License in this directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn

CHECKSUM='d3f0b4b17c4c5c25caad11ea1cd0707781dafc5c195c4f2b41b23a5f07cfa147'


class NativeIncludeLSTM(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm=nn.LSTM(input_size=134,hidden_size=256,num_layers=5,batch_first=True,bidirectional=True,dropout=.2)
        self.l1=nn.Linear(512,50)

    def forward(self,x):
        x,_=self.lstm(x)
        return self.l1(nn.functional.dropout(x.max(dim=1).values,p=.3))  # preserves upstream always-active dropout


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint',type=Path,default=Path('.cache/phase3-audit/include50_lstm.pth'))
    parser.add_argument('--output',type=Path,default=Path('docs/phase-3-include-load.json'))
    args=parser.parse_args()
    with args.checkpoint.open('rb') as handle:
        if hashlib.file_digest(handle,'sha256').hexdigest()!=CHECKSUM:raise ValueError('Checkpoint hash mismatch.')
    with torch.serialization.safe_globals([(np._core.multiarray.scalar,'numpy.core.multiarray.scalar'),np.dtype,np.dtypes.Float64DType]):
        checkpoint=torch.load(args.checkpoint,map_location='cpu',weights_only=True)
    model=NativeIncludeLSTM().eval();model.load_state_dict(checkpoint['model'],strict=True)
    if not all(torch.isfinite(value).all() for value in model.state_dict().values()):raise ValueError('Invalid weights.')
    report={'model':'INCLUDE50 LSTM','language':'ISL','checkpoint_sha256':CHECKSUM,'strict_load':'all keys matched',
        'parameters':sum(p.numel() for p in model.parameters()),'input':['batch',169,134],'classes':50,
        'labeled_inference_tested':False,'reason':'No matching legacy upper-body Hands+Pose features extracted. Holistic and later Tasks video probes use different extractors.',
        'upstream_issue':'F.dropout defaults training=True even in eval; no silent correction applied.'}
    args.output.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
