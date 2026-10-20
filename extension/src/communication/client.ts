import type { BackendStatus, ExtensionStatus, WorkerMessage, WorkerResponse } from './messages';
import { checkBackend } from '../background/health';
import { isExtension } from '../settings';
import manifest from '../../public/manifest.json';

async function send(message: WorkerMessage): Promise<WorkerResponse> {
  const response: WorkerResponse | undefined = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error('The extension service worker did not respond. Reload the extension.');
  if (!response.ok) throw new Error(response.message);
  return response;
}
export async function getStatus(): Promise<ExtensionStatus> {
  if (!isExtension()) return { version: manifest.version, phase: 3, recognition: 'managed_in_webcam_studio', camera: 'managed_in_webcam_studio', model: 'reported_by_backend' };
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
