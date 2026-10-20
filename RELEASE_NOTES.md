# SignBridge AI — Phase 5 Release Notes
## Version 0.3.0 · Microsoft Hackathon Edition

### Highlights & New Capabilities

1. **Google Meet Web Live AI Captions**:
   - Integrates directly with Google Meet calls through Chrome Manifest V3 `chrome.tabCapture` and offscreen processing.
   - Automatically detects open meeting tabs and injects floating, draggable live captions rendered inside isolated Shadow DOM roots.

2. **Single-Signer Region of Interest (ROI) Selector**:
   - Interactive, non-destructive drag-to-select overlay that lets users tightly focus on the active signer's video tile.
   - Normalized $[0, 1]$ coordinate math is completely invariant to browser zoom, display DPI, and meeting window dimensions.

3. **Production Hardening & Edge Compatibility**:
   - **Microsoft Edge Verified**: Fully tested and verified operational on Microsoft Edge 155 (Windows 11) using Playwright.
   - **Provider Architecture**: Clean provider interface ([`MeetingPlatformAdapter`](file:///d:/SignBridge%20AI/extension/src/providers/meeting-provider.ts)) ready for future Microsoft Teams Web integration.

4. **Accessibility (WCAG 2.2 Level AA)**:
   - High-contrast dark and light themes (contrast ratios $> 12:1$).
   - On-card font size toggle ($16\text{px}$, $22\text{px}$, $28\text{px}$).
   - W3C WAI-ARIA `role="status"` and `aria-live="polite"` announcements for assistive technologies.
   - Explicit reduced-motion CSS query (`prefers-reduced-motion: reduce`).

5. **AI Reliability & Truthful Score Representation**:
   - Features active 2-layer custom GRU (`ml/runs/isl500-v2-remediated`, Safetensors format, 223,747 parameters).
   - Rejection threshold ($\tau = 0.80$) and dedicated `NO_SIGN` sink guarantee 0.0% false acceptance on held-out unknown signs.
   - Terminology updated to transparently display **Model Score** ($0.0$ – $1.0$) rather than uncalibrated accuracy percentages.

6. **Automated Verification Suite (163 Tests Passed)**:
   - 92 Vitest unit and component tests
   - 62 FastAPI Pytest backend tests
   - 2 Node extraction diagnostic tests
   - 6 Playwright E2E browser tests (including Edge and Google Meet)
   - Manifest V3 package validation

---

### Security & Privacy Commitments
- **Zero Cloud Media Transmission**: 100% local processing on loopback `127.0.0.1`.
- **Zero Audio Permissions**: No microphone or audio access.
- **Transient Landmark Buffers**: Coordinates discarded after 32-frame sliding window computation.
- **Immediate Cleanup**: Media streams and workers terminate instantly on Stop or tab close.

