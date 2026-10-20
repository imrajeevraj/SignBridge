import type { VisionRequest, VisionResponse } from './protocol';
import type { FeatureSchema } from './schemas';
import { FEATURE_SCHEMA } from './features';

export type SessionState = 'idle' | 'requesting' | 'loading' | 'running' | 'stopped' | 'error';
export type FrameResult = Extract<VisionResponse, { type: 'RESULT' }>;
export interface SessionHooks {
  state(state: SessionState, message: string): void;
  frame(result: FrameResult): void;
  clear(): void;
}
export interface SessionDependencies {
  getMedia(): Promise<MediaStream>;
  worker(): Worker;
  bitmap(video: HTMLVideoElement): Promise<ImageBitmap>;
  lease(): Promise<() => void>;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  requestVideoFrame?(callback: (now: number, mediaTime: number) => void): number;
  cancelVideoFrame?(id: number): void;
}

export function acquireCameraLease(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    void navigator.locks.request('signbridge-webcam', { ifAvailable: true }, (lock) => {
      if (!lock) { reject(new Error('Another SignBridge studio is using the camera. Stop it first.')); return; }
      return new Promise<void>((release) => resolve(release));
    }).catch(reject);
  });
}

export function cameraError(error: unknown): string {
  const name = error !== null && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow this extension in Chrome’s camera settings and try again.';
  if (name === 'NotFoundError') return 'No camera was found. Connect a webcam and try again.';
  if (name === 'NotReadableError') return 'The camera is unavailable or in use by another application.';
  return error instanceof Error ? error.message : 'Could not start webcam landmarks.';
}

/** Owns every stream, worker and scheduled frame. Cancellation also covers late
 * permission/model promises, so Stop never leaves a late-arriving stream alive. */
export class WebcamSession {
  private generation = 0;
  private stream?: MediaStream;
  private vision?: Worker;
  private releaseLease?: () => void;
  private pendingReject?: (error: Error) => void;
  private animation = 0;
  private busy = false;
  private active = false;
  private lastVideoTime = -1;
  private lastSent = -Infinity;
  private watchdog?: ReturnType<typeof setTimeout>;
  private samplingHz = 15;
  private nextVideoTime = -Infinity;

  constructor(private video: HTMLVideoElement, private hooks: SessionHooks, private dependencies: SessionDependencies) {}

  async start(schema: FeatureSchema = FEATURE_SCHEMA): Promise<void> {
    if (this.active) return;
    this.samplingHz = schema === 'signbridge.custom-gru.v2' ? 30 : 15;
    this.active = true;
    const token = ++this.generation;
    this.hooks.state('requesting', 'Waiting for camera permission…');
    try {
      const release = await this.dependencies.lease();
      if (token !== this.generation) { release(); return; }
      this.releaseLease = release;
      const stream = await this.dependencies.getMedia();
      if (token !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (token === this.generation) this.fail('Camera disconnected or permission revoked.'); }, { once: true });
      this.video.srcObject = stream;
      await this.video.play();
      if (token !== this.generation) return;
      this.hooks.state('loading', 'Loading local hand and pose detectors…');
      const worker = this.dependencies.worker();
      this.vision = worker;
      await new Promise<void>((resolve, reject) => {
        this.pendingReject = reject;
        this.watchdog = setTimeout(() => reject(new Error('Local models did not load within 30 seconds. Rebuild or run npm run assets:setup.')), 30_000);
        worker.onerror = (event) => { event.preventDefault(); this.fail('Local landmark worker failed. Check packaged assets and reload the extension.'); };
        worker.onmessage = (event: MessageEvent<VisionResponse>) => {
          if (token !== this.generation) return;
          if (event.data.type === 'ERROR') { this.fail(event.data.message); return; }
          clearTimeout(this.watchdog);
          if (event.data.type === 'READY') { this.pendingReject = undefined; resolve(); }
          if (event.data.type === 'RESULT') { this.busy = false; this.hooks.frame(event.data); }
        };
        worker.postMessage({ type: 'INITIALIZE', schema } satisfies VisionRequest);
      });
      if (token !== this.generation) return;
      this.hooks.state('running', 'Camera active · Local landmarks only');
      this.schedule(token);
    } catch (error) { if (token === this.generation) this.fail(cameraError(error)); }
  }

  private schedule(token: number) {
    const consume = (timestamp: number, mediaTime = this.video.currentTime) => {
      if (token !== this.generation) return;
      this.schedule(token);
      if (this.busy || this.video.readyState < 2 || mediaTime === this.lastVideoTime) return;
      if (this.samplingHz === 15 && timestamp - this.lastSent < 1000 / 15) return;
      if (this.samplingHz === 30 && mediaTime * 1000 + 0.001 < this.nextVideoTime) return;
      this.busy = true;
      this.lastVideoTime = mediaTime;
      this.lastSent = timestamp;
      this.nextVideoTime = Number.isFinite(this.nextVideoTime) ? Math.max(this.nextVideoTime + 1000 / 30, mediaTime * 1000) : mediaTime * 1000 + 1000 / 30;
      void this.dependencies.bitmap(this.video).then((bitmap) => {
        if (token !== this.generation) { bitmap.close(); return; }
        this.watchdog = setTimeout(() => this.fail('Landmark processing stopped responding. Camera released; try restarting.'), 10_000);
        try {
          this.vision!.postMessage({ type: 'FRAME', bitmap, timestampMs: timestamp } satisfies VisionRequest, [bitmap]);
        } catch (error) { bitmap.close(); throw error; }
      }).catch((error: unknown) => { if (token === this.generation) this.fail(cameraError(error)); });
    };
    if (this.samplingHz === 30) {
      if (!this.dependencies.requestVideoFrame || !this.dependencies.cancelVideoFrame) throw new Error('Decoded video frame callbacks are required for v2.');
      this.animation = this.dependencies.requestVideoFrame(consume);
    } else this.animation = this.dependencies.requestFrame(consume);
  }

  stop(message = 'Camera stopped. All video tracks and landmark buffers are released.') {
    this.dispose();
    this.hooks.state('stopped', message);
  }
  private fail(message: string) { this.dispose(); this.hooks.state('error', message); }
  private dispose() {
    this.generation++;
    this.active = false;
    if (this.samplingHz === 30) this.dependencies.cancelVideoFrame?.(this.animation);
    else this.dependencies.cancelFrame(this.animation);
    clearTimeout(this.watchdog);
    this.pendingReject?.(new Error('Session cancelled.')); this.pendingReject = undefined;
    this.vision?.terminate(); this.vision = undefined;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = undefined;
    this.video.pause(); this.video.srcObject = null;
    this.releaseLease?.(); this.releaseLease = undefined;
    this.busy = false; this.lastVideoTime = -1; this.lastSent = -Infinity; this.nextVideoTime = -Infinity;
    this.hooks.clear();
  }
}
