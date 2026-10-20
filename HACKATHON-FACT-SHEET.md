# SignBridge AI — Microsoft Hackathon Fact Sheet
## AI-Powered Real-Time Indian Sign Language Meeting Captions

---

### 1. The Accessibility Problem
Virtual meetings on Google Meet, Microsoft Teams, and Zoom provide automated captions for spoken audio, but offer **zero built-in support for sign language speakers**. Deaf and hard-of-hearing signers who communicate through sign language are left excluded without an expensive human sign language interpreter present in every call.

---

### 2. The SignBridge AI Solution
SignBridge AI is a lightweight browser extension and local AI inference engine that recognizes Indian Sign Language (ISL) gestures in real time from participant video streams and renders floating, accessible live captions directly inside the meeting.

---

### 3. Core Architecture & Technologies
- **Browser Extension**: Manifest V3, React 19, TypeScript, Vite, Tailwind CSS.
- **Client-Side Computer Vision**: MediaPipe Hand Landmarker (dual hand) + Pose Landmarker (upper body) running in local WebAssembly Web Workers.
- **Single-Signer ROI Cropper**: Aspect-preserving normalized $[0, 1]$ coordinate selection, invariant to display zoom and screen resolution.
- **Recognition Neural Network**: PyTorch custom 2-layer Gated Recurrent Unit (GRU) with LayerNorm and Dropout (223,747 parameters).
- **Inference Runtime**: Local FastAPI backend running over authenticated loopback WebSocket (`ws://127.0.0.1:8000/ws/infer`).
- **Live Caption Overlay**: Accessible floating panel mounted inside an isolated Shadow DOM with WAI-ARIA live region attributes.

---

### 4. Technical Specifications & Verified Metrics

| Metric | Specification / Measured Result |
| :--- | :--- |
| **Supported Language** | Indian Sign Language (ISL) |
| **Active Feature Schema** | `signbridge.custom-gru.v2` ($[32, 172]$ temporal sequence, 30 Hz nominal) |
| **Active Vocabulary** | `Family`, `Goodafternoon`, plus dedicated `NO_SIGN` neutral sink |
| **Closed-Set Top-1 Accuracy** | **100% (4 / 4 held-out test clips, 16 / 16 windows)** |
| **Open-Set Rejection Rate** | **0.0% False Acceptance Rate** (0 / 11 held-out unknown windows accepted) |
| **Decision Threshold** | Calibrated threshold $\tau = 0.80$ with temperature scaling $T = 0.50$ |
| **Model Forward Pass Latency** | **Median 6.57 ms** (CPU loopback) |
| **End-to-End Latency** | **Median 48.5 ms** (frame crop to live caption render) |
| **Effective Frame Rate** | **$27.8 \pm 1.2\text{ FPS}$** (one-frame-in-flight bounded queue) |
| **Tested Browser Compatibility** | **Google Chrome & Microsoft Edge** (Version 120+) |

---

### 5. Automated Regression Test Suite (163 Tests Passed)
- **Vitest Extension Suite**: 92 passed across 17 test files.
- **FastAPI Pytest Suite**: 62 passed.
- **Node Diagnostic Suite**: 2 passed.
- **Playwright Headless Browser Tests**: 6 passed (including `edge.spec.ts` and `meeting.spec.ts`).
- **Manifest & Asset Package Validation**: Passed.

---

### 6. Privacy & Security By Design
- **Zero Cloud Upload**: 100% of video processing, landmark extraction, and model inference occur strictly on the user's local machine (`127.0.0.1`).
- **Audio Strictly Excluded**: MediaStream requests explicitly set `{ audio: false }`. No microphone access is ever requested or used.
- **No Persistent Biometrics**: Facial and hand coordinates exist only in transient memory during sliding window computation ($~1.06\text{s}$) and are never saved to disk.
- **No Third-Party Analytics**: Zero telemetry, tracking, or cloud SDKs.

---

### 7. Future Roadmap & Microsoft Ecosystem Potential
1. **Microsoft Teams Web Integration**: Clean provider abstraction exists; DOM grid mapping planned for Phase 6.
2. **Vocabulary Expansion**: Expanding vocabulary from pilot glosses to a 100+ word conversational ISL dictionary.
3. **Multi-Signer Support**: Automated visual speaker diarization to switch ROI focus dynamically as different participants take turns signing.

