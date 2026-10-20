# SignBridge AI

A local accessibility prototype with a Chrome MV3 extension, React webcam studio
and FastAPI backend. **Phase 3 is PARTIAL:** a genuine two-class ISL GRU is now
trained and verified through the backend. It got 4/4 held-out known clips correct,
but falsely accepted all 11 unsupported test windows. Real-time recorded-video
studio checks also failed to accumulate valid windows on this host. The model
is a local research artifact, not reliable recognition or continuous translation.

See [the final Phase 3 verification report](docs/PHASE-3-FINAL-VERIFICATION.md),
[model audit](docs/PHASE-3-MODEL-AUDIT.md) and
[model card](docs/PHASE-3-MODEL-CARD.md). Meeting capture, recording and captions
remain unimplemented. Phase 1/2 capture and privacy boundaries are preserved.

## What works now

- Dark/light React dashboard and toolbar popup, built with strict TypeScript,
  Tailwind CSS and local Lucide icons; responsive and keyboard accessible.
- English/Hindi caption preferences, caption size and confidence display saved
  in `chrome.storage.local`. Only the theme currently has a visual effect.
- Real localhost backend checks: loading, online, offline and error states.
- MV3 service worker lifecycle, typed messaging and explicit `NOT_IMPLEMENTED`
  replies for background/meeting capture commands; local inference belongs to the studio.
- Inert, idempotent content scripts on Google Meet, Teams Web and Zoom Web.
  No page text or media is read, and no captions or meeting controls are modified.
- Webcam studio: explicit Start/Stop, camera permission, skeleton, measured FPS,
  missing-hand indicators and a bounded 32-frame feature buffer.
- Local MediaPipe Tasks Vision 1.1.1, pinned hand/pose-lite task and WASM assets,
  the preserved [v1 161-value schema](docs/11-DATA-CONTRACTS.md), and the separately
  approved [v2 172-value schema](docs/11B-DATA-CONTRACTS-V2.md).
- Packaged inactive offscreen document and caption-overlay boundary.
- `GET /health`, `GET /model/info`, authenticated `WebSocket /ws/infer`, model/dataset tests, component tests, build validation
  and real Chromium extension/model/capture integration tests.

## Prerequisites

- Node.js **20.19+ in the 20.x line**, **22.12+ in the 22.x line**, or **24+**
  (tested on 20.20.0).
- npm 10+ (tested with 11.12.1), Python **3.11+** (tested with 3.11.9).
- Chrome 116+; a recent stable Chrome is recommended. Git is optional for setup.
- Internet for dependency and model setup only. Runtime code and assets are local.
- A webcam for manual testing. Automated tests use simulated capture and test images.

The repository root is already `D:\SignBridge AI`; do not create a second nested
`signbridge-ai` directory. Commands below are PowerShell-compatible.

## Install and build

```powershell
Set-Location 'D:\SignBridge AI'
npm ci
npm run assets:setup
npm run backend:setup
npm run build
```

The backend setup script creates `backend/.venv` and installs the complete pinned
`backend/requirements-lock.txt`. Activation is not required. `package-lock.json`
pins the npm graph. Asset setup downloads ~14 MB of model bundles and copies the
pinned npm WASM files into `extension/public`. All six assets are SHA-256 verified
on setup and build; a build never silently downloads missing assets.
If PowerShell blocks `npm.ps1`, use `npm.cmd` in these commands
instead of changing the system execution policy.

## Start the backend

In one terminal, from the repository root:

```powershell
npm run backend:dev
```

Equivalent direct command (also useful without Node):

```powershell
Set-Location 'D:\SignBridge AI\backend'
.\.venv\Scripts\python.exe -m app
```

This runs Uvicorn with development reload at `http://127.0.0.1:8000`. Press Ctrl+C
to stop. It never binds to `0.0.0.0` by default. From another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/model/info
```

**If port 8000 is occupied:** keep the other application running and choose a free
port. In this workspace, port 8000 was serving Coding Streak Guardian during
validation; SignBridge was browser-tested on 18000. In a root PowerShell terminal:

```powershell
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
npm run build
npm run backend:dev
```

Reload the extension after rebuilding. Both variables must select the same port.
The build updates the compiled health URL, dashboard label and exact CSP origin.
For a persistent extension override, copy `extension/.env.example` to
`extension/.env.local` and edit its port. The backend still needs `SIGNBRIDGE_PORT`.
Remove the overrides and rebuild to restore port 8000; no external hosts can be
configured. To run Chromium tests on 18000, set both variables, build, stop any
manually started SignBridge backend and run `npm run test:e2e` in that terminal.

Health JSON:

```json
{
  "status": "ok",
  "service": "SignBridge AI Backend",
  "phase": 3,
  "model_status": "not_loaded",
  "model_state": "MODEL_NOT_INSTALLED"
}
```

The backend now supports Phase 3 model lifecycle and inference; webcam tracking
still runs entirely in the browser and does not require it. `/model/info` describes the **sign model**
and reports `available: false`, null model and sign-language identifiers,
an empty supported-language list and vocabulary size zero. The WebSocket returns
MODEL_NOT_READY until a validated compatible checkpoint is loaded. `/openapi.json` is available; CDN-backed Swagger/ReDoc pages are disabled.

## Install the unpacked extension in Chrome

1. Run `npm run build` from the root and keep the backend running if you want an
   online status.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** at the top right.
4. Click **Load unpacked** and choose **`D:\SignBridge AI\extension\dist`**.
   Select the directory containing the generated `manifest.json`, not the root,
   `extension`, or `extension/public`.
5. Pin **SignBridge AI** using Chrome's Extensions menu and click the toolbar icon.
   Use the top-right arrow to open the full dashboard, or choose **Extension
   options** from Chrome's extension menu.
6. The backend should show **Online** only when the real health request succeeds.
   The model shows **Not Installed** until you install a compatible trained package.
   Capture and recognition session state are shown in the dedicated studio.
7. After edits: rebuild, click the extension's **Reload** button on
   `chrome://extensions`, and reopen the popup/dashboard. Reload an existing
   meeting tab to refresh its content script.

