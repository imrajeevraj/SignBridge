import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BACKEND_URL } from '../background/health';
import { InferenceClient, type RecognitionState } from '../inference/client';
import { isModelInfo, type ModelInfo, type Prediction } from '../inference/contracts';
import type { FrameResult } from '../vision/session';

export interface RecognitionHandle { frame(result: FrameResult): void; stop(): void }
const labels = { MODEL_NOT_INSTALLED: 'Not Installed', MODEL_LOADING: 'Loading', MODEL_READY: 'Ready', MODEL_ERROR: 'Error', MODEL_INCOMPATIBLE: 'Incompatible', MODEL_UNAVAILABLE: 'Unavailable' };
export const RecognitionPanel = forwardRef<RecognitionHandle, { capturing: boolean; onModelChange?: (model: ModelInfo) => void }>(function RecognitionPanel({ capturing, onModelChange }, ref) {
  const modelCallback = useRef(onModelChange); modelCallback.current = onModelChange;
  const client = useRef<InferenceClient | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [modelError, setModelError] = useState('');
  const [status, setStatus] = useState<RecognitionState>('Disabled');
  const [detail, setDetail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [showConfidence, setShowConfidence] = useState(true);
  const [threshold, setThreshold] = useState(0.8);
  const [consecutive, setConsecutive] = useState(2);
  const [cooldownMs, setCooldownMs] = useState(1500);
  const [current, setCurrent] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [timings, setTimings] = useState({ roundTripMs: 0, endToEndMs: 0, accumulationMs: 0 });

  const refresh = async () => {
    fetchController.current?.abort();
    const controller = new AbortController(); fetchController.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 4000);
    setChecking(true); setModelError('');
    try {
      const response = await fetch(`${BACKEND_URL}/model/info`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const value: unknown = await response.json();
      if (!response.ok || !isModelInfo(value)) throw new Error('Unexpected model metadata. Start the Phase 3 backend.');
      if (!controller.signal.aborted) { setModel(value); modelCallback.current?.(value); }
    } catch (error) {
      if (!controller.signal.aborted || timedOut) { setModel(null); setModelError(timedOut ? 'Backend model check timed out.' : error instanceof Error ? error.message : 'Backend disconnected.'); }
    } finally { clearTimeout(timeout); if (!controller.signal.aborted || timedOut) setChecking(false); }
  };

  useEffect(() => {
    client.current = new InferenceClient({
      state: (value, message = '') => {
        setStatus(value); setDetail(message);
        setEnabled(!['Disabled', 'Error', 'Backend disconnected'].includes(value));
      },
      model: (value) => { setModel(value); modelCallback.current?.(value); },
      clear: () => { setCurrent(null); setTimings({ roundTripMs: 0, endToEndMs: 0, accumulationMs: 0 }); },
      prediction: (result, measured) => { setCurrent(result); setTimings(measured); setHistory((items) => [...items, result.label!].slice(-10)); },
    });
    void refresh();
    return () => { fetchController.current?.abort(); client.current?.stop(); client.current = null; };
  }, []);

  useImperativeHandle(ref, () => ({
    frame: (result) => client.current?.frame(result),
    stop: () => { client.current?.stop(); setHistory([]); setToken(''); },
  }), []);

  const enable = () => {
    if (!model?.available || !capturing || token.length < 32) return;
    client.current?.connect(token, { threshold: Math.max(threshold, model.confidence_threshold ?? 0.8), consecutive, cooldownMs });
    setToken('');
  };
  return <section className="panel recognition-live" aria-labelledby="live-recognition-title">
    <div className="section-heading"><h2 id="live-recognition-title">Isolated sign recognition</h2><span className="badge">PHASE 3</span></div>
    <p>Model: <strong>{checking ? 'Loading' : model ? labels[model.state] : 'Backend disconnected'}</strong></p>
    <p>{model?.message ?? modelError}</p>
    {model?.available && <p>{model.model_id} · {model.sign_language} · {model.vocabulary_size} labels · {model.calibrated ? 'Validation-calibrated threshold' : 'Uncalibrated threshold — confidence is not accuracy'}</p>}
    <button className="button secondary" disabled={checking || enabled} onClick={() => void refresh()}>Refresh model status</button>
    <p className="inference-consent">Enabling inference sends numeric landmark windows only to <code>{BACKEND_URL}</code>. Video stays in this tab. The session token stays in memory and is cleared after connecting; it is never saved in extension settings.</p>
    <p>Authorize this studio origin in the backend: <code>{window.location.origin}</code></p>
    <label className="inference-token">Local backend session token<input type="password" autoComplete="off" value={token} maxLength={128} disabled={enabled} onChange={(event) => setToken(event.target.value)} /></label>
    <div className="studio-options inference-tuning">
      <label>Minimum confidence<input type="number" min={0.5} max={1} step={0.05} value={threshold} disabled={enabled} onChange={(event) => setThreshold(Math.min(1, Math.max(0.5, Number(event.target.value) || 0.8)))} /></label>
      <label>Stable windows<input type="number" min={1} max={5} value={consecutive} disabled={enabled} onChange={(event) => setConsecutive(Math.min(5, Math.max(1, Math.round(Number(event.target.value) || 2))))} /></label>
      <label>Cooldown (ms)<input type="number" min={500} max={10000} step={100} value={cooldownMs} disabled={enabled} onChange={(event) => setCooldownMs(Math.min(10000, Math.max(500, Number(event.target.value) || 1500)))} /></label>
    </div>
    <div className="studio-controls"><button className="button primary" disabled={enabled || !capturing || !model?.available || token.length < 32} onClick={enable}>Enable local inference</button><button className="button secondary" disabled={!enabled} onClick={() => client.current?.stop()}>Disable inference</button></div>
    <p role="status" aria-label="Recognition status">{status}{detail ? ` · ${detail}` : ''}</p>
    {!capturing && <p>Start webcam landmarks before enabling inference.</p>}
    <div className="recognition-output" aria-live="polite"><strong>{current?.label ?? 'No accepted sign'}</strong>
      {current && <p>{model?.sign_language} · Accepted{showConfidence && current.confidence !== null ? ` · ${(current.confidence * 100).toFixed(1)}% model confidence` : ''} · Model {current.latency_ms.toFixed(1)} ms</p>}
      {current && <p>Round trip {timings.roundTripMs.toFixed(0)} ms · Non-model overhead {Math.max(0, timings.roundTripMs - current.latency_ms).toFixed(0)} ms · Latest frame to response {timings.endToEndMs.toFixed(0)} ms · Window accumulation {timings.accumulationMs.toFixed(0)} ms</p>}
    </div>
    <div className="studio-options"><label><input type="checkbox" checked={showConfidence} onChange={(event) => setShowConfidence(event.target.checked)} />Show recognition confidence</label><button className="button secondary" onClick={() => { setHistory([]); setCurrent(null); }}>Clear recognition history</button></div>
    <p aria-label="Recognition history">{history.length ? history.join(' · ') : 'Recognition history is empty.'}</p>
    <p>Labels describe isolated signs from the selected vocabulary. They are not translated sentences or meeting captions.</p>
  </section>;
});
