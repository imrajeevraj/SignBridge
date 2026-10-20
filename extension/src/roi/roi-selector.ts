import { cssToNormalized } from './roi-transform';
import { validateROI } from './roi-validator';
import type { PixelRect, RegionOfInterest, ViewportDimensions } from './types';

export const ROI_HOST_ID = 'signbridge-roi-host';

export interface ROISelectorOptions {
  onConfirm: (roi: RegionOfInterest) => void;
  onCancel: () => void;
  initialROI?: RegionOfInterest;
}

export class ROISelectorOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private isDragging = false;
  private isResizing = false;
  private resizeHandle: string | null = null;
  private startX = 0;
  private startY = 0;
  private currentRect: PixelRect = { x: 0, y: 0, width: 0, height: 0 };
  private initialRectForResize: PixelRect = { x: 0, y: 0, width: 0, height: 0 };
  private options: ROISelectorOptions;

  constructor(options: ROISelectorOptions) {
    this.options = options;
  }

  show(doc: Document = document): void {
    if (this.host) return;

    this.host = doc.createElement('div');
    this.host.id = ROI_HOST_ID;
    this.host.style.position = 'fixed';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.width = '100vw';
    this.host.style.height = '100vh';
    this.host.style.zIndex = '2147483646'; // High z-index to overlay video
    this.host.style.pointerEvents = 'auto';

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.render();
    this.attachEventListeners();
    doc.body.appendChild(this.host);

    // If initial ROI provided, initialize currentRect
    if (this.options.initialROI) {
      const vW = window.innerWidth;
      const vH = window.innerHeight;
      this.currentRect = {
        x: Math.round(this.options.initialROI.x * vW),
        y: Math.round(this.options.initialROI.y * vH),
        width: Math.round(this.options.initialROI.width * vW),
        height: Math.round(this.options.initialROI.height * vH),
      };
      this.updateSelectionBox();
    }
  }

  hide(): void {
    this.dispose();
  }

  dispose(): void {
    this.detachEventListeners();
    if (this.host && this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    this.host = null;
    this.shadow = null;
  }

  private render(): void {
    if (!this.shadow) return;

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .scrim {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          cursor: crosshair;
          user-select: none;
        }
        .instruction-banner {
          position: absolute;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #111827;
          color: #f9fafb;
          padding: 10px 20px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 10;
          pointer-events: auto;
          border: 1px solid #374151;
        }
        .badge {
          background: #0284c7;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .selection-box {
          position: absolute;
          border: 2px dashed #00e5ff;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
          background: transparent;
          cursor: move;
          box-sizing: border-box;
          display: none;
        }
        .handle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: #00e5ff;
          border: 1px solid #ffffff;
          border-radius: 2px;
        }
        .handle.tl { top: -6px; left: -6px; cursor: nwse-resize; }
        .handle.tr { top: -6px; right: -6px; cursor: nesw-resize; }
        .handle.bl { bottom: -6px; left: -6px; cursor: nesw-resize; }
        .handle.br { bottom: -6px; right: -6px; cursor: nwse-resize; }
        .action-bar {
          position: absolute;
          bottom: -48px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          background: #1f2937;
          padding: 6px 10px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          pointer-events: auto;
          white-space: nowrap;
        }
        button {
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn-confirm {
          background: #059669;
          color: white;
        }
        .btn-confirm:hover { background: #047857; }
        .btn-cancel {
          background: #4b5563;
          color: white;
        }
        .btn-cancel:hover { background: #374151; }
        .error-msg {
          color: #f87171;
          font-size: 12px;
          margin-top: 4px;
          display: none;
        }
      </style>
      <div class="scrim" id="scrim">
        <div class="instruction-banner">
          <span class="badge">SignBridge AI</span>
          <span>Drag to select the signer's video frame. Use handles to resize.</span>
        </div>
        <div class="selection-box" id="selection-box">
          <div class="handle tl" data-handle="tl"></div>
          <div class="handle tr" data-handle="tr"></div>
          <div class="handle bl" data-handle="bl"></div>
          <div class="handle br" data-handle="br"></div>
          <div class="action-bar">
            <button type="button" class="btn-confirm" id="btn-confirm">Confirm ROI</button>
            <button type="button" class="btn-cancel" id="btn-cancel">Cancel</button>
            <span class="error-msg" id="error-msg"></span>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.shadow) return;

    const scrim = this.shadow.getElementById('scrim');
    const box = this.shadow.getElementById('selection-box');
    const btnConfirm = this.shadow.getElementById('btn-confirm');
    const btnCancel = this.shadow.getElementById('btn-cancel');

    scrim?.addEventListener('mousedown', this.onScrimMouseDown);
    box?.addEventListener('mousedown', this.onBoxMouseDown);
    btnConfirm?.addEventListener('click', this.onConfirmClick);
    btnCancel?.addEventListener('click', this.onCancelClick);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private detachEventListeners(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onScrimMouseDown = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest('.action-bar') || (e.target as HTMLElement).closest('.instruction-banner')) {
      return;
    }
    this.isDragging = true;
    this.isResizing = false;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentRect = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
    this.updateSelectionBox();
  };

  private onBoxMouseDown = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('handle')) {
      e.stopPropagation();
      this.isResizing = true;
      this.isDragging = false;
      this.resizeHandle = target.dataset.handle || null;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.initialRectForResize = { ...this.currentRect };
      return;
    }

    if (target.closest('.action-bar')) {
      return;
    }

    // Move whole box
    e.stopPropagation();
    this.isDragging = false;
    this.isResizing = false;
    // Box dragging can be implemented or simply allow redrawing
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.isDragging) {
      const x = Math.min(this.startX, e.clientX);
      const y = Math.min(this.startY, e.clientY);
      const width = Math.abs(e.clientX - this.startX);
      const height = Math.abs(e.clientY - this.startY);
      this.currentRect = { x, y, width, height };
      this.updateSelectionBox();
    } else if (this.isResizing && this.resizeHandle) {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const init = this.initialRectForResize;

      let { x, y, width, height } = init;

      if (this.resizeHandle === 'br') {
        width = Math.max(20, init.width + dx);
        height = Math.max(20, init.height + dy);
      } else if (this.resizeHandle === 'bl') {
        width = Math.max(20, init.width - dx);
        x = init.x + (init.width - width);
        height = Math.max(20, init.height + dy);
      } else if (this.resizeHandle === 'tr') {
        width = Math.max(20, init.width + dx);
        height = Math.max(20, init.height - dy);
        y = init.y + (init.height - height);
      } else if (this.resizeHandle === 'tl') {
        width = Math.max(20, init.width - dx);
        x = init.x + (init.width - width);
        height = Math.max(20, init.height - dy);
        y = init.y + (init.height - height);
      }

      this.currentRect = { x, y, width, height };
      this.updateSelectionBox();
    }
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.onCancelClick();
    }
  };

  private updateSelectionBox(): void {
    if (!this.shadow) return;
    const box = this.shadow.getElementById('selection-box');
    if (!box) return;

    if (this.currentRect.width > 10 && this.currentRect.height > 10) {
      box.style.display = 'block';
      box.style.left = `${this.currentRect.x}px`;
      box.style.top = `${this.currentRect.y}px`;
      box.style.width = `${this.currentRect.width}px`;
      box.style.height = `${this.currentRect.height}px`;
    } else {
      box.style.display = 'none';
    }
  }

  private onConfirmClick = (e?: MouseEvent): void => {
    if (e) e.stopPropagation();

    const viewport: ViewportDimensions = {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    };

    const normalized = cssToNormalized(this.currentRect, viewport);
    const validation = validateROI(normalized);

    if (!validation.valid || !validation.normalized) {
      const errMsg = this.shadow?.getElementById('error-msg');
      if (errMsg) {
        errMsg.textContent = validation.reason || 'Invalid ROI selection';
        errMsg.style.display = 'block';
      }
      return;
    }

    this.dispose();
    this.options.onConfirm(validation.normalized);
  };

  private onCancelClick = (e?: MouseEvent): void => {
    if (e) e.stopPropagation();
    this.dispose();
    this.options.onCancel();
  };
}
