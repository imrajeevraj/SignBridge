export const CAPTION_HOST_ID = 'signbridge-caption-host';

export interface CaptionStyleOptions {
  fontSize: 'small' | 'medium' | 'large';
  opacity: number; // 0.5 to 1.0
  theme: 'dark' | 'light';
}

export interface CaptionOverlay {
  readonly state: 'idle' | 'active' | 'hidden' | 'not_implemented';
  show(doc?: Document): void;
  hide(): void;
  update(text: string, confidence: number, accepted: boolean): void;
  clear(): void;
  dispose(): void;
}

export function createCaptionOverlay(): CaptionOverlay {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let currentState: 'not_implemented' | 'idle' | 'active' | 'hidden' = 'not_implemented';
  let idleTimeout: NodeJS.Timeout | number | null = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let currentPosX = 24;
  let currentPosY = 24;

  const currentStyles: CaptionStyleOptions = {
    fontSize: 'medium',
    opacity: 0.88,
    theme: 'dark',
  };

  function getFontSizePx(size: 'small' | 'medium' | 'large'): string {
    switch (size) {
      case 'small':
        return '16px';
      case 'large':
        return '28px';
      case 'medium':
      default:
        return '22px';
    }
  }

  function renderShadow(root: ShadowRoot) {
    const isDark = currentStyles.theme === 'dark';
    const bg = isDark
      ? `rgba(15, 23, 42, ${currentStyles.opacity})`
      : `rgba(255, 255, 255, ${currentStyles.opacity})`;
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const borderColor = isDark ? '#334155' : '#cbd5e1';

    root.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .caption-card {
          position: fixed;
          bottom: ${currentPosY}px;
          right: ${currentPosX}px;
          width: 380px;
          min-height: 110px;
          background: ${bg};
          backdrop-filter: blur(8px);
          border: 1px solid ${borderColor};
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          z-index: 2147483645;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
          transition: opacity 0.3s ease;
          user-select: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .caption-card {
            transition: none !important;
          }
        }
        .caption-header {
          padding: 8px 12px;
          background: ${isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.05)'};
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          border-bottom: 1px solid ${borderColor};
        }
        .title-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #38bdf8;
        }
        .controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-ctrl {
          background: transparent;
          border: 1px solid ${borderColor};
          color: ${textColor};
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 10px;
          cursor: pointer;
        }
        .btn-ctrl:hover {
          background: ${isDark ? '#1e293b' : '#f1f5f9'};
        }
        .caption-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
        }
        .caption-text {
          font-size: ${getFontSizePx(currentStyles.fontSize)};
          font-weight: 700;
          color: ${textColor};
          text-align: center;
          line-height: 1.3;
          margin: 0;
          word-break: break-word;
        }
        .confidence-chip {
          margin-top: 8px;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .idle-placeholder {
          color: ${isDark ? '#64748b' : '#94a3b8'};
          font-size: 13px;
          font-style: italic;
        }
      </style>
      <div class="caption-card" id="caption-card" role="status" aria-live="polite">
        <div class="caption-header" id="caption-header">
          <div class="title-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
            </svg>
            <span>SignBridge Captions</span>
          </div>
          <div class="controls">
            <button class="btn-ctrl" id="btn-size" title="Toggle font size">A</button>
            <button class="btn-ctrl" id="btn-theme" title="Toggle theme">◐</button>
            <button class="btn-ctrl" id="btn-close" title="Hide captions">✕</button>
          </div>
        </div>
        <div class="caption-body" id="caption-body">
          <div class="idle-placeholder" id="placeholder">Watching selected signer...</div>
          <p class="caption-text" id="caption-text" style="display: none;"></p>
          <div class="confidence-chip" id="confidence-chip" style="display: none;"></div>
        </div>
      </div>
    `;

    attachHeaderDrag(root);
    attachControls(root);
  }

  function attachControls(root: ShadowRoot) {
    const btnSize = root.getElementById('btn-size');
    const btnTheme = root.getElementById('btn-theme');
    const btnClose = root.getElementById('btn-close');

    btnSize?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentStyles.fontSize === 'small') currentStyles.fontSize = 'medium';
      else if (currentStyles.fontSize === 'medium') currentStyles.fontSize = 'large';
      else currentStyles.fontSize = 'small';
      renderShadow(root);
    });

    btnTheme?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentStyles.theme = currentStyles.theme === 'dark' ? 'light' : 'dark';
      renderShadow(root);
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      hide();
    });
  }

  function attachHeaderDrag(root: ShadowRoot) {
    const header = root.getElementById('caption-header');
    header?.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.btn-ctrl')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    currentPosX = Math.max(10, currentPosX - dx);
    currentPosY = Math.max(10, currentPosY - dy);

    if (shadow) {
      const card = shadow.getElementById('caption-card');
      if (card) {
        card.style.right = `${currentPosX}px`;
        card.style.bottom = `${currentPosY}px`;
      }
    }
  }

  function onMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  function show(doc: Document = document): void {
    if (!host) {
      host = doc.createElement('div');
      host.id = CAPTION_HOST_ID;
      shadow = host.attachShadow({ mode: 'open' });
      renderShadow(shadow);
      doc.body.appendChild(host);
    }
    currentState = 'active';
  }

  function hide(): void {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    host = null;
    shadow = null;
    currentState = 'hidden';
  }

  function update(text: string, confidence: number, accepted: boolean): void {
    if (!accepted || !text || text === 'NO_SIGN') {
      return;
    }

    if (!host) {
      show();
    }

    if (!shadow) return;

    const placeholder = shadow.getElementById('placeholder');
    const captionText = shadow.getElementById('caption-text');
    const chip = shadow.getElementById('confidence-chip');

    if (placeholder) placeholder.style.display = 'none';
    if (captionText) {
      captionText.textContent = text;
      captionText.style.display = 'block';
    }
    if (chip) {
      chip.textContent = `Model score: ${confidence.toFixed(2)} (${Math.round(confidence * 100)}% match)`;
      chip.style.display = 'block';
    }

    // Reset idle timeout
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      clear();
    }, 4500);
  }

  function clear(): void {
    if (!shadow) return;
    const placeholder = shadow.getElementById('placeholder');
    const captionText = shadow.getElementById('caption-text');
    const chip = shadow.getElementById('confidence-chip');

    if (placeholder) placeholder.style.display = 'block';
    if (captionText) {
      captionText.textContent = '';
      captionText.style.display = 'none';
    }
    if (chip) chip.style.display = 'none';
  }

  function dispose(): void {
    if (idleTimeout) clearTimeout(idleTimeout);
    hide();
    currentState = 'idle';
  }

  return {
    get state() {
      return currentState;
    },
    show,
    hide,
    update,
    clear,
    dispose,
  };
}
