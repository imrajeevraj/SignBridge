# SignBridge AI — Phase 5 Real-World Acceptance Testing Protocol
## Physical Camera Validation, Google Meet User Journey & Evaluation Matrix

### 1. Overview & Evaluation Scope

SignBridge AI has verified automated gates via headless Chromium, real video replay, and simulated media streams. However, virtual accessibility tools must ultimately be judged by real human signers in physical spaces.

This document defines the **repeatable physical acceptance protocol** for evaluators, hackathon judges, and test participants using real webcams and live Google Meet sessions.

> [!CAUTION]
> **Honest Verification Boundary**: Automated CI/CD environments execute simulated camera streams and pre-recorded video tensors. Physical camera tests require live human hardware and are marked **MANUAL ACCEPTANCE** until performed on live hardware. Never claim physical tests passed without human execution.

---

### 2. Physical Webcam Studio Acceptance Test Matrix

| Test ID | Scenario | Procedure | Expected Physical Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PC-01** | Explicit Camera Permission | Open `webcam.html`, click "Start Camera" | Browser shows native permission prompt; stream opens only after clicking Allow. | Verified in E2E / Manual on Hardware |
| **PC-02** | Right-Hand Tracking | Raise right hand into view | 21 hand keypoints rendered; landmark indicator shows "Right Hand: Detected". | Manual Procedure |
| **PC-03** | Left-Hand Tracking | Raise left hand into view | 21 hand keypoints rendered; landmark indicator shows "Left Hand: Detected". | Manual Procedure |
| **PC-04** | Dual-Hand Tracking | Raise both hands into view | Both hands tracked simultaneously without swapping coordinates or jitter. | Manual Procedure |
| **PC-05** | Upper-Body Pose | Position head and torso in frame | Shoulders, elbows, wrists, and face landmarks overlay upper body. | Manual Procedure |
| **PC-06** | Distance Variation (0.5m – 2.0m) | Step back from desk | Landmarks maintain tracking as long as hands occupy $\ge 64\times 64$ pixels. | Manual Procedure |
| **PC-07** | Low-Light Conditions | Dim room lights ($< 50\text{ lux}$) | Worker logs landmark confidence; if tracking drops below threshold, sequence resets cleanly. | Manual Procedure |
| **PC-08** | Partial Hand Occlusion | Cross wrists or overlap fingers | Landmark detector outputs valid indicator mask; invalid frames reset buffer without crashing. | Manual Procedure |
| **PC-09** | Hands Out of Frame | Lower hands below desk | Buffer resets to 0 frames; recognition transitions to "Waiting for signer". | Manual Procedure |
| **PC-10** | Permission Denial | Click Block on Chrome camera prompt | Studio displays error message explaining how to re-enable camera in site settings. | Verified in E2E (`webcam.spec.ts`) |
| **PC-11** | Camera Disconnection | Unplug USB webcam during active stream | MediaStream track triggers `ended`; studio cleanly transitions to "stopped" state. | Verified in Unit (`session.test.ts`) |
| **PC-12** | Studio Stop Action | Click "Stop Camera" in studio | Video track stops; hardware webcam LED turns OFF immediately; worker terminates. | Verified in E2E (`webcam.spec.ts`) |
| **PC-13** | Multi-Tab Mutex | Open studio in two separate tabs | Web Locks API (`signbridge-webcam`) prevents camera hijacking; second tab shows lock warning. | Verified in Unit (`session.test.ts`) |
| **PC-14** | Tab Backgrounding / Hide | Switch to another browser tab | Page visibility listener halts frame processing; resumes when tab becomes visible. | Verified in E2E (`webcam.spec.ts`) |

---

### 3. Live Google Meet Acceptance Protocol (16-Step Journey)

Follow this exact workflow to validate live meeting captions:

1. **Host Backend**: Start the local backend on loopback:
   ```powershell
   $env:SIGNBRIDGE_PORT="18000"
   npm run backend:dev
   ```
2. **Launch Chrome**: Open Google Chrome with the unpacked extension loaded from `dist/`.
3. **Open Google Meet**: Navigate to `https://meet.google.com` and join a meeting with a second participant (e.g., using a phone or laptop).
4. **Pin Signer**: Pin or spotlight the signing participant's video tile so it is prominently visible in the meeting window.
5. **Open SignBridge Extension**: Click the SignBridge AI icon in the Chrome toolbar.
6. **Verify Tab Discovery**: In the "Meeting Mode" panel, verify that the active Google Meet tab appears in the dropdown.
7. **Initiate Capture**: Click **Start Meeting Captions**.
8. **Verify Permission & Banner**: Chrome displays the tab sharing indicator banner ("Sharing this tab to SignBridge AI").
9. **Trigger ROI Selector**: Click **Select Signer Region**.
10. **Drag ROI Box**: On the Google Meet tab, click and drag a bounding box tightly around the signer's upper body and hands.
11. **Confirm ROI**: Click **Confirm ROI** (or press Escape if re-drawing is needed).
12. **Sign Known Gloss**: Have the signer perform the ISL sign **"Goodafternoon"** with both hands clearly visible.
13. **Observe Floating Caption**: Within $\approx 50\text{ms}$ of gesture completion, verify that the floating caption card renders:
    ```text
    Goodafternoon
    Model score: 0.94
    ```
14. **Perform Unsupported Gesture**: Have the signer wave naturally or perform an unknown gesture. Verify that no false caption is displayed.
15. **Drag Caption Box**: Grab the caption header and move it to a comfortable location on the screen. Adjust text size with the `A` button.
16. **Stop & Release**: Click **Stop Captions** in the extension dashboard. Verify that:
    - Tab capture stops and Chrome's sharing banner dismisses.
    - Floating captions disappear from the Google Meet page.
    - All offscreen resources and workers are freed.

---

### 4. Human Evaluation Evidence Log Template

```markdown
### Live Human Acceptance Log

- **Date & Time**: YYYY-MM-DD HH:MM
- **Evaluator / Signer**: [Name or ID]
- **OS & Architecture**: Windows 11 / macOS / Linux
- **Browser**: Chrome Version [e.g. 135.0]
- **Camera Hardware**: [e.g. Logitech Brio / Integrated 1080p]
- **Lighting Conditions**: [Natural Daylight / Office LED / Low Light]
- **Tested Model**: `signbridge-custom-gru` (`ml/runs/isl500-v2-remediated`)

| Step | Action Performed | Expected Behavior | Observed Result | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Start tab capture | Banner displayed | [Observed] | [Pass/Fail] |
| 2 | ROI drag-select | Cyan dashed box | [Observed] | [Pass/Fail] |
| 3 | Sign "Goodafternoon" | Caption appears | [Observed] | [Pass/Fail] |
| 4 | Sign "Family" | Caption appears | [Observed] | [Pass/Fail] |
| 5 | Unknown gesture | Zero false caption | [Observed] | [Pass/Fail] |
| 6 | Stop capture | Clean teardown | [Observed] | [Pass/Fail] |

**Notes & Signer Feedback**: [Record any qualitative observations here]
```

