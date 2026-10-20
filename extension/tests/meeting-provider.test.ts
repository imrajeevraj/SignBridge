import { describe, expect, it } from 'vitest';
import {
  getAllAdapters,
  getMeetingAdapter,
  GoogleMeetAdapter,
  TeamsAdapter,
  ZoomAdapter,
} from '../src/providers';

describe('Meeting Provider Abstraction', () => {
  it('registers Google Meet, Teams, and Zoom adapters', () => {
    const adapters = getAllAdapters();
    expect(adapters.some((a) => a.id === 'google-meet')).toBe(true);
    expect(adapters.some((a) => a.id === 'teams')).toBe(true);
    expect(adapters.some((a) => a.id === 'zoom')).toBe(true);
  });

  it('matches Google Meet URLs correctly and marks as supported', () => {
    const adapter = getMeetingAdapter('https://meet.google.com/abc-defg-hij');
    expect(adapter).toBeInstanceOf(GoogleMeetAdapter);
    expect(adapter?.id).toBe('google-meet');
    expect(adapter?.isSupported).toBe(true);
    expect(adapter?.name).toBe('Google Meet');
  });

  it('identifies Teams as unsupported placeholder', () => {
    const adapter = getMeetingAdapter('https://teams.microsoft.com/v2/');
    expect(adapter).toBeInstanceOf(TeamsAdapter);
    expect(adapter?.id).toBe('teams');
    expect(adapter?.isSupported).toBe(false);
  });

  it('identifies Zoom as unsupported placeholder', () => {
    const adapter = getMeetingAdapter('https://app.zoom.us/wc/join/123456');
    expect(adapter).toBeInstanceOf(ZoomAdapter);
    expect(adapter?.id).toBe('zoom');
    expect(adapter?.isSupported).toBe(false);
  });

  it('returns null for arbitrary web pages', () => {
    const adapter = getMeetingAdapter('https://github.com/google/mediapipe');
    expect(adapter).toBeNull();
  });

  it('injects and removes caption container in Google Meet adapter', () => {
    const adapter = new GoogleMeetAdapter();
    const container = adapter.injectCaptionContainer(document);
    expect(container).toBeDefined();
    expect(container.id).toBe('signbridge-caption-host');
    expect(document.getElementById('signbridge-caption-host')).toBe(container);

    adapter.removeCaptionContainer(document);
    expect(document.getElementById('signbridge-caption-host')).toBeNull();
  });
});

