import { POSE_INDICES, type FeatureVector } from './features';
import type { LandmarkFrame } from './types';

/** Opt-in offline diagnostics only. Does not change feature eligibility or geometry. */
export function diagnoseFrame(frame: LandmarkFrame, features: Pick<FeatureVector, 'values' | 'usable' | 'reason'>) {
  const aspect = frame.imageHeight / frame.imageWidth;
  const left = frame.pose?.[11], right = frame.pose?.[12];
  return {
    timestampMs: frame.timestampMs,
    poseChecks: POSE_INDICES.map(index => {
      const point = frame.pose?.[index];
      const finite = !!point && [point.x, point.y, point.z].every(Number.isFinite);
      const visibility = point?.visibility ?? null;
      return { index, present: !!point, finite, visibility,
        valid: finite && (visibility ?? 1) >= 0.5 };
    }),
    aspect, shoulderScale: left && right ? Math.hypot(left.x - right.x, (left.y - right.y) * aspect) : null,
    masks: [features.values[159], features.values[160]],
    normalizedFinite: Array.from(features.values).every(Number.isFinite),
    usable: features.usable, reason: features.reason,
    // Tasks Vision does not expose per-frame detector/presence confidence scores.
    handDetectionConfidence: null, poseDetectionConfidence: null,
  };
}

export type FrameDiagnostics = ReturnType<typeof diagnoseFrame> & {
  handedness: { category: string; score: number; points: number }[];
};
