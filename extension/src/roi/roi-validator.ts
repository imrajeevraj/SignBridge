import type { RegionOfInterest, ROIValidationResult } from './types';

export const MIN_NORMALIZED_DIMENSION = 0.05; // At least 5% of screen width/height
export const MIN_PIXEL_DIMENSION = 64; // Minimum 64x64 pixels for landmark detection
export const MIN_ASPECT_RATIO = 0.2; // Min width/height ratio
export const MAX_ASPECT_RATIO = 5.0; // Max width/height ratio

/**
 * Validates a normalized Region of Interest.
 */
export function validateROI(roi: RegionOfInterest): ROIValidationResult {
  if (
    typeof roi.x !== 'number' ||
    typeof roi.y !== 'number' ||
    typeof roi.width !== 'number' ||
    typeof roi.height !== 'number' ||
    isNaN(roi.x) ||
    isNaN(roi.y) ||
    isNaN(roi.width) ||
    isNaN(roi.height)
  ) {
    return { valid: false, reason: 'ROI coordinates must be valid numbers.' };
  }

  if (roi.x < 0 || roi.y < 0) {
    return { valid: false, reason: 'ROI coordinates cannot be negative.' };
  }

  if (roi.width <= 0 || roi.height <= 0) {
    return { valid: false, reason: 'ROI width and height must be strictly positive.' };
  }

  if (roi.x + roi.width > 1.001 || roi.y + roi.height > 1.001) {
    return { valid: false, reason: 'ROI extends outside normalized bounds [0, 1].' };
  }

  if (roi.width < MIN_NORMALIZED_DIMENSION || roi.height < MIN_NORMALIZED_DIMENSION) {
    return {
      valid: false,
      reason: `ROI dimensions too small (min normalized dimension is ${MIN_NORMALIZED_DIMENSION}).`,
    };
  }

  if (roi.viewportWidth > 0 && roi.viewportHeight > 0) {
    const pixelW = roi.width * roi.viewportWidth;
    const pixelH = roi.height * roi.viewportHeight;

    if (pixelW < MIN_PIXEL_DIMENSION || pixelH < MIN_PIXEL_DIMENSION) {
      return {
        valid: false,
        reason: `ROI pixel dimensions (${Math.round(pixelW)}x${Math.round(
          pixelH
        )}) are below minimum ${MIN_PIXEL_DIMENSION}x${MIN_PIXEL_DIMENSION}.`,
      };
    }

    const aspect = pixelW / pixelH;
    if (aspect < MIN_ASPECT_RATIO || aspect > MAX_ASPECT_RATIO) {
      return {
        valid: false,
        reason: `ROI aspect ratio (${aspect.toFixed(2)}) is outside acceptable range [${MIN_ASPECT_RATIO}, ${MAX_ASPECT_RATIO}].`,
      };
    }
  }

  // Clamped clean copy
  const normalized: RegionOfInterest = {
    x: Math.max(0, Math.min(1, roi.x)),
    y: Math.max(0, Math.min(1, roi.y)),
    width: Math.max(0, Math.min(1 - roi.x, roi.width)),
    height: Math.max(0, Math.min(1 - roi.y, roi.height)),
    viewportWidth: roi.viewportWidth,
    viewportHeight: roi.viewportHeight,
    devicePixelRatio: roi.devicePixelRatio,
    timestamp: roi.timestamp || Date.now(),
  };

  return { valid: true, normalized };
}
