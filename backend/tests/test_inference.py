"""TEST FIXTURE tensors test mechanics only; no sign accuracy claims."""
import asyncio
import hashlib
import json
import time
from pathlib import Path
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from pydantic import ValidationError
from safetensors.torch import save_file
from starlette.websockets import WebSocketDisconnect
from app.main import create_app
from app.inference.contracts import GRUConfig, ModelMetadata, ModelState, PredictRequest, PROTOCOL, SCHEMA, labels_hash, InferenceError
from app.inference.gru import SignGRU
from app.inference.registry import ModelRegistry
from app.inference.service import InferenceService
from ml.dataset import digest, load_dataset, validate_window, PREPROCESSING
from ml.train import train

TOKEN='TEST_FIXTURE_'+'x'*40
ORIGIN='chrome-extension://'+'a'*32


def test_cross_language_golden_vector_is_not_transformed():
    fixture=json.loads((Path(__file__).parents[2]/'ml/tests/golden-vector.json').read_text())
    vector=fixture['expected']
    window=validate_window({'features':vector*32,'timestamps':[i*70 for i in range(32)]})
    validated=PredictRequest.model_validate(request(features=vector*32))
    np.testing.assert_array_equal(window.flatten(),np.asarray(validated.features,dtype=np.float32))
    np.testing.assert_array_equal(window[0],np.asarray(vector,dtype=np.float32))


def request(**overrides):
    features=np.zeros((32,161),dtype=np.float32); features[:,159]=1
    return dict(type='predict',protocol=PROTOCOL,request_id='fixture-1',model_id='test-fixture',sequence_id=1,
        schema_version=SCHEMA,sequence_shape=[32,161],captured_at_ms=time.time()*1000,sent_at_ms=time.time()*1000,
        features=features.flatten().tolist(),**{}) | overrides


@pytest.fixture
def package(tmp_path):
    labels=['TEST FIXTURE A','TEST FIXTURE B']; config=GRUConfig(hidden_size=8,num_layers=1,dropout=0)
    torch.manual_seed(0); model=SignGRU(2,config)
    save_file(model.state_dict(),tmp_path/'weights.safetensors',metadata={'feature_schema':SCHEMA,'labels_sha256':labels_hash(labels)})
    evaluation={'dataset_sha256':'1'*64,'labels_sha256':labels_hash(labels),'signer_independent':True,'test_samples':2}
    (tmp_path/'evaluation.json').write_text(json.dumps(evaluation))
    metadata=ModelMetadata(model_id='test-fixture',model_version='test-only',architecture='custom_gru',language='ISL',
        feature_schema=SCHEMA,shape=(32,161),config=config,labels=labels,labels_sha256=labels_hash(labels),
        checkpoint_sha256=digest(tmp_path/'weights.safetensors'),evaluation_sha256=digest(tmp_path/'evaluation.json'),dataset_sha256='1'*64,
        source='TEST FIXTURE, not training data',license='test-only',purpose='test_fixture',confidence_threshold=.5,calibrated=False)
    (tmp_path/'metadata.json').write_text(metadata.model_dump_json())
    return tmp_path


def edit_metadata(directory, **changes):
    path=directory/'metadata.json'; data=json.loads(path.read_text()); data.update(changes); path.write_text(json.dumps(data))


def test_real_torch_fixture_architecture_load_and_close(package):
    registry=ModelRegistry(package,allow_test_fixture=True); registry.load()
    assert registry.state==ModelState.READY
    label,probability=registry.adapter.predict(request()['features'])
    assert label in registry.info()['labels'] and .5<=probability<=1
    assert registry.adapter.model(torch.zeros(3,32,161)).shape==(3,2)
    with pytest.raises(ValueError): registry.adapter.model(torch.zeros(1,31,161))
    registry.close(); assert registry.adapter is None and registry.state==ModelState.NOT_INSTALLED


def test_fixture_never_enabled_in_application(package):
    registry=ModelRegistry(package); registry.load(); assert registry.state==ModelState.INCOMPATIBLE


@pytest.mark.parametrize('changes',[{'feature_schema':'wrong'},{'labels':['TEST FIXTURE B','TEST FIXTURE A']},{'language':'made-up'},
    {'config':{'hidden_size':16,'num_layers':1,'dropout':0}},{'checkpoint_sha256':'0'*64},{'shape':[32,134]}])
def test_incompatible_packages(package,changes):
    edit_metadata(package,**changes); registry=ModelRegistry(package,allow_test_fixture=True); registry.load()
    assert registry.state==ModelState.INCOMPATIBLE and not registry.info()['available']


