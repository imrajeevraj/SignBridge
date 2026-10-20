# MediaPipe assets

Copyright The MediaPipe Authors. MediaPipe code and models are licensed under
Apache License 2.0 unless otherwise noted by upstream. The license is adjacent
in `LICENSE`. These assets are unmodified; application integration is separate.

- JS/WASM: `@mediapipe/tasks-vision` 1.1.1, pinned by npm lockfile.
- Models: Hand Landmarker float16 version 1 and Pose Landmarker Lite float16
  version 1, from Google's versioned MediaPipe model bucket.
- Exact URLs, byte sizes and SHA-256 hashes: `extension/vision-assets.json`.
- Model guides/cards: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
  and https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- Upstream license: https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/LICENSE
- Maintainer model-license clarification (2026-10-05):
  https://github.com/google-ai-edge/mediapipe/issues/6355
- SDK/pose-license and network-policy discussion:
  https://github.com/google-ai-edge/mediapipe/issues/6306

The npm package does not supply a complete artifact-specific third-party NOTICE
or source-build attestation. This notice records the available upstream evidence;
it is not a complete third-party SBOM. Recheck upstream distribution notices before
publishing a redistributable release. No public release is made by this project.
The local extension blocks external network origins with CSP; tests verify no
external HTTP requests during landmark processing. Re-audit when changing versions.
