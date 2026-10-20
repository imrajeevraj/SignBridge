# Local landmark assets — not sign classifiers

Run `npm run assets:setup` at the repository root. Official MediaPipe Hand
Landmarker and Pose Landmarker Lite bundles are generated here and ignored by Git.
WASM files come from pinned Tasks Vision 1.1.1 under `vendor/mediapipe/wasm`.

`extension/vision-assets.json` records source URLs, byte counts and SHA-256 hashes.
Setup and builds reject mismatches. Assets load from the local extension only.
See `vendor/mediapipe/NOTICE.md` and `LICENSE` for provenance and licensing.
No INCLUDE/WLASL/GRU classifier is present; sign-model readiness remains false.
