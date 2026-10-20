# Phase 4 — Chrome MV3 Tab Capture & Offscreen Document Specification

### 1. Overview
In Manifest V3, background service workers do not have direct access to DOM APIs or `navigator.mediaDevices.getUserMedia`. To capture an active Google Meet video stream while preserving user privacy and strict sandboxing, SignBridge AI uses the Chrome **Offscreen Document API** coupled with `chrome.tabCapture.getMediaStreamId()`.

### 2. Capture Pipeline & Permissions

#### Required Manifest Permissions
```json
{
  "permissions": [
    "storage",
    "tabCapture",
    "offscreen",
    "activeTab",
    "tabs"
  ]
}
```

#### MediaStream Acquisition Flow
1. **Target Tab Selection**:
   The user chooses an active Google Meet tab from the SignBridge dashboard.
2. **Stream ID Generation**:
   The Service Worker calls:
   ```ts
   const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
   ```
   This generates a transient, cryptographically bound stream ID scoped exclusively to the authorized tab.
3. **Offscreen Document Lifecycle**:
   If not already running, the Service Worker initiates the offscreen document:
   ```ts
   await chrome.offscreen.createDocument({
     url: 'src/offscreen/offscreen.html',
     reasons: ['USER_MEDIA'],
     justification: 'Meeting sign language recognition tab capture'
   });
   ```
4. **MediaStream Binding in Offscreen**:
   The offscreen script consumes the stream ID using Chrome's specialized media constraints:
   ```ts
   const stream = await navigator.mediaDevices.getUserMedia({
     audio: false,
     video: {
       mandatory: {
         chromeMediaSource: 'tab',
         chromeMediaSourceId: streamId
       }
     } as unknown as MediaTrackConstraints
   });
   ```
   > [!IMPORTANT]
   > Notice `audio: false`. SignBridge AI strictly excludes audio streams, guaranteeing that meeting audio and participant conversations are never captured.

### 3. Lifecycle Teardown
1. **User Stop**: When the user clicks "Stop Captions" in the dashboard, the service worker sends `STOP_OFFSCREEN_CAPTURE` and calls `chrome.offscreen.closeDocument()`.
2. **Tab Closure (`onTabRemoved`)**: When the captured meeting tab is closed by the user, the service worker automatically terminates offscreen capture and clears state.
3. **Navigation Away (`onTabUpdated`)**: If the user navigates the captured tab away from Google Meet, capture is immediately aborted.
4. **Track Invalidation**: The offscreen session attaches `ended` event listeners to all video tracks to clean up if the browser revokes capture permissions.

