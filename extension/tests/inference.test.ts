import { afterEach, describe, expect, it, vi } from 'vitest';
import { InferenceClient } from '../src/inference/client';
import { PredictionFilter } from '../src/inference/filter';
import { isModelInfo, isPrediction } from '../src/inference/contracts';
import { FakeSocket, frame, model, prediction } from './inference-fixtures';

afterEach(()=>vi.useRealTimers());
describe('TEST FIXTURE inference contracts and filtering',()=>{
  it('rejects incompatible metadata and nonfinite or fictitious predictions',()=>{
    expect(isModelInfo(model)).toBe(true);
    expect(isModelInfo({...model,sequence_shape:[32,134]})).toBe(false);
    expect(isModelInfo({...model,sign_language:'English'})).toBe(false);
    expect(isPrediction({...prediction,confidence:NaN})).toBe(false);
    expect(isPrediction({...prediction,accepted:true,label:null})).toBe(false);
  });
  it('enforces confidence, stability, cooldown, duplicate and neutral resets',()=>{
    const filter=new PredictionFilter(.8,2,1500);
    expect(filter.accept({...prediction,confidence:.7},0)).toBe(false);
    expect(filter.accept(prediction,1)).toBe(false);expect(filter.accept(prediction,2)).toBe(true);
    expect(filter.accept(prediction,2000)).toBe(false);
    const other={...prediction,label:'TEST FIXTURE B'};
    expect(filter.accept(other,3)).toBe(false);expect(filter.accept(other,4)).toBe(false);
    expect(filter.accept(other,2001)).toBe(true);
    expect(filter.accept({...prediction,accepted:false,label:null,reason:'NO_SIGN'},2100)).toBe(false);
    expect(filter.accept(other,4000)).toBe(false);expect(filter.accept(other,4001)).toBe(true);
    expect(filter.accept({...other,accepted:false,label:null,reason:'UNKNOWN'},4100)).toBe(false);
    expect(filter.accept(other,6000)).toBe(false);expect(filter.accept(other,6001)).toBe(true);
    filter.reset();expect(filter.accept(prediction,5000)).toBe(false);
  });
});

function setup(){
  const hooks={state:vi.fn(),model:vi.fn(),prediction:vi.fn(),clear:vi.fn()};
  const client=new InferenceClient(hooks,url=>new FakeSocket(url) as unknown as WebSocket);
  client.connect('TEST_FIXTURE_'+'x'.repeat(40),{threshold:.8,consecutive:1,cooldownMs:0});
  const socket=FakeSocket.instances.at(-1)!;return {client,socket,hooks};
}
describe('bounded opt-in inference client',()=>{
  it('routes explicitly tagged v2 windows and rejects cross-schema data',()=>{
    const {client,socket,hooks}=setup();const v2={...model,feature_schema:'signbridge.custom-gru.v2',sequence_shape:[32,172],sampling_hz:30};
    expect(isModelInfo(v2)).toBe(true);expect(isModelInfo({...v2,sequence_shape:[32,161]})).toBe(false);
    socket.open();socket.receive({type:'authenticated',protocol:'signbridge.inference.v1',model:v2});
    const f=frame();f.sequence={...f.sequence!,schema:'signbridge.custom-gru.v2',samplingHz:30,values:new Float32Array(5504)};
    client.frame(f);expect(socket.sent.at(-1)!.schema_version).toBe(v2.feature_schema);
    expect(socket.sent.at(-1)!.features).toHaveLength(5504);socket.respond();
    client.frame(frame());expect(socket.closed).toBe(true);expect(hooks.state).toHaveBeenLastCalledWith('Error',expect.stringContaining('contract'));
  });
  it('authenticates, sends numeric windows only and correlates a real response shape',()=>{
    const {client,socket,hooks}=setup();socket.authenticate();client.frame(frame());client.frame(frame());
    expect(socket.sent).toHaveLength(2); const request=socket.sent[1]!;
    expect(Object.keys(request).sort()).toEqual(['type','protocol','request_id','sequence_id','model_id','schema_version','sequence_shape','captured_at_ms','sent_at_ms','features'].sort());
    expect(request.features).toHaveLength(5152);expect((request.features as unknown[]).every(v=>typeof v==='number')).toBe(true);
    socket.respond();expect(hooks.prediction).toHaveBeenCalledTimes(1);expect(hooks.state).toHaveBeenLastCalledWith('Sign detected');
    client.stop();expect(socket.closed).toBe(true);
  });
  it('ignores stale IDs, invalidated windows and late responses after stop',()=>{
    const {client,socket,hooks}=setup();socket.authenticate();client.frame(frame());
    socket.respond({request_id:'old'});expect(hooks.prediction).not.toHaveBeenCalled();
    client.frame({...frame(Date.now(),1),featureState:'no_hands',bufferSize:0,sequence:undefined});socket.respond();
    expect(hooks.prediction).not.toHaveBeenCalled();client.frame(frame(Date.now(),1));
    const late=socket.onmessage;const request=socket.sent.at(-1)!;client.stop();
    late?.(new MessageEvent('message',{data:JSON.stringify({...prediction,...request,type:'prediction'})}));
    expect(hooks.prediction).not.toHaveBeenCalled();
  });
  it('clears uncertain predictions and never invents a label',()=>{
    const {client,socket,hooks}=setup();socket.authenticate();client.frame(frame());socket.respond({accepted:false,label:null,confidence:.4,reason:'UNKNOWN'});
    expect(hooks.prediction).not.toHaveBeenCalled();expect(hooks.state).toHaveBeenLastCalledWith('Unknown sign');expect(hooks.clear).toHaveBeenCalled();
    client.frame(frame());socket.respond({label:'invented'});expect(hooks.state).toHaveBeenLastCalledWith('Error',expect.stringContaining('does not match'));client.stop();
  });
  it('disconnects on timeouts and requires explicit reconnection',()=>{
    vi.useFakeTimers();const {client,socket,hooks}=setup();socket.authenticate();client.frame(frame());
    vi.advanceTimersByTime(5001);expect(socket.closed).toBe(true);expect(hooks.state).toHaveBeenLastCalledWith('Error',expect.stringContaining('timed out'));
    const count=FakeSocket.instances.length;vi.advanceTimersByTime(60000);expect(FakeSocket.instances).toHaveLength(count);
    client.connect('x'.repeat(40));expect(FakeSocket.instances).toHaveLength(count+1);client.stop();
  });
  it('fails closed for missing models and failed socket creation',()=>{
    const {client,socket,hooks}=setup();socket.receive({type:'authenticated',protocol:'signbridge.inference.v1',model:{...model,state:'MODEL_NOT_INSTALLED',available:false,labels:[],vocabulary_size:0}});
    expect(socket.closed).toBe(true);client.frame(frame());expect(hooks.prediction).not.toHaveBeenCalled();
    new InferenceClient(hooks,()=>{throw new Error('socket failure');}).connect('x'.repeat(40));
    expect(hooks.state).toHaveBeenLastCalledWith('Backend disconnected',expect.any(String));
  });
});
