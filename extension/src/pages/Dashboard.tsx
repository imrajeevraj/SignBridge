import { useCallback, useEffect, useState } from 'react';
import { Activity, Box, Camera, Captions, CircleHelp, Cpu, Fingerprint, Globe2, Hand, LockKeyhole, Monitor, Play, RefreshCw, Server, ShieldCheck, Square, Wifi } from 'lucide-react';
import { Header } from '../components/Header';
import { StatusCard } from '../components/StatusCard';
import { FeatureCard } from '../components/FeatureCard';
import { SettingsPanel } from '../components/SettingsPanel';
import { getBackendStatus, getStatus } from '../communication/client';
import type { BackendStatus } from '../communication/messages';
import { isExtension } from '../settings';
import manifest from '../../public/manifest.json';
import { BACKEND_URL } from '../background/health';

type Connection = BackendStatus | { state: 'loading' };
const labels = { online: 'Online', offline: 'Offline', error: 'Error', loading: 'Checking…' };

export function Dashboard() {
  const openStudio = () => {
    if (isExtension()) void chrome.tabs.create({ url: chrome.runtime.getURL('webcam.html') }).catch(() => setRuntimeError('Could not open the webcam studio. Reload the extension.'));
    else window.location.assign('./webcam.html');
  };
  const [connection, setConnection] = useState<Connection>({ state: 'loading' });
  const [version, setVersion] = useState(manifest.version);
  const [runtimeError, setRuntimeError] = useState('');
  const check = useCallback(async () => {
    setConnection({ state: 'loading' });
    try { setConnection(await getBackendStatus()); }
    catch (error) { setConnection({ state: 'error', message: error instanceof Error ? error.message : 'Unable to check backend.' }); }
  }, []);
  useEffect(() => {
    void check();
    void getStatus().then((status) => setVersion(status.version)).catch((error: unknown) => {
      setRuntimeError(error instanceof Error ? error.message : 'Could not read extension status.');
    });
  }, [check]);

  return <div className="app-shell">
    <Header version={version} onError={setRuntimeError} />
    <main id="main">
      {!isExtension() && <div className="preview-banner" role="note">Browser preview · Preferences are stored only in this browser preview. Load the extension to test Chrome integration.</div>}
      {runtimeError && <p className="error-message" role="alert">{runtimeError}</p>}
      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> BUILT FOR UNDERSTANDING</div>
        <h1>Every gesture.<br /><span>A step toward connection.</span></h1>
        <p>A more accessible meeting starts here. Your foundation for<br className="desktop-break" /> sign-language recognition and live captions.</p>
        <div className="hero-tags"><span><ShieldCheck size={13} aria-hidden="true" /> Privacy first</span><span className="tag-divider" /><span>Phase 3 <span className="muted">/ Local inference foundation</span></span></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="gesture-mark"><Hand size={65} strokeWidth={1.1} /></div><span className="art-label">CONNECTION STARTS WITH YOU</span></div>
      </section>

      <section className="status-grid" aria-label="System status" aria-live="polite">
        <StatusCard icon={Activity} label="Recognition" value="See studio" />
        <StatusCard icon={Server} label="Backend" value={labels[connection.state]} tone={connection.state} />
        <StatusCard icon={Box} label="Sign model" value={connection.state === 'online' ? ({ MODEL_NOT_INSTALLED: 'Not Installed', MODEL_LOADING: 'Loading', MODEL_READY: 'Ready', MODEL_ERROR: 'Error', MODEL_INCOMPATIBLE: 'Incompatible', MODEL_UNAVAILABLE: 'Unavailable' })[connection.health.model_state] : 'Unavailable'} />
        <StatusCard icon={Camera} label="Webcam status" value="See studio" />
      </section>

      <div className="workspace-grid">
        <div className="flex flex-col gap-5">
          <section className="panel webcam-launch"><div className="section-heading"><Camera size={19} className="accent" /><h2>Webcam landmarks are ready to try</h2></div><p>Open the visible studio to start your camera with permission. It tracks hands and pose locally; isolated sign recognition additionally requires a validated trained model. Switching away from the studio stops capture.</p><button className="button primary" onClick={openStudio}>Open webcam studio</button></section>
          <section className="panel recognition-panel" aria-labelledby="recognition-heading">
            <div className="flex items-center justify-between gap-3"><div className="section-heading"><span className="heading-icon"><Fingerprint size={19} aria-hidden="true" /></span><h2 id="recognition-heading">Recognition studio</h2></div><span className="badge">COMING NEXT</span></div>
            <p className="section-description">The space where signs will become words.</p>
            <fieldset className="mode-options" disabled aria-describedby="phase-notice"><legend className="sr-only">Recognition mode (planned)</legend>
              <label className="mode-card"><input type="radio" name="mode" value="webcam" defaultChecked /><Camera size={21} aria-hidden="true" /><strong>Webcam Mode</strong><small>Landmarks in Phase 2</small></label>
              <label className="mode-card"><input type="radio" name="mode" value="meeting-tab" /><Monitor size={21} aria-hidden="true" /><strong>Meeting Tab Mode</strong><small>Tab capture in Phase 4</small></label>
            </fieldset>
            <div className="caption-empty"><span className="caption-icon"><Captions size={27} strokeWidth={1.3} aria-hidden="true" /></span><strong>Your captions will appear here</strong><p>Meeting captions are not implemented. See the studio for its local session status.</p><span className="empty-rule" /></div>
            <div className="control-buttons"><button className="button primary" disabled aria-describedby="phase-notice"><Play size={15} aria-hidden="true" />Start Recognition</button><button className="button secondary" disabled aria-describedby="phase-notice"><Square size={13} aria-hidden="true" />Stop Recognition</button></div>
            <p className="phase-notice" id="phase-notice"><CircleHelp size={16} aria-hidden="true" /><span>Local inference runs only in the studio after explicit consent and model validation. Meeting capture follows in Phase 4 and integrated captions in Phase 5.</span></p>
          </section>
          <section className="panel connection-panel" aria-labelledby="backend-heading">
            <div className="connection-top"><div className="section-heading"><span className="heading-icon cyan"><Wifi size={18} aria-hidden="true" /></span><div><h2 id="backend-heading">Local backend</h2><code>{new URL(BACKEND_URL).host}</code></div></div><button className="icon-button" aria-label="Check backend connection" onClick={() => void check()} disabled={connection.state === 'loading'}><RefreshCw size={17} className={connection.state === 'loading' ? 'spin' : ''} /></button></div>
            <div className={`connection-status tone-${connection.state}`} role="status"><span className="status-dot" />{connection.state === 'online' ? 'Connected · Health check passed. Model state is reported above.' : connection.state === 'loading' ? 'Checking local service…' : connection.message}</div>
            {connection.state === 'offline' && <p className="backend-hint">From the project root, run <code>npm run backend:dev</code></p>}
          </section>
        </div>
        <SettingsPanel />
      </div>

      <section className="roadmap" aria-labelledby="roadmap-heading"><div className="roadmap-heading"><div><span className="eyebrow">THE ROAD AHEAD</span><h2 id="roadmap-heading">Built today. More possible tomorrow.</h2></div><span className="roadmap-note">One thoughtful step at a time</span></div>
        <div className="feature-grid">
          <FeatureCard icon={Hand} title="Real-time sign recognition" description="One signer. A focused vocabulary. Meaningful connections." phase="Phase 3" />
          <FeatureCard icon={Captions} title="Live meeting captions" description="Bring accessible captions into your meeting space." phase="Phase 5" />
          <FeatureCard icon={Cpu} title="MediaPipe integration" description="Local hand and pose landmarks in the webcam studio." phase="Phase 2" available />
          <FeatureCard icon={LockKeyhole} title="Private local inference" description="A local model, with your video staying on your device." phase="Phase 3" />
        </div>
      </section>
    </main>
    <footer><span><span className="footer-dot" />Phase 3 · Model readiness required</span><span>Hackathon prototype <span className="footer-separator">/</span> <Globe2 size={12} aria-hidden="true" /> Privacy-first design</span></footer>
  </div>;
}
