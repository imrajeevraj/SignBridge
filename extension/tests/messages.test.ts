import { describe, expect, it } from 'vitest';
import { handleMessage } from '../src/background/handlers';
import { futureTypes, type ExtensionMessage } from '../src/communication/messages';

describe('message boundary', () => {
  it('accepts a typed status command and reports no recognition', async () => {
    const command = { target: 'background', type: 'GET_STATUS' } satisfies ExtensionMessage;
    expect(await handleMessage(command, '0.1.0')).toEqual({ ok: true, type: 'STATUS', status: {
      version: '0.1.0', phase: 3, recognition: 'managed_in_webcam_studio', camera: 'managed_in_webcam_studio', model: 'reported_by_backend',
    } });
  });
  it.each([...futureTypes])('rejects %s explicitly', async (type) => {
    expect(await handleMessage({ target: 'background', type }, '0.1.0')).toMatchObject({ ok: false, code: 'NOT_IMPLEMENTED' });
  });
  it.each([null, [], {}, { target: 'offscreen', type: 'GET_STATUS' }, { target: 'background', type: 'UNKNOWN' }])('rejects malformed or misrouted messages %j', async (message) => {
    expect(await handleMessage(message, '0.1.0')).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
  });
});
