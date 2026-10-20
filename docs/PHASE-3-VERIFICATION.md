# Latest Phase 3 status — 2026-10-20

**PHASE 3 PARTIAL**, with substantial new real-data evidence. A genuine v2 GRU
is trained, exported and verified through the backend. Known held-out clips:4/4;
unsupported windows falsely accepted:11/11. Real-time video replay emitted no
valid windows on this host. See [final verification](PHASE-3-FINAL-VERIFICATION.md),
[training results](PHASE-3-TRAINING-RESULTS.md) and [model card](PHASE-3-MODEL-CARD.md).

The report below is retained as the historical pre-completion baseline; its
no-compatible-checkpoint statements are superseded by the linked current reports.

---

# Phase 3 verification — 2026-10-19

**PHASE 3 PARTIAL.** The local inference infrastructure, custom training pipeline
and native research baseline are implemented. A compatible, genuinely trained
live checkpoint and real-signer acceptance remain unfinished.

## A. Implementation summary

Preserved Phase1/2 extension, consent, worker and feature geometry. Added safe model
packages/lifecycle, shared PyTorch GRU, strict dataset/training/evaluation/export,
bounded authenticated local WebSocket inference, studio controls/filtering/history/
timings, schema parity and regression tests. No meeting capture, recording, cloud
media transmission, remote captions, commit, push or deployment.

## B. Selected recognition model

Live architecture: custom batch-first GRU128×2/dropout.2/dense64/ReLU, configurable,
float32 `[N,32,161]`, preferred ISL. No real training dataset/vocabulary/checkpoint
installed. Backend therefore correctly returns MODEL_NOT_INSTALLED / MODEL_NOT_READY.

Offline research: authentic OpenHands INCLUDE LSTM, ISL263, bidirectional128×4+
attention, native Holistic `[N,2,T,27]`. Weights from official release, strict
load succeeded. INCLUDE50 LSTM strict load also succeeded, without labeled native
inference. Provenance/hashes/licenses are in [the model audit](PHASE-3-MODEL-AUDIT.md).

## C. Model decision

Custom GRU is the live path because its input matches the approved existing worker
exactly. INCLUDE/OpenHands require different extractors, dimensions, normalization
and temporal policies; feeding them custom tensors would be invalid. OpenHands
also performed poorly in this native batch-one test. WLASL is ASL and cannot
establish ISL recognition. No random classifier replaces a missing trained model.

## D. Files changed

[Complete file-by-file inventory](PHASE-3-CHANGED-FILES.md), categorized as new or
modified relative to the pre-Phase3 hash snapshot. The repository had no tracked
baseline commits, so Git's untracked status alone could not identify Phase3 edits.
Approved `docs/11-DATA-CONTRACTS.md` and inspected user reference documents were
hash-checked unchanged. Generated build, venv, downloaded research assets, tokens,
temporary test packages and browser artifacts are ignored and not source deliverables.

## E. Training results

No genuine custom-model training occurred. Missing: usable complete windows from this exact Tasks Vision worker, audited
signer identities, and sufficient labeled examples across all splits. Implemented pipeline validates them and rejects missing/invalid data.
Pytest executed a two-epoch CPU **TEST FIXTURE** training/export/load smoke test.
Its metrics are not sign accuracy and the normal application rejects its package.
CUDA and genuine training remain unverified. A real INCLUDE MOV decoded and ran
through the packaged extractor:27 sampled frames,22 usable and5 no-hands, but
zero complete32-frame windows. It was rejected without padding. This verifies
decode/execution and rejection, not successful training-data extraction. A second,
longer real clip produced57frames (47ready,10no-hands) and again zero complete
windows because of interrupted continuity. Neither probe was used for training. See
[extraction evidence](phase-3-extraction-probes.json). A generated
blank-video attempt yielded a zero-byte file in this browser; extraction correctly
rejected it as corrupt. That is not a successful video extraction result.

