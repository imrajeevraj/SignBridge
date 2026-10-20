import { describe, expect, it } from 'vitest';
import {
  calculateAspectPreservingCrop,
  cssToNormalized,
  normalizedToPixel,
} from '../src/roi/roi-transform';
import { validateROI } from '../src/roi/roi-validator';
import type { RegionOfInterest, ViewportDimensions } from '../src/roi/types';

describe('ROI Transform and Coordinate Normalization', () => {
  const viewport: ViewportDimensions = {
    width: 1920,
    height: 1080,
    devicePixelRatio: 1.5,
  };

  it('normalizes CSS pixel coordinates correctly', () => {
    const rect = { x: 480, y: 270, width: 960, height: 540 };
    const roi = cssToNormalized(rect, viewport);

    expect(roi.x).toBeCloseTo(0.25);
    expect(roi.y).toBeCloseTo(0.25);
    expect(roi.width).toBeCloseTo(0.5);
    expect(roi.height).toBeCloseTo(0.5);
    expect(roi.viewportWidth).toBe(1920);
    expect(roi.viewportHeight).toBe(1080);
    expect(roi.devicePixelRatio).toBe(1.5);
  });

  it('handles inverted drag (negative width/height)', () => {
    // User drags from (500, 500) to (300, 300) -> width = -200, height = -200
    const rect = { x: 500, y: 500, width: -200, height: -200 };
    const roi = cssToNormalized(rect, viewport);

    expect(roi.x).toBeCloseTo(300 / 1920);
    expect(roi.y).toBeCloseTo(300 / 1080);
    expect(roi.width).toBeCloseTo(200 / 1920);
    expect(roi.height).toBeCloseTo(200 / 1080);
  });

  it('clamps coordinates exceeding viewport bounds', () => {
    const rect = { x: -100, y: -50, width: 2500, height: 1500 };
    const roi = cssToNormalized(rect, viewport);

    expect(roi.x).toBe(0);
    expect(roi.y).toBe(0);
    expect(roi.width).toBe(1);
    expect(roi.height).toBe(1);
  });

  it('maps normalized coordinates to pixel targets accurately', () => {
    const roi: RegionOfInterest = {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const target = normalizedToPixel(roi, 1280, 720);
    expect(target).toEqual({
      x: 320,
      y: 180,
      width: 640,
      height: 360,
    });
  });

  it('calculates aspect-preserving crop with downscaling', () => {
    const roi: RegionOfInterest = {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    // Source is 1920x1080 -> 80% is 1536x864. Max width 640.
    const result = calculateAspectPreservingCrop(roi, 1920, 1080, 640);
    expect(result.crop.width).toBe(1536);
    expect(result.crop.height).toBe(864);
    expect(result.destWidth).toBe(640);
    expect(result.destHeight).toBe(360);
  });

  it('does not upscale when crop is smaller than maxWidth', () => {
    const roi: RegionOfInterest = {
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    // 20% of 1920x1080 = 384x216
    const result = calculateAspectPreservingCrop(roi, 1920, 1080, 640);
    expect(result.destWidth).toBe(384);
    expect(result.destHeight).toBe(216);
  });
});

describe('ROI Validation', () => {
  it('accepts valid ROI', () => {
    const roi: RegionOfInterest = {
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.4,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const res = validateROI(roi);
    expect(res.valid).toBe(true);
    expect(res.normalized).toBeDefined();
    expect(res.normalized?.x).toBe(0.2);
  });

  it('rejects ROI extending beyond bounds', () => {
    const roi: RegionOfInterest = {
      x: 0.8,
      y: 0.2,
      width: 0.4, // 0.8 + 0.4 = 1.2 > 1.0
      height: 0.4,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const res = validateROI(roi);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('extends outside');
  });

  it('rejects ROI below minimum normalized dimensions', () => {
    const roi: RegionOfInterest = {
      x: 0.1,
      y: 0.1,
      width: 0.02, // < 0.05
      height: 0.2,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const res = validateROI(roi);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('too small');
  });

  it('rejects extreme aspect ratios', () => {
    const roi: RegionOfInterest = {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.06, // aspect ~ 1536 / 64.8 = ~23.7 > 5.0
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      timestamp: Date.now(),
    };

    const res = validateROI(roi);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('aspect ratio');
  });
});
