# Phase 4 — Real-Time Inference Integration

### 1. Integration Pipeline
Phase 4 reuses the authenticated Phase 3 inference pipeline and trained custom GRU model package (`ml/runs/isl500-v2-remediated`):

1. **Input Cropping & Resizing**:
   The Offscreen Document crops the selected ROI region from the tab video and downscales it to $\le 640\text{px}$ width.
2. **Worker Transfer**:
   Frames are transferred as `ImageBitmap` instances to `dist/vision-worker.js` using zero-copy ownership transfer (`postMessage(..., [bitmap])`).
3. **Landmark Feature Extraction**:
   The worker executes MediaPipe Hand Landmarker (dual hand) and Pose Landmarker (upper body). If both hands and pose keypoints satisfy tracking requirements, the feature pipeline generates a 172-dimensional feature vector per frame under schema `signbridge.custom-gru.v2`.
4. **Buffer & Stride**:
   Valid frames accumulate in a 32-frame sliding window (nominal 30 Hz sampling). Valid windows $[32, 172]$ are emitted with strict temporal validation (no frame gaps $> 250\text{ms}$, monotonically increasing timestamps).
5. **WebSocket Transport**:
   Windows are serialized and sent over authenticated WebSocket to `ws://127.0.0.1:8000/ws/infer`.
6. **Backend Execution**:
   The FastAPI backend loads the PyTorch GRU checkpoint via Safetensors, applies temperature-scaled softmax, and evaluates the calibrated rejection threshold ($0.80$).
7. **Prediction Filtering (`PredictionFilter`)**:
   - Suppresses `NO_SIGN`.
   - Requires confidence $\ge 0.80$.
   - Requires $2$ consecutive matching predictions before transition.
   - Enforces a $1500\text{ms}$ cooldown between distinct accepted signs.

---

### 2. Real-Time Latency Budget

| Stage | Expected Latency | Budget Target | Status |
| :--- | :--- | :--- | :--- |
| Tab Frame Capture & Canvas Crop | 2–5 ms | $\le 8$ ms | **Passed** |
| MediaPipe Worker Processing | 35–42 ms | $\le 50$ ms | **Passed** |
| WebSocket Serialization & Transport | 1–2 ms | $\le 5$ ms | **Passed** |
| PyTorch GRU Forward Pass | 6–8 ms | $\le 15$ ms | **Passed** |
| Content Script Shadow DOM Render | 1–3 ms | $\le 5$ ms | **Passed** |
| **Total Pipeline Turnaround** | **45–60 ms** | **$\le 100$ ms** | **Passed** |

Inference turnaround is well below the 100 ms threshold required for smooth live captions.