## F. Genuine inference results

Native OpenHands: first64 matching published test CSV clips,37 actual true classes,
3 correct; top1 **4.6875%**. Macro precision0.9506%, recall0.5703%, F1 0.5577%,
computed over all263 vocabulary classes with absent classes scored zero. The
unbalanced subset is not an overall dataset or paper accuracy estimate.

Correct: `Adjectives/2. quiet/MVI_5340.pkl` → `2. quiet`, confidence0.9973.
Incorrect: `Adjectives/1. loud/MVI_9289.pkl` → `55. Thank you`, confidence0.9553.
[All predictions, hashes, per-class metrics and confusion matrix](phase-3-native-results.json).
Unknown/neutral rejection, false-positive rate and unseen-signer accuracy: unmeasured.
The native upstream RNN batch-axis behavior was preserved. Full dataset archive
MD5 was not verified after download failures; accessed ZIP member CRCs and recorded
per-sample SHA-256 provide narrower integrity evidence.

## G. Performance

| Measurement | Actual observation / scope |
|---|---|
| Native model first forward | 82.396ms; excludes loading/data/preprocessing |
| Native subsequent63 forward median / p95 | 36.928 /54.641ms; CPU batch1,2 threads |
| Recorded full-suite fake-camera processed FPS | 14.7; recorded full validation run, no signer, no live model |
| Earlier fake-camera run | 6.5FPS; illustrates variable runtime load |
| Recorded full-suite fake-camera processing sample | 37.6ms; features+buffer rounded0.00ms |
| Three detector photo/empty fixture timings | 723.6,83.0,62.9ms |
| Their feature+buffer timings | .2,0,0ms at browser timer resolution |
| Their valid windows | zero: strict pose validity rejected all three |
| Actual live accumulation/transport/end-to-end sign latency | unmeasured; compatible model absent |
| CPU utilization, memory, sustained performance | unmeasured |

The first detector fixture includes first-execution effects; three samples are
insufficient for a meaningful detector p95. No hardware-wide15FPS promise. Studio
instrumentation reports accumulation/roundtrip/non-model overhead/end-to-end once
real inference is enabled. Nominal32-frame span at15FPS is2.07s before inference
and stability filtering; that is arithmetic, not a measured recognition delay.

## H. Testing results

Final `npm run validate:all` on port18000:

- PASS: strict TypeScript compilation.
- PASS: **56 Vitest tests /11 files**, preserving previous45 tests with appropriate
  Phase3 status expectations; added contracts/client/filter/panel/golden checks.
- PASS: **53 pytest tests**, preserving previous13 health/config checks; added
  real Torch fixture loading, failure states, protocol, security, bounds, timeout,
  unknown/no-sign, dataset/split integrity and training/export/parity checks.
- PASS: production Vite/MV3 validator, local model/WASM hashes, imports and CSP.
- PASS: **4 Chromium integration tests**,19.1s suite. Actual unpacked extension,
  settings/health/inert meeting scaffold; authenticated WS under CSP with truthful
  unavailable model; actual MediaPipe photo fixtures; simulated-camera lifecycle.
- PASS: `pip check`, Python compileall, Node extractor syntax, train/evaluate CLI help.
- PASS: screenshot visually inspected; model missing, inference disabled, no labels.

Final failed automated tests: **0**. Final skipped automated tests: **0**.
Earlier failures were fixed: test-client wrong host, cross-import config-object
validation and phase-status test expectations. Failed dataset downloads and the
corrupt-video extraction attempt are recorded, not treated as successful tests.
`git diff --check` emitted no errors, but source files are untracked, so it does
not constitute a full baseline diff review.

Unexecuted acceptance: a usable real dataset/training run, compatible genuine
checkpoint→studio sign rendering, CUDA, physical camera/signers, unknown/neutral,
unseen-signer/generalization and sustained resource tests. No hardware testing is
claimed. The frozen feature contract's strict validity was not relaxed to make
fixtures produce windows. Full native accuracy reproduction remains unexecuted.

