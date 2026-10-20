import type { InferenceResult, LandmarkSequence } from '../vision/types';
import { MODEL_STATES, type ModelState } from '../inference/contracts';

export type CaptureState = 'inactive' | 'starting' | 'active' | 'stopped' | 'error';
export type FutureMessage =
  | { type: 'START_CAPTURE'; mode: 'webcam' | 'meeting-tab' }
  | { type: 'STOP_CAPTURE' }
  | { type: 'CAPTURE_STATUS'; state: CaptureState }
  | { type: 'LANDMARK_SEQUENCE'; sequence: LandmarkSequence }
  | { type: 'INFERENCE_RESULT'; result: InferenceResult }
  | { type: 'ERROR'; code: string; message: string };
export type WorkerMessage = {
  target: 'background';
} & ({ type: 'GET_STATUS' } | { type: 'CHECK_BACKEND' } | FutureMessage);
export type OffscreenMessage = { target: 'offscreen' } & ({ type: 'GET_STATUS' } | FutureMessage);
export type ContentMessage = { target: 'content' } & (
  | { type: 'GET_STATUS' }
  | Extract<FutureMessage, { type: 'INFERENCE_RESULT' | 'CAPTURE_STATUS' | 'ERROR' }>
);
export type ExtensionMessage = WorkerMessage | OffscreenMessage | ContentMessage;

export interface ExtensionStatus {
  version: string;
  phase: 3;
  recognition: 'managed_in_webcam_studio';
  camera: 'managed_in_webcam_studio';
  model: 'reported_by_backend';
}
export interface HealthResponse {
  status: 'ok';
  service: 'SignBridge AI Backend';
  phase: 3;
  model_status: 'not_loaded' | 'loaded';
  model_state: ModelState;
}
export type BackendStatus =
  | { state: 'online'; health: HealthResponse }
  | { state: 'offline' | 'error'; message: string };
export type Failure = { ok: false; code: 'NOT_IMPLEMENTED' | 'INVALID_MESSAGE' | 'FORBIDDEN' | 'INTERNAL_ERROR'; message: string };
export type WorkerResponse = Failure | { ok: true; type: 'STATUS'; status: ExtensionStatus } | { ok: true; type: 'BACKEND_STATUS'; backend: BackendStatus };

export const futureTypes: ReadonlySet<string> = new Set([
  'START_CAPTURE', 'STOP_CAPTURE', 'CAPTURE_STATUS', 'LANDMARK_SEQUENCE', 'INFERENCE_RESULT', 'ERROR',
]);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function notImplemented(): Failure {
  return { ok: false, code: 'NOT_IMPLEMENTED', message: 'Use the visible webcam studio for local landmarks. Background capture and meeting capture are not implemented. Opt-in inference is managed only in the studio.' };
}
export function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && value.status === 'ok' && value.service === 'SignBridge AI Backend'
    && value.phase === 3 && (value.model_status === 'not_loaded' || value.model_status === 'loaded')
    && MODEL_STATES.includes(value.model_state as ModelState);
}
