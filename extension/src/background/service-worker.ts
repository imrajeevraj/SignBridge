import { isRecord, type WorkerResponse } from '../communication/messages';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../settings';
import { handleMessage } from './handlers';

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    // Content scripts do not need direct access to stored preferences.
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const saved = await chrome.storage.local.get(SETTINGS_KEY);
    if (saved[SETTINGS_KEY] === undefined) await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    console.info(`[SignBridge] ${details.reason}: Phase 2 initialized; webcam requires consent in the studio.`);
  })().catch((error: unknown) => console.error('[SignBridge] Initialization failed', error));
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: WorkerResponse) => void) => {
  if (!isRecord(message) || message.target !== 'background') return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, code: 'FORBIDDEN', message: 'Only this extension may send commands.' });
    return false;
  }
  // Health checks are available to the dashboard, never a page/content script.
  // An options page opened as a tab legitimately has sender.tab. Authorize its
  // exact extension page URL instead, allowing the dashboard's local hash link.
  const senderPage = sender.url?.split(/[?#]/, 1)[0];
  if (message.type === 'CHECK_BACKEND' && senderPage !== chrome.runtime.getURL('index.html')) {
    sendResponse({ ok: false, code: 'FORBIDDEN', message: 'Only the dashboard may check the backend.' });
    return false;
  }
  void handleMessage(message, chrome.runtime.getManifest().version)
    .then(sendResponse)
    .catch((error: unknown) => {
      console.error('[SignBridge] Message handler failed', error);
      sendResponse({ ok: false, code: 'INTERNAL_ERROR', message: 'The extension could not handle this request.' });
    });
  return true;
});
