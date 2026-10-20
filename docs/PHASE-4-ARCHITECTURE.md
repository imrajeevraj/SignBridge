# SignBridge AI — Phase 4 Architecture Specification
## Chrome Meeting Integration + Real-Time AI Sign Captions

### 1. Executive Summary

Phase 4 extends SignBridge AI from standalone webcam studio evaluation into virtual meeting environments, primarily targeting **Google Meet Web**. It introduces tab video capture via Manifest V3 `chrome.tabCapture` and offscreen processing, a user-guided single-signer Region of Interest (ROI) selection overlay, client-side MediaPipe landmark extraction, authenticated local WebSocket inference against the Phase 3 remediated ISL model (`ml/runs/isl500-v2-remediated`), and accessible, draggable live floating captions rendered directly within Google Meet.

---

### 2. End-to-End System Architecture

```text
+---------------------------------------------------------------------------------------------------+
|                                        CHROME BROWSER                                             |
|                                                                                                   |
|  +---------------------------+     User Start      +-------------------------------------------+  |
|  |     GOOGLE MEET TAB       | ------------------> |       MANIFEST V3 SERVICE WORKER          |  |
|  | (https://meet.google.com) |                     |  - Manages session lifecycle              |  |
|  +---------------------------+                     |  - Requests tabCapture stream ID          |  |
|                ^                                   |  - Coordinates Content Script & Offscreen |  |
|                |                                   +-------------------------------------------+  |
|                | (UPDATE_CAPTION)                                        |                        |
|                |                                                         | (streamId, roi)        |
|  +---------------------------+                                           v                        |
|  |     CONTENT SCRIPT        |                     +-------------------------------------------+  |
|  |  - ROI Selector Overlay   | <------------------ |             OFFSCREEN DOCUMENT            |  |
|  |    (Shadow DOM)           |   (SHOW_SELECTOR)   |  - navigator.mediaDevices.getUserMedia    |  |
|  |  - Floating Captions      |                     |  - Video element + Offscreen Canvas       |  |
|  |    (Shadow DOM + ARIA)    |                     |  - Crops ROI (downscaled <= 640px)        |  |
|  +---------------------------+                     +-------------------------------------------+  |
|                                                                          |                        |
|                                                      ImageBitmap (30 Hz) | Transfer               |
|                                                                          v                        |
|                                                    +-------------------------------------------+  |
|                                                    |         MEDIAPIPE VISION WORKER           |  |
|                                                    |  - Hand Landmarker (Dual-hand)            |  |
|                                                    |  - Pose Landmarker (Upper-body)           |  |
|                                                    |  - Deterministic v2 Feature Extractor     |  |
|                                                    |  - Output: 32x172 sequence @ 30 Hz        |  |
|                                                    +-------------------------------------------+  |
|                                                                          |                        |
+--------------------------------------------------------------------------|------------------------+
                                                                           |
                                              Authenticated WebSocket WS   | [32, 172] sequence
                                              ws://127.0.0.1:8000/ws/infer v
+---------------------------------------------------------------------------------------------------+
|                                     FASTAPI LOCAL BACKEND                                         |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |  Inference Engine (ml/runs/isl500-v2-remediated)                                            |  |
|  |  - Architecture: Custom 2-layer GRU with LayerNorm + Dropout                                |  |
|  |  - Output Classes: Family, Goodafternoon, NO_SIGN                                          |  |
|  |  - Prediction Filtering: Confidence >= 0.80, Consecutive Confirmation = 2, Cooldown 1500 ms   |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

### 3. Component Boundaries and Data Contracts

1. **Service Worker (`src/background/`)**:
   - Holds no persistent state in global variables.
   - Re-registers listeners synchronously on module scope (`onMessage`, `tabs.onRemoved`, `tabs.onUpdated`).
   - Obtains `streamId` via `chrome.tabCapture.getMediaStreamId({ targetTabId })`.
   - Creates/destroys offscreen document via `chrome.offscreen`.
   - Routes prediction events from Offscreen to Content Script in target meeting tab.

2. **Offscreen Document Engine (`src/offscreen/`)**:
   - Acquires the tab's MediaStream via `getUserMedia` using `chromeMediaSourceId`.
   - Renders video to hidden `<video>` element.
   - If ROI is selected: performs aspect-preserving crop and downscaling to $\le 640\text{px}$ width.
   - Extracts and transfers `ImageBitmap` to `vision-worker.js` at 30 Hz.
   - Forwards resulting 32-frame v2 feature windows to FastAPI backend over WebSocket.

3. **Content Script (`src/content/`)**:
   - Injected only into approved meeting origins (`https://meet.google.com/*`).
   - Remains completely inert until explicit user activation (never alters page DOM on initial load).
   - Encapsulates UI in closed/isolated **Shadow DOM** subtrees (`#signbridge-caption-host` and `#signbridge-roi-host`) to eliminate CSS collisions.
   - Provides drag, resize, theme toggle, font sizing, and accessibility `role="status"` live region.

4. **FastAPI Inference Backend (`backend/app/`)**:
   - Runs locally on loopback (`127.0.0.1`).
   - Enforces token authorization and protocol validation (`signbridge.inference.v1`).
   - Executes PyTorch model checkpoint `model.safetensors` on v2 `[32, 172]` temporal tensors.
   - Rejects unsupported signs through calibrated temperature scaling and explicit `NO_SIGN` class.

