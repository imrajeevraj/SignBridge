import type { LandmarkFrame, NormalizedLandmark } from './types';

/** New custom schema approved for this project; never an INCLUDE/WLASL adapter. */
export const FEATURE_SCHEMA = 'signbridge.custom-gru.v1';
export const POSE_INDICES = [0, 11, 12, 13, 14, 15, 16, 17, 18, 23, 24] as const;
export const FEATURE_COUNT = 161;
export const SEQUENCE_LENGTH = 32;
export const SEQUENCE_STRIDE = 8;

const finite = (point: NormalizedLandmark) => [point.x, point.y, point.z].every(Number.isFinite);
const visible = (point: NormalizedLandmark | undefined): point is NormalizedLandmark =>
  Boolean(point && finite(point) && (point.visibility ?? 1) >= 0.5);

export interface FeatureVector {
  schema: typeof FEATURE_SCHEMA;
  timestampMs: number;
  values: Float32Array;
  usable: boolean;
  reason: 'ready' | 'no_hands' | 'pose_unavailable';
}

export function extractFeatures(frame: LandmarkFrame): FeatureVector {
  if (!Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) throw new Error('Invalid landmark timestamp.');
  const values = new Float32Array(FEATURE_COUNT);
  const left = frame.pose?.[11];
  const right = frame.pose?.[12];
  const poseValid = POSE_INDICES.every((index) => visible(frame.pose?.[index]));
  // Aspect-correct image coordinates: all axes are expressed in image-width units.
  const aspect = frame.imageHeight / frame.imageWidth;
  const scale = left && right ? Math.hypot(left.x - right.x, (left.y - right.y) * aspect) : 0;
  if (!poseValid || !visible(left) || !visible(right) || !Number.isFinite(aspect) || aspect <= 0 || scale < 0.025) {
    return { schema: FEATURE_SCHEMA, timestampMs: frame.timestampMs, values, usable: false, reason: 'pose_unavailable' };
  }
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  let hands = 0;
  for (const [handIndex, hand] of [frame.leftHand, frame.rightHand].entries()) {
    if (!hand || hand.length !== 21 || !hand.every(finite)) continue;
    hands++;
    values[159 + handIndex] = 1;
    const wrist = hand[0]!;
    hand.forEach((point, index) => {
      const offset = handIndex * 63 + index * 3;
      // Keep wrist position in x/y; hand z is wrist-relative and must not be
      // mixed with the pose model's unrelated depth origin.
      values[offset] = (point.x - center.x) / scale;
      values[offset + 1] = (point.y - center.y) * aspect / scale;
      values[offset + 2] = (point.z - wrist.z) / scale;
    });
  }
  POSE_INDICES.forEach((index, slot) => {
    const point = frame.pose![index]!;
    const offset = 126 + slot * 3;
    values[offset] = (point.x - center.x) / scale;
    values[offset + 1] = (point.y - center.y) * aspect / scale;
    values[offset + 2] = (point.z - center.z) / scale;
  });
  if (![...values].every(Number.isFinite)) throw new Error('Non-finite normalized features.');
  return { schema: FEATURE_SCHEMA, timestampMs: frame.timestampMs, values, usable: hands > 0, reason: hands ? 'ready' : 'no_hands' };
}

/** Bounded in-memory window. Gaps/no signer invalidate a sequence; never pad it. */
export class TemporalBuffer {
  private frames: FeatureVector[] = [];
  private accepted = 0;
  private lastTimestamp = -1;
  get size() { return this.frames.length; }
  get timestamps() { return this.frames.map((frame) => frame.timestampMs); }
  clear() { this.frames = []; this.accepted = 0; this.lastTimestamp = -1; }
  push(frame: FeatureVector): Float32Array | null {
    if (frame.timestampMs <= this.lastTimestamp) throw new Error('Timestamps must increase.');
    const gap = this.lastTimestamp >= 0 && frame.timestampMs - this.lastTimestamp > 250;
    this.lastTimestamp = frame.timestampMs;
    if (!frame.usable || gap) { this.frames = []; this.accepted = 0; }
    if (!frame.usable) return null;
    this.frames.push(frame);
    if (this.frames.length > SEQUENCE_LENGTH) this.frames.shift();
    this.accepted++;
    if (this.frames.length < SEQUENCE_LENGTH || (this.accepted - SEQUENCE_LENGTH) % SEQUENCE_STRIDE !== 0) return null;
    const sequence = new Float32Array(SEQUENCE_LENGTH * FEATURE_COUNT);
    this.frames.forEach((item, index) => sequence.set(item.values, index * FEATURE_COUNT));
    return sequence;
  }
}
