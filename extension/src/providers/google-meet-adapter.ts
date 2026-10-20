import type { MeetingPlatformAdapter } from './meeting-provider';

export const GOOGLE_MEET_HOST_ID = 'signbridge-caption-host';

export class GoogleMeetAdapter implements MeetingPlatformAdapter {
  readonly id = 'google-meet' as const;
  readonly name = 'Google Meet';
  readonly isSupported = true;

  matchesUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'meet.google.com' && parsed.pathname.length > 1;
    } catch {
      return false;
    }
  }

  getVideoElements(doc: Document = document): HTMLVideoElement[] {
    const list = Array.from(doc.querySelectorAll<HTMLVideoElement>('video'));
    // Filter to videos that have non-zero dimensions or active srcObject
    return list.filter((v) => v.videoWidth > 0 || v.srcObject !== null || v.src !== '');
  }

  getActiveSpeakerElement(doc: Document = document): HTMLVideoElement | null {
    const videos = this.getVideoElements(doc);
    if (videos.length === 0) return null;

    // Largest video element by rendered bounding rect area is typically active presentation/speaker
    let bestVideo: HTMLVideoElement | null = null;
    let maxArea = 0;

    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 100 && rect.height > 100) {
        maxArea = area;
        bestVideo = v;
      }
    }

    return bestVideo ?? (videos[0] ?? null);
  }

  injectCaptionContainer(doc: Document = document): HTMLElement {
    let existing = doc.getElementById(GOOGLE_MEET_HOST_ID);
    if (!existing) {
      existing = doc.createElement('div');
      existing.id = GOOGLE_MEET_HOST_ID;
      existing.setAttribute('aria-live', 'polite');
      existing.setAttribute('aria-label', 'SignBridge AI Real-Time Captions');
      doc.body.appendChild(existing);
    }
    return existing;
  }

  removeCaptionContainer(doc: Document = document): void {
    const existing = doc.getElementById(GOOGLE_MEET_HOST_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }
}
