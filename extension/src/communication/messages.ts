import type { InferenceResult, LandmarkSequence } from '../vision/types';
import { MODEL_STATES, type ModelState } from '../inference/contracts';
import type { RegionOfInterest } from '../roi/types';

export type CaptureState = 'inactive' | 'starting' | 'active' | 'stopped' | 'error';

export type FutureMessage =
  | { type: 'START_CAPTURE'; mode: 'webcam' | 'meeting-tab' }
  | { type: 'STOP_CAPTURE' }
  | { type: 'CAPTURE_STATUS'; state: CaptureState }
  | { type: 'LANDMARK_SEQUENCE'; sequence: LandmarkSequence }
  | { type: 'INFERENCE_RESULT'; result: InferenceResult }
  | { type: 'ERROR'; code: string; message: string };

export type MeetingCaptureStatus =
  | 'idle'
  | 'requesting_permission'
  | 'capturing'
  | 'selecting_roi'
  | 'active'
  | 'stopped'
  | 'error';

export interface MeetingState {
  status: MeetingCaptureStatus;
  activeTabId?: number;
  activeTabTitle?: string;
  roi?: RegionOfInterest;
  error?: string;
  hasActiveStream: boolean;
  lastPrediction?: {
    label: string;
    confidence: number;
    timestamp: number;
  };
}

export interface MeetingTabInfo {
  id: number;
  title: string;
  url: string;
  platform: string;
}

export type MeetingWorkerMessage =
  | { type: 'GET_MEETING_STATE' }
  | { type: 'GET_MEETING_TABS' }
  | { type: 'START_MEETING_CAPTURE'; tabId: number; roi?: RegionOfInterest }
  | { type: 'STOP_MEETING_CAPTURE' }
  | { type: 'UPDATE_ROI'; roi: RegionOfInterest }
  | { type: 'ROI_SELECTED'; roi: RegionOfInterest }
  | { type: 'MEETING_PREDICTION'; label: string; confidence: number; accepted: boolean }
  | { type: 'MEETING_ERROR'; code: string; message: string };

export type MeetingOffscreenMessage =
  | { type: 'INIT_CAPTURE'; streamId: string; roi?: RegionOfInterest }
  | { type: 'SET_ROI'; roi: RegionOfInterest }
  | { type: 'STOP_OFFSCREEN_CAPTURE' };

export type MeetingContentMessage =
  | { type: 'SHOW_ROI_SELECTOR' }
  | { type: 'HIDE_ROI_SELECTOR' }
  | { type: 'SHOW_CAPTIONS' }
  | { type: 'UPDATE_CAPTION'; text: string; confidence: number; accepted: boolean }
  | { type: 'CLEAR_CAPTION' }
  | { type: 'CLOSE_CAPTIONS' };

export type WorkerMessage = {
  target: 'background';
} & ({ type: 'GET_STATUS' } | { type: 'CHECK_BACKEND' } | MeetingWorkerMessage | FutureMessage);

export type OffscreenMessage = { target: 'offscreen' } & (
  | { type: 'GET_STATUS' }
  | MeetingOffscreenMessage
  | FutureMessage
);

export type ContentMessage = { target: 'content' } & (
  | { type: 'GET_STATUS' }
  | MeetingContentMessage
  | Extract<FutureMessage, { type: 'INFERENCE_RESULT' | 'CAPTURE_STATUS' | 'ERROR' }>
);

export type ExtensionMessage = WorkerMessage | OffscreenMessage | ContentMessage;

export interface ExtensionStatus {
  version: string;
  phase: 3 | 4;
  recognition: 'managed_in_webcam_studio' | 'meeting_mode' | 'active';
  camera: 'managed_in_webcam_studio' | 'tab_capture';
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

export type Failure = {
  ok: false;
  code: 'NOT_IMPLEMENTED' | 'INVALID_MESSAGE' | 'FORBIDDEN' | 'INTERNAL_ERROR' | 'CAPTURE_ERROR';
  message: string;
};

export type WorkerResponse =
  | Failure
  | { ok: true; type: 'STATUS'; status: ExtensionStatus }
  | { ok: true; type: 'BACKEND_STATUS'; backend: BackendStatus }
  | { ok: true; type: 'MEETING_STATE'; state: MeetingState }
  | { ok: true; type: 'MEETING_TABS'; tabs: MeetingTabInfo[] }
  | { ok: true; type: 'MEETING_CAPTURE_STARTED'; tabId: number }
  | { ok: true; type: 'MEETING_CAPTURE_STOPPED' }
  | { ok: true; type: 'ROI_UPDATED'; roi: RegionOfInterest };

export const futureTypes: ReadonlySet<string> = new Set([
  'START_CAPTURE',
  'STOP_CAPTURE',
  'CAPTURE_STATUS',
  'LANDMARK_SEQUENCE',
  'INFERENCE_RESULT',
  'ERROR',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function notImplemented(): Failure {
  return {
    ok: false,
    code: 'NOT_IMPLEMENTED',
    message:
      'Use the visible webcam studio or Meeting Mode for recognition. Background capture requires explicit user consent.',
  };
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    value.status === 'ok' &&
    value.service === 'SignBridge AI Backend' &&
    value.phase === 3 &&
    (value.model_status === 'not_loaded' || value.model_status === 'loaded') &&
    MODEL_STATES.includes(value.model_state as ModelState)
  );
}
