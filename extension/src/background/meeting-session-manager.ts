import type {
  MeetingState,
  MeetingTabInfo,
  WorkerResponse,
} from '../communication/messages';
import { getMeetingAdapter } from '../providers';
import type { RegionOfInterest } from '../roi/types';

export class MeetingSessionManager {
  private state: MeetingState = {
    status: 'idle',
    hasActiveStream: false,
  };

  getState(): MeetingState {
    return { ...this.state };
  }

  async getMeetingTabs(): Promise<MeetingTabInfo[]> {
    if (!chrome?.tabs?.query) {
      return [];
    }

    try {
      const tabs = await chrome.tabs.query({});
      const meetingTabs: MeetingTabInfo[] = [];

      for (const tab of tabs) {
        if (tab.id && tab.url) {
          const adapter = getMeetingAdapter(tab.url);
          if (adapter && adapter.isSupported) {
            meetingTabs.push({
              id: tab.id,
              title: tab.title || 'Meeting Tab',
              url: tab.url,
              platform: adapter.name,
            });
          }
        }
      }

      return meetingTabs;
    } catch {
      return [];
    }
  }

  async startCapture(tabId: number, roi?: RegionOfInterest): Promise<WorkerResponse> {
    if (this.state.status === 'active') {
      await this.stopCapture();
    }

    this.state.status = 'requesting_permission';
    this.state.activeTabId = tabId;

    try {
      // 1. Get tab media stream ID via chrome.tabCapture
      if (!chrome?.tabCapture?.getMediaStreamId) {
        throw new Error('chrome.tabCapture API is unavailable in this browser environment.');
      }

      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      if (!streamId) {
        throw new Error('Failed to obtain stream ID for tab ' + tabId);
      }

      // 2. Ensure Offscreen document exists
      if (chrome?.offscreen?.hasDocument && chrome?.offscreen?.createDocument) {
        const hasDoc = await chrome.offscreen.hasDocument();
        if (!hasDoc) {
          await chrome.offscreen.createDocument({
            url: 'src/offscreen/offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Meeting sign language recognition tab capture',
          });
        }
      }

      // 3. Send INIT_CAPTURE to offscreen
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'INIT_CAPTURE',
        streamId,
        roi,
      });

      // 4. Request content script in meeting tab to display captions
      if (chrome?.tabs?.sendMessage) {
        chrome.tabs
          .sendMessage(tabId, {
            target: 'content',
            type: 'SHOW_CAPTIONS',
          })
          .catch(() => {
            // Content script may not have injected yet or user navigated
          });
      }

      this.state.status = 'active';
      this.state.hasActiveStream = true;
      this.state.roi = roi;
      this.state.error = undefined;

      return {
        ok: true,
        type: 'MEETING_CAPTURE_STARTED',
        tabId,
      };
    } catch (err: any) {
      this.state.status = 'error';
      this.state.hasActiveStream = false;
      this.state.error = err instanceof Error ? err.message : 'Meeting capture failed to start';

      return {
        ok: false,
        code: 'CAPTURE_ERROR',
        message: this.state.error,
      };
    }
  }

  async stopCapture(): Promise<WorkerResponse> {
    const tabId = this.state.activeTabId;

    this.state = {
      status: 'stopped',
      hasActiveStream: false,
    };

    // 1. Close captions in meeting tab
    if (tabId && chrome?.tabs?.sendMessage) {
      chrome.tabs
        .sendMessage(tabId, {
          target: 'content',
          type: 'CLOSE_CAPTIONS',
        })
        .catch(() => {});
      chrome.tabs
        .sendMessage(tabId, {
          target: 'content',
          type: 'HIDE_ROI_SELECTOR',
        })
        .catch(() => {});
    }

    // 2. Stop offscreen capture
    try {
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'STOP_OFFSCREEN_CAPTURE',
      });
    } catch {}

    // 3. Close offscreen document if open
    try {
      if (chrome?.offscreen?.closeDocument) {
        await chrome.offscreen.closeDocument();
      }
    } catch {}

    return {
      ok: true,
      type: 'MEETING_CAPTURE_STOPPED',
    };
  }

  async updateROI(roi: RegionOfInterest): Promise<WorkerResponse> {
    this.state.roi = roi;

    try {
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'SET_ROI',
        roi,
      });
    } catch {}

    return {
      ok: true,
      type: 'ROI_UPDATED',
      roi,
    };
  }

  handlePrediction(label: string, confidence: number, accepted: boolean): void {
    if (this.state.status !== 'active' || !this.state.activeTabId) {
      return;
    }

    this.state.lastPrediction = {
      label,
      confidence,
      timestamp: Date.now(),
    };

    if (chrome?.tabs?.sendMessage) {
      chrome.tabs
        .sendMessage(this.state.activeTabId, {
          target: 'content',
          type: 'UPDATE_CAPTION',
          text: label,
          confidence,
          accepted,
        })
        .catch(() => {});
    }
  }

  handleError(code: string, message: string): void {
    this.state.status = 'error';
    this.state.error = `[${code}] ${message}`;
    void this.stopCapture();
  }

  async onTabRemoved(tabId: number): Promise<void> {
    if (this.state.activeTabId === tabId) {
      await this.stopCapture();
    }
  }

  async onTabUpdated(tabId: number, changeInfo: { url?: string }): Promise<void> {
    if (this.state.activeTabId === tabId && changeInfo.url) {
      const adapter = getMeetingAdapter(changeInfo.url);
      if (!adapter || !adapter.isSupported) {
        await this.stopCapture();
      }
    }
  }
}

