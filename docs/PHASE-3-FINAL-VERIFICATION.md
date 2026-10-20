# Phase 3 Final Verification Report (Remediated) — 2026-10-20

**Overall Status:** **PHASE 3 COMPLETE (Automated Gates Passed).**  
Both previously failed acceptance gates — **Real-Time Webcam Studio Prediction Delivery** and **Unsupported Sign Rejection** — have been resolved, verified, and empirically validated.

Physical webcam acceptance with consenting real signers remains a post-automated-testing requirement before deployment, as automated test suites must never activate physical camera hardware.

---

## 1. Acceptance Gates Summary

| Acceptance Gate | Baseline State (Prior Run) | Remediated State (Current Run) | Final Verdict |
|---|---|---|:---:|
| **1. Genuine Compatible Trained Model** | `ml/runs/isl500-v2-pilot` (2-class, v2 `[32, 172]`, strict safetensors) | `ml/runs/isl500-v2-remediated` (3-class with `NO_SIGN`, v2 `[32, 172]`, 30 Hz, strict safetensors) | **PASS** |
| **2. Real Labeled Data & Held-Out Evaluation** | 15 train, 6 val, 4 test clips; 4/4 known test clips correct | 19 train, 8 val, 4 test clips (31 clips across 13 signers); 4/4 held-out test clips correct (100% Top-1) | **PASS** |
| **3. Real Backend Inference** | Authenticated FastAPI WebSocket parity verified on port 18000 | Remediated model verified on loopback port 18000; latency median 6.57 ms | **PASS** |
| **4. Webcam Studio Prediction Delivery** | **FAIL**: 0 valid windows, 0 predictions, 210 ms latency | **PASS**: 32-frame valid windows emitted in native (2560×1440) and 640×360 replay; prediction (`Family`, 1.00) rendered in UI | **PASS** |
| **5. Unsupported Sign Rejection** | **FAIL**: 11/11 unsupported test windows falsely accepted (100% FAR) | **PASS**: 0/11 test windows falsely accepted (**0.0% FAR**); 0/6 validation windows falsely accepted (**0.0% FAR**) | **PASS** |
| **6. Automated Regression Tests** | 63 Vitest, 62 Pytest, 2 Node diagnostic, 4 Chromium E2E | 63 Vitest, 62 Pytest, 2 Node diagnostic, 4 Chromium E2E; strict TypeScript & MV3 package validation | **PASS** |
| **7. Physical-Camera & Unseen-Signer Boundary** | Physical camera not activated; limitation recorded | Preserved: automated tests use Chromium fake stream and genuine replay; real hardware acceptance documented as pending | **PASS (Doc)** |

---

## 2. Key Remediation Evidence

### A. Real-Time Studio Acceptance (Gate 4)
- **Root Cause Identified:** Native 2560×1440 uncompressed bitmap transfer (14.7 MB) and single-threaded CPU WASM inference (~100 ms) dropped frames against a 33 ms stream interval, limiting throughput to 10 FPS. Bounded ISL active signing strokes (~2.2 s) resulted in hand drops (`no_hands`) resetting the buffer before reaching 32 frames.
- **Optimizations Implemented:** Input downscaling to max width 640 in `Webcam.tsx` and MediaPipe GPU delegate with automatic CPU fallback in `vision-worker.ts`.
- **Outcome:** Worker turnaround reduced from 210 ms to **40.8 ms** (native) and **36.0 ms** (640).
- **Execution:** Complete 32-frame valid windows accumulated in real-time replay, WebSocket predict request dispatched, genuine prediction response received (`label: "Family"`, `confidence: 1.0`, `latency_ms: 6.57 ms`), and studio UI rendered `"Family"` with `'Sign detected'`.
- **Full Report:** [`docs/PHASE-3-REAL-STUDIO-ACCEPTANCE.md`](PHASE-3-REAL-STUDIO-ACCEPTANCE.md).

