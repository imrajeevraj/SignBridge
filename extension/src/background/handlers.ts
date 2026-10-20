import {
  futureTypes,
  isRecord,
  notImplemented,
  type WorkerResponse,
} from '../communication/messages';
import { checkBackend } from './health';
import { MeetingSessionManager } from './meeting-session-manager';

export const defaultMeetingManager = new MeetingSessionManager();

export async function handleMessage(
  message: unknown,
  version: string,
  manager: MeetingSessionManager = defaultMeetingManager
): Promise<WorkerResponse> {
  if (!isRecord(message) || message.target !== 'background' || typeof message.type !== 'string') {
    return {
      ok: false,
      code: 'INVALID_MESSAGE',
      message: 'Expected a background message with a known type.',
    };
  }

  // Reject future placeholder commands before touching their payloads or invoking any runtime.
  if (futureTypes.has(message.type)) return notImplemented();

  switch (message.type) {
    case 'GET_STATUS': {
      const state = manager.getState();
      const isActive = state.status === 'active';
      return {
        ok: true,
        type: 'STATUS',
        status: {
          version,
          phase: (isActive ? 4 : 3) as any,
          recognition: isActive ? 'meeting_mode' : 'managed_in_webcam_studio',
          camera: isActive ? 'tab_capture' : 'managed_in_webcam_studio',
          model: 'reported_by_backend',
        },
      };
    }

    case 'CHECK_BACKEND':
      return { ok: true, type: 'BACKEND_STATUS', backend: await checkBackend() };

    case 'GET_MEETING_STATE':
      return { ok: true, type: 'MEETING_STATE', state: manager.getState() };

    case 'GET_MEETING_TABS':
      return { ok: true, type: 'MEETING_TABS', tabs: await manager.getMeetingTabs() };

    case 'START_MEETING_CAPTURE': {
      if (typeof message.tabId !== 'number') {
        return { ok: false, code: 'INVALID_MESSAGE', message: 'Missing valid tabId' };
      }
      return await manager.startCapture(
        message.tabId,
        isRecord(message.roi) ? (message.roi as any) : undefined
      );
    }

    case 'STOP_MEETING_CAPTURE':
      return await manager.stopCapture();

    case 'UPDATE_ROI':
    case 'ROI_SELECTED': {
      if (!isRecord(message.roi)) {
        return { ok: false, code: 'INVALID_MESSAGE', message: 'Missing valid ROI' };
      }
      return await manager.updateROI(message.roi as any);
    }

    case 'MEETING_PREDICTION': {
      if (
        typeof message.label === 'string' &&
        typeof message.confidence === 'number' &&
        typeof message.accepted === 'boolean'
      ) {
        manager.handlePrediction(message.label, message.confidence, message.accepted);
        return { ok: true, type: 'MEETING_STATE', state: manager.getState() };
      }
      return { ok: false, code: 'INVALID_MESSAGE', message: 'Invalid MEETING_PREDICTION payload' };
    }

    case 'MEETING_ERROR': {
      manager.handleError(
        typeof message.code === 'string' ? message.code : 'UNKNOWN_ERROR',
        typeof message.message === 'string' ? message.message : 'Meeting capture error'
      );
      return { ok: true, type: 'MEETING_STATE', state: manager.getState() };
    }

    default:
      return { ok: false, code: 'INVALID_MESSAGE', message: 'Unknown message type.' };
  }
}
