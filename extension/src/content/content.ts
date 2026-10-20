import { isRecord, notImplemented } from '../communication/messages';
import { ROISelectorOverlay } from '../roi/roi-selector';
import { createCaptionOverlay } from './caption-overlay';

declare global {
  interface Window {
    __signBridgePhase1Initialized?: boolean;
  }
}

// Runs in Chrome's isolated world; never listens to messages from the web page.
if (!window.__signBridgePhase1Initialized) {
  window.__signBridgePhase1Initialized = true;
  const overlay = createCaptionOverlay();
  let roiSelector: ROISelectorOverlay | null = null;

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !isRecord(message) || message.target !== 'content') {
      return false;
    }

    switch (message.type) {
      case 'GET_STATUS': {
        sendResponse({
          ok: true,
          phase: 1,
          overlay: overlay.state,
          capture: overlay.state === 'active' ? 'active' : 'inactive',
        });
        return false;
      }

      case 'SHOW_ROI_SELECTOR': {
        if (!roiSelector) {
          roiSelector = new ROISelectorOverlay({
            onConfirm: (roi) => {
              chrome.runtime.sendMessage({
                target: 'background',
                type: 'ROI_SELECTED',
                roi,
              });
              roiSelector = null;
            },
            onCancel: () => {
              roiSelector = null;
            },
          });
        }
        roiSelector.show();
        sendResponse({ ok: true });
        return false;
      }

      case 'HIDE_ROI_SELECTOR': {
        if (roiSelector) {
          roiSelector.dispose();
          roiSelector = null;
        }
        sendResponse({ ok: true });
        return false;
      }

      case 'SHOW_CAPTIONS': {
        overlay.show();
        sendResponse({ ok: true });
        return false;
      }

      case 'UPDATE_CAPTION': {
        if (
          typeof message.text === 'string' &&
          typeof message.confidence === 'number' &&
          typeof message.accepted === 'boolean'
        ) {
          overlay.update(message.text, message.confidence, message.accepted);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, message: 'Invalid UPDATE_CAPTION payload' });
        }
        return false;
      }

      case 'CLEAR_CAPTION': {
        overlay.clear();
        sendResponse({ ok: true });
        return false;
      }

      case 'CLOSE_CAPTIONS': {
        overlay.hide();
        sendResponse({ ok: true });
        return false;
      }

      default:
        sendResponse(notImplemented());
        return false;
    }
  });
}
