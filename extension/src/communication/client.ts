import type {
  BackendStatus,
  ExtensionStatus,
  MeetingState,
  MeetingTabInfo,
  WorkerMessage,
  WorkerResponse,
} from './messages';
import { checkBackend } from '../background/health';
import { isExtension } from '../settings';
import manifest from '../../public/manifest.json';
import type { RegionOfInterest } from '../roi/types';

async function send(message: WorkerMessage): Promise<WorkerResponse> {
  const response: WorkerResponse | undefined = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error('The extension service worker did not respond. Reload the extension.');
  if (!response.ok) throw new Error(response.message);
  return response;
}

export async function getStatus(): Promise<ExtensionStatus> {
  if (!isExtension())
    return {
      version: manifest.version,
      phase: 3,
      recognition: 'managed_in_webcam_studio',
      camera: 'managed_in_webcam_studio',
      model: 'reported_by_backend',
    };
  const response = await send({ target: 'background', type: 'GET_STATUS' });
  if (!response.ok || response.type !== 'STATUS') throw new Error('Unexpected extension status response.');
  return response.status;
}

export async function getBackendStatus(): Promise<BackendStatus> {
  if (!isExtension()) return checkBackend();
  const response = await send({ target: 'background', type: 'CHECK_BACKEND' });
  if (!response.ok || response.type !== 'BACKEND_STATUS') throw new Error('Unexpected backend response.');
  return response.backend;
}

export async function getMeetingTabs(): Promise<MeetingTabInfo[]> {
  if (!isExtension()) return [];
  const response = await send({ target: 'background', type: 'GET_MEETING_TABS' });
  if (!response.ok || response.type !== 'MEETING_TABS') return [];
  return response.tabs;
}

export async function getMeetingState(): Promise<MeetingState> {
  if (!isExtension())
    return {
      status: 'idle',
      hasActiveStream: false,
    };
  const response = await send({ target: 'background', type: 'GET_MEETING_STATE' });
  if (!response.ok || response.type !== 'MEETING_STATE') {
    return { status: 'idle', hasActiveStream: false };
  }
  return response.state;
}

export async function startMeetingCapture(tabId: number, roi?: RegionOfInterest): Promise<void> {
  if (!isExtension()) throw new Error('Meeting capture requires extension context.');
  const response = await send({
    target: 'background',
    type: 'START_MEETING_CAPTURE',
    tabId,
    roi,
  });
  if (!response.ok) throw new Error(response.message);
}

export async function stopMeetingCapture(): Promise<void> {
  if (!isExtension()) return;
  const response = await send({ target: 'background', type: 'STOP_MEETING_CAPTURE' });
  if (!response.ok) throw new Error(response.message);
}

export async function updateMeetingROI(roi: RegionOfInterest): Promise<void> {
  if (!isExtension()) return;
  const response = await send({ target: 'background', type: 'UPDATE_ROI', roi });
  if (!response.ok) throw new Error(response.message);
}

export async function requestROISelection(tabId: number): Promise<void> {
  if (!isExtension()) return;
  await chrome.tabs.sendMessage(tabId, {
    target: 'content',
    type: 'SHOW_ROI_SELECTOR',
  });
}
