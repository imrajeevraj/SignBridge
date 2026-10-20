export type MeetingPlatformId = 'google-meet' | 'teams' | 'zoom' | 'generic';

export interface MeetingPlatformAdapter {
  readonly id: MeetingPlatformId;
  readonly name: string;
  readonly isSupported: boolean;
  matchesUrl(url: string): boolean;
  getVideoElements(doc?: Document): HTMLVideoElement[];
  getActiveSpeakerElement(doc?: Document): HTMLVideoElement | null;
  injectCaptionContainer(doc?: Document): HTMLElement;
  removeCaptionContainer(doc?: Document): void;
}

const adapters: MeetingPlatformAdapter[] = [];

export function registerMeetingAdapter(adapter: MeetingPlatformAdapter): void {
  adapters.push(adapter);
}

export function getMeetingAdapter(url: string): MeetingPlatformAdapter | null {
  for (const adapter of adapters) {
    if (adapter.matchesUrl(url)) {
      return adapter;
    }
  }
  return null;
}

export function getAllAdapters(): readonly MeetingPlatformAdapter[] {
  return [...adapters];
}

