# 11 — Data contracts

This is a **new custom contract**, authorized by the user on 2026-10-18 because
the referenced original document was missing. It does not reconstruct an earlier
specification. Implemented by `extension/src/vision/features.ts`; golden geometry
and temporal behavior are tested in `extension/tests/features.test.ts`.

## Scope and compatibility

`signbridge.custom-gru.v1` is a proposed input for a future separately trained
landmark GRU. No GRU or sign classifier is installed. These features are **not
compatible with INCLUDE or WLASL checkpoints by assumption**. A future native
model requires its own inspected preprocessing, vocabulary and tensor contract.
Changing any rule below requires a schema version change and corresponding training.

MediaPipe outputs observations, not sign labels. Frames have no ASL/ISL tag;
a future training/inference envelope must explicitly identify source sign language,
model version and verified label order. English/Hindi caption preferences are
unrelated to source sign language. No landmark message is sent to the backend.

## Raw frame

`LandmarkFrame` contains `timestampMs`, `imageWidth`, `imageHeight`, `leftHand`,
`rightHand`, and `pose`. Missing groups are `null`. Coordinates use the original,
unmirrored input image. Hands have 21 points in MediaPipe order, pose has 33.
Each point has finite `x`, `y`, `z`; pose visibility is retained. Coordinates may
lie outside [0,1]. Depth is relative to each detector, not measured metres.

Use the model's `Left`/`Right` category, confidence >= 0.5, rather than x position
or detection order. Keep the highest-confidence detection for duplicate labels.
Unknown labels, short hands and non-finite hand coordinates become missing hands.
The preview mirrors video and skeleton together using CSS only. No hand swapping,
reflection or sign-language-specific augmentation occurs in preprocessing.
Model-side labels are shown explicitly; verify anatomical handedness on target
camera hardware before collecting training data. This is a one-signer pipeline,
not an identity tracker or a way to separate multiple visible people.

## Feature layout: float32, 161 values

| Offsets (zero based) | Meaning |
| --- | --- |
| 0–62 | Model Left, 21 consecutive xyz triples |
| 63–125 | Model Right, 21 consecutive xyz triples |
| 126–158 | Selected pose points, 11 consecutive xyz triples |
| 159 | Left present mask: 0 or 1 |
| 160 | Right present mask: 0 or 1 |

Pose order: `[0,11,12,13,14,15,16,17,18,23,24]`: nose, left/right shoulders,
elbows, wrists, pinkies, hips. Both shoulder anchors and all 11 selected points
must be finite with visibility >= 0.5. An omitted visibility defaults to 1 for
typed synthetic/alternate extractor input; MediaPipe supplies actual visibility.

Let `a = imageHeight / imageWidth`, `c = (pose[11] + pose[12]) / 2`, and
`s = hypot(pose[11].x - pose[12].x, a * (pose[11].y - pose[12].y))`.
Dimensions must produce a finite positive aspect ratio and `s >= 0.025`.
All outputs use image-width units before division by shoulder distance:

```text
hand x = (x - c.x) / s
hand y = (y - c.y) * a / s
hand z = (z - that_hand_wrist.z) / s
pose x = (x - c.x) / s
pose y = (y - c.y) * a / s
pose z = (z - c.z) / s
```

Hand depth is wrist-relative because hand and pose depth origins differ. Do not
subtract pose depth from hand depth. No clipping, smoothing, world-coordinate
conversion or per-dataset statistics are applied. Values round to float32.

Missing/invalid hands occupy 63 zeros and mask 0. With at least one valid hand
and valid pose, `usable=true`, reason `ready`. No hands yields `usable=false`,
reason `no_hands`, with pose features retained for diagnostics. Invalid pose or
anchors yields an all-zero vector, `usable=false`, reason `pose_unavailable`.
Non-finite normalized output and invalid timestamps throw and stop capture;
missing detections are ordinary unusable observations, not predictions.

## Time and windows

- Capture timestamps use the document's monotonic rAF clock in milliseconds.
  Timestamps must be finite, nonnegative and strictly increasing within a session.
- Sample at most 15 FPS, skip repeated video times and allow only one outstanding
  bitmap/worker frame. Busy frames are dropped; there is no backlog.
- Buffer the latest 32 usable frames. Emit row-major float32 `[32,161]` (5,152
  values; 20,608 bytes) after 32 accepted frames, then every 8 accepted frames.
- A missing signer/invalid pose clears the window. A timestamp gap >250 ms clears
  it before adding the new usable frame. No zero padding or imputation.
- This version is **sample-count based, not fixed-rate resampled**. At 15 FPS,
  32 frames span approximately 2.07 seconds; slower devices produce longer spans
  or reset when gaps exceed 250 ms. Future training must match that policy or
  introduce a new version with explicit time resampling. Do not assume 30 FPS.
- Stop, error, hidden document, page exit and restart terminate the worker and
  discard its buffer. Windows are currently counted and discarded, never sent
  to a classifier or persisted. The raw buffer itself is bounded to 20,608 bytes
  of feature values plus small metadata; model/WASM memory is separate.

## Worker and extension messages

Private dedicated-worker messages: `INITIALIZE`, `FRAME` with a transferred
ImageBitmap and timestamp; responses `READY`, `RESULT`, `ERROR`. The worker chooses
fixed local asset URLs itself. RESULT contains raw landmarks, processing time,
buffer size, completed-window count and feature state. The sender closes failed
transfers; the receiver closes transferred bitmaps even on errors.

Chrome runtime `GET_STATUS` reports extension phase 2 and camera ownership as
`managed_in_webcam_studio`. This avoids claiming another tab's camera is off.
`CHECK_BACKEND` still validates the phase-1 read-only backend health schema.
Reserved meeting capture and inference commands still return `NOT_IMPLEMENTED`.
