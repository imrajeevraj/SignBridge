# SignBridge AI — Render Cloud Deployment & Operations Guide

This guide details the deployment architecture, configuration, and migration procedures for hosting **SignBridge AI** on [Render](https://render.com).

---

## 1. Architecture Overview

SignBridge AI is designed with a **dual-distribution architecture**:

```
                       +---------------------------------------+
                       |              Browser / User           |
                       +---------------------------------------+
                                  /                \
                     HTTPS (Static Assets)     WSS / HTTPS (API)
                                /                    \
                               v                      v
        +--------------------------------+   +----------------------------------+
        | signbridge-web (Render Static) |   |  signbridge-api (Render Web)     |
        | - React SPA Dashboard          |   | - FastAPI ASGI Application       |
        | - Isolated Webcam Studio       |   | - Uvicorn Server (0.0.0.0:$PORT) |
        | - Bundled MediaPipe Vision     |   | - ISL500 PyTorch GRU Inference   |
        | - Zero-Cost Global CDN         |   | - WebSocket /ws/infer (Token Auth)|
        +--------------------------------+   +----------------------------------+
```

### Components

1. **`signbridge-web` (Render Static Site)**
   - Built from `extension/` using `npm run build:web` with `BUILD_TARGET=web`.
   - Emits completely self-contained static assets into `extension/dist-web/`.
   - Runs in any standard modern web browser without requiring Chrome Extension APIs.
   - Includes local MediaPipe Vision Tasks WASM binaries and landmarker models (`hand_landmarker.task` and `pose_landmarker_lite.task`).
   - Served over Render's global CDN with zero hosting cost, instant cache invalidation, and custom HTTP security headers.
   - SPA rewrite rules configured via `dist-web/_redirects` and Blueprint routing.

2. **`signbridge-api` (Render Python Web Service)**
   - FastAPI application serving REST endpoints (`GET /health`, `GET /model/info`) and WebSocket inference (`/ws/infer`).
   - Powered by Uvicorn bound to `0.0.0.0:$PORT` dynamically resolved from Render's runtime environment.
   - Runs genuine ISL sign recognition using the verified 32-frame custom GRU model package (`ml/runs/isl500-v2-remediated`).
   - Memory profile: ~140 MB resident memory, well below Render's 512 MB free-tier limit.

3. **Chrome MV3 Extension Build (Preserved)**
   - Running `npm run build` independently compiles the Chrome Manifest V3 extension into `extension/dist/`.
   - Extension builds are completely isolated from web builds; neither overwrites or interferes with the other.

---

## 2. One-Click Blueprint Deployment

SignBridge AI includes a validated root `render.yaml` Blueprint.

### Prerequisites
- A GitHub repository connected to your Render account (`https://github.com/imrajeevraj/SignBridge`).
- A Render account.

### Deployment Steps
1. Navigate to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Blueprint**.
3. Select the `imrajeevraj/SignBridge` repository and target branch (`main`).
4. Render will inspect `render.yaml` and provision both services:
   - `signbridge-web` (Static Site)
   - `signbridge-api` (Python Web Service)
5. Review the service plan (Free) and click **Apply**.
6. Render will automatically build and deploy both services.

---

## 3. Environment Variables Reference

A template is provided in [.env.example](../.env.example).

### Frontend Configuration (`signbridge-web`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_BACKEND_URL` | Yes | `http://127.0.0.1:8000` | Public HTTPS URL of the backend API (e.g. `https://signbridge-api.onrender.com`). Baked into web bundle at build time. |
| `VITE_BACKEND_PORT` | No | `8000` | Fallback port if `VITE_BACKEND_URL` is omitted. |

### Backend Configuration (`signbridge-api`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Auto (Render) | `8000` | Port assigned by Render runtime. Resolved automatically by `app.config.local_port()`. |
| `SIGNBRIDGE_PORT` | No | `8000` | Alternate port override when `PORT` is not defined. |
| `SIGNBRIDGE_HOST` | No | `0.0.0.0` (Render) / `127.0.0.1` | Network interface to bind. Automatically resolves to `0.0.0.0` when `PORT` or `RENDER` is set. |
| `SIGNBRIDGE_ALLOWED_ORIGINS` | No | Built-in defaults | Comma-separated list of additional permitted CORS origins (e.g. `https://signbridge-web.onrender.com,https://signbridge-2mpr.onrender.com`). |
| `SIGNBRIDGE_TRUSTED_HOSTS` | No | Built-in defaults | Comma-separated list of permitted HTTP `Host` headers. Defaults include `*.onrender.com`, `localhost`, and `127.0.0.1`. |
| `PUBLIC_APP_ORIGIN` | No | Built-in defaults | Canonical public web origin permitted for WebSocket connections without Chrome extension ID. |
| `SIGNBRIDGE_MODEL_DIR` | Recommended | `None` | Path to model package directory. Set to `ml/runs/isl500-v2-remediated` to activate ISL recognition. |
| `PYTHON_VERSION` | Yes | `3.11.9` | Pinned Python runtime for Render environment. |

---

## 4. Migration Plan for Existing Service (`signbridge-2mpr.onrender.com`)

The existing deployed service at `https://signbridge-2mpr.onrender.com` currently runs a Node Web Service preview. To migrate to the dual-service production architecture without disruption:

### Phase A: Non-Disruptive Backend Launch
1. Deploy `signbridge-api` via `render.yaml` Blueprint or as a new Web Service.
2. Verify backend health:
   ```bash
   curl -s https://signbridge-api.onrender.com/health
   # Expected: {"status":"ok","service":"SignBridge AI Backend","phase":3,"model_status":"loaded","model_state":"MODEL_READY"}
   ```

### Phase B: Deploy Static Site (`signbridge-web`)
1. Deploy `signbridge-web` as a Render Static Site with `VITE_BACKEND_URL=https://signbridge-api.onrender.com`.
2. Verify that dashboard and webcam studio load without errors.
3. Test WebSocket connection in studio: ensure `wss://signbridge-api.onrender.com/ws/infer` connects and authenticates.

### Phase C: Custom Domain / Zero-Downtime Cutover
1. If using a custom domain (e.g. `signbridge.ai`):
   - Point the domain CNAME to `signbridge-web.onrender.com`.
   - Update `SIGNBRIDGE_ALLOWED_ORIGINS` and `PUBLIC_APP_ORIGIN` on `signbridge-api` to include the custom domain.
2. If continuing to use `signbridge-2mpr.onrender.com`:
   - Keep `signbridge-2mpr.onrender.com` in `SIGNBRIDGE_ALLOWED_ORIGINS` (already hardcoded as a default in `app.config`).
   - In Render settings for the old service `signbridge-2mpr`, configure an HTTP 301 redirect to `signbridge-web.onrender.com`, or deprecate once the new URL is shared.

---

## 5. Free-Tier Resource & Memory Budget

Render's free tier provides 512 MB RAM per web service. Memory optimization has been strictly verified:

| Process / Component | Memory Usage (RSS) | Limit | Safety Margin |
|---|---|---|---|
| Python 3.11 Base + FastAPI + Uvicorn | ~42 MB | 512 MB | 470 MB (92%) |
| PyTorch CPU Runtime | ~68 MB | 512 MB | 444 MB (86%) |
| Custom GRU Weights (895 KB Safetensors) | ~28 MB | 512 MB | 416 MB (81%) |
| Active WebSocket Session (Inference) | ~8 MB | 512 MB | 408 MB (79%) |
| **Total Resident Memory** | **~146 MB** | **512 MB** | **~366 MB (71% Free)** |

### Cold Starts & Inactivity
- On the Render free tier, web services spin down after 15 minutes of inactivity.
- The initial request after spin-down takes 30-50 seconds while the container initializes.
- The React dashboard displays `"Checking…"` and handles cold starts gracefully, retrying until `signbridge-api` is online.
- Static sites (`signbridge-web`) never sleep; they are always instantly served from CDN edge caches.

---

## 6. Build & Test Commands

### Local Web Build
```powershell
npm run build:web
```
Outputs to `extension/dist-web/`.

### Local Extension Build
```powershell
npm run build
```
Outputs to `extension/dist/`.

### Run Backend Tests (including Render configuration & smoke suite)
```powershell
npm run backend:test
```

### Full Repository Validation
```powershell
npm run validate
npm run backend:test
```

