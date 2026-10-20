# Approved additive contract: signbridge.custom-gru.v2

Approved explicitly in chat on 2026-10-19. The original
[v1 reference](11-DATA-CONTRACTS.md) and implementation are preserved.

Input is float32 `[32,172]`, flattened row-major to 5504 JSON numbers for local
inference. Slots 0–160 retain v1 ordering and geometry. Slots 161–171 are binary
pose-validity masks in index order `[0,11,12,13,14,15,16,17,18,23,24]`.
Hand masks remain at 159/160; an absent hand has exactly 63 zero coordinates.

Both shoulders must have finite xyz and visibility >=0.5 (missing visibility
retains v1's default of 1). Their aspect-correct XY distance must be >=0.025.
Non-anchor pose points are optional: valid points retain their normalized xyz
and mask 1; otherwise coordinates and mask are zero. No missing point is imputed.
Hand validity, handedness selection, shoulder center/scale, image aspect correction
and wrist-relative hand z are unchanged. At least one actual valid hand is required.

Temporal rules remain 32 consecutive usable frames, stride 8, strict increasing
timestamps, reset for no hands/invalid anchors or gaps >250 ms. The separately
approved sampling amendment permits a v2 cap of 30 Hz. Offline seeks verify decoded
mediaTime and skip duplicate PTS; live capture skips repeated video times and
keeps one frame in flight. There is no padding, interpolation or gap bridging.

Preprocessing ID: `tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30`.
Offline catalogs select `"feature_schema":"signbridge.custom-gru.v2"` and
`"sampling_hz":30` explicitly;
omission means v1. Files/manifests/checkpoints must agree. No v1 features may be
reinterpreted as v2 by appending guessed masks.

The backend accepts either declared contract and rejects wrong sampling policy, width, masks,
unmasked missing-point coordinates and model/request schema mismatch. A v2 GRU
has input_size=172, requiring new training. Existing v1 weights are incompatible.
The normal application rejects test-fixture packages for both schemas.

The studio learns the active schema from validated model metadata. Changing schema
stops camera/inference and clears buffers; the user must Start again. There is no
automatic camera start or schema fallback. Without a genuine model, v1 remains the
landmark-only default. Changing a backend model without refreshing cannot silently
reinterpret a window: the client/backend reject mismatched contracts.

Golden parity: `ml/tests/golden-vector-v2.json` is explicitly synthetic geometry,
shared by TypeScript extraction and Python dataset/request tests. Its successful
validation proves coordinate compatibility, not recognition accuracy.