You can inspect the service worker using its link on `chrome://extensions`.
The offscreen page is deliberately **not** created. Loading the dashboard does not
request a camera. If the backend is off, the dashboard truthfully shows Offline.

## Try webcam landmarks

1. Click **Open webcam studio** in the dashboard. Use one studio tab at a time.
2. Click **Start webcam landmarks**, then allow Chrome's camera prompt. The
   microphone is never requested. Keep your upper body and both hands visible.
3. Wait for **Camera active · Local landmarks only**. Skeleton and diagnostics
   show real local detector output. Missing hands/pose leave the buffer empty;
   no landmarks are invented to fill a gap.
4. **Stop camera**, **Esc**, switching away from the studio, or closing the tab
   ends capture and releases tracks, worker and buffers. Returning does not
   restart automatically. Mirroring changes the preview only.

If permission is denied, allow the extension in Chrome's camera settings and
click Start again. Device-in-use, disconnected-camera, missing assets and worker
timeouts show errors and release capture. Re-run `npm run assets:setup`, rebuild
and reload for missing/corrupt assets. Windows camera privacy settings must also
permit desktop apps. No video/audio is saved or uploaded. Numeric landmark windows go only to the
loopback backend after separate explicit inference consent; they are not persisted.

The CPU worker caps v1 sampling at 15 FPS and v2 at 30 distinct decoded FPS,
selected from compatible model metadata, and allows one frame in flight. Slow
hardware drops samples; gaps above 250 ms reset the buffer. Diagnostics measure
performance, not recognition accuracy. Real two-hand tracking, anatomical labels
and sustained device performance still need manual QA.

## Development and validation

```powershell
# Dashboard/studio preview at http://127.0.0.1:5173 (camera requires explicit Start)
npm run dev

# In another terminal: TypeScript, unit/component tests, production build,
# and packaged manifest/CSP/import validation
npm run validate

# Real FastAPI tests, including lifespan startup and origin/host checks
npm run backend:test

# Download test browser once, then test the actual unpacked build
npx playwright install chromium
npm run test:e2e

# Everything, once dependencies and Chromium are installed
npm run validate:all
```

Stop any manually running SignBridge backend before `test:e2e`: the test starts its own
backend on port 8000 (or `SIGNBRIDGE_PORT`) and refuses to reuse an unrelated service. It launches an
isolated Chromium profile, loads `extension/dist`, checks real worker messaging
and health, persists settings, verifies the inactive offscreen state and tests a
synthetic meeting page. Additional tests run actual local models against test
images and Chromium's fake camera, checking no external HTTP requests, permission
denial, Stop/restart, Esc and hidden-tab cleanup. They never use a physical camera
or join a live meeting. Screenshots and measured timings appear under
`extension/test-results/` and are ignored by Git.

On this Windows host, Playwright's bundled Chromium 156 could not launch because
of a Windows side-by-side assembly error. Google Chrome for Testing **155.0.8059.84**
does launch. A pinned fallback downloader and executable override are provided:

```powershell
npm run test:browser:setup
$env:SIGNBRIDGE_CHROMIUM_PATH = (Join-Path (Get-Location) '.cache\chrome-for-testing-155\chrome-win64\chrome.exe')
# Use the matching port override above if 8000 is occupied, then:
npm run test:e2e
```

This uses an isolated test profile; it does not change your installed Chrome or
its browsing profile. The fallback browser is cached under the ignored `.cache/`.

`npm run dev` is **not** an extension hot-reload server. Its browser preview uses
localStorage, is explicitly labeled, and calls FastAPI from the exact allowed
origin `http://127.0.0.1:5173`. Installed extension settings use Chrome storage and
are separate. The dev command builds the local landmark worker once; restart it
after worker/feature edits. React UI changes use Vite HMR. Always load production
`dist` for Chrome API testing.

## Structure

