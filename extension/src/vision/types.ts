/** Raw observations from local MediaPipe; not sign-recognition predictions. */
export type SignLanguage = 'ASL' | 'ISL';
export interface NormalizedLandmark {
  /** Image-relative x/y. z is model-relative depth, not a probability. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}
export interface LandmarkFrame {
  readonly timestampMs: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly leftHand: readonly NormalizedLandmark[] | null;
  readonly rightHand: readonly NormalizedLandmark[] | null;
  readonly pose: readonly NormalizedLandmark[] | null;
}
export interface LandmarkSequence {
  readonly schemaVersion: 1;
  readonly signLanguage: SignLanguage;
  readonly frames: readonly LandmarkFrame[];
}
export interface InferenceResult {
  readonly signLanguage: SignLanguage;
  readonly label: string;
  readonly confidence: number;
  readonly timestampMs: number;
}
