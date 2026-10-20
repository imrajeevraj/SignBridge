import type { MeetingPlatformAdapter } from './meeting-provider';

export class ZoomAdapter implements MeetingPlatformAdapter {
  readonly id = 'zoom' as const;
  readonly name = 'Zoom Web (Planned)';
  readonly isSupported = false;

  matchesUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname.endsWith('zoom.us');
    } catch {
      return false;
    }
  }

  getVideoElements(): HTMLVideoElement[] {
    return [];
  }

  getActiveSpeakerElement(): HTMLVideoElement | null {
    return null;
  }

  injectCaptionContainer(): HTMLElement {
    throw new Error('Zoom Web integration is planned for a future release.');
  }

  removeCaptionContainer(): void {}
}
