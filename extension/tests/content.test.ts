import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); delete window.__signBridgePhase1Initialized; });
it('initializes once and does not add overlays or alter the page', async () => {
  const listener = vi.fn();
  vi.stubGlobal('chrome', { runtime: { id: 'test', onMessage: { addListener: listener } } });
  const original = document.body.innerHTML;
  vi.resetModules(); await import('../src/content/content');
  vi.resetModules(); await import('../src/content/content');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(document.body.innerHTML).toBe(original);
});
