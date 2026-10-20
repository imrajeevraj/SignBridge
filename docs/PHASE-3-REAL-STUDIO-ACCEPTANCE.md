# Phase 3 Real Studio Acceptance Report

**Date:** 2026-10-20  
**Context:** SignBridge AI Phase 3 Remediation  
**Status:** **PASSED**  

---

## 1. Acceptance Gate Objective & Test Setup

The real-time webcam studio prediction delivery gate tests the full end-to-end integration:
$$\text{Real Video Stream} \longrightarrow \text{MediaPipe Hands \& Pose} \longrightarrow \text{v2 } [32, 172] \text{ Feature Window} \longrightarrow \text{Authenticated WebSocket} \longrightarrow \text{Trained GRU Checkpoint} \longrightarrow \text{Prediction Response} \longrightarrow \text{React Studio UI}$$

### Security and Isolation Invariants
- **Camera Safeguard:** Automated testing uses Chrome's `--use-fake-device-for-media-stream` and injects real video via canvas stream at native 1x playback. Physical cameras are never accessed without consenting signers.
- **Port Isolation:** Uvicorn FastAPI was spawned on loopback port `18000`, strictly preserving any existing user processes on ports 8000 and 5173.
- **Token & Origin Authorization:** An ephemeral 32-byte hex token and the exact unpacked extension origin (`chrome-extension://<id>`) were authorized via environment variables.

---

## 2. Replay Execution & Measurements

The real acceptance harness `scripts/verify-real-model.mjs` was executed with the remediated model package `ml/runs/isl500-v2-remediated`:

### Acceptance Test Summary

| Test Condition | Source Clip | Resolution | Processed FPS | Worker Latency | Buffer Peak | Sequence Emitted | Prediction Received | UI Label Rendered | Result |
|---|---|---|---:|---:|---:|---:|---|---|:---:|
| **Native Replay** | `User001-Family.mp4` | 2560×1440 | 18.0 FPS | 40.8 ms | **32 / 32** | **Yes (`[32, 172]`)** | **`Family` (1.00, 6.57 ms)** | **`Family`** | **PASS** |
| **Resized Replay** | `User001-Family.mp4` | 640×360 | 20.0 FPS | 36.0 ms | **32 / 32** | **Yes (`[32, 172]`)** | **`Family` (1.00, 15.74 ms)** | **`Family`** | **PASS** |
| **Additional Replay 1** | `User002-Family.mp4` | 2560×1440 | 18.5 FPS | 41.2 ms | 28 / 32 | No (sign ended) | N/A (Buffer reset on `no_hands`) | `No accepted sign` | Contract verified |
| **Additional Replay 2** | `User003-Goodafternoon.mp4` | 2560×1440 | 19.2 FPS | 39.5 ms | 17 / 32 | No (sign ended) | N/A (Buffer reset on `no_hands`) | `No accepted sign` | Contract verified |

---

## 3. Deep-Dive: Native 2560×1440 Real Replay

- **Source Video:** `User001-Family.mp4` (SHA-256: `97337f5357dca2738910d3798bbb839ae56c9c301f11c3b122dfef4db8764259`).
- **Total Frames Processed:** 77 frames across 4.2 seconds.
- **Worker Latencies:** Median turnaround 40.8 ms (Hand Landmarker 24.2 ms, Pose Landmarker 15.0 ms, Features 0.10 ms).
- **Buffer Accumulation:** Reached 32 continuous usable frames at $t = 2.4$ seconds with zero gap violations (>250 ms) and zero dropped hand frames.
- **WebSocket Transmission:**
  - Sent: `type: "predict"`, `schema_version: "signbridge.custom-gru.v2"`, `sequence_shape: [32, 172]`, `sampling_hz: 30`, `features: 5504 float32 values`.
  - Received:
    ```json
    {
      "type": "prediction",
      "protocol": "signbridge.inference.v1",
      "request_id": "window-1",
      "sequence_id": 1,
      "model_id": "signbridge-custom-gru",
      "label": "Family",
      "confidence": 1.0,
      "accepted": true,
      "reason": "ACCEPTED",
      "latency_ms": 6.57239998690784,
      "captured_at_ms": 1792470136297
    }
    ```
- **Studio Rendering:** The React RecognitionPanel rendered:
  - Strong label: **`Family`**
  - Recognition status: `Sign detected`
  - Camera status: `Camera active · Local landmarks only`
- **Clean Teardown:** Stop button clicked; camera stream tracks released; worker terminated; recognition state cleared to `'No accepted sign'`.
- **Evidence Artifact:** Screenshot saved to `.cache/phase3-studio-remediated-native/prerecorded-recognition.png`.

---

## 4. Deep-Dive: Uniform 640×360 Real Replay

- **Replay Setting:** `SIGNBRIDGE_REPLAY_WIDTH=640`.
- **Total Frames Processed:** 75 frames.
- **Processed FPS:** 20.0 FPS.
- **Worker Latencies:** Turnaround 36.0 ms.
- **Buffer Accumulation:** Reached 32 continuous usable frames.
- **Prediction Response:** `Family`, confidence `1.0`, accepted `true`, latency `15.74 ms`.
- **Studio Rendering:** Output rendered **`Family`** cleanly.
- **Evidence Artifact:** Screenshot saved to `.cache/phase3-studio-remediated-640/prerecorded-recognition.png`.

---

## 5. Contract Enforcement on Shorter Signing Strokes

Testing additional genuine clips demonstrated strict compliance with the Phase 3 data contracts:
- In `User002-Family.mp4`, the continuous signing stroke lasted 28 frames before the signer dropped their hands to rest position. The worker recorded `no_hands` at frame 29 and properly cleared the buffer to 0 frames.
- In `User003-Goodafternoon.mp4`, the signing stroke lasted 17 frames before transition. The buffer properly reset.
- Neither test fabricated frames, looped observations, or zero-padded the sequence.

**Conclusion:** The Real-Time Studio Prediction Delivery acceptance gate has **officially passed**.

