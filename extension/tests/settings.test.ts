import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, normalizeSettings, saveSettings } from '../src/settings';

afterEach(() => vi.unstubAllGlobals());
describe('preferences', () => {
  it('normalizes absent or corrupt data without unsafe values', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ captionLanguage: 'ASL', captionSize: 'giant', displayConfidence: 'yes', theme: 'remote' })).toEqual(DEFAULT_SETTINGS);
  });
  it('persists real chrome storage values', async () => {
    const values = { ...DEFAULT_SETTINGS, captionLanguage: 'hi' as const, theme: 'light' as const };
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { runtime: { id: 'test' }, storage: { local: { get: vi.fn().mockResolvedValue({ [SETTINGS_KEY]: values }), set } } });
    expect(await loadSettings()).toEqual(values);
    await saveSettings(values);
    expect(set).toHaveBeenCalledWith({ [SETTINGS_KEY]: values });
  });
  it('propagates storage failures instead of claiming a save', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'test' }, storage: { local: { set: vi.fn().mockRejectedValue(new Error('Storage unavailable')) } } });
    await expect(saveSettings(DEFAULT_SETTINGS)).rejects.toThrow('Storage unavailable');
  });
});
