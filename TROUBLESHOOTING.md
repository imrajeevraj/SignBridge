# SignBridge AI — Troubleshooting Guide

### 1. Port Conflicts (Port 8000 Already in Use)
- **Symptom**: `OSError: [Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)`
- **Solution**: Do NOT terminate unrelated applications running on port 8000. Use port 18000:
  ```powershell
  # 1. Rebuild extension targeting port 18000
  $env:VITE_BACKEND_PORT="18000"
  npm run build

  # 2. Run backend on port 18000
  $env:SIGNBRIDGE_PORT="18000"
  npm run backend:dev
  ```

---

### 2. Camera Access Denied in Webcam Studio
- **Symptom**: "Camera permission was denied. Allow this extension in Chrome's camera settings."
- **Solution**:
  1. In Chrome/Edge, open `chrome://settings/content/camera` (or `edge://settings/content/camera`).
  2. Verify that camera access is enabled for extensions.
  3. Reopen `webcam.html` and click "Start Camera", then click "Allow" on the browser prompt.

---

### 3. Model Shows "Not Loaded" or "Unavailable"
- **Symptom**: Dashboard shows "Sign model: Unavailable" or "Not Installed".
- **Solution**:
  1. Ensure `ml/runs/isl500-v2-remediated/weights.safetensors` exists.
  2. When starting the backend, specify the model directory if not using default:
     ```powershell
     $env:SIGNBRIDGE_MODEL_DIR="ml/runs/isl500-v2-remediated"
     npm run backend:dev
     ```
  3. Check `http://127.0.0.1:18000/model/info` to confirm `available: true`.

---

### 4. Google Meet Tab Not Appearing in Dropdown
- **Symptom**: Dashboard dropdown says "No active Google Meet tab detected".
- **Solution**:
  1. Confirm that Google Meet is open in an active browser tab with URL matching `https://meet.google.com/*`.
  2. Click the **Refresh** icon next to the dropdown in the Meeting Mode panel.
  3. Ensure the extension has the `"tabs"` permission loaded in `chrome://extensions`.

---

### 5. Captions Disappear After 4–5 Seconds
- **Expected Behavior**: Captions feature an intentional 4.5-second idle timeout to prevent stale sign labels from permanently obstructing the video call once a gesture has concluded. New predictions immediately reappear upon signing.

---

### 6. MediaPipe Assets Missing
- **Symptom**: "Local models did not load within 30 seconds."
- **Solution**: Run `npm run assets:setup` to fetch the verified task assets (`hand_landmarker.task`, `pose_landmarker.task`).

