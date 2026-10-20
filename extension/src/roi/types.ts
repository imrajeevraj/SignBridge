/**
 * Normalized Region of Interest (ROI) and coordinate transformation contracts.
 * Coordinates are normalized to [0, 1] relative to viewport/captured video dimensions.
 */

export interface RegionOfInterest {
  /** Normalized X offset from left edge [0, 1) */
  x: number;
  /** Normalized Y offset from top edge [0, 1) */
  y: number;
  /** Normalized width (0, 1] */
  width: number;
  /** Normalized height (0, 1] */
  height: number;
  /** CSS viewport width at time of selection */
  viewportWidth: number;
  /** CSS viewport height at time of selection */
  viewportHeight: number;
  /** Device pixel ratio at time of selection */
  devicePixelRatio: number;
  /** Selection timestamp */
  timestamp: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ROIValidationResult {
  valid: boolean;
  reason?: string;
  normalized?: RegionOfInterest;
}

