import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, ShieldCheck, Square } from 'lucide-react';
import { drawLandmarks } from '../vision/draw';
import { acquireCameraLease, WebcamSession, type FrameResult, type SessionState } from '../vision/session';
import { FEATURE_SCHEMA, POSE_INDICES } from '../vision/features';
import { loadSettings } from '../settings';
import { RecognitionPanel, type RecognitionHandle } from '../components/RecognitionPanel';
import { featureCount, isFeatureSchema, type FeatureSchema } from '../vision/schemas';
import type { ModelInfo } from '../inference/contracts';

interface Metrics { frames: number; fps: number; processingMs: number; featureMs: number; left: boolean; right: boolean; pose: number; buffered: number; windows: number; featureState: string }
const empty: Metrics = { frames: 0, fps: 0, processingMs: 0, featureMs: 0, left: false, right: false, pose: 0, buffered: 0, windows: 0, featureState: 'Waiting for frames' };

export function Webcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<WebcamSession | null>(null);
  const recognitionRef = useRef<RecognitionHandle>(null);
  const skeletonRef = useRef(true);
  const [state, setState] = useState<SessionState>('idle');
  const [message, setMessage] = useState('Camera is off. Start when you are ready.');
  const [skeleton, setSkeleton] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [metrics, setMetrics] = useState<Metrics>(empty);
  const schemaRef = useRef<FeatureSchema>(FEATURE_SCHEMA);
  const [schema, setSchema] = useState<FeatureSchema>(FEATURE_SCHEMA);
  const modelChanged = useCallback((model: ModelInfo) => {
    if (!model.available || !isFeatureSchema(model.feature_schema) || model.feature_schema === schemaRef.current) return;
    sessionRef.current?.stop('Model feature contract changed. Start the camera again to use the selected model.');
    schemaRef.current = model.feature_schema; setSchema(model.feature_schema);
  }, []);

  useEffect(() => {
    const video = videoRef.current!;
    let mounted = true;
    let started = 0; let frames = 0; let lastUpdate = 0;
    void loadSettings().then((settings) => { if (mounted) document.documentElement.dataset.theme = settings.theme; }).catch(() => { /* Theme defaults to dark; capture is independent of stored preferences. */ });
    const frame = (result: FrameResult) => {
      recognitionRef.current?.frame(result);
      frames++;
      const now = performance.now();
      if (!started) started = now;
      if (canvasRef.current) drawLandmarks(canvasRef.current, result.frame, skeletonRef.current);
      if (mounted && now - lastUpdate >= 500) {
        lastUpdate = now;
        setMetrics({ frames, fps: frames > 1 ? (frames - 1) * 1000 / (now - started) : 0, processingMs: result.processingMs, featureMs: result.featureMs ?? 0,
          left: Boolean(result.frame.leftHand), right: Boolean(result.frame.rightHand),
          pose: POSE_INDICES.filter((index) => (result.frame.pose?.[index]?.visibility ?? 0) >= 0.5).length,
          buffered: result.bufferSize, windows: result.windows,
          featureState: result.featureState === 'ready' ? 'Valid custom features' : result.featureState === 'no_hands' ? 'No hands detected' : 'Pose anchors not visible',
        });
      }
    };
    const session = new WebcamSession(video, {
      state: (value, text) => { if (mounted) { setState(value); setMessage(text); } },
      frame,
      clear: () => {
        recognitionRef.current?.stop();
        frames = 0; started = 0; lastUpdate = 0;
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        if (mounted) setMetrics(empty);
      },
    }, {
      getMedia: () => navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: schemaRef.current.endsWith('.v2') ? 30 : 15, max: 30 }, facingMode: 'user' } }),
      worker: () => new Worker(new URL('vision-worker.js', window.location.href)),
      bitmap: (element) => {
        const width = element.videoWidth || 640;
        const height = element.videoHeight || 480;
        if (width > 640) {
          const targetWidth = 640;
          const targetHeight = Math.round(height * 640 / width);
          return createImageBitmap(element, { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'low' });
        }
        return createImageBitmap(element);
      },
      lease: acquireCameraLease,
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
      requestVideoFrame: (callback) => video.requestVideoFrameCallback((now, metadata) => callback(now, metadata.mediaTime)),
      cancelVideoFrame: (id) => video.cancelVideoFrameCallback(id),
    });
    sessionRef.current = session;
    const stop = () => session.stop();
    const hidden = () => { if (document.hidden) session.stop('Camera stopped because the studio is no longer visible.'); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') stop(); };
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('keydown', escape);
    return () => { mounted = false; session.stop(); sessionRef.current = null; window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('keydown', escape); };
  }, []);

  const active = state === 'requesting' || state === 'loading' || state === 'running';
  return <div className="app-shell webcam-shell">
    <header className="header flex items-center justify-between gap-4"><a className="studio-back" href="./index.html"><ArrowLeft size={16} />Dashboard</a><span className="badge">PHASE 3 · LOCAL STUDIO</span></header>
    <main>
      <section className="hero"><div className="eyebrow">YOUR CAMERA. YOUR CONTROL.</div><h1>Webcam landmark studio</h1><p>Track hands and pose locally. Sign recognition requires a validated trained model and separate opt-in.</p></section>
      <section className="panel" aria-labelledby="camera-title">
        <div className="flex items-center justify-between gap-3"><h2 id="camera-title">One-signer preview</h2><span className={`camera-indicator ${active ? 'tone-online' : 'muted'}`}>{state === 'running' || state === 'loading' ? '● CAMERA ACTIVE' : state === 'requesting' ? 'Permission pending' : 'Camera off'}</span></div>
        <div className={`video-stage ${mirror ? 'mirrored' : ''}`} data-processed-frames={metrics.frames}>
          <video ref={videoRef} muted playsInline aria-label="Local webcam preview" />
          <canvas ref={canvasRef} aria-label="Detected landmark skeleton" />
          {!active && <div className="video-placeholder"><Camera size={42} /><strong>Your camera is off</strong><span>Keep your upper body and both hands in frame.</span></div>}
        </div>
        <div className="studio-controls"><button className="button primary" disabled={active} onClick={() => void sessionRef.current?.start(schemaRef.current)}><Camera size={16} />Start webcam landmarks</button><button className="button stop-button" disabled={!active} onClick={() => sessionRef.current?.stop()}><Square size={15} />Stop camera</button></div>
        <p className={state === 'error' ? 'error-message' : 'studio-status'} aria-label="Camera status" role={state === 'error' ? 'alert' : 'status'}>{message}</p>
        <div className="studio-options"><label><input type="checkbox" checked={skeleton} onChange={(event) => { skeletonRef.current = event.target.checked; setSkeleton(event.target.checked); if (!event.target.checked) { const canvas = canvasRef.current; if (canvas) canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height); } }} />Show skeleton</label><label><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />Mirror preview only</label><span>Esc stops the camera</span></div>
      </section>
      <section className="studio-metrics" aria-label="Measured landmark diagnostics">
        <article className="panel"><small>Processed FPS</small><strong>{metrics.fps.toFixed(1)}</strong><span>Measured · capped at {schema.endsWith('.v2') ? 30 : 15}</span></article>
        <article className="panel"><small>Last processing time</small><strong>{metrics.processingMs.toFixed(1)} ms</strong><span>Features + buffer: {metrics.featureMs.toFixed(2)} ms</span></article>
        <article className="panel"><small>Detected hands</small><strong>{Number(metrics.left) + Number(metrics.right)} / 2</strong><span>Model Left: {metrics.left ? 'yes' : 'no'} · Right: {metrics.right ? 'yes' : 'no'}</span></article>
        <article className="panel"><small>Selected pose points</small><strong>{metrics.pose} / 11</strong><span>Visibility threshold 0.5</span></article>
      </section>
      <section className="panel studio-contract"><h2>Feature buffer · {metrics.buffered} / 32 frames</h2><p>{metrics.featureState}. Complete windows: {metrics.windows}. These are numeric observations, not predictions.</p><code>{schema} · {featureCount(schema)} values/frame · stride 8</code><p>The loaded model defines its language and verified vocabulary. Landmark detection has no sign-language semantics.</p></section>
      <RecognitionPanel ref={recognitionRef} capturing={state === 'running'} onModelChange={modelChanged} />
      <aside className="studio-privacy"><ShieldCheck size={22} /><p>Camera starts only after you click Start and grant Chrome permission. Microphone stays off. Nothing is recorded or saved. Landmark windows go to your local backend only after you separately enable inference. Switching away, closing this tab, Esc or Stop ends capture and inference. Only one studio can capture at a time.</p></aside>
    </main>
    <footer><span>Phase 3 · Opt-in local recognition</span><span>Model state shown above · Meeting capture: Disabled</span></footer>
  </div>;
}
