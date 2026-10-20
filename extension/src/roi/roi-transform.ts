import type { PixelRect, RegionOfInterest, ViewportDimensions } from './types';

/**
 * Converts CSS pixel coordinates from viewport drag selection to normalized [0, 1] coordinates.
 */
export function cssToNormalized(
  rect: PixelRect,
  viewport: ViewportDimensions
): RegionOfInterest {
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('Viewport dimensions must be greater than zero.');
  }

  // Handle potential negative width/height from inverted drag
  const minX = Math.min(rect.x, rect.x + rect.width);
  const minY = Math.min(rect.y, rect.y + rect.height);
  const rawW = Math.abs(rect.width);
  const rawH = Math.abs(rect.height);

  // Clamp to viewport boundaries
  const clampedX = Math.max(0, Math.min(minX, viewport.width));
  const clampedY = Math.max(0, Math.min(minY, viewport.height));
  const clampedW = Math.max(0, Math.min(rawW, viewport.width - clampedX));
  const clampedH = Math.max(0, Math.min(rawH, viewport.height - clampedY));

  return {
    x: clampedX / viewport.width,
    y: clampedY / viewport.height,
    width: clampedW / viewport.width,
    height: clampedH / viewport.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    devicePixelRatio: viewport.devicePixelRatio || 1,
    timestamp: Date.now(),
  };
}

/**
 * Maps normalized [0, 1] coordinates to target pixel dimensions (e.g. video element or canvas).
 */
export function normalizedToPixel(
  roi: RegionOfInterest,
  targetWidth: number,
  targetHeight: number
): PixelRect {
  if (targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const px = Math.round(roi.x * targetWidth);
  const py = Math.round(roi.y * targetHeight);
  const pw = Math.round(roi.width * targetWidth);
  const ph = Math.round(roi.height * targetHeight);

  // Clamp within target bounds
  const x = Math.max(0, Math.min(px, targetWidth));
  const y = Math.max(0, Math.min(py, targetHeight));
  const width = Math.max(0, Math.min(pw, targetWidth - x));
  const height = Math.max(0, Math.min(ph, targetHeight - y));

  return { x, y, width, height };
}

/**
 * Calculates crop dimensions and destination canvas dimensions, scaling down to maxWidth
 * while preserving aspect ratio and ensuring dimensions are valid integers.
 */
export function calculateAspectPreservingCrop(
  roi: RegionOfInterest,
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = 640
): { crop: PixelRect; destWidth: number; destHeight: number } {
  const crop = normalizedToPixel(roi, sourceWidth, sourceHeight);

  if (crop.width <= 0 || crop.height <= 0) {
    return { crop, destWidth: 0, destHeight: 0 };
  }

  let destWidth = crop.width;
  let destHeight = crop.height;

  if (destWidth > maxWidth) {
    const scale = maxWidth / destWidth;
    destWidth = Math.round(destWidth * scale);
    destHeight = Math.round(destHeight * scale);
  }

  // Ensure minimum 1x1 and even dimensions if helpful for image processing
  destWidth = Math.max(2, destWidth);
  destHeight = Math.max(2, destHeight);

  return { crop, destWidth, destHeight };
}
