"""TEST FIXTURE: versioned geometry/transport/export mechanics, never sign accuracy."""
import asyncio
import json
from pathlib import Path
import numpy as np
import pytest
from pydantic import ValidationError
from app.inference.contracts import SCHEMA_V2, PredictRequest, GRUConfig, ModelState, InferenceError
from app.inference.registry import ModelRegistry
from app.inference.service import InferenceService
from ml.dataset import validate_window, digest, PREPROCESSING_BY_SCHEMA
from ml.train import train
from test_inference import request, fixture_dataset, ready_client, wait_ready, authenticate, TOKEN, PROTOCOL


def vector():
    return json.loads((Path(__file__).parents[2]/'ml/tests/golden-vector-v2.json').read_text())['expected']


def v2_request(**changes):
    return request(schema_version=SCHEMA_V2,sequence_shape=[32,172],sampling_hz=30,features=vector()*32) | changes


def test_v2_golden_training_serving_parity():
    data=validate_window({'features':vector()*32,'timestamps':[i*70 for i in range(32)]},SCHEMA_V2)
    parsed=PredictRequest.model_validate(v2_request())
    np.testing.assert_array_equal(data.flatten(),np.asarray(parsed.features,dtype=np.float32))
    assert data.shape==(32,172)
    with pytest.raises(ValueError):validate_window({'features':vector()*32,'timestamps':[i*70 for i in range(32)]})


@pytest.mark.parametrize('offset,value',[(162,0),(163,0),(170,.5),(153,1)])
def test_v2_rejects_missing_shoulders_invalid_masks_and_unmasked_coordinates(offset,value):
    raw=v2_request();raw['features'][offset]=value
    with pytest.raises(ValidationError):PredictRequest.model_validate(raw)


def test_v2_fixture_training_export_websocket_and_cross_schema_rejection(tmp_path):
    path=fixture_dataset(tmp_path);manifest=json.loads(path.read_text())
    manifest.update(feature_schema=SCHEMA_V2,sampling_hz=30,preprocessing=PREPROCESSING_BY_SCHEMA[SCHEMA_V2])
    for i,sample in enumerate(manifest['samples']):
        file=tmp_path/sample['feature_path'];data=json.loads(file.read_text())
        data.update(feature_schema=SCHEMA_V2,sampling_hz=30,preprocessing=PREPROCESSING_BY_SCHEMA[SCHEMA_V2])
        values=vector()*32;values[0]+=i*.01 # Unique explicitly synthetic test windows.
        data['windows'][0]['features']=values;file.write_text(json.dumps(data));sample['feature_sha256']=digest(file)
    path.write_text(json.dumps(manifest));output=tmp_path/'v2-model'
    report=train(path,output,epochs=2,batch_size=2,patience=1,config=GRUConfig(hidden_size=8,num_layers=1,dropout=0),allow_test_fixture=True)
    assert report['purpose']=='test_fixture'
    registry=ModelRegistry(output);registry.load();assert registry.state==ModelState.INCOMPATIBLE
    with ready_client(output) as client:
        wait_ready(client)
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN});info=socket.receive_json()
            assert info['model']['sequence_shape']==[32,172]
            model_id=info['model']['model_id']
            socket.send_json(v2_request(model_id=model_id));response=socket.receive_json()
            assert response['type']=='prediction' and response['reason'] in ('UNKNOWN','ACCEPTED')
    async def cross_schema():
        registry=ModelRegistry(output,allow_test_fixture=True);registry.load();service=InferenceService(registry)
        with pytest.raises(InferenceError,match='contract'):
            await service.predict(PredictRequest.model_validate(request(model_id=registry.adapter.metadata.model_id)))
        await service.close()
    asyncio.run(cross_schema())
