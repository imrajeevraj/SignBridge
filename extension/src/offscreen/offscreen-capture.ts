import { InferenceClient } from '../inference/client';
import { calculateAspectPreservingCrop } from '../roi/roi-transform';
import type { RegionOfInterest } from '../roi/types';
import type { VisionRequest, VisionResponse } from '../vision/protocol';
import type { FrameResult } from '../vision/session';

export interface OffscreenCaptureHooks {
  onPrediction: (label: string, confidence: number, accepted: boolean) => void;
  onError: (code: string, message: string) => void;
  onStateChange: (state: string) => void;
}

export class OffscreenCaptureSession {
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private worker?: Worker;
  private inference?: InferenceClient;
  private currentROI?: RegionOfInterest;
  private active = false;
  private busy = false;
  private animId = 0;
  private lastVideoTime = -1;
  private nextVideoTime = -Infinity;
  private token = 0;

  constructor(
    private hooks: OffscreenCaptureHooks,
    private makeWorker = () => new Worker(chrome.runtime.getURL('vision-worker.js')),
    private makeInference = (hooks: any) => new InferenceClient(hooks)
  ) {}

  async start(streamId: string, initialROI?: RegionOfInterest): Promise<void> {
    this.stop();
    const currentToken = ++this.token;
    this.active = true;
    this.currentROI = initialROI;
    this.hooks.onStateChange('requesting_stream');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        } as unknown as MediaTrackConstraints,
      });

      if (currentToken !== this.token) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.stream = stream;

      for (const track of stream.getTracks()) {
        track.addEventListener(
          'ended',
          () => {
            if (currentToken === this.token) {
              this.hooks.onError(
                'STREAM_ENDED',
                'Tab capture stream ended (tab closed or user stopped sharing).'
              );
              this.stop();
            }
          },
          { once: true }
        );
      }

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.video = video;

      await video.play();
      if (currentToken !== this.token) return;

      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      // Init MediaPipe Worker
      this.hooks.onStateChange('loading_detector');
      const worker = this.makeWorker();
      this.worker = worker;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MediaPipe worker initialization timed out'));
        }, 30000);

        worker.onmessage = (e: MessageEvent<VisionResponse>) => {
          if (currentToken !== this.token) return;
          if (e.data.type === 'READY') {
            clearTimeout(timeout);
            resolve();
          } else if (e.data.type === 'ERROR') {
            clearTimeout(timeout);
            reject(new Error(e.data.message));
          } else if (e.data.type === 'RESULT') {
            this.busy = false;
            this.handleWorkerResult(e.data);
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };

        worker.postMessage({
          type: 'INITIALIZE',
          schema: 'signbridge.custom-gru.v2',
        } satisfies VisionRequest);
      });

      if (currentToken !== this.token) return;

      // Init Inference Client
      this.hooks.onStateChange('connecting_backend');
      this.inference = this.makeInference({
        state: (state: string) => this.hooks.onStateChange(state),
        model: () => {},
        prediction: (pred: any) => {
          if (pred.accepted && pred.label && pred.label !== 'NO_SIGN') {
            this.hooks.onPrediction(pred.label, pred.confidence ?? 0, true);
          }
        },
        clear: () => {},
      });

      this.inference?.connect('', { threshold: 0.8, consecutive: 2, cooldownMs: 1500 });
      this.hooks.onStateChange('capturing');

      this.scheduleLoop(currentToken);
    } catch (err: any) {
      if (currentToken === this.token) {
        this.hooks.onError(
          'CAPTURE_FAILED',
          err instanceof Error ? err.message : 'Could not initialize tab capture.'
        );
        this.stop();
      }
    }
  }

  setROI(roi: RegionOfInterest): void {
    this.currentROI = roi;
  }

  private handleWorkerResult(result: FrameResult): void {
    if (!this.active || !this.inference) return;
    this.inference.frame(result);
  }

  private scheduleLoop(token: number): void {
    const video = this.video;
    if (!video) return;

    const processFrame = (_now: number, metadata?: { mediaTime: number }) => {
      if (token !== this.token || !this.active) return;

      const mediaTime = metadata ? metadata.mediaTime : video.currentTime;

      if (!this.busy && video.readyState >= 2 && mediaTime !== this.lastVideoTime) {
        if (!Number.isFinite(this.nextVideoTime) || mediaTime * 1000 + 0.001 >= this.nextVideoTime) {
          this.busy = true;
          this.lastVideoTime = mediaTime;
          this.nextVideoTime = Number.isFinite(this.nextVideoTime)
            ? Math.max(this.nextVideoTime + 1000 / 30, mediaTime * 1000)
            : mediaTime * 1000 + 1000 / 30;

          void this.extractAndSendBitmap(token, performance.now());
        }
      }

      if ('requestVideoFrameCallback' in video) {
        this.animId = (video as any).requestVideoFrameCallback(processFrame);
      } else {
        this.animId = requestAnimationFrame((t) => processFrame(t));
      }
    };

    if ('requestVideoFrameCallback' in video) {
      this.animId = (video as any).requestVideoFrameCallback(processFrame);
    } else {
      this.animId = requestAnimationFrame((t) => processFrame(t));
    }
  }

  private async extractAndSendBitmap(token: number, timestampMs: number): Promise<void> {
    const video = this.video;
    if (!video || !this.worker || token !== this.token) {
      this.busy = false;
      return;
    }

    try {
      let bitmap: ImageBitmap;

      if (this.currentROI && this.canvas && this.ctx && video.videoWidth > 0 && video.videoHeight > 0) {
        const { crop, destWidth, destHeight } = calculateAspectPreservingCrop(
          this.currentROI,
          video.videoWidth,
          video.videoHeight,
          640
        );

        if (crop.width > 0 && crop.height > 0 && destWidth > 0 && destHeight > 0) {
          if (this.canvas.width !== destWidth || this.canvas.height !== destHeight) {
            this.canvas.width = destWidth;
            this.canvas.height = destHeight;
          }

          this.ctx.drawImage(
            video,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            destWidth,
            destHeight
          );

          bitmap = await createImageBitmap(this.canvas);
        } else {
          bitmap = await createImageBitmap(video);
        }
      } else {
        bitmap = await createImageBitmap(video);
      }

      if (token !== this.token) {
        bitmap.close();
        this.busy = false;
        return;
      }

      this.worker.postMessage(
        {
          type: 'FRAME',
          bitmap,
          timestampMs,
        } satisfies VisionRequest,
        [bitmap]
      );
    } catch {
      this.busy = false;
    }
  }

  stop(): void {
    this.token++;
    this.active = false;
    this.busy = false;
    this.lastVideoTime = -1;
    this.nextVideoTime = -Infinity;

    if (this.video) {
      if ('cancelVideoFrameCallback' in this.video) {
        (this.video as any).cancelVideoFrameCallback(this.animId);
      } else {
        cancelAnimationFrame(this.animId);
      }
      this.video.pause();
      this.video.srcObject = null;
      this.video = undefined;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = undefined;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }

    if (this.inference) {
      this.inference.stop();
      this.inference = undefined;
    }

    this.canvas = undefined;
    this.ctx = undefined;
    this.currentROI = undefined;
    this.hooks.onStateChange('stopped');
  }
}
