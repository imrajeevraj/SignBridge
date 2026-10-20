import { isRecord, notImplemented } from '../communication/messages';
import { createCaptionOverlay } from './caption-overlay';

declare global { interface Window { __signBridgePhase1Initialized?: boolean } }

// Runs in Chrome's isolated world; never listens to messages from the web page.
if (!window.__signBridgePhase1Initialized) {
  window.__signBridgePhase1Initialized = true;
  const overlay = createCaptionOverlay();
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !isRecord(message) || message.target !== 'content') return false;
    sendResponse(message.type === 'GET_STATUS'
      ? { ok: true, phase: 1, overlay: overlay.state, capture: 'inactive' }
      : notImplemented());
    return false;
  });
}
