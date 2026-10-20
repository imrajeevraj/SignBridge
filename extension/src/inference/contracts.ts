import { featureCount, isFeatureSchema } from '../vision/schemas';
export const INFERENCE_PROTOCOL = 'signbridge.inference.v1';
export const MODEL_STATES = ['MODEL_NOT_INSTALLED', 'MODEL_LOADING', 'MODEL_READY', 'MODEL_ERROR', 'MODEL_INCOMPATIBLE', 'MODEL_UNAVAILABLE'] as const;
export type ModelState = typeof MODEL_STATES[number];
export interface ModelInfo {
  state: ModelState; available: boolean; model_id: string | null; model_type: string | null;
  sign_language: 'ISL' | 'ASL' | null; model_version: string | null; feature_schema: string | null;
  sequence_shape: number[] | null; labels: string[]; vocabulary_size: number;
  sampling_hz?: 15 | 30 | null;
  confidence_threshold: number | null; calibrated: boolean; message: string;
}
export interface Prediction {
  type: 'prediction'; protocol: typeof INFERENCE_PROTOCOL; request_id: string; sequence_id: number;
  model_id: string; label: string | null; confidence: number | null; accepted: boolean;
  reason: 'ACCEPTED' | 'NO_SIGN' | 'UNKNOWN'; latency_ms: number; captured_at_ms: number;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function isModelInfo(value: unknown): value is ModelInfo {
  if (!record(value) || !MODEL_STATES.includes(value.state as ModelState) || typeof value.available !== 'boolean'
    || !Array.isArray(value.labels) || value.labels.length > 512 || !value.labels.every((label) => typeof label === 'string' && label.length > 0 && label.length <= 100)
    || value.vocabulary_size !== value.labels.length || typeof value.message !== 'string' || typeof value.calibrated !== 'boolean') return false;
  if (value.state !== 'MODEL_READY') return value.available === false && value.labels.length === 0;
  return value.available && typeof value.model_id === 'string' && /^[\w-]{1,80}$/.test(value.model_id)
    && value.model_type === 'custom_gru' && (value.sign_language === 'ISL' || value.sign_language === 'ASL')
    && isFeatureSchema(value.feature_schema) && JSON.stringify(value.sequence_shape) === JSON.stringify([32,featureCount(value.feature_schema)])
    && (value.sampling_hz ?? 15) === (value.feature_schema === 'signbridge.custom-gru.v2' ? 30 : 15)
    && value.labels.length >= 2 && new Set(value.labels).size === value.labels.length
    && typeof value.confidence_threshold === 'number' && value.confidence_threshold >= 0.5 && value.confidence_threshold <= 1;
}
export function isPrediction(value: unknown): value is Prediction {
  return record(value) && value.type === 'prediction' && value.protocol === INFERENCE_PROTOCOL
    && typeof value.request_id === 'string' && Number.isInteger(value.sequence_id)
    && typeof value.model_id === 'string' && typeof value.accepted === 'boolean'
    && (value.label === null || typeof value.label === 'string')
    && (value.confidence === null || (typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1))
    && ['ACCEPTED', 'NO_SIGN', 'UNKNOWN'].includes(String(value.reason))
    && typeof value.latency_ms === 'number' && Number.isFinite(value.latency_ms) && value.latency_ms >= 0
    && typeof value.captured_at_ms === 'number' && Number.isFinite(value.captured_at_ms)
    && (!value.accepted || (value.reason === 'ACCEPTED' && typeof value.label === 'string' && typeof value.confidence === 'number'));
}