```text
extension/
  public/manifest.json, icons/, models/
  src/background/        # lifecycle, messaging, health
  src/content/           # passive meeting integration and overlay boundary
  src/offscreen/         # packaged but inactive future media context
  src/communication/     # typed messages and dashboard client
  src/vision/            # local detector worker, capture lifecycle, custom features
  src/inference/         # bounded local client, validation, prediction filtering
  src/components/, pages/, styles/
  vision-assets.json     # versioned task/WASM URLs and SHA-256 lock
  scripts/               # Vite builds, asset setup and package validator
  tests/, e2e/           # Vitest and real Chromium checks
backend/
  app/                   # configuration, Pydantic schemas, FastAPI
  tests/                 # endpoint/startup/CORS/host checks
  requirements.txt       # direct pins
  requirements-lock.txt  # full graph
ml/                     # dataset/train/evaluate and native research audits
docs/                    # architecture, roadmap, verification record
scripts/                 # portable backend helpers and original icon generator
AGENTS.md                # repository conventions
```

## Architecture and permissions

Dashboard → typed service-worker messages → loopback FastAPI. The content script
and offscreen document are separate boundaries for later phases. Details and the
complete intended system diagram are in [docs/architecture.md](docs/architecture.md).

Manifest permissions remain `storage` and a host permission for `http://127.0.0.1/*`.
Chrome match patterns cannot restrict ports, so application code and CSP restrict
HTTP and WebSocket connections to port 8000 by default (or the exact configured loopback port). Content-script matches are limited to Meet,
Teams and Zoom domains. There is no `tabs`, `scripting`, `activeTab`, `offscreen`,
`tabCapture`, microphone or camera permission. Local icons are original generated
PNG assets; typography uses the system font stack; no CDN scripts or fonts exist.
Visible-page `getUserMedia` requests camera consent at runtime. CSP permits local
WASM via `'wasm-unsafe-eval'`, without JavaScript `'unsafe-eval'` or inline scripts.
External runtime origins are blocked. Attribution is packaged in
`vendor/mediapipe/NOTICE.md` and `LICENSE`.

The main Vite build emits `index.html`, `webcam.html`, a module `service-worker.js`, and
`src/offscreen/offscreen.html`. A second Vite library build emits the content
script as a self-contained IIFE (`content.js`) because manifest content scripts
cannot contain normal ES module imports. The build validator checks referenced
files, module imports, HTML assets, icons, CSP and classic-script parsing. Another
IIFE build bundles MediaPipe into `vision-worker.js` for its local `importScripts`
WASM loader. Model processing stays off the UI thread.

See official references for [MV3 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy),
[content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
[offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen),
[Vite builds](https://vite.dev/guide/build),
[Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite),
and [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/).

## Enable local inference (only with a genuine compatible model)

The default backend is **Not Installed** unless a model directory is explicitly
configured. The genuine local package is `D:\SignBridge AI\ml\runs\isl500-v2-pilot`.
Read its [model card](docs/PHASE-3-MODEL-CARD.md) before research use: unsupported
sign rejection failed, and live studio delivery is unverified. Set it explicitly
in the terminal that starts the backend:

```powershell
$env:SIGNBRIDGE_MODEL_DIR = 'D:\SignBridge AI\ml\runs\isl500-v2-pilot'
```

Training and dataset commands are in
[08-DATASETS-AND-TRAINING.md](docs/08-DATASETS-AND-TRAINING.md). Use real, licensed
clips, verified labels and signer-independent splits; synthetic test checkpoints
are rejected by the application.

1. Install a validated package containing `metadata.json`, `weights.safetensors`
   and `evaluation.json`; set `SIGNBRIDGE_MODEL_DIR` to its absolute directory.
2. Set `SIGNBRIDGE_EXTENSION_ORIGINS` to the exact `chrome-extension://<id>` shown
   in the studio. Restart your SignBridge backend. No wildcard origins are allowed.
3. Read your private `backend/.local/inference-token` file and paste its contents
   into the studio's session-token field. Do not share or put it in frontend env.
4. Start webcam landmarks, refresh model status, and enable local inference only
   when Ready. The panel shows accepted isolated labels, language, confidence and
   measured timings. Confidence is not accuracy. No sentences are generated.
5. Stop/Esc/hide/close ends capture and inference. Backend disconnect requires
   explicit reconnect. No automated retries or automatic camera restarts occur.

See [the protocol/setup guide](docs/09-ML-INFERENCE-PIPELINE.md) for exact variables,
package validation, message limits and troubleshooting. A model-loading or schema
error leaves the model unavailable and does not substitute random predictions.

## Limitations and next phase

Real training and backend inference now work, but **unknown-sign rejection failed**
and real-time video replay did not deliver predictions to the studio on this host.
The research pilot has only two classes and four known test clips. Neutral activity,
physical webcams and consenting live signers remain unverified. The prior native
OpenHands result (3/64) is separate and is not a live adapter. ASL and ISL remain
separate; neither custom schema is a native INCLUDE/OpenHands/WLASL input.
Caption preferences remain future configuration, and meeting content scripts
remain inert.

Before Phase 4: address rejection using genuine negatives and a new untouched
held-out set, improve measured live landmark throughput without relaxing validity,
and complete [manual acceptance](docs/14-TESTING-AND-ACCEPTANCE.md).
The [Phase 2 record](docs/phase-2-checklist.md) and
[Phase 1 record](docs/phase-1-checklist.md) remain historical evidence.
