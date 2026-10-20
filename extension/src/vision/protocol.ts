import type { LandmarkFrame } from './types';
import type { FeatureVector } from './features';
import type { FrameDiagnostics } from './diagnostics';
import type { FeatureSchema } from './schemas';

export type VisionRequest = { type: 'INITIALIZE'; diagnostics?: boolean; schema?: FeatureSchema } | { type: 'FRAME'; bitmap: ImageBitmap; timestampMs: number };
export interface FeatureWindow { values: Float32Array; timestamps: number[]; schema?: FeatureSchema; samplingHz?: 15 | 30 }
export type VisionResponse =
  | { type: 'READY' }
  | { type: 'ERROR'; message: string }
  | { type: 'RESULT'; frame: LandmarkFrame; processingMs: number; bufferSize: number; windows: number; featureState: FeatureVector['reason']; sequence?: FeatureWindow; continuity?: number; featureMs?: number; handMs?: number; poseMs?: number; diagnostics?: FrameDiagnostics };
