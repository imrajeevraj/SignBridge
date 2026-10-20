# Phase 4 — Security and Privacy Architecture

### 1. Privacy Principles
SignBridge AI is built on strict **zero cloud transmission** and **explicit user opt-in** principles:
1. **Zero Media Upload**: No video frames, audio tracks, cropped bitmaps, or landmark tensors are ever transmitted across external networks or stored on remote servers. All image processing and ML inference occur on the user's local machine (`127.0.0.1`).
2. **Audio Exclusion**: The tab capture request explicitly sets `{ audio: false }`. No microphone or audio permissions are ever requested or accessed.
3. **Session-Scoped Tab Capture**: Capture is initiated strictly via explicit user selection in the dashboard. The extension never automatically captures background tabs.
4. **Isolated World Content Scripts**: The extension content script runs in Chrome's isolated world and does not expose extension APIs (`chrome.runtime`) to web pages or third-party meeting scripts.

---

### 2. Permissions Justification
- `storage`: Required for local settings persistence (caption preferences, themes). Access level is restricted to `TRUSTED_CONTEXTS`.
- `tabCapture`: Required to obtain the video stream ID for the user-selected meeting tab via `chrome.tabCapture.getMediaStreamId()`.
- `offscreen`: Required to create sandboxed offscreen documents to render the captured tab video and run worker inference without opening visible auxiliary windows.
- `activeTab`: Grants temporary access to inject the content script overlay when the user initiates meeting mode.
- `tabs`: Allows querying the active meeting tabs in the user's browser to display the tab selection dropdown.

---

### 3. Cleanup & Teardown Invariants
- **Tab Close**: The background service worker listens to `chrome.tabs.onRemoved`. If the captured meeting tab is closed, all offscreen resources, MediaStreams, and workers are immediately torn down.
- **Navigation Away**: The background listens to `chrome.tabs.onUpdated`. If the tab URL changes away from the supported meeting domain, capture is aborted immediately.
- **Mutex with Webcam Studio**: Only one capture pipeline (Webcam Studio or Meeting Mode) may run at any time.
- **Explicit Stop**: Clicking "Stop Captions" in the dashboard halts all media tracks, terminates the vision worker, closes the backend WebSocket, and unmounts the Shadow DOM overlays.

