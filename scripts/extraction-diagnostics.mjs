/** Every rolling 32-frame candidate, including those invalidated before emission. */
export function summarizeContinuity(frames) {
  let run = 0, longestRun = 0;
  const resets = [], candidates = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i], previous = frames[i - 1];
    const delta = previous ? frame.timestampMs - previous.timestampMs : null;
    const gap = delta !== null && delta > 250;
    const nonIncreasing = delta !== null && delta <= 0;
    if (!frame.usable || gap || nonIncreasing) {
      resets.push({ index: i, timestampMs: frame.timestampMs, previousRun: run,
        reason: !frame.usable ? frame.reason : nonIncreasing ? 'non_increasing_timestamp' : 'gap_over_250ms', deltaMs: delta });
      run = 0;
    }
    if (frame.usable && !nonIncreasing) run++;
    longestRun = Math.max(longestRun, run);
    if (i >= 31) {
      const rejected = [];
      for (let j = i - 31; j <= i; j++) {
        if (!frames[j].usable) rejected.push({ index: j, reason: frames[j].reason });
        if (j > i - 31) {
          const dt = frames[j].timestampMs - frames[j - 1].timestampMs;
          if (dt > 250 || dt <= 0) rejected.push({ index: j, reason: dt > 250 ? 'gap_over_250ms' : 'non_increasing_timestamp' });
        }
      }
      candidates.push({ startIndex: i - 31, endIndex: i, rejected,
        outcome: rejected.length ? 'rejected' : frame.emitted ? 'emitted' : 'valid_not_stride_boundary' });
    }
  }
  return { longestRun, resets, candidates, insufficientTotalFrames: frames.length < 32,
    requiredFrames: 32, gapLimitMs: 250, stride: 8 };
}
