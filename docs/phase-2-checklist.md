# Phase 2 verification record — 2026-10-18

Phase 2 implementation is present. Automated gates below pass; physical-camera
acceptance remains explicitly unverified. Phase 3 sign inference is not implemented.
The user approved defining the missing custom feature contract, now recorded in
[11-DATA-CONTRACTS.md](11-DATA-CONTRACTS.md).

## Implemented

- Dedicated React webcam studio, linked from dashboard; no capture at page load.
- Explicit Start + Chrome permission; video only; visible active indicator and Stop.
- Stop/Esc/hide/page exit/error cleanup, delayed-permission cancellation and a
  Web Lock preventing concurrent studio capture. No automatic restart.
- Local Tasks Vision 1.1.1, Hand Landmarker v1 and Pose Lite v1; fixed local URLs,
  SHA-256 asset lock, setup script and production package verification.
- CPU classic worker, one bitmap in flight, sample cap 15 FPS, no frame backlog.
- Genuine hand/pose overlay, mirror-preview-only toggle and measured diagnostics.
- Deterministic custom 161-value features, 32-frame windows, stride 8, masks and
  reset on unusable observations or >250 ms gaps. No native-checkpoint assumptions.
- No recording, microphone, media upload, sign predictions or captions. Reserved
  meeting/inference commands still fail explicitly; offscreen remains inactive.

## Executed validation

Environment: Windows, Node 20.20.0, Python 3.11.9, Chrome for Testing
155.0.8059.84. Playwright's installed Chromium 156 has a host side-by-side launch
failure, so the documented stable fallback was used in an isolated profile.
Port 8000 belongs to another application; it was left running. Tests used 18000.

```powershell
npm run assets:setup
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run validate:all
```

| Check | Result |
| --- | --- |
| TypeScript strict compilation | Passed |
| Vitest unit/component suite | 45 passed across 9 files |
| FastAPI pytest suite | 13 passed |
| Vite production build / MV3 validator | Passed, local model/WASM hashes verified |
| Chromium unpacked extension / health / settings / inert meeting scaffold | Passed |
| Actual MediaPipe worker on two-hand composite, pose photo, empty frame | Passed |
| Simulated camera Start/Stop/restart/Esc/hidden event/denial/no external HTTP | Passed |
| Initial camera access and audio requested | Neither; video only after Start |
| Manual physical webcam / real human signer | Not run |

After integration tests, `npm run build` also passed without port overrides;
the delivered `dist` uses the default backend port 8000. README explains how to
rebuild for 18000 on this host. A focused rerun of the camera browser test passed
after adding a visible TEST FIXTURE label to its screenshot.

`npm run dev` built the worker but could not bind 5173 because an existing
SignBridge Vite preview already owned it. That process was preserved. Its
`/webcam.html` and `/vision-worker.js` returned HTTP 200, and the hand model endpoint
returned the expected 7,819,105 bytes. A second preview server was not started.

Lifecycle unit tests cover late permission/lease/bitmap resolution, duplicate
Start, cancellation during loading, disconnect, model/frame timeout and failed
bitmap transfer. Golden features cover both hands, masks, missing/invalid pose,
translation/scale invariance, bounds, timestamps and stride. Mapping tests ensure
handedness follows model labels rather than detection order.

Browser integration runs real bundled models under the extension's CSP. The
two-hand fixture combines an upstream hand photograph with its reflection; it
is not a real two-hand signer sequence. The pose fixture produces 33 pose points.
A blank frame produces no hands or pose. The fake-camera test uses Chrome flags,
never a physical webcam. Hidden-state cleanup is checked with a controlled
`document.hidden` and dispatched visibility event because headless tab switching
does not consistently produce native visibility transitions.

## Measurements and artifacts

One recorded run: simulated camera 14.9 processed FPS, last frame 37.2 ms (hands,
pose, features). Fixture processing: two-hand composite 251.2 ms on its first
frame, pose image 74.9 ms, empty image 47.0 ms. These short CPU samples include
startup/warm-up effects and are not latency percentiles or recognition accuracy.
Earlier first-frame timings varied considerably; do not promise 15 FPS on all
hardware. No sustained CPU utilization or peak WASM memory benchmark is claimed.

The feature ring is bounded to 32 × 161 float32 values (20,608 bytes) plus metadata;
an emitted tensor is another 20,608 bytes and is immediately discarded after
counting. Model/WASM, browser and bitmap memory are separate. At most one
bitmap is outstanding. Worker termination releases session model ownership.

Ignored artifacts under `extension/test-results/` include dark/light dashboard
screenshots, a visibly labeled fake-camera screenshot, fixture timing JSON and
simulated-camera timing text. The studio screenshot was visually inspected.
Playwright clears its output directory between runs; a focused rerun retains
only that test's latest artifacts. Measurements above preserve the full-run record.

## Remaining manual acceptance and risks

1. Load the rebuilt `extension/dist` unpacked. Open studio and approve a real
   webcam. Keep upper body and hands visible; verify skeleton alignment and both
   model-side labels with mirroring on/off. Confirm missing hands clear masks.
2. Verify Chrome's live-camera indicator extinguishes on Stop, switching tabs,
   closing studio, revoking permission and unplugging the device. Try a second
   studio tab. Returning must not silently resume capture.
3. Run a sustained session on target hardware; record FPS, processing latency,
   CPU and memory. Confirm usable windows fill only with visible pose/hands.
   Strict all-11-pose visibility can interrupt windows during occlusion.
4. Package attribution includes available upstream Apache-2.0 evidence. The npm
   release does not include a full artifact-specific third-party NOTICE/SBOM;
   recheck distribution notices before publishing a redistributable release.

Reference gaps still present: `PROJECT_DOCS_INDEX.md` and numbered docs 00, 01,
05, 08, 09, 12 and 14. Existing user-supplied architecture, model and roadmap
documents are preserved. The original testing/acceptance doc 14 was unavailable;
this record is implementation evidence, not a claim to satisfy an unseen checklist.
Before Phase 3, resolve dataset/native-inference requirements and select a genuine
language-specific model with verified preprocessing and evaluation data.
