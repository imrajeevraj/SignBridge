import type { ModelInfo, Prediction } from '../src/inference/contracts';
import { INFERENCE_PROTOCOL } from '../src/inference/contracts';
import type { FrameResult } from '../src/vision/session';

// TEST FIXTURE: transport/lifecycle data, not sign recognition evidence.
export const model: ModelInfo = { state:'MODEL_READY', available:true, model_id:'test-fixture', model_type:'custom_gru',
  sign_language:'ISL', model_version:'TEST FIXTURE', feature_schema:'signbridge.custom-gru.v1',sequence_shape:[32,161],
  labels:['TEST FIXTURE A','TEST FIXTURE B'], vocabulary_size:2, confidence_threshold:.8,calibrated:false,message:'TEST FIXTURE only' };
export const prediction: Prediction = {type:'prediction',protocol:INFERENCE_PROTOCOL,request_id:'window-1',sequence_id:1,
  model_id:'test-fixture',label:'TEST FIXTURE A',confidence:.95,accepted:true,reason:'ACCEPTED',latency_ms:2,captured_at_ms:0};
export class FakeSocket {
  static instances: FakeSocket[]=[];
  onopen: ((event: Event)=>unknown)|null=null;
  onmessage: ((event: MessageEvent)=>unknown)|null=null;
  onerror: ((event: Event)=>unknown)|null=null;
  onclose: ((event: CloseEvent)=>unknown)|null=null;
  readyState=1; sent: Record<string,unknown>[]=[]; closed=false;
  constructor(public url: string) {FakeSocket.instances.push(this);}
  send(text: string) {this.sent.push(JSON.parse(text) as Record<string,unknown>);}
  close() {this.closed=true;this.readyState=3;}
  open() {this.onopen?.(new Event('open'));}
  receive(value:unknown) {this.onmessage?.(new MessageEvent('message',{data:JSON.stringify(value)}));}
  authenticate() {this.open();this.receive({type:'authenticated',protocol:INFERENCE_PROTOCOL,model});}
  respond(overrides:Partial<Prediction>={}) {
    const request=this.sent.at(-1)!;
    this.receive({...prediction,request_id:request.request_id,sequence_id:request.sequence_id,captured_at_ms:request.captured_at_ms,...overrides});
  }
}
export function frame(now=Date.now(), continuity=0): FrameResult {
  const values=new Float32Array(5152);for(let i=0;i<32;i++)values[i*161+159]=1;
  return {type:'RESULT',frame:{timestampMs:now-performance.timeOrigin,imageWidth:640,imageHeight:480,leftHand:null,rightHand:null,pose:null},
    featureState:'ready',bufferSize:32,windows:1,processingMs:10,continuity,featureMs:.1,
    sequence:{values,timestamps:Array.from({length:32},(_,i)=>now-performance.timeOrigin-(31-i)*70)}};
}
