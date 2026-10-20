import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkBackend } from '../src/background/health';

const health = { status: 'ok', service: 'SignBridge AI Backend', phase: 3, model_status: 'not_loaded', model_state: 'MODEL_NOT_INSTALLED' };
afterEach(() => vi.unstubAllGlobals());
describe('backend status', () => {
  it('only reports online for the expected health schema', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(health)));
    expect(await checkBackend(fetcher)).toEqual({ state: 'online', health });
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8000/health', expect.objectContaining({ credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) }));
  });
  it.each([{}, { ...health, model_status: 'ready' }, { ...health, service: 'Another application' }])('rejects incorrect health payload %j', async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body)));
    expect((await checkBackend(fetcher)).state).toBe('error');
  });
  it('reports non-200 responses', async () => {
    expect(await checkBackend(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))).toEqual({ state: 'error', message: 'Backend returned HTTP 503.' });
  });
  it('reports malformed JSON', async () => {
    expect((await checkBackend(vi.fn<typeof fetch>().mockResolvedValue(new Response('not json')))).state).toBe('error');
  });
  it.each([new TypeError('Failed to fetch'), new DOMException('Timed out', 'TimeoutError')])('reports unreachable/timed out backend', async (error) => {
    expect((await checkBackend(vi.fn<typeof fetch>().mockRejectedValue(error))).state).toBe('offline');
  });
});
