import { POSE_INDICES, type FeatureVector } from './features';
import type { LandmarkFrame, NormalizedLandmark } from './types';

export const FEATURE_SCHEMA_V2 = 'signbridge.custom-gru.v2';
export const FEATURE_COUNT_V2 = 172;
export type FeatureVectorV2 = Omit<FeatureVector, 'schema'> & { schema: typeof FEATURE_SCHEMA_V2 };
const finite = (p: NormalizedLandmark) => [p.x, p.y, p.z].every(Number.isFinite);
const valid = (p: NormalizedLandmark | undefined): p is NormalizedLandmark => !!p && finite(p) && (p.visibility ?? 1) >= 0.5;

/** Approved v2: optional non-anchor pose points have explicit masks, never imputation. */
export function extractFeaturesV2(frame: LandmarkFrame): FeatureVectorV2 {
  if (!Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) throw new Error('Invalid landmark timestamp.');
  const values = new Float32Array(FEATURE_COUNT_V2);
  const result = (usable: boolean, reason: FeatureVector['reason']): FeatureVectorV2 => ({ schema: FEATURE_SCHEMA_V2, timestampMs: frame.timestampMs, values, usable, reason });
  const left = frame.pose?.[11], right = frame.pose?.[12];
  const aspect = frame.imageHeight / frame.imageWidth;
  const scale = left && right ? Math.hypot(left.x - right.x, (left.y - right.y) * aspect) : 0;
  if (!valid(left) || !valid(right) || !Number.isFinite(aspect) || aspect <= 0 || scale < 0.025) return result(false, 'pose_unavailable');
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, z: (left.z + right.z) / 2 };
  let hands = 0;
  [frame.leftHand, frame.rightHand].forEach((hand, slot) => {
    if (!hand || hand.length !== 21 || !hand.every(finite)) return;
    hands++; values[159 + slot] = 1;
    hand.forEach((p, i) => {
      const offset = slot * 63 + i * 3;
      values[offset] = (p.x - center.x) / scale;
      values[offset + 1] = (p.y - center.y) * aspect / scale;
      values[offset + 2] = (p.z - hand[0]!.z) / scale;
    });
  });
  POSE_INDICES.forEach((index, slot) => {
    const p = frame.pose?.[index];
    if (!valid(p)) return;
    values[161 + slot] = 1;
    const offset = 126 + slot * 3;
    values[offset] = (p.x - center.x) / scale;
    values[offset + 1] = (p.y - center.y) * aspect / scale;
    values[offset + 2] = (p.z - center.z) / scale;
  });
  if (!Array.from(values).every(Number.isFinite)) throw new Error('Non-finite normalized features.');
  return result(hands > 0, hands ? 'ready' : 'no_hands');
}

/** Separate buffer leaves the approved v1 implementation intact. Same temporal rules. */
export class TemporalBufferV2 {
  private frames: FeatureVectorV2[] = [];
  private accepted = 0;
  private lastTimestamp = -1;
  get size() { return this.frames.length; }
  get timestamps() { return this.frames.map(f => f.timestampMs); }
  clear() { this.frames = []; this.accepted = 0; this.lastTimestamp = -1; }
  push(frame: FeatureVectorV2): Float32Array | null {
    if (frame.timestampMs <= this.lastTimestamp) throw new Error('Timestamps must increase.');
    const gap = this.lastTimestamp >= 0 && frame.timestampMs - this.lastTimestamp > 250;
    this.lastTimestamp = frame.timestampMs;
    if (!frame.usable || gap) { this.frames = []; this.accepted = 0; }
    if (!frame.usable) return null;
    this.frames.push(frame); if (this.frames.length > 32) this.frames.shift(); this.accepted++;
    if (this.frames.length < 32 || (this.accepted - 32) % 8 !== 0) return null;
    const sequence = new Float32Array(32 * FEATURE_COUNT_V2);
    this.frames.forEach((item, i) => sequence.set(item.values, i * FEATURE_COUNT_V2));
    return sequence;
  }
}
