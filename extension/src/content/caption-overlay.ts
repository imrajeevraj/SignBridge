/** Reserved boundary: no DOM is mounted and no sample captions are generated. */
export interface CaptionOverlay {
  readonly state: 'not_implemented';
  dispose(): void;
}
export function createCaptionOverlay(): CaptionOverlay {
  // Phase 5: mount a ShadowRoot after consent and render only genuine predictions.
  return { state: 'not_implemented', dispose() { /* No resources exist in Phase 1. */ } };
}
