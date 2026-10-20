# Phase 3 final verification — 2026-10-20

**PHASE 3 PARTIAL.** A genuine compatible model is now trained, exported and
verified through the backend. Two essential acceptance checks failed:
unsupported-sign rejection and real-time studio prediction delivery on this host.
No Phase4 capture or meeting overlay was implemented.

## Acceptance evidence

| Required gate | Result |
|---|---|
| Genuine compatible trained model | PASS: local `ml/runs/isl500-v2-pilot`, v2 `[32,172]`, genuine ISL500 data, strict safetensors/hash validation |
| Real labeled data and held-out evaluation | PASS with severe sample-size limits:15 training,6 validation,4 test clips;4/4 known test clips correct |
| Real backend inference | PASS: four genuine held-out windows through authenticated FastAPI WebSocket match direct model output; package reload/re-evaluation agrees |
| Webcam studio receives authentic predictions | **FAIL on real-video replay**: native and640-wide1x replay emitted no valid windows; no UI label appeared |
| Unknown/unsupported signs handled | **FAIL empirically**:11/11 unsupported test windows falsely accepted at both model and studio default thresholds |
| Automated regression tests | PASS:63 Vitest,2 Node diagnostic tests,62 Pytest,4 Chromium integration tests; strict TypeScript/build/MV3 validation |
| Physical-camera and unseen-signer gaps recorded | PASS as documentation only: physical camera not accessed; source-reported held-out IDs tested on just two known-sign signers |

The regression suite passing does not override the failed real acceptance checks.
Fixture tests prove mechanics; they contribute no sign-recognition accuracy.

## Actual studio replay

`scripts/verify-real-model.mjs` launches an isolated unpacked extension and its
own backend on free port18000, loads the genuine package, authorizes the exact
extension origin with an ephemeral token, and substitutes a real research-video
stream for getUserMedia. Chrome's fake-device guard prevents physical access.
It observes unmodified worker results and actual WebSocket traffic. No prediction
is injected. Stable windows is1 to isolate transport/rendering; minimum confidence
remains.8. Source video is User001-Family (a training clip used only for integration,
not added to held-out accuracy). Source speed stays1x, with no looping or padding.

| Replay | Processed frames | Usable frames | Maximum buffer | Emitted windows / requests / predictions |
|---|---:|---:|---:|---:|
| Native2560×1440 | 43 | 12 | 2 | 0 / 0 / 0 |
| Uniform640×360 resize | 48 | 15 | 3 | 0 / 0 / 0 |

Native median worker processing:210.3ms; resized:187.4ms. The resized UI reported
about4.4 processed FPS. Missing hands and processing gaps above250ms reset the
buffer. Lowering the gap requirement, repeating observations or slowing playback
would invalidate this acceptance check and was not done. The recording's native
stream ends at EOF and triggers the existing disconnect cleanup; the canvas
stream used for spatial resizing is explicitly stopped. Both runs released
capture and cleared recognition output. Physical-webcam performance is unmeasured.

Full scalar frame audit and outcomes:
[real studio verification](phase-3-real-studio-verification.json).
Local screenshots/logs remain under `.cache/phase3-completion/real-studio-*`.
Backend-only real serving evidence is separate:
[WebSocket parity](phase-3-real-backend-verification.json).

Reproduce on a free test port after the matching build:

```powershell
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run build
# Use a NEW output directory. The harness starts/stops only its own backend.
npm run ml:verify-studio -- ml/runs/isl500-v2-pilot .cache/phase3-completion/User001-Family.mp4 .cache/phase3-completion/replay-native-new
$env:SIGNBRIDGE_REPLAY_WIDTH = '640'
npm run ml:verify-studio -- ml/runs/isl500-v2-pilot .cache/phase3-completion/User001-Family.mp4 .cache/phase3-completion/replay-640-new
Remove-Item Env:SIGNBRIDGE_REPLAY_WIDTH
```

## Commands and regression results

Executed successfully:

- `npm run validate`: strict TypeScript;63 Vitest across13 files;2 Node diagnostic
  tests; production Vite bundle; local asset/hash, deterministic entries, classic
  content script, module imports and MV3 CSP checks.
- `npm run backend:test`:62 Pytest, including v1/v2 geometry, schema/mask/gap
  guards, training/export fixtures, dataset leakage, model loading, authorization,
  low confidence, NO_SIGN, backpressure/timeouts and session behavior.
- `npm run test:e2e`:4 Chromium tests on the actual unpacked extension, using
  Chrome for Testing155.0.8059.84 and an isolated owned backend on18000.
- `backend/.venv/Scripts/python.exe -m pip check`: no broken requirements.
- `node --check scripts/extract-dataset.mjs` and `scripts/verify-real-model.mjs`.
- Real source hash audit:57 pinned files; strict merged dataset audit; real
  repeat extraction:3/3 windows/timestamps exactly equal, maximum feature delta0.
- Genuine `ml.train`, `ml.evaluate`, `ml.evaluate_open_set` and
  `ml.verify_real_backend` commands. The open-set command ran successfully but
  measured failed rejection; it is not a passed recognition-quality check.

The first Chromium run was3/4: the content-script test could return an empty
response from an unrelated tab before probing the meeting tab. Its probe now
continues until a content response appears. The rerun passed4/4. No product
permission or content-script behavior was changed to make the test pass.

## Preservation and remaining work

V1 remains separately supported. The additive v2 and native30 amendments were
explicitly approved in chat. Original reference documents, including
`11-DATA-CONTRACTS.md`, match their baseline SHA-256 values; see
[preservation check](phase-3-preservation-check.json). The missing source index
and reference files00/01/05/12 remain absent; none was fabricated. Newly written
08/09/14 and11B document actual implementation. Historical Phase1/2 and native
OpenHands results remain preserved. No unrelated service on8000 or5173 was stopped,
no physical camera was activated, and no commit, push or deployment was performed.

Next smallest work: profile/accelerate the real landmark runtime without relaxing
validity, then revalidate extraction/model parity; obtain genuine negative/neutral
training examples and a new untouched evaluation set for rejection. These exposed
test examples cannot be reused for tuning and then advertised as fresh held-out
evidence. Physical-device and consenting real-signer acceptance remain necessary.

Related reports: [dataset audit](PHASE-3-DATASET-AUDIT.md),
[extraction diagnosis](PHASE-3-EXTRACTION-DIAGNOSTICS.md),
[training results](PHASE-3-TRAINING-RESULTS.md), [model card](PHASE-3-MODEL-CARD.md).
