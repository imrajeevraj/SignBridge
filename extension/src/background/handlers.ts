import { futureTypes, isRecord, notImplemented, type WorkerResponse } from '../communication/messages';
import { checkBackend } from './health';

export async function handleMessage(message: unknown, version: string): Promise<WorkerResponse> {
  if (!isRecord(message) || message.target !== 'background' || typeof message.type !== 'string') {
    return { ok: false, code: 'INVALID_MESSAGE', message: 'Expected a background message with a known type.' };
  }
  // Reject future commands before touching their payloads or invoking any runtime.
  if (futureTypes.has(message.type)) return notImplemented();
  switch (message.type) {
    case 'GET_STATUS': return { ok: true, type: 'STATUS', status: {
      version, phase: 3, recognition: 'managed_in_webcam_studio', camera: 'managed_in_webcam_studio', model: 'reported_by_backend',
    } };
    case 'CHECK_BACKEND': return { ok: true, type: 'BACKEND_STATUS', backend: await checkBackend() };
    default: return { ok: false, code: 'INVALID_MESSAGE', message: 'Unknown message type.' };
  }
}
