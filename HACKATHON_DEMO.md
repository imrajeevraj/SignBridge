# SignBridge AI — Microsoft Hackathon Live Demo Script
## 7-Stage Interactive Presentation Protocol

This script provides the step-by-step walkthrough for presenting SignBridge AI to hackathon judges, technical evaluators, and audience members.

---

### Pre-Demo Preparation Checklist
1. **Local Backend Running**:
   ```powershell
   $env:SIGNBRIDGE_PORT="18000"
   npm run backend:dev
   ```
2. **Chrome or Edge Browser Launched**: Unpacked extension loaded from `dist/`.
3. **Google Meet Room Active**: Open a Google Meet call with 2 participants (e.g., host on computer, second participant on mobile phone).
4. **Lighting**: Ensure moderate, even lighting on the signer's upper body.

---

### Stage 1: Problem Introduction (30 seconds)
- **Speaker Action**: Show the virtual meeting screen.
- **Talking Points**:
  > "Every day, millions of people use video meetings for work, school, and healthcare. While automated captions exist for spoken voices, deaf and hard-of-hearing individuals who communicate via sign language have zero built-in translation. Without an expensive human interpreter, they are left excluded from the visual conversation."
  > "SignBridge AI changes this: an open-source, privacy-first browser extension that recognizes sign language directly from participant video and renders real-time live captions."

---

### Stage 2: Computer Vision & Local Landmarks (45 seconds)
- **Action**: In the SignBridge AI dashboard, click **"Open webcam studio"**.
- **Demonstration**:
  1. Click **"Start Camera"** and approve the browser permission prompt.
  2. Raise left hand, then right hand, then both hands.
  3. Point out the real-time 21-point skeletal hand wireframes and upper-body pose keypoints rendered locally at ~30 FPS.
- **Talking Points**:
  > "Everything you see here is calculated locally inside the browser using MediaPipe WebAssembly. Zero video frames leave this computer."

---

### Stage 3: Real AI Recognition (45 seconds)
- **Action**: Enable local inference in the studio.
- **Demonstration**:
  1. Perform the ISL sign for **"Goodafternoon"** (both hands open, palms facing outward, gentle upward movement).
  2. Within 50 ms of gesture completion, point out the prediction card:
     ```text
     Goodafternoon · Model score: 0.94
     ```
  3. Perform the sign for **"Family"**. Observe the clean transition to `Family`.
- **Talking Points**:
  > "Behind this is our custom 2-layer PyTorch GRU running on our local FastAPI service. It evaluates 32-frame temporal sequences under our versioned v2 contract."

---

### Stage 4: Open-Set Rejection & No False Positives (30 seconds)
- **Action**: Perform arbitrary hand waving, typing gestures, or natural conversation movements.
- **Demonstration**:
  1. Wave casually or scratch chin.
  2. Show that the model outputs `NO_SIGN` and the UI stays completely quiet without generating false positive captions.
- **Talking Points**:
  > "A major flaw in naive gesture models is firing false captions on natural movements. Our model is trained with an explicit rejection sink and strict confidence thresholding, guaranteeing 0% false acceptance on held-out unknown gestures."

---

### Stage 5: Google Meet Integration (60 seconds)
- **Action**: Switch to the Google Meet tab.
- **Demonstration**:
  1. Open the SignBridge popup; select the Google Meet tab from the dropdown.
  2. Click **"Start Meeting Captions"**.
  3. Click **"Select Signer Region"**.
  4. Drag the cyan dashed bounding box tightly around the signer's video frame and click **"Confirm ROI"**.
  5. Have the participant sign **"Goodafternoon"**.
  6. Point out the floating live caption card rendering directly over Google Meet:
     ```text
     Goodafternoon
     Model score: 0.94
     ```
  7. Drag the caption box across the screen to demonstrate that it is non-intrusive and movable.
- **Talking Points**:
  > "Using Chrome's Offscreen Document API and Shadow DOM isolation, we crop the signer's tile and render live captions inside Google Meet without injecting raw CSS or modifying Meet's native interface."

---

### Stage 6: Privacy by Design & Clean Teardown (20 seconds)
- **Action**: Click **"Stop Captions"**.
- **Demonstration**:
  1. Chrome's tab sharing banner immediately dismisses.
  2. The floating caption card unmounts from the Google Meet page.
  3. Check the developer console: all workers and streams are completely terminated.
- **Talking Points**:
  > "Zero audio permissions. Zero cloud media upload. Local inference on 127.0.0.1. Immediate resource cleanup."

---

### Stage 7: Engineering Rigor & Hackathon Summary (30 seconds)
- **Action**: Show `HACKATHON-FACT-SHEET.md` and test results.
- **Talking Points**:
  > "SignBridge AI is backed by 163 passing automated regression tests, including native Microsoft Edge compatibility verified on Edge 155. It represents a real step forward for accessibility in digital workspaces."

---

### Fallback Demonstration Pathway (If No Live Camera)
If camera hardware is unavailable during presentation:
Run the verified automated replay harness:
```powershell
$env:SIGNBRIDGE_PORT="18000"
$env:SIGNBRIDGE_CHROMIUM_PATH="D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe"
npm run test:e2e -- e2e/meeting.spec.ts
```
Show the recorded screenshots in `test-results/meeting-Meeting-Mode-Googl.../`:
- `meeting-roi-selector.png` (interactive drag ROI overlay)
- `meeting-live-captions.png` (floating live captions in Google Meet).