def test_missing_corrupt_and_reload_fail_closed(package):
    registry=ModelRegistry(package,allow_test_fixture=True); registry.load()
    (package/'weights.safetensors').unlink(); registry.load()
    assert registry.state==ModelState.NOT_INSTALLED and registry.adapter is None
    (package/'weights.safetensors').write_bytes(b'corrupt'); edit_metadata(package,checkpoint_sha256=digest(package/'weights.safetensors'))
    registry.load(); assert not registry.info()['available'] and registry.state in (ModelState.INCOMPATIBLE,ModelState.ERROR)


@pytest.mark.parametrize('error,expected',[(ImportError('dependency'),ModelState.UNAVAILABLE),(OSError('disk'),ModelState.ERROR)])
def test_loading_state_and_dependency_failure(package,monkeypatch,error,expected):
    registry=ModelRegistry(package,allow_test_fixture=True)
    def fail(*_args):
        assert registry.state==ModelState.LOADING
        raise error
    monkeypatch.setattr('app.inference.registry.CustomGRUAdapter',fail)
    registry.load();assert registry.state==expected and registry.adapter is None


def test_unknown_low_confidence_and_duplicate_request(package):
    edit_metadata(package,confidence_threshold=1.0)
    with ready_client(package) as client:
        wait_ready(client)
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN});socket.receive_json()
            raw=request();socket.send_json(raw);response=socket.receive_json()
            assert response['accepted'] is False and response['label'] is None and response['reason']=='UNKNOWN'
            socket.send_json(raw);assert socket.receive_json()['code']=='STALE_REQUEST'


def test_origins_never_accept_wildcards(monkeypatch):
    from app.inference.security import permitted_origins
    monkeypatch.setenv('SIGNBRIDGE_EXTENSION_ORIGINS','*')
    with pytest.raises(ValueError):permitted_origins()
    monkeypatch.setenv('SIGNBRIDGE_EXTENSION_ORIGINS',ORIGIN)
    assert permitted_origins()=={ORIGIN,'http://127.0.0.1:5173'}


@pytest.mark.parametrize('changes',[{'schema_version':'other'},{'sequence_shape':[32,134]}, {'features':[0]*10},
    {'features':[float('nan')]*5152},{'features':[float('inf')]*5152},{'features':['0']*5152},{'features':[True]*5152},
    {'features':[1e39]*5152},{'sequence_id':True},{'extra':123}])
def test_strict_requests(changes):
    with pytest.raises(ValidationError): PredictRequest.model_validate(request(**changes))


def test_masks():
    raw=request(); raw['features'][159]=.5
    with pytest.raises(ValidationError): PredictRequest.model_validate(raw)
    raw=request();raw['features'][160]=0;raw['features'][63]=1
    with pytest.raises(ValidationError): PredictRequest.model_validate(raw)


def ready_client(package):
    registry=ModelRegistry(package,allow_test_fixture=True)
    return TestClient(create_app(registry=registry,token=TOKEN,origins={ORIGIN}),base_url='http://127.0.0.1')


def authenticate(client):
    socket=client.websocket_connect('ws://127.0.0.1/ws/infer',headers={'origin':ORIGIN})
    return socket


def wait_ready(client):
    for _ in range(200):
        if client.get('/model/info').json()['available']: return
        time.sleep(.01)
    raise AssertionError('TEST FIXTURE model did not load')


def test_websocket_auth_correlation_no_sign_unknown_and_disconnect(package):
    with ready_client(package) as client:
        wait_ready(client)
        assert client.get('/health').json()['model_state']=='MODEL_READY'
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN}); assert socket.receive_json()['type']=='authenticated'
            socket.send_json(request()); response=socket.receive_json()
            assert response['type']=='prediction' and response['request_id']=='fixture-1'
            assert response['label'].startswith('TEST FIXTURE') and response['latency_ms']>0
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN}); socket.receive_json()
            socket.send_json(request(features=[0]*5152)); response=socket.receive_json()
            assert response['reason']=='NO_SIGN' and response['label'] is None and response['confidence'] is None
        assert client.app.state.inference_connections==0


@pytest.mark.parametrize('raw,code',[(lambda:request(schema_version='wrong'),'INVALID_REQUEST'),
    (lambda:request(sequence_shape=[1,161]),'INVALID_REQUEST'),(lambda:request(model_id='unknown'),'UNKNOWN_MODEL'),
    (lambda:request(captured_at_ms=0),'STALE_REQUEST'),(lambda:'{"features":NaN}','INVALID_REQUEST'),
    (lambda:'x'*262145,'PAYLOAD_TOO_LARGE')])
def test_websocket_bad_requests(package,raw,code):
    with ready_client(package) as client:
        wait_ready(client)
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN}); socket.receive_json()
            value=raw(); socket.send_text(value) if isinstance(value,str) else socket.send_json(value)
            assert socket.receive_json()['code']==code


