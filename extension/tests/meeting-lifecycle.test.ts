import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMessage } from '../src/background/handlers';
import { MeetingSessionManager } from '../src/background/meeting-session-manager';
import type { RegionOfInterest } from '../src/roi/types';

describe('Meeting Lifecycle and Session Manager', () => {
  let manager: MeetingSessionManager;
  let mockTabsSendMessage: any;
  let mockRuntimeSendMessage: any;
  let mockTabCapture: any;
  let mockOffscreen: any;

  beforeEach(() => {
    manager = new MeetingSessionManager();
    mockTabsSendMessage = vi.fn().mockResolvedValue({ ok: true });
    mockRuntimeSendMessage = vi.fn().mockResolvedValue({ ok: true });
    mockTabCapture = {
      getMediaStreamId: vi.fn().mockResolvedValue('test-stream-id-123'),
    };
    mockOffscreen = {
      hasDocument: vi.fn().mockResolvedValue(false),
      createDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-ext',
        sendMessage: mockRuntimeSendMessage,
        getManifest: () => ({ version: '0.3.0' }),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 101, title: 'Google Meet Call', url: 'https://meet.google.com/xyz-123-abc' },
          { id: 102, title: 'Unrelated Tab', url: 'https://news.ycombinator.com' },
          { id: 103, title: 'Teams Call', url: 'https://teams.microsoft.com/call' }, // unsupported
        ]),
        sendMessage: mockTabsSendMessage,
      },
      tabCapture: mockTabCapture,
      offscreen: mockOffscreen,
    });
  });

  it('queries and filters only supported active meeting tabs', async () => {
    const tabs = await manager.getMeetingTabs();
    expect(tabs.length).toBe(1);
    expect(tabs[0]?.id).toBe(101);
    expect(tabs[0]?.platform).toBe('Google Meet');
  });

  it('starts capture: obtains streamId, creates offscreen doc, inits offscreen, and notifies content', async () => {
    const roi: RegionOfInterest = {
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const res = await manager.startCapture(101, roi);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.type).toBe('MEETING_CAPTURE_STARTED');
    }

    expect(mockTabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 101 });
    expect(mockOffscreen.createDocument).toHaveBeenCalled();
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      type: 'INIT_CAPTURE',
      streamId: 'test-stream-id-123',
      roi,
    });
    expect(mockTabsSendMessage).toHaveBeenCalledWith(101, {
      target: 'content',
      type: 'SHOW_CAPTIONS',
    });

    const state = manager.getState();
    expect(state.status).toBe('active');
    expect(state.hasActiveStream).toBe(true);
    expect(state.activeTabId).toBe(101);
  });

  it('stops capture cleanly: notifies content, offscreen, and closes offscreen doc', async () => {
    await manager.startCapture(101);
    const stopRes = await manager.stopCapture();

    expect(stopRes.ok).toBe(true);
    expect(mockTabsSendMessage).toHaveBeenCalledWith(101, {
      target: 'content',
      type: 'CLOSE_CAPTIONS',
    });
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      type: 'STOP_OFFSCREEN_CAPTURE',
    });
    expect(mockOffscreen.closeDocument).toHaveBeenCalled();

    const state = manager.getState();
    expect(state.status).toBe('stopped');
    expect(state.hasActiveStream).toBe(false);
  });

  it('forwards predictions to active meeting tab', async () => {
    await manager.startCapture(101);
    manager.handlePrediction('Goodafternoon', 0.92, true);

    expect(mockTabsSendMessage).toHaveBeenCalledWith(101, {
      target: 'content',
      type: 'UPDATE_CAPTION',
      text: 'Goodafternoon',
      confidence: 0.92,
      accepted: true,
    });

    const state = manager.getState();
    expect(state.lastPrediction?.label).toBe('Goodafternoon');
  });

  it('cleans up when active tab is closed (onTabRemoved)', async () => {
    await manager.startCapture(101);
    await manager.onTabRemoved(101);

    const state = manager.getState();
    expect(state.status).toBe('stopped');
  });

  it('cleans up when tab navigates away from meeting (onTabUpdated)', async () => {
    await manager.startCapture(101);
    await manager.onTabUpdated(101, { url: 'https://google.com' });

    const state = manager.getState();
    expect(state.status).toBe('stopped');
  });

  it('routes messages through handleMessage', async () => {
    const response = await handleMessage({ target: 'background', type: 'GET_MEETING_STATE' }, '0.3.0', manager);
    expect(response.ok).toBe(true);
    if (response.ok && response.type === 'MEETING_STATE') {
      expect(response.state.status).toBe('idle');
    }
  });
});
