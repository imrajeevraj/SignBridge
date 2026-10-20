import { afterEach, expect, it, vi } from 'vitest';
import type { WorkerResponse } from '../src/communication/messages';

afterEach(() => vi.unstubAllGlobals());

it('allows health checks from the full dashboard tab but rejects a meeting content script', async () => {
  type Listener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
  let listener: Listener | undefined;
  vi.stubGlobal('chrome', { runtime: {
    id: 'test-extension',
    getURL: (file: string) => `chrome-extension://test-extension/${file}`,
    getManifest: () => ({ version: '0.1.0' }),
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: (callback: Listener) => { listener = callback; } },
  } });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', service: 'SignBridge AI Backend', phase: 3, model_status: 'not_loaded', model_state: 'MODEL_NOT_INSTALLED' })));
  vi.stubGlobal('fetch', fetcher);
  vi.resetModules();
  await import('../src/background/service-worker');
  const request = { target: 'background', type: 'CHECK_BACKEND' };
  const tabSender = { id: 'test-extension', url: 'chrome-extension://test-extension/index.html#main', tab: { id: 1 } } as chrome.runtime.MessageSender;
  const response = await new Promise<WorkerResponse>((resolve) => listener?.(request, tabSender, resolve));
  expect(response).toMatchObject({ ok: true, type: 'BACKEND_STATUS', backend: { state: 'online' } });
  const reject = vi.fn();
  listener?.(request, { ...tabSender, url: 'https://meet.google.com/example' }, reject);
  expect(reject).toHaveBeenCalledWith(expect.objectContaining({ ok: false, code: 'FORBIDDEN' }));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
