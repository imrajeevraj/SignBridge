# Phase 4 — Testing and Acceptance Gates

### 1. Verification Test Matrix

The verification matrix covers unit tests, integration contracts, coordinate transformation logic, backend inference, and Playwright end-to-end browser tests:

| Test Suite | File / Scope | Tests Count | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Vitest Extension Suite** | `extension/tests/*.test.ts(x)` | **92 passed** (17 files) | **PASSED** | Covers ROI transform, ROI validator, meeting provider abstraction, caption overlay, meeting lifecycle, session management, and dashboard |
| **Node Diagnostic Tests** | `scripts/extraction-diagnostics.test.mjs` | **2 passed** | **PASSED** | Verifies sequence rejection, stride suppression, frame gaps, and non-monotonic timestamps |
| **FastAPI Backend Suite** | `backend/tests/test_*.py` | **62 passed** | **PASSED** | Verifies calibration, configuration, health endpoints, WebSocket inference, Safetensors loader, and v2 schemas |
| **Playwright E2E Suite** | `extension/e2e/*.spec.ts` | **5 passed** | **PASSED** | Real Chromium headless tests verifying MV3 extension loading, local inference, MediaPipe detector fixtures, simulated webcam, and Google Meet integration |
| **Package Validator** | `extension/scripts/validate-build.mjs` | **Validated** | **PASSED** | Asserts entrypoints, manifest CSP, classic content scripts, and local assets |

---

### 2. Meeting Mode E2E Acceptance (`meeting.spec.ts`)
The automated Playwright E2E test `extension/e2e/meeting.spec.ts` executes the complete meeting flow:
1. Launches Chromium with unpacked SignBridge AI extension.
2. Serves a simulated Google Meet tab (`https://meet.google.com/abc-defg-hij`).
3. Verifies content script is initially inert (zero DOM modifications).
4. Tests ROI selector overlay injection into Shadow DOM (`#signbridge-roi-host`).
5. Tests keyboard `Escape` dismissal of the ROI selector.
6. Injects floating live captions overlay into Shadow DOM (`#signbridge-caption-host`).
7. Delivers genuine model prediction `Goodafternoon (94%)` and verifies rendered text and confidence chip.
8. Verifies `NO_SIGN` and low-confidence predictions are rejected and do not overwrite captions.
9. Closes captions and verifies complete cleanup of Shadow DOM nodes from page.

