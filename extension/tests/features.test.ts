import { describe, expect, it } from 'vitest';
import { extractFeatures, FEATURE_COUNT, POSE_INDICES, TemporalBuffer } from '../src/vision/features';
import type { LandmarkFrame, NormalizedLandmark } from '../src/vision/types';
import golden from '../../ml/tests/golden-vector.json';

// Synthetic golden geometry, not camera data or sign labels. Shoulders are one
// half image-width apart. The expected values below are hand-calculated.
const point = (x: number, y: number, z = 0): NormalizedLandmark => ({ x, y, z, visibility: 1 });
function fixture(timestampMs = 0): LandmarkFrame {
  const pose = Array.from({ length: 33 }, () => point(0.5, 0.5));
  pose[11] = point(0.25, 0.5); pose[12] = point(0.75, 0.5);
  return { timestampMs, imageWidth: 640, imageHeight: 480, pose,
    leftHand: Array.from({ length: 21 }, (_, i) => point(0.25, 0.25, i * 0.125)),
    rightHand: Array.from({ length: 21 }, (_, i) => point(0.75, 0.75, -i * 0.125)) };
}
describe('custom GRU feature contract', () => {
  it('matches the JSON golden vector consumed by Python training and inference', () => {
    expect(Array.from(extractFeatures(golden.frame).values)).toEqual(golden.expected);
  });
  it('matches the complete hand-calculated two-hand golden vector', () => {
    const result = extractFeatures(fixture());
    const expected = [
      ...Array.from({ length: 21 }, (_, i) => [-0.5, -0.375, i * 0.25]).flat(),
      ...Array.from({ length: 21 }, (_, i) => [0.5, 0.375, -i * 0.25]).flat(),
      0, 0, 0, -0.5, 0, 0, 0.5, 0, 0, ...Array(24).fill(0), 1, 1,
    ];
    expect(result.schema).toBe('signbridge.custom-gru.v1');
    expect(result.usable).toBe(true);
    expect(result.values).toHaveLength(161);
    result.values.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 7));
  });
  it('zero-fills missing hands with explicit masks and rejects no-hands windows', () => {
    const frame = fixture();
    const one = extractFeatures({ ...frame, leftHand: null });
    expect([...one.values.slice(0, 63)]).toEqual(Array(63).fill(0));
    expect([...one.values.slice(159)]).toEqual([0, 1]);
    expect(one.usable).toBe(true);
    expect(extractFeatures({ ...frame, leftHand: null, rightHand: null }).reason).toBe('no_hands');
  });
  it('rejects invisible, degenerate or missing pose anchors without NaN features', () => {
    for (const index of POSE_INDICES) {
      const frame = fixture(); const pose = [...frame.pose!];
      pose[index] = { ...pose[index]!, visibility: 0.49 };
      expect(extractFeatures({ ...frame, pose })).toMatchObject({ usable: false, reason: 'pose_unavailable' });
    }
    const frame = fixture(); const pose = [...frame.pose!]; pose[12] = pose[11]!;
    expect([...extractFeatures({ ...frame, pose }).values]).toEqual(Array(161).fill(0));
    expect(extractFeatures({ ...frame, pose: null }).usable).toBe(false);
    expect(extractFeatures({ ...frame, imageWidth: 0 }).usable).toBe(false);
    expect(() => extractFeatures({ ...frame, timestampMs: NaN })).toThrow();
  });
  it('discards invalid hand geometry and preserves translation/scale invariance', () => {
    const frame = fixture(); const hand = [...frame.leftHand!]; hand[4] = point(NaN, 0);
    expect(extractFeatures({ ...frame, leftHand: hand }).values[159]).toBe(0);
    const transform = (p: NormalizedLandmark) => ({ ...p, x: p.x * 0.5 + 0.1, y: p.y * 0.5 + 0.2, z: p.z * 0.5 + 0.3 });
    const transformed = extractFeatures({ ...frame, pose: frame.pose!.map(transform), leftHand: frame.leftHand!.map(transform), rightHand: frame.rightHand!.map(transform) });
    extractFeatures(frame).values.forEach((value, index) => expect(transformed.values[index]).toBeCloseTo(value, 6));
  });
});

describe('bounded temporal window', () => {
  it('emits exact 32×161 windows with stride eight and no padding', () => {
    const buffer = new TemporalBuffer(); const emitted: number[] = [];
    for (let i = 0; i < 80; i++) {
      const feature = extractFeatures(fixture(i * 70)); feature.values[0] = i;
      const window = buffer.push(feature);
      if (window) {
        emitted.push(i); expect(window).toHaveLength(32 * FEATURE_COUNT);
        expect(window[0]).toBe(i - 31); expect(window[31 * FEATURE_COUNT]).toBe(i);
      }
      expect(buffer.size).toBeLessThanOrEqual(32);
    }
    expect(emitted).toEqual([31, 39, 47, 55, 63, 71, 79]);
    buffer.clear(); expect(buffer.size).toBe(0);
    expect(buffer.push(extractFeatures(fixture(0)))).toBeNull();
  });
  it('resets on long gaps/no signer and rejects duplicate/out-of-order timestamps', () => {
    const buffer = new TemporalBuffer();
    buffer.push(extractFeatures(fixture(0))); buffer.push(extractFeatures(fixture(70)));
    buffer.push(extractFeatures(fixture(400))); expect(buffer.size).toBe(1);
    expect(() => buffer.push(extractFeatures(fixture(400)))).toThrow('increase');
    expect(() => buffer.push(extractFeatures(fixture(399)))).toThrow('increase');
    buffer.push(extractFeatures({ ...fixture(470), leftHand: null, rightHand: null }));
    expect(buffer.size).toBe(0);
  });
});
