# V2 sampling amendment — approved 2026-10-19

The user explicitly approved this amendment in chat. It is implemented under
preprocessing `tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30`.

The approved v2 pose masks allow genuine windows: User007 Family emitted one.
However the first nine expanded probes yielded only that one usable clip. Initial
Water/Sit probes have 23/18 consecutive valid frames at 15 Hz after the hip issue
is removed. A fixed 32-frame window spans 2.07 seconds at 15 Hz, longer than many
observed uninterrupted sign segments.

Proposed amendment, without changing the 32×172 geometry:

- Keep v1 at its existing 15 Hz cap and preprocessing version.
- Allow v2 capture/extraction up to 30 Hz, respecting native frame availability.
- Verify decoded media timestamps and skip duplicate source frames. Never pad,
  interpolate, slow playback or mark missing hands as detected.
- Preserve 32 consecutive valid frames, stride 8 and the 250 ms gap/reset rule.
- Record the new sampling policy in model metadata and a new preprocessing ID.
  Reject packages/datasets with mismatched sampling policies. Select that policy
  before camera Start; a policy change stops capture and clears all buffers.
- Re-extract all pilot data; do not mix existing 15 Hz windows with the new data.
- Measure achievable processing FPS; report lower live FPS as an accuracy/domain
  limitation rather than promising 30 FPS on every computer.

Initial implementation uses requestVideoFrameCallback mediaTime to verify decoded
source PTS and rejects repeated/nonincreasing PTS before worker submission. Final
yield and accuracy belong in the extraction/training reports. The nominal 32-frame
span at 30 Hz is 1.03 seconds; actual source/live rates can be lower.
