# Phase 3 implementation checklist

## Audit and decision

- [x] Read repository instructions, architecture/flow/model/roadmap references,
  approved custom feature contract, Phase2 code and verification records.
- [x] Report absent PROJECT_DOCS_INDEX.md, root ARCHITECTURE.md and numbered
  00/01/05/08/09/12/14. Create only the requested new Phase3 implementation docs.
- [x] Inspect pinned INCLUDE/OpenHands/WLASL sources and native preprocessing.
- [x] Download authentic INCLUDE50/OpenHands checkpoints, hash and safely load.
- [x] Run genuine labeled native ISL inference; record poor results transparently.
- [x] Keep incompatible native input schemas out of the live studio.

## Implemented

- [x] Model adapter/registry, lifecycle, safe weights, provenance and label hashes.
- [x] Configurable custom GRU, strict dataset loader and explicit signer splits.
- [x] Offline video extractor using the same packaged browser worker; no camera API.
- [x] Training/validation/scheduler/early stop/seed/export and held-out evaluation.
- [x] Health/model info and versioned, bounded authenticated WebSocket API.
- [x] Studio opt-in controls, truthful model/error states, predictions and metrics.
- [x] Confidence/stability/cooldown/dedup/unknown handling and session invalidation.
- [x] Golden vector, model/dataset/API/client/panel tests and MV3 browser regression.
- [x] Exact loopback HTTP/WS CSP and local assets; preserve capture consent.

## Remaining acceptance work

- [ ] Genuine custom-contract dataset with audited signer/duplicate metadata.
- [ ] Valid-video extraction/training on that real dataset; compatible trained model.
- [ ] Calibrated unknown/neutral rejection, fair/unseen-signer evaluation.
- [ ] Real camera→worker→trained checkpoint→visible accepted label smoke test.
- [ ] Physical webcam/manual acceptance and sustained hardware benchmarks.

### Module map

`backend/app/inference/`: `contracts.py` owns strict schemas/states; `gru.py` the
shared architecture; `registry.py` adapter/package validation; `service.py` one
model job; `security.py` local tokens/origins; `websocket.py` bounded protocol.
`app/main.py` starts model loading without blocking routes and owns cleanup.

`extension/src/inference/`: runtime contracts, session client and stability filter.
`RecognitionPanel.tsx` integrates the existing Webcam component. The existing worker
adds optional emitted windows/timestamps/continuity and timing to RESULT; feature
values/order remain unchanged. No global background capture is introduced.

`ml/`: strict dataset loader, metrics, train/evaluate/inspect CLIs; `research/`
contains separate native audits with retained source licenses. The browser
extractor is `scripts/extract-dataset.mjs`. Research/test assets are not bundled.

Phase1/2 historical documents and user reference files are preserved. The new
protocol document explicitly supersedes Phase2 transport-only statements; it does
not edit the approved data-contract geometry. No meeting overlay/capture work,
recording, publication, Git commit or deployment was performed.
