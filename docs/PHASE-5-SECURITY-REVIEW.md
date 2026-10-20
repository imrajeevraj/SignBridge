# SignBridge AI — Phase 5 Security Review
## Threat Modeling, Authorization Boundaries & Hardening Verification

### 1. Security Architecture & Threat Vectors

```text
+-----------------------+                    +-------------------------+
|   Google Meet Web     |                    |  Chrome Extension UI    |
| (Untrusted Web Page)  |                    | (Privileged MV3 Context)|
+-----------------------+                    +-------------------------+
            |                                             |
     Isolated World                                 chrome.runtime
     Shadow DOM Only                                 API Boundary
            |                                             |
            v                                             v
+----------------------------------------------------------------------+
|                     SignBridge Extension Sandbox                     |
|  - Content Script in isolated world (no window API leakage)          |
|  - Service Worker handles privileged requests                        |
|  - Offscreen Document processes MediaStream in sandboxed context     |
+----------------------------------------------------------------------+
                                  |
                   Loopback Only (127.0.0.1)
                   Authenticated WebSocket Handshake
                   Origin Whitelist Check (chrome-extension://)
                                  v
+----------------------------------------------------------------------+
|                       Local FastAPI Backend                          |
|  - Binds strictly to 127.0.0.1 (never 0.0.0.0)                       |
|  - Constant-time HMAC token comparison                               |
|  - Strict schema, shape [32, 172], and timestamp monotonicity checks |
|  - Rate limited (max 10 req/s, max 2 concurrent sockets)             |
|  - Non-finite numeric value (NaN/Inf) rejection                      |
+----------------------------------------------------------------------+
```

---

### 2. Threat Analysis & Mitigations

| Threat Vector | Attack Scenario | Implemented Mitigation | Verification Status |
| :--- | :--- | :--- | :--- |
| **Cross-Origin Socket Hijacking** | Malicious website connects to `ws://127.0.0.1:8000/ws/infer` | Backend checks `Origin` header; rejects connections not matching authorized extension ID (`code=1008`). | **Verified** in Pytest |
| **Token Brute-Force** | Web script guesses authorization token | 32-character high-entropy token (`secrets.token_urlsafe(32)`) compared using `hmac.compare_digest`. | **Verified** in Pytest |
| **Tensor Injection / DoS** | Client sends non-finite numbers (NaN/Inf) to crash PyTorch | JSON parser uses `parse_constant` to reject non-finite literals. Pydantic validates bounds. | **Verified** in Pytest |
| **Replay / Stale Inferences** | Replaying old feature tensors to trigger false captions | Monotonically strictly increasing sequence numbers, bounded timestamp freshness ($< 5\text{s}$), and deque deduplication. | **Verified** in Pytest |
| **DOM Pollution / Meet XSS** | Injected captions interfere with Google Meet's DOM or vice-versa | Captions and ROI selector are encapsulated in closed Shadow DOM roots; zero inline `<script>` tags; strict MV3 CSP. | **Verified** in E2E |
| **Eavesdropping / Audio Leak** | Microphone audio captured without user knowledge | Capture constraints explicitly set `{ audio: false }`. No audio permission is ever requested in manifest. | **Verified** in Unit & Build |

---

### 3. Manifest V3 Permissions Audit

```json
{
  "permissions": [
    "storage",      // Trusted settings storage
    "tabCapture",   // Video stream ID generation for approved meeting tab
    "offscreen",    // Sandbox offscreen document for canvas cropping
    "activeTab",    // Injects caption overlay into selected meeting tab
    "tabs"          // Queries open meeting tab URLs for user dropdown
  ]
}
```
- Broad host permissions (`<all_urls>`, `http://*/*`, `https://*/*`) are **NOT** present.
- Declarative content scripts are restricted to `"matches": ["https://meet.google.com/*"]`.
- Packaged assets (`vision-worker.js`, MediaPipe WASM, task bundles) are 100% locally bundled; zero remotely hosted code.

