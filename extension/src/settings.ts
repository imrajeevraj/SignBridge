import { isRecord } from './communication/messages';

export interface Settings {
  captionLanguage: 'en' | 'hi';
  captionSize: 'small' | 'medium' | 'large';
  displayConfidence: boolean;
  theme: 'dark' | 'light';
}
export const DEFAULT_SETTINGS: Settings = {
  captionLanguage: 'en', captionSize: 'medium', displayConfidence: false, theme: 'dark',
};
export const SETTINGS_KEY = 'signbridge.settings.v1';
export function normalizeSettings(value: unknown): Settings {
  const data = isRecord(value) ? value : {};
  return {
    captionLanguage: data.captionLanguage === 'hi' ? 'hi' : 'en',
    captionSize: data.captionSize === 'small' || data.captionSize === 'large' ? data.captionSize : 'medium',
    displayConfidence: data.displayConfidence === true,
    theme: data.theme === 'light' ? 'light' : 'dark',
  };
}
export const isExtension = () => typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
export async function loadSettings(): Promise<Settings> {
  if (isExtension()) {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  }
  const raw = localStorage.getItem(SETTINGS_KEY);
  return normalizeSettings(raw ? JSON.parse(raw) as unknown : undefined);
}
export async function saveSettings(settings: Settings): Promise<void> {
  if (isExtension()) await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  else localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
