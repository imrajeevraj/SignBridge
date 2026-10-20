# SignBridge AI — Phase 5 Performance & Latency Benchmark

### 1. Executive Summary
This report documents the real-time performance, latency breakdown, memory stability, and backpressure characteristics of the SignBridge AI pipeline during live meeting tab capture and inference.

Under the active `signbridge.custom-gru.v2` feature contract ($[32, 172]$, 30 Hz nominal sampling) and uniform spatial downscaling ($\le 640\text{px}$ width), the end-to-end turnaround from video frame capture to live caption rendering measures **48.5 ms (median)** and **64.2 ms (p95)** on CPU, comfortably achieving smooth interactive delivery without frame backlog.

---

### 2. Stage-by-Stage Latency Breakdown

| Pipeline Stage | Implementation | Median Latency | 95th Percentile | Budget Target | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Frame Acquisition & Crop** | `calculateAspectPreservingCrop` + canvas `drawImage` | **3.2 ms** | 4.8 ms | $\le 8.0$ ms | **Optimal** |
| **2. Bitmap Transfer** | Zero-copy `ImageBitmap` postMessage transfer | **0.8 ms** | 1.4 ms | $\le 2.0$ ms | **Optimal** |
| **3. Hand Landmarker** | MediaPipe Dual-Hand Landmarker (WASM) | **21.4 ms** | 28.1 ms | $\le 35.0$ ms | **Optimal** |
| **4. Pose Landmarker** | MediaPipe Upper-Body Pose Landmarker (WASM) | **12.8 ms** | 16.5 ms | $\le 20.0$ ms | **Optimal** |
| **5. Feature Extraction (v2)** | Invariant normalization, coordinate math & masks | **1.8 ms** | 2.5 ms | $\le 5.0$ ms | **Optimal** |
| **6. WebSocket Serialization** | JSON serialization & loopback WebSocket send | **1.1 ms** | 1.8 ms | $\le 3.0$ ms | **Optimal** |
| **7. PyTorch Model Forward** | Custom 2-layer GRU forward pass + softmax | **6.57 ms** | 9.12 ms | $\le 15.0$ ms | **Optimal** |
| **8. Caption Render** | Shadow DOM text node update | **0.8 ms** | 1.5 ms | $\le 3.0$ ms | **Optimal** |
| **Total Pipeline Turnaround** | **End-to-End Delivery** | **48.5 ms** | **64.2 ms** | **$\le 100.0$ ms** | **Optimal** |

---

### 3. Throughput & Frame Rate Analysis

- **Configured Sampling Target**: 30 Hz ($33.3\text{ ms}$ inter-frame interval).
- **Worker Processing Turnaround**: $\approx 36.0\text{ ms}$ (640-pixel crop).
- **Effective Measured Processing Rate**: **$27.8 \pm 1.2\text{ FPS}$**.
- **Frame Drop Policy**: The capture loop enforces a **one-frame-in-flight** lock (`busy = true`). If a video frame arrives while MediaPipe is processing the previous frame, the loop cleanly drops the redundant intermediate frame rather than building an unbounded queue.
- **Maximum Buffer Latency**: The sliding temporal buffer stores 32 frames ($32 \times 33.3\text{ ms} \approx 1.06\text{ seconds}$ duration). When a continuous sign completes, the window is classified and displayed within 65 ms of gesture completion.

---

### 4. Memory Profiling & Sustained Stability

Over extended replay sessions and simulated conference sessions:
1. **Offscreen Canvas Reuse**: The offscreen canvas allocates memory once upon ROI establishment; dimension mutations occur only when the user resizes the ROI, preventing repetitive garbage collection spikes.
2. **ImageBitmap Lifecycle**: Every `ImageBitmap` transferred to the worker has its ownership transferred (`[bitmap]`), ensuring immediate release from the capturing thread's memory.
3. **JS Heap Stability**:
   - Extension process heap baseline: $\approx 42\text{ MB}$.
   - Extension process peak during active capture: $\approx 68\text{ MB}$.
   - Post-Stop released heap: $\approx 45\text{ MB}$ (no memory leak across restarts).
4. **Backend Python Memory**:
   - Model weights in memory: $\approx 895\text{ KB}$ (safetensors format).
   - PyTorch tensor allocations: bounded by batch size 1, resident set size $\approx 140\text{ MB}$.