def test_origin_token_and_missing_model():
    with TestClient(create_app(token=TOKEN,origins={ORIGIN}),base_url='http://127.0.0.1') as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('ws://127.0.0.1/ws/infer',headers={'origin':'https://evil.example'}): pass
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':'wrong'*10})
            with pytest.raises(WebSocketDisconnect): socket.receive_json()
        with authenticate(client) as socket:
            socket.send_json({'type':'authenticate','protocol':PROTOCOL,'token':TOKEN}); assert not socket.receive_json()['model']['available']
            socket.send_json(request()); assert socket.receive_json()['code']=='MODEL_NOT_READY'


def test_timeout_keeps_single_busy_slot(package):
    async def scenario():
        registry=ModelRegistry(package,allow_test_fixture=True); registry.load()
        original=registry.adapter.predict
        def slow(values): time.sleep(.1); return original(values)
        registry.adapter.predict=slow
        service=InferenceService(registry,timeout=.005)
        with pytest.raises(InferenceError,match='time limit'): await service.predict(PredictRequest.model_validate(request()))
        with pytest.raises(InferenceError,match='already in progress'): await service.predict(PredictRequest.model_validate(request()))
        await service.close()
    asyncio.run(scenario())


def fixture_dataset(root):
    labels=['TEST FIXTURE A','TEST FIXTURE B']; samples=[]
    for split_index,split in enumerate(['train','validation','test']):
        for target,label in enumerate(labels):
            sample_id=f'{split}-{target}'; features=np.array(request()['features']); features[0]=split_index+target*.1
            source=hashlib.sha256(sample_id.encode()).hexdigest()
            data={'feature_schema':SCHEMA,'preprocessing':PREPROCESSING,'extractor_sha256':'0'*64,'source_sha256':source,
                'windows':[{'features':features.tolist(),'timestamps':[i*70 for i in range(32)]}]}
            file=root/f'{sample_id}.json';file.write_text(json.dumps(data))
            samples.append(dict(id=sample_id,label=label,signer_id=f'pseudonym-{split_index}',duplicate_group=sample_id,source_sha256=source,
                feature_path=file.name,feature_sha256=digest(file),split=split))
    manifest=dict(purpose='test_fixture',dataset_id='TEST FIXTURE',language='ISL',source='TEST FIXTURE',license='test-only',
        feature_schema=SCHEMA,preprocessing=PREPROCESSING,extractor_sha256='0'*64,labels=labels,samples=samples)
    path=root/'manifest.json';path.write_text(json.dumps(manifest));return path


def test_dataset_integrity_and_training_smoke(tmp_path):
    manifest=fixture_dataset(tmp_path)
    with pytest.raises(ValueError,match='Real labeled'): load_dataset(manifest)
    first=load_dataset(manifest,allow_test_fixture=True); second=load_dataset(manifest,allow_test_fixture=True)
    np.testing.assert_array_equal(first[1][0]['x'],second[1][0]['x'])
    report=train(manifest,tmp_path/'model',epochs=2,batch_size=2,patience=1,config=GRUConfig(hidden_size=8,num_layers=1,dropout=0),allow_test_fixture=True)
    assert len(report['history'])>=1 and report['purpose']=='test_fixture' and report['test_samples']==2
    registry=ModelRegistry(tmp_path/'model',allow_test_fixture=True);registry.load();assert registry.state==ModelState.READY
    registry.close(); registry=ModelRegistry(tmp_path/'model');registry.load();assert registry.state==ModelState.INCOMPATIBLE


@pytest.mark.parametrize('field,value',[('signer_id','pseudonym-0'),('duplicate_group','train-0'),('source_sha256',hashlib.sha256(b'train-0').hexdigest()),('label','invented')])
def test_dataset_leakage_and_labels(tmp_path,field,value):
    path=fixture_dataset(tmp_path);data=json.loads(path.read_text());data['samples'][2][field]=value;path.write_text(json.dumps(data))
    with pytest.raises(ValueError):load_dataset(path,allow_test_fixture=True)


def test_dataset_hash_missing_landmarks_and_gaps(tmp_path):
    path=fixture_dataset(tmp_path); data=json.loads(path.read_text()); file=tmp_path/data['samples'][0]['feature_path']
    original=json.loads(file.read_text()); original['windows'][0]['timestamps'][1]=500
    file.write_text(json.dumps(original))
    with pytest.raises(ValueError,match='checksum'):load_dataset(path,allow_test_fixture=True)
    data['samples'][0]['feature_sha256']=digest(file);path.write_text(json.dumps(data))
    with pytest.raises(ValueError,match='timestamps'):load_dataset(path,allow_test_fixture=True)
