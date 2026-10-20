import { isRecord, notImplemented } from '../communication/messages';

// Packaged only. Phase 4 adds the offscreen permission and user-initiated lifecycle.
// No getUserMedia, tabCapture, model load, timers or automatic document creation.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isRecord(message) || message.target !== 'offscreen') return false;
  sendResponse(message.type === 'GET_STATUS'
    ? { ok: true, phase: 1, capture: 'inactive', model: 'not_loaded' }
    : notImplemented());
  return false;
});
