import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crop,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import {
  getMeetingState,
  getMeetingTabs,
  requestROISelection,
  startMeetingCapture,
  stopMeetingCapture,
} from '../communication/client';
import type { MeetingState, MeetingTabInfo } from '../communication/messages';

export function MeetingModePanel() {
  const [tabs, setTabs] = useState<MeetingTabInfo[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingState>({
    status: 'idle',
    hasActiveStream: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTabs = useCallback(async () => {
    try {
      const availableTabs = await getMeetingTabs();
      setTabs(availableTabs);
      if (availableTabs.length > 0 && selectedTabId === null && availableTabs[0]) {
        setSelectedTabId(availableTabs[0].id);
      }
    } catch {
      // Background might still be initializing
    }
  }, [selectedTabId]);

  const refreshState = useCallback(async () => {
    try {
      const state = await getMeetingState();
      setMeetingState(state);
      if (state.activeTabId) {
        setSelectedTabId(state.activeTabId);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void refreshTabs();
    void refreshState();
    const interval = setInterval(() => {
      void refreshState();
    }, 2000);
    return () => clearInterval(interval);
  }, [refreshTabs, refreshState]);

  const handleStart = async () => {
    if (!selectedTabId) {
      setError('Please select an active Google Meet tab first.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await startMeetingCapture(selectedTabId);
      await refreshState();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not start meeting capture');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setLoading(true);
    try {
      await stopMeetingCapture();
      await refreshState();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Could not stop meeting capture');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectROI = async () => {
    const tabId = meetingState.activeTabId || selectedTabId;
    if (!tabId) return;
    try {
      await requestROISelection(tabId);
    } catch (err: any) {
      setError('Could not open signer selector in meeting tab.');
    }
  };

  const isCapturing = meetingState.status === 'active' || meetingState.hasActiveStream;

  return (
    <section className="panel meeting-mode-panel" aria-labelledby="meeting-heading">
      <div className="flex items-center justify-between gap-3">
        <div className="section-heading">
          <span className="heading-icon cyan">
            <Monitor size={19} aria-hidden="true" />
          </span>
          <h2 id="meeting-heading">Meeting Mode · Google Meet</h2>
        </div>
        <span className={`badge ${isCapturing ? 'badge-online' : ''}`}>
          {isCapturing ? 'ACTIVE' : 'READY'}
        </span>
      </div>

      <p className="section-description">
        Capture participant video from an active Google Meet call and render live ISL captions directly inside the meeting.
      </p>

      {error && (
        <div className="error-message flex items-center gap-2" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="meeting-tab-select-group">
        <label htmlFor="meeting-tab-select" className="text-sm font-medium">
          Active Google Meet Tab:
        </label>
        <div className="flex gap-2 mt-1">
          <select
            id="meeting-tab-select"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"
            value={selectedTabId ?? ''}
            disabled={isCapturing}
            onChange={(e) => setSelectedTabId(Number(e.target.value) || null)}
          >
            {tabs.length === 0 ? (
              <option value="">No active Google Meet tab detected</option>
            ) : (
              tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title} ({tab.platform})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="icon-button"
            title="Refresh detected meeting tabs"
            onClick={() => void refreshTabs()}
            disabled={isCapturing || loading}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {tabs.length === 0 && !isCapturing && (
          <p className="text-xs text-slate-400 mt-1">
            Open <a href="https://meet.google.com" target="_blank" rel="noreferrer" className="underline">meet.google.com</a> in Chrome to enable meeting mode.
          </p>
        )}
      </div>

      <div className="meeting-controls flex flex-wrap gap-2 mt-4">
        {!isCapturing ? (
          <button
            type="button"
            className="button primary flex items-center gap-2"
            disabled={!selectedTabId || tabs.length === 0 || loading}
            onClick={handleStart}
          >
            <Play size={15} />
            Start Meeting Captions
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button secondary flex items-center gap-2"
              onClick={handleStop}
              disabled={loading}
            >
              <Square size={14} />
              Stop Captions
            </button>
            <button
              type="button"
              className="button secondary flex items-center gap-2"
              onClick={handleSelectROI}
              title="Drag a selection box over the signer's video frame in Google Meet"
            >
              <Crop size={15} />
              Select Signer Region
            </button>
          </>
        )}
      </div>

      {isCapturing && (
        <div className="meeting-active-card p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 mt-4 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 size={13} /> Capturing tab {meetingState.activeTabId}
            </span>
            <span>
              ROI: {meetingState.roi ? `${Math.round(meetingState.roi.width * 100)}% × ${Math.round(meetingState.roi.height * 100)}%` : 'Full tab (default)'}
            </span>
          </div>
          {meetingState.lastPrediction && (
            <div className="text-sky-300 font-semibold text-sm pt-1">
              Latest Sign: {meetingState.lastPrediction.label} (Model Score: {meetingState.lastPrediction.confidence.toFixed(2)})
            </div>
          )}
        </div>
      )}

      <div className="privacy-callout mt-4 text-xs text-slate-400 flex items-start gap-2 bg-slate-900/40 p-2.5 rounded border border-slate-800">
        <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-200">Local & Private: </strong>
          Video frames from the selected tab are processed strictly on your computer by local MediaPipe WASM and the authenticated local backend. No images, video, or audio leave your machine.
        </div>
      </div>
    </section>
  );
}

