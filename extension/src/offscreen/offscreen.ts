import { isRecord, notImplemented } from '../communication/messages';
import { OffscreenCaptureSession } from './offscreen-capture';

let session: OffscreenCaptureSession | null = null;

function getSession(): OffscreenCaptureSession {
  if (!session) {
    session = new OffscreenCaptureSession({
      onPrediction: (label, confidence, accepted) => {
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'MEETING_PREDICTION',
          label,
          confidence,
          accepted,
        });
      },
      onError: (code, message) => {
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'MEETING_ERROR',
          code,
          message,
        });
      },
      onStateChange: () => {},
    });
  }
  return session;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isRecord(message) || message.target !== 'offscreen') {
    return false;
  }

  switch (message.type) {
    case 'GET_STATUS': {
      sendResponse({
        ok: true,
        phase: 4,
        capture: session ? 'active' : 'inactive',
        model: 'reported_by_backend',
      });
      return false;
    }

    case 'INIT_CAPTURE': {
      if (typeof message.streamId === 'string') {
        const s = getSession();
        void s.start(message.streamId, isRecord(message.roi) ? (message.roi as any) : undefined);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, message: 'Invalid streamId' });
      }
      return false;
    }

    case 'SET_ROI': {
      if (isRecord(message.roi)) {
        session?.setROI(message.roi as any);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, message: 'Invalid ROI' });
      }
      return false;
    }

    case 'STOP_OFFSCREEN_CAPTURE': {
      if (session) {
        session.stop();
        session = null;
      }
      sendResponse({ ok: true });
      return false;
    }

    default:
      sendResponse(notImplemented());
      return false;
  }
});
