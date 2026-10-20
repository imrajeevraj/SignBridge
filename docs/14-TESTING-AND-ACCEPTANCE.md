# Testing and acceptance — Phase 3

Created from the current implementation; historical Phase1/2 records are preserved.

## Repeatable automation

```powershell
Set-Location 'D:\SignBridge AI'
npm ci
npm run assets:setup
npm run backend:setup
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run validate:all
.\backend\.venv\Scripts\python.exe -m pip check
```

Do not stop unrelated port8000/5173 services. The browser suite owns its temporary
backend on18000, refuses reuse, discovers the exact unpacked extension origin and
passes a freshly generated token to its subprocess. It does not edit user secrets.
Only fake cameras and fixture images are used. Screenshots/metrics are in ignored
`extension/test-results/`. Version155.0.8059.84 is the installed working fallback;
run `npm run test:browser:setup` if absent. No physical camera is accessed.

Unit tests cover legacy settings/messages/features/camera lifecycle plus model
metadata and packages, real Torch fixture execution, absent hands, shape/schema/
finiteness/masks, request correlation, origin/token denial, payload bounds,
staleness, inference timeout/busy retention, dataset leakage/hashes, golden-vector
parity, training/export mechanics, client stability/dedup/unknown/timeout/stop and
panel rendering. Fixtures explicitly say TEST FIXTURE; none count as sign accuracy.

Browser tests cover actual MV3 packaging/health/settings/inert content/offscreen,
local model execution on photos, fake-camera consent/lifecycle, and authenticated
local WebSocket/model-not-ready behavior under packaged CSP. A separate genuine checkpoint backend WebSocket parity audit now passes, but
real-video studio replay failed to accumulate windows; these regression checks
do not satisfy the real webcam→recognition acceptance criterion. See
`PHASE-3-FINAL-VERIFICATION.md` for current evidence.

## Manual acceptance — all unverified

- Real hand/skeleton alignment, one and two hands, upper-body and all11pose visibility.
- Model Left/Right with mirrored preview on/off; absent-hand masks.
- Occlusion and distance recovery, variable lighting, camera frame-rate variation.
- Genuine trained checkpoint predictions from a consenting real signer, including
  neutral, out-of-vocabulary, ambiguous and rapid repeated signs.
- Confidence/stability settings using held-out data, false positives, unseen signers.
- Physical camera LED off after Stop/Esc/hide/close, restart without automatic capture.
- OS permission denial/revocation, unplugged/in-use camera, multiple studio tabs.
- Sustained CPU/RAM, thermal load, processed FPS and end-to-end latency.
- Wider codec/dataset coverage beyond the audited ISL500 pilot. The original two
  MOV probes still yielded zero v1 windows; approved v2 now yields real pilot
  windows, with explicit attrition and partial-decode diagnostics.

## Completion gate

Current **PHASE 3 PARTIAL**. A genuine compatible two-class model is trained;
backend inference and tiny signer-disjoint known-test evaluation pass. Unsupported
sign rejection fails11/11 windows and real-time studio replay produces no complete
windows on this host. Neutral/physical-camera acceptance remains unverified.
See [final verification](PHASE-3-FINAL-VERIFICATION.md).
Do not call this continuous translation or claim meeting captions are implemented.