### B. Unsupported Sign Rejection (Gate 5)
- **Root Cause Identified:** 2-class softmax hyperplane forced any non-Family sign (including ISL compound signs sharing the "Good-" prefix like `Goodevening` and `Goodnight`) into the positive `Goodafternoon` half-space with saturation confidence >0.9999.
- **Architectural Solution:** Retrained GRU with genuine ISL500 negative/neutral samples (`Sit`, `Water`, and non-target `Goodmorning`) under `neutral_label: "NO_SIGN"` with class-balanced cross-entropy weights and calibrated confidence threshold 0.80.
- **Outcome on Untouched Test Split:**
  - `User013-Goodevening` (4 windows): 4 / 4 classified as `NO_SIGN` $\implies$ **0 false acceptances**.
  - `User013-Goodnight` (7 windows): 7 / 7 classified as `NO_SIGN` $\implies$ **0 false acceptances**.
  - Test split false acceptance rate dropped from **100% (11/11)** to **0.0% (0/11)**.
- **Full Report:** [`docs/PHASE-3-OPEN-SET-EVALUATION.md`](PHASE-3-OPEN-SET-EVALUATION.md).

---

## 3. Automated Test Suite Execution Log

All regressions executed cleanly on Windows (Node v20.20.0, Python 3.11.9, Chrome for Testing 155.0.8059.84):

1. **`npm run validate`:**
   - Strict TypeScript check: 0 errors.
   - Vitest unit tests: 63 passed across 13 test files.
   - Extraction diagnostics tests: 2 passed.
   - Vite extension build: production bundle validated for MV3 CSP, classic content script, and local WASM/model assets.
2. **`npm run backend:test`:**
   - 62 Pytest tests passed in 22.9s.
   - Covers v1/v2 schema validation, landmark masks, 250 ms gaps, token authorization, registry lifecycles, and backpressure.
3. **`npm run test:e2e`:**
   - 4 Chromium end-to-end integration tests passed on isolated port 18000:
     - `extension.spec.ts`: MV3 extension unpacking, health check, settings.
     - `inference.spec.ts`: WebSocket CSP, explicit auth, studio controls.
     - `landmarks.spec.ts`: Local detector output on test fixtures.
     - `webcam.spec.ts`: Camera consent, start/stop, hidden-tab teardown, denial handling.

---

## 4. Preservation of Invariants & Historical Records

- **No Breaking Contract Changes:** `signbridge.custom-gru.v1` (`[32, 161]`, 15 Hz) and `signbridge.custom-gru.v2` (`[32, 172]`, 30 Hz) remain intact.
- **Historical Evidence Preserved:** The baseline model package (`ml/runs/isl500-v2-pilot`) and earlier Phase 1/2 verification records remain preserved in git history and filesystem.
- **Zero Phase 4 Leakage:** No meeting caption overlays, signer bounding-box ROI, or background tab capture were added.
- **No Resource Collisions:** Isolated port 18000 was used for all test backend spawns; unrelated processes on ports 8000 and 5173 were never touched.

---

## 5. Remediation Documentation Index

1. [Performance Root-Cause Analysis](PHASE-3-PERFORMANCE-ROOT-CAUSE.md) — Detailed latency breakdown across detectors, IPC, and buffer mechanics.
2. [Runtime Optimization Report](PHASE-3-RUNTIME-OPTIMIZATION.md) — Pre-worker scaling and WebGL GPU delegate implementation.
3. [Open-Set Rejection Report](PHASE-3-OPEN-SET-EVALUATION.md) — Hyperplane analysis, negative class training, and untouched test split metrics.
4. [Model Retraining Report](PHASE-3-RETRAINING-RESULTS.md) — Package metadata, training dynamics, and held-out signer recognition.
5. [Real Studio Acceptance Report](PHASE-3-REAL-STUDIO-ACCEPTANCE.md) — Replay measurements, screenshots, and WebSocket protocol logs.
