# Custom GRU v2 — approved 2026-10-19

The user explicitly approved this separate v2 contract in chat on 2026-10-19.
It is now implemented alongside v1; this document retains the proposal rationale.
The approved v1 remains unchanged. A real ISL500 Water probe detected a hand but
rejected every sampled frame because both hips had visibility below 0.5. Upper-body
framing cannot satisfy v1's all-11-pose-points requirement. This is independent of
the INCLUDE probes' shorter hand-detection runs.

## Proposed narrowly scoped change

- New schema ID `signbridge.custom-gru.v2`, shape **32×172**, stride 8.
- Keep the original 161 coordinate/mask slots, ordering, shoulder centering,
  aspect correction, shoulder-distance scaling and wrist-relative hand depth.
- Append eleven binary pose-validity masks, in the existing POSE_INDICES order.
- Require both shoulders to be finite, visibility >=0.5, and scale >=0.025.
- Other pose points are optional: finite with visibility >=0.5 means retain
  normalized coordinates and mask 1; otherwise exactly zero coordinates and mask 0.
- Keep at least one valid detected hand per frame, 32 consecutive usable frames,
  strictly increasing timestamps, reset on gaps >250 ms, no padding/interpolation.
- Do not synthesize landmarks or relax hand detection thresholds.

This proposal addresses invisible non-anchor pose points only. It does not solve
short clips or hand dropouts, and does not guarantee useful recognition accuracy.
Before training, rerun genuine clip probes and measure yield with this contract.

## Compatibility implementation

1. Preserve the v1 implementation, golden vectors, loaders and tests.
2. Add a separate v2 extractor, geometry tests and shared Python/TypeScript golden
   vectors. Opt into v2 explicitly; never reinterpret v1 files as v2.
3. Version preprocessing, dataset manifests, model shape metadata and backend
   validators. Reject cross-schema model/request combinations.
4. Train a new GRU with input_size=172 only from newly extracted lawful data.
5. Studio selects the declared supported contract of its configured genuine model
   before capture; session changes stop and clear all buffers. No automatic fallback.
6. Evaluate signer-disjoint recognition and open-set rejection before acceptance
   (still requires a genuine trained checkpoint).

Alternative: keep v1 exclusively and collect consented, full-body recordings with
all eleven required pose points visible and at least 32 consecutive detected-hand
frames. See PHASE-3-COLLECTION-PROCEDURE.md. Only the separate v2 change above was
approved; no interpolation, lower detection thresholds or relaxed validity/gap
checks were implemented. A subsequent explicit approval permits v2 sampling up to
30 Hz with distinct decoded frames; see PHASE-3-V2-SAMPLING-PROPOSAL.md. V1 stays at 15 Hz.
