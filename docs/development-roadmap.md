# Five-phase development roadmap

This implementation summary follows the user-supplied source of truth in
[13-IMPLEMENTATION-ROADMAP.md](13-IMPLEMENTATION-ROADMAP.md). No later-phase
implementation beyond Phase 2 is included in the current code.

## Phase 1 — Foundation

MV3 packaging, dashboard, settings, typed message and vision boundaries, inert
content/offscreen scaffolds, local health service, tests and reproducible setup.
Exit: unpacked extension loads, preferences persist, health is real and all
recognition actions remain disabled.

## Phase 2 — Webcam + MediaPipe Landmarks

Implemented: user-initiated webcam consent in a visible studio, start/stop,
local pinned MediaPipe task/WASM assets, hand/pose extraction, skeleton, measured
FPS and the approved custom `(32,161)` feature contract. Automated tests cover
real detector fixtures, simulated capture, denial and deterministic cleanup.
Physical-webcam acceptance and sustained hardware measurements remain manual;
see [phase-2-checklist.md](phase-2-checklist.md). No sign recognition exists.

## Phase 3 — Limited-vocabulary recognition

Choose one identified sign language (ASL or ISL) and a documented small vocabulary.
First audit a relevant pretrained baseline using its native preprocessing; for an
ISL MVP this may be INCLUDE, while WLASL is ASL only. If unavailable or unsuitable,
collect consented, licensed data and train/evaluate a custom GRU with signer-separated
data and a matching feature schema. Load actual versioned weights locally and
expose truthful model readiness. Add bounded, authenticated local WebSocket
inference, confidence calibration, rejection of unknown inputs and temporal
smoothing. Prove accuracy and latency before enabling recognition/captions.

## Phase 4 — Meeting capture + selected signer ROI

Implement explicit selection of a meeting tab, the required `tabCapture` and
`offscreen` permissions and capture lifecycle. Add a selected signer ROI and route
only that crop to the model-compatible extractor. Validate Meet first; Teams and
Zoom remain best-effort until tested. Provide
visible capture status and immediate stop; handle navigation and worker restarts.
Do not record, upload or retain raw meeting video. Test on real supported meeting
clients with consent, without modifying their native controls.

## Phase 5 — Captions, validation + demo readiness

Integrate accepted/unknown/deduplicated real predictions with isolated Shadow DOM
captions and verified output gloss mapping. Captions are visible only to the local
viewer. Complete accessibility review, measured performance, resilience, privacy/security review,
data/model licensing, supported-browser testing and a reproducible hackathon
demo. Report vocabulary, signer and language limits transparently. Continuous
translation and arbitrary signer/language support remain outside the MVP.
