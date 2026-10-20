# Phase 4 — Meeting UI & Live Floating Captions

### 1. Requirements & Design Principles
The meeting user interface must satisfy five strict design principles:
1. **Isolated Mounting (Shadow DOM)**: UI elements injected into Google Meet must never interfere with Google Meet's DOM, CSS styles, or event handlers, nor should Meet styles bleed into SignBridge overlays.
2. **Inert Content Script**: Prior to explicit user activation, the content script does not mount DOM elements or modify native page content.
3. **Draggable & Non-Intrusive**: Captions float over the video meeting and can be repositioned anywhere by dragging the header.
4. **Accessible**: Conforms to W3C WAI-ARIA guidelines using `role="status"` and `aria-live="polite"` for assistive technology.
5. **Dynamic Customization**: Supports font size switching (Small, Medium, Large), theme toggle (Dark, Light), and idle timeout fade-out.

---

### 2. Shadow DOM Component Architecture

```text
Google Meet Page DOM
  |
  +-- <div id="signbridge-caption-host">
        |
        #shadow-root (open)
          |
          +-- <style> ... Encapsulated styles ... </style>
          +-- <div class="caption-card" role="status" aria-live="polite">
                +-- <div class="caption-header" id="caption-header">
                      +-- [Title & Icon] SignBridge Captions
                      +-- [Controls]
                            +-- Size Toggle ('A')
                            +-- Theme Toggle ('◐')
                            +-- Close Button ('✕')
                +-- <div class="caption-body">
                      +-- <div class="idle-placeholder">Watching selected signer...</div>
                      +-- <p class="caption-text">Goodafternoon</p>
                      +-- <div class="confidence-chip">94% match</div>
```

---

### 3. Display Rules & Timing
- **Filtering**: Only predictions marked with `accepted: true` and non-null labels distinct from `NO_SIGN` are displayed.
- **Confidence Formatting**: Formatted as an integer percentage badge (e.g. `94% match`).
- **Idle Timeout**: When no new predictions are received for 4.5 seconds, the active text smoothly clears back to the idle placeholder ("Watching selected signer..."), preventing stale captions from lingering indefinitely.
- **Teardown**: On session stop or meeting end, `#signbridge-caption-host` is cleanly removed from the DOM.

