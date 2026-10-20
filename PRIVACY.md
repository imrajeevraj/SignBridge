# SignBridge AI — Privacy Policy & Data Governance

**Last Updated:** October 2026  
**Scope:** SignBridge AI Chrome Extension, Local Offscreen Capture & Local Inference Backend

---

### 1. Fundamental Privacy Guarantee: Zero Cloud Transmission

SignBridge AI is designed with an uncompromising **local-first, privacy-by-design** architecture:

- **No Remote Video or Image Upload**: Captured video frames from your webcam or meeting tab are processed strictly on your computer's CPU/GPU by local WebAssembly and local background services. No images, video clips, or raw pixel data are ever uploaded to cloud servers or third parties.
- **No Audio Capture**: SignBridge AI does not request, capture, or process audio or microphone streams. Meeting conversations are never recorded or listened to.
- **No Cloud Inference**: All machine learning inference runs locally via an authenticated loopback WebSocket connection (`127.0.0.1`).
- **No Persistent Biometrics**: Landmark keypoints (hand and pose coordinates) are transiently held in volatile memory only for the duration of the 32-frame recognition window ($~1.06\text{ seconds}$). They are never written to disk, saved in databases, or correlated with user identities.
- **No Tracking or Third-Party Analytics**: SignBridge AI contains zero telemetry SDKs, zero analytics trackers, and zero external tracking scripts.

---

### 2. Permissions & Justification

| Permission | Purpose & Scope |
| :--- | :--- |
| `storage` | Stores your local user preferences (selected sign language, caption font size, appearance theme). Restricted to trusted extension contexts. |
| `tabCapture` | Allows capturing the visual video stream of a single Google Meet tab chosen explicitly by you in the dashboard. |
| `offscreen` | Creates a sandboxed offscreen canvas to crop the selected signer's region of interest without opening auxiliary desktop windows. |
| `activeTab` | Grants temporary authority to display the live caption overlay in the active meeting tab during a capture session. |
| `tabs` | Used solely to enumerate active meeting tabs so you can select which call to caption. |

---

### 3. User Consent & Lifecycle Control

- **Opt-In Capture**: Video capture never begins automatically. It requires your explicit click on "Start Meeting Captions" or "Start Camera" in the studio.
- **Immediate Teardown**: Clicking "Stop Captions" or closing the meeting tab instantly destroys all media tracks, terminates worker threads, clears feature buffers, and removes caption overlays from the web page.

---

### 4. Open-Source Transparency

All code for SignBridge AI is open for review. You can inspect network activity in Chrome's Developer Tools (`chrome://extensions`) to verify that zero external network requests are made during live captioning sessions.

