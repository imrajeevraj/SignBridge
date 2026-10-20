import { BACKEND_URL } from '../background/health';
import type { FrameResult } from '../vision/session';
import { INFERENCE_PROTOCOL, isModelInfo, isPrediction, type ModelInfo, type Prediction } from './contracts';
import { PredictionFilter } from './filter';

export type RecognitionState = 'Disabled' | 'Connecting' | 'Waiting for signer' | 'Collecting frames' | 'Recognizing' | 'Sign detected' | 'Unknown sign' | 'Backend disconnected' | 'Error';
export interface RecognitionHooks {
  state(state: RecognitionState, detail?: string): void;
  model(model: ModelInfo): void;
  prediction(result: Prediction, timings: { roundTripMs: number; endToEndMs: number; accumulationMs: number }): void;
  clear(): void;
}
export class InferenceClient {
  private socket?: WebSocket;
  private model?: ModelInfo;
  private generation = 0;
  private epoch = 0;
  private serial = 0;
  private continuity = -1;
  private visibleLabel: string | null = null;
  private pending?: { id: string; sequence: number; epoch: number; captured: number; sent: number; accumulation: number };
  private timer?: ReturnType<typeof setTimeout>;
  private filter = new PredictionFilter();
  constructor(private hooks: RecognitionHooks, private makeSocket = (url: string) => new WebSocket(url), private clock = () => Date.now()) {}

  connect(token: string, options = { threshold: 0.8, consecutive: 2, cooldownMs: 1500 }) {
    this.stop();
    const generation = ++this.generation;
    this.filter = new PredictionFilter(options.threshold, options.consecutive, options.cooldownMs);
    this.hooks.state('Connecting');
    let socket: WebSocket;
    try { socket = this.makeSocket(BACKEND_URL.replace('http:', 'ws:') + '/ws/infer'); }
    catch { this.fail('Cannot create a local connection.', 'Backend disconnected'); return; }
    this.socket = socket;
    this.timer = setTimeout(() => this.fail('Authentication timed out.'), 6000);
    socket.onopen = () => { if (generation === this.generation) socket.send(JSON.stringify({ type: 'authenticate', protocol: INFERENCE_PROTOCOL, token })); token = ''; };
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      let data: unknown;
      try { if (typeof event.data !== 'string' || event.data.length > 131072) throw new Error(); data = JSON.parse(event.data); }
      catch { this.fail('Malformed inference response.'); return; }
      if (data !== null && typeof data === 'object' && 'type' in data && data.type === 'authenticated') {
        if (!('protocol' in data) || data.protocol !== INFERENCE_PROTOCOL || !('model' in data) || !isModelInfo(data.model)) { this.fail('Incompatible model response.'); return; }
        clearTimeout(this.timer); this.hooks.model(data.model);
        if (generation !== this.generation) return;
        if (!data.model.available) { this.fail(data.model.message); return; }
        this.model = data.model; this.hooks.state('Waiting for signer'); return;
      }
      if (data !== null && typeof data === 'object' && 'type' in data && data.type === 'error') {
        this.fail('message' in data && typeof data.message === 'string' ? data.message : 'Backend rejected inference.'); return;
      }
      if (!isPrediction(data)) { this.fail('Invalid prediction response.'); return; }
      const pending = this.pending;
      if (!pending || data.request_id !== pending.id || data.sequence_id !== pending.sequence) return;
      this.pending = undefined; clearTimeout(this.timer);
      if (pending.epoch !== this.epoch || this.clock() - pending.captured > 5000) return;
      if (!this.model || data.model_id !== this.model.model_id || data.captured_at_ms !== pending.captured
        || (data.label !== null && !this.model.labels.includes(data.label))) { this.fail('Prediction does not match the selected model/request.'); return; }
      if (this.filter.accept(data, this.clock())) {
        this.visibleLabel = data.label;
        this.hooks.prediction(data, { roundTripMs: this.clock() - pending.sent, endToEndMs: this.clock() - pending.captured, accumulationMs: pending.accumulation });
        this.hooks.state('Sign detected');
      } else {
        const confident = data.accepted && data.confidence !== null && data.confidence >= options.threshold;
        if (confident && data.label === this.visibleLabel) this.hooks.state('Sign detected');
        else {
          this.visibleLabel = null; this.hooks.clear();
          this.hooks.state(data.reason === 'NO_SIGN' ? 'Waiting for signer' : confident ? 'Recognizing' : 'Unknown sign');
        }
      }
    };
    socket.onclose = () => { if (generation === this.generation) this.fail('Connection closed. Reconnect explicitly.', 'Backend disconnected'); };
    socket.onerror = () => { if (generation === this.generation) this.fail('Cannot connect to the authorized local backend.', 'Backend disconnected'); };
  }

  frame(frame: FrameResult) {
    if (!this.model || this.socket?.readyState !== 1) return;
    if (frame.continuity !== undefined && frame.continuity !== this.continuity) {
      this.continuity = frame.continuity; this.epoch++; this.filter.reset(); this.visibleLabel = null; this.hooks.clear();
    }
    if (frame.featureState !== 'ready') {
      this.epoch++; this.filter.reset(); this.visibleLabel = null; this.hooks.clear();
      this.hooks.state('Waiting for signer'); return;
    }
    if (frame.bufferSize < 32) { this.hooks.state('Collecting frames'); return; }
    const sequence = frame.sequence;
    if (!sequence || this.pending) return;
    if ((sequence.schema ?? 'signbridge.custom-gru.v1') !== this.model.feature_schema
      || (sequence.samplingHz ?? 15) !== (this.model.sampling_hz ?? 15)
      || sequence.values.length !== 32 * this.model.sequence_shape![1]! || sequence.timestamps.length !== 32) {
      this.fail('Camera feature contract differs from the model. Stop capture, refresh model status and restart.'); return;
    }
    const last = sequence.timestamps[31]!;
    const captured = Math.round(performance.timeOrigin + last);
    const now = this.clock();
    if (now - captured > 5000 || captured > now + 1000) return;
    const serial = ++this.serial; const id = `window-${serial}`;
    this.pending = { id, sequence: serial, epoch: this.epoch, captured, sent: now, accumulation: last - sequence.timestamps[0]! };
    try {
      this.socket.send(JSON.stringify({ type: 'predict', protocol: INFERENCE_PROTOCOL, request_id: id,
        sequence_id: serial, model_id: this.model.model_id, schema_version: this.model.feature_schema,
        ...(this.model.feature_schema === 'signbridge.custom-gru.v2' ? {sampling_hz:30} : {}),
        sequence_shape: this.model.sequence_shape, captured_at_ms: captured, sent_at_ms: now, features: Array.from(sequence.values) }));
      this.timer = setTimeout(() => this.fail('Inference timed out; reconnect to retry.'), 5000);
      this.hooks.state('Recognizing');
    } catch { this.fail('Could not send a feature window.', 'Backend disconnected'); }
  }

  stop() {
    this.generation++; this.epoch++; clearTimeout(this.timer);
    if (this.socket) { this.socket.onclose = null; this.socket.onerror = null; this.socket.onmessage = null; this.socket.onopen = null; this.socket.close(); }
    this.socket = undefined; this.model = undefined; this.pending = undefined; this.continuity = -1;
    this.filter.reset(); this.visibleLabel = null; this.hooks.clear(); this.hooks.state('Disabled');
  }
  private fail(message: string, state: RecognitionState = 'Error') { this.stop(); this.hooks.state(state, message); }
}
