import type { MeetingPlatformAdapter } from './meeting-provider';

export class TeamsAdapter implements MeetingPlatformAdapter {
  readonly id = 'teams' as const;
  readonly name = 'Microsoft Teams (Planned)';
  readonly isSupported = false;

  matchesUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'teams.microsoft.com' ||
        parsed.hostname === 'teams.live.com'
      );
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
    throw new Error('Microsoft Teams integration is planned for a future release.');
  }

  removeCaptionContainer(): void {}
}
