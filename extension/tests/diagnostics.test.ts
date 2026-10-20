import { expect, it } from 'vitest';
import { diagnoseFrame } from '../src/vision/diagnostics';
import { extractFeatures, POSE_INDICES } from '../src/vision/features';
import golden from '../../ml/tests/golden-vector.json';

it('diagnostics preserve golden geometry and identify each failed pose point', () => {
  const before = extractFeatures(golden.frame);
  const report = diagnoseFrame(golden.frame, before);
  expect(report.poseChecks).toHaveLength(11);
  expect(report.poseChecks.every(p => p.valid)).toBe(true);
  expect(report.handDetectionConfidence).toBeNull();
  expect(Array.from(before.values)).toEqual(golden.expected);
  for (const index of POSE_INDICES) {
    const frame = structuredClone(golden.frame);
    frame.pose[index]!.visibility = 0.49;
    const result = diagnoseFrame(frame, extractFeatures(frame));
    expect(result.poseChecks.filter(p => !p.valid).map(p => p.index)).toEqual([index]);
    expect(result.reason).toBe('pose_unavailable');
  }
});
