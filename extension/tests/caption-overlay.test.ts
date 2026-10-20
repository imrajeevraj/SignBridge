import { beforeEach, describe, expect, it } from 'vitest';
import { CAPTION_HOST_ID, createCaptionOverlay } from '../src/content/caption-overlay';

describe('Caption Overlay Component', () => {
  beforeEach(() => {
    const existing = document.getElementById(CAPTION_HOST_ID);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  });

  it('initializes in idle/not_implemented state without modifying DOM before show()', () => {
    const overlay = createCaptionOverlay();
    expect(overlay.state).toBe('not_implemented');
    expect(document.getElementById(CAPTION_HOST_ID)).toBeNull();
  });

  it('attaches shadow root on show()', () => {
    const overlay = createCaptionOverlay();
    overlay.show();

    expect(overlay.state).toBe('active');
    const host = document.getElementById(CAPTION_HOST_ID);
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeDefined();

    overlay.dispose();
  });

  it('renders genuine accepted prediction and confidence badge', () => {
    const overlay = createCaptionOverlay();
    overlay.show();

    overlay.update('Goodafternoon', 0.94, true);

    const host = document.getElementById(CAPTION_HOST_ID);
    const shadow = host?.shadowRoot;
    const textEl = shadow?.getElementById('caption-text');
    const chipEl = shadow?.getElementById('confidence-chip');

    expect(textEl?.textContent).toBe('Goodafternoon');
    expect(chipEl?.textContent).toContain('Model score: 0.94');
    expect(chipEl?.textContent).toContain('94% match');

    overlay.dispose();
  });

  it('ignores NO_SIGN and unaccepted predictions', () => {
    const overlay = createCaptionOverlay();
    overlay.show();

    overlay.update('NO_SIGN', 0.99, true);

    const host = document.getElementById(CAPTION_HOST_ID);
    const shadow = host?.shadowRoot;
    const textEl = shadow?.getElementById('caption-text');
    expect(textEl?.style.display).toBe('none');

    overlay.update('Family', 0.45, false);
    expect(textEl?.style.display).toBe('none');

    overlay.dispose();
  });

  it('clears displayed text on clear()', () => {
    const overlay = createCaptionOverlay();
    overlay.show();
    overlay.update('Family', 0.95, true);

    overlay.clear();

    const host = document.getElementById(CAPTION_HOST_ID);
    const shadow = host?.shadowRoot;
    const textEl = shadow?.getElementById('caption-text');
    const placeholder = shadow?.getElementById('placeholder');

    expect(textEl?.style.display).toBe('none');
    expect(placeholder?.style.display).toBe('block');

    overlay.dispose();
  });

  it('cleans up DOM on dispose()', () => {
    const overlay = createCaptionOverlay();
    overlay.show();
    expect(document.getElementById(CAPTION_HOST_ID)).not.toBeNull();

    overlay.dispose();
    expect(document.getElementById(CAPTION_HOST_ID)).toBeNull();
  });
});
