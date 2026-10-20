import type { Prediction } from './contracts';

export class PredictionFilter {
  private candidate: string | null = null;
  private count = 0;
  private lastEmitted: string | null = null;
  private lastTime = -Infinity;
  constructor(readonly threshold = 0.8, readonly consecutive = 2, readonly cooldownMs = 1500) {}
  reset() { this.candidate = null; this.count = 0; this.lastEmitted = null; this.lastTime = -Infinity; }
  accept(result: Prediction, now: number): boolean {
    if (!result.accepted || !result.label || result.confidence === null || result.confidence < this.threshold) {
      this.candidate = null; this.count = 0;
      // Uncertainty closes the visible segment. A later stable result may be
      // emitted again after the cooldown, rather than remaining suppressed.
      this.lastEmitted = null;
      return false;
    }
    this.count = this.candidate === result.label ? this.count + 1 : 1;
    this.candidate = result.label;
    if (this.count < this.consecutive || result.label === this.lastEmitted || now - this.lastTime < this.cooldownMs) return false;
    this.lastEmitted = result.label; this.lastTime = now;
    return true;
  }
}
