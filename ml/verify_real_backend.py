"""Exercise real held-out windows through FastAPI's authenticated WebSocket.

Uses an in-process ASGI test transport, no physical camera or public listener.
This checks serving parity, not a new independent accuracy estimate.
"""
import argparse
import json
from pathlib import Path
import secrets
import time

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.inference.contracts import ModelState, PROTOCOL
from backend.app.inference.registry import ModelRegistry
from .dataset import load_dataset


def verify(manifest_path, model_path):
    manifest, clips, checksum = load_dataset(manifest_path)
    registry = ModelRegistry(Path(model_path))
    registry.load()
    if registry.state != ModelState.READY or registry.adapter.metadata.purpose != 'trained':
        raise ValueError('A genuine compatible trained package is required.')
    metadata = registry.adapter.metadata
    if metadata.dataset_sha256 != checksum or metadata.labels != manifest['labels']:
        raise ValueError('Dataset/package provenance mismatch.')
    origin = 'chrome-extension://' + 'a' * 32
    token = secrets.token_hex(32)
    report = dict(kind='Genuine held-out features, ASGI WebSocket serving parity',
                  checkpoint_sha256=metadata.checkpoint_sha256, dataset_sha256=checksum,
                  observations=[], no_hands_suppressed=False, passed=False)
    with TestClient(create_app(registry=registry, token=token, origins={origin}),
                    base_url='http://127.0.0.1') as client:
        deadline = time.monotonic() + 15
        while not client.get('/model/info').json()['available']:
            if time.monotonic() > deadline:
                raise TimeoutError('Model did not become ready.')
            time.sleep(.05)
        for clip in [c for c in clips if c['split'] == 'test']:
            values = clip['x'][0].flatten().tolist()
            expected_label, expected_confidence = registry.adapter.predict(values)
            with client.websocket_connect('ws://127.0.0.1/ws/infer', headers={'origin': origin}) as socket:
                socket.send_json(dict(type='authenticate', protocol=PROTOCOL, token=token))
                assert socket.receive_json()['model']['available']
                now = time.time() * 1000
                request = dict(type='predict', protocol=PROTOCOL, request_id='real-clip',
                               sequence_id=1, model_id=metadata.model_id,
                               schema_version=metadata.feature_schema, sequence_shape=list(metadata.shape),
                               sampling_hz=metadata.sampling_hz, captured_at_ms=now,
                               sent_at_ms=now, features=values)
                socket.send_json(request)
                response = socket.receive_json()
                accepted = expected_confidence >= metadata.confidence_threshold and expected_label != metadata.neutral_label
                assert response['type'] == 'prediction'
                assert abs(response['confidence'] - expected_confidence) < 1e-6
                assert response['accepted'] == accepted
                assert response['label'] == (expected_label if accepted else None)
                report['observations'].append(dict(clip_id=clip['id'], source_gloss=clip['label'], response=response))
        # A protocol mutation, explicitly not a genuine neutral-activity sample.
        no_hands = clips[0]['x'][0].copy()
        no_hands[:, :126] = 0
        no_hands[:, 159:161] = 0
        with client.websocket_connect('ws://127.0.0.1/ws/infer', headers={'origin': origin}) as socket:
            socket.send_json(dict(type='authenticate', protocol=PROTOCOL, token=token))
            socket.receive_json()
            now = time.time() * 1000
            socket.send_json({**request, 'features': no_hands.flatten().tolist(),
                              'captured_at_ms': now, 'sent_at_ms': now})
            response = socket.receive_json()
            assert response['reason'] == 'NO_SIGN' and not response['accepted'] and response['label'] is None
            report['no_hands_suppressed'] = True
    report['passed'] = bool(report['observations']) and report['no_hands_suppressed']
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('model')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = verify(args.manifest, args.model)
    with args.output.open('x', encoding='utf-8') as file:
        json.dump(result, file, indent=2)
    print(json.dumps({'passed': result['passed'], 'real_clips': len(result['observations']),
                      'no_hands_suppressed': result['no_hands_suppressed']}))
