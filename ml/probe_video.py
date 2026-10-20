"""Decode source frames to audit native PTS/FPS; never generate training features."""
import argparse
import hashlib
import json
from pathlib import Path
import av


def probe(path):
    path = Path(path)
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        timestamps = [float(frame.pts * frame.time_base) * 1000 if frame.pts is not None else None
                      for frame in container.decode(stream)]
        deltas = [b-a for a,b in zip(timestamps,timestamps[1:]) if a is not None and b is not None]
        return dict(source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            decoder=f'PyAV {av.__version__}', codec=stream.codec_context.name,
            width=stream.width,height=stream.height,declared_frames=stream.frames,
            declared_average_fps=str(stream.average_rate), time_base=str(stream.time_base),
            decoded_frames=len(timestamps), timestamps_ms=timestamps,
            min_delta_ms=min(deltas) if deltas else None,max_delta_ms=max(deltas) if deltas else None,
            measured_fps=1000*len(deltas)/sum(deltas) if deltas and sum(deltas)>0 else None)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args()
    with args.output.open('x',encoding='utf-8') as target:
        json.dump(probe(args.video),target,indent=2)
