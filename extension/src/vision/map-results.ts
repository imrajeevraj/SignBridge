import type { HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { LandmarkFrame, NormalizedLandmark } from './types';

export function mapResults(hands: HandLandmarkerResult, pose: PoseLandmarkerResult, timestampMs: number, imageWidth: number, imageHeight: number): LandmarkFrame {
  const selected: Record<'Left' | 'Right', { points: NormalizedLandmark[]; score: number } | undefined> = { Left: undefined, Right: undefined };
  hands.landmarks.forEach((points, index) => {
    const category = hands.handedness[index]?.[0];
    if (!category || (category.categoryName !== 'Left' && category.categoryName !== 'Right') || category.score < 0.5 || points.length !== 21) return;
    const side = category.categoryName;
    if (!selected[side] || selected[side].score < category.score) selected[side] = { points, score: category.score };
  });
  return { timestampMs, imageWidth, imageHeight, leftHand: selected.Left?.points ?? null, rightHand: selected.Right?.points ?? null, pose: pose.landmarks[0] ?? null };
}