After the final UI control-state and uncertainty-reset fixes, frontend validation
passed again (56 tests and build), and all4 browser tests passed again in15.8s (fake camera14.9FPS,36.6ms last processing sample).
Backend code was unchanged after its53-test pass.

## I. Commands executed

Principal validation/research commands (from repository root, PowerShell):

```powershell
npm run typecheck
npm test
npm run backend:test
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run validate:all
npm run validate
npm run test:e2e
.\backend\.venv\Scripts\python.exe -m pip check
.\backend\.venv\Scripts\python.exe -m compileall -q backend/app ml
node --check scripts/extract-dataset.mjs
.\backend\.venv\Scripts\python.exe -m ml.train --help
.\backend\.venv\Scripts\python.exe -m ml.evaluate --help
.\backend\.venv\Scripts\python.exe -m ml.research.include_load_audit
.\backend\.venv\Scripts\python.exe -m ml.research.openhands_baseline --partial-archive --limit 64
node scripts/extract-dataset.mjs .cache/phase3-extractor-test/catalog.json .cache/phase3-extractor-test/output --test-fixture
node scripts/extract-dataset.mjs .cache/phase3-audit/raw-probe/catalog.json .cache/phase3-audit/raw-probe/extracted
node scripts/extract-dataset.mjs .cache/phase3-audit/raw-probe-long/catalog.json .cache/phase3-audit/raw-probe-long/extracted
git diff --check
```

The TEST FIXTURE extraction command failed on a corrupt zero-byte video;
it is included for transparency. Temporary browser fixture generation used no
physical camera. Native dependencies were installed into backend/.venv and pinned
in requirements-lock.txt. Exact model source revisions and reproduction URLs are
in the audit. Final build currently selects loopback18000; source default stays8000.
The existing port8000 process remained running; no unrelated process was terminated.

## J. Browser integration / installation

Load `D:\SignBridge AI\extension\dist` via Chrome `chrome://extensions` → Developer
mode → Load unpacked. Reload it after any build. Start only SignBridge's backend:

```powershell
$env:SIGNBRIDGE_PORT = '18000'
npm run backend:dev
```

Open the dashboard and webcam studio. Camera starts only after Start and Chrome
permission. Model reports Not Installed; local inference stays disabled. When a
genuine compatible model is available, follow [authorization/model setup](09-ML-INFERENCE-PIPELINE.md):
exact extension origin, model directory and private session token. The panel then
supports accepted isolated labels, language/confidence, bounded history, filtering
and measured timings. Tests render explicitly labeled fixture responses only in
tests; the packaged application has no simulation mode or random model fallback.

## K. Remaining limitations

No live trained checkpoint, verified custom vocabulary or real matching dataset;
poor native baseline accuracy; batch-axis issue; partial archive integrity;
no usable real dataset extraction acceptance; no physical signer/camera or unknown/neutral
evaluation; no automatic near-duplicate detector; finite native thread timeout
cannot kill a hung Torch operation; CUDA and long-duration benchmarks untested.
Source licenses do not automatically grant all downstream checkpoint/video rights.

## L. Completion status

**PHASE 3 PARTIAL — genuine offline inference verified, live recognition milestone
not satisfied.** Model readiness, API, filtering and UI infrastructure work, but
there is no compatible real checkpoint to produce studio recognition evidence.
No scientific acceptance was replaced by synthetic fixture results.

## M. Before the next phase

Obtain lawful labeled ISL videos and signer metadata, verify a small vocabulary,
extract this exact contract, audit duplicates, train and evaluate a compatible
GRU, measure neutral/unknown and unseen-signer performance, then complete manual
camera and real-checkpoint end-to-end acceptance. Only then begin Phase4 meeting
capture/ROI/lifecycle and local overlay work under explicit consent. This phase
does not transmit captions to remote participants or produce translated sentences.
