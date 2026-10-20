import { describe, expect, it } from 'vitest';
import type { HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { mapResults } from '../src/vision/map-results';

const points = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0.2, z: 0, visibility: 1 }));
const category = (categoryName: string, score = 0.9) => [{ categoryName, score, index: 0, displayName: '' }];
const emptyPose: PoseLandmarkerResult = { landmarks: [], worldLandmarks: [], close() {} };
describe('landmark identity mapping', () => {
  it('orders two hands by model label rather than detection order or screen x', () => {
    const right = points(0.1); const left = points(0.9);
    const hands: HandLandmarkerResult = { landmarks: [right, left], worldLandmarks: [], handedness: [category('Right'), category('Left')], handednesses: [] };
    const result = mapResults(hands, emptyPose, 100, 640, 480);
    expect(result.leftHand).toBe(left); expect(result.rightHand).toBe(right); expect(result.pose).toBeNull();
  });
  it('uses highest-confidence duplicate label and rejects unknown/low-confidence groups', () => {
    const hands: HandLandmarkerResult = { landmarks: [points(0.1), points(0.2), points(0.3), points(0.4)], worldLandmarks: [],
      handedness: [category('Left', 0.6), category('Left', 0.9), category('Right', 0.4), category('Unknown')], handednesses: [] };
    const result = mapResults(hands, emptyPose, 100, 640, 480);
    expect(result.leftHand?.[0]?.x).toBe(0.2); expect(result.rightHand).toBeNull();
  });
});
