# SignBridge AI — Installation & Setup Guide

This guide walks through setting up the local backend and installing the SignBridge AI browser extension on **Windows** using Google Chrome or Microsoft Edge.

---

### Prerequisites
- **Operating System**: Windows 10 / 11 (64-bit)
- **Node.js**: Version 20.x LTS or higher
- **Python**: Version 3.11.x (with `venv` and `pip`)
- **Web Browser**: Google Chrome (version 120+) or Microsoft Edge (version 120+)

---

### Step 1: Install Node.js Dependencies & Assets
Open **Windows PowerShell** in the project root:
```powershell
# Install npm workspace dependencies
npm ci

# Download and verify local MediaPipe WASM & Landmarker task assets
npm run assets:setup
```

---

### Step 2: Set Up Python Backend Virtual Environment
```powershell
# Create venv and install PyTorch, FastAPI, Safetensors
npm run backend:setup
```

---

### Step 3: Build the Extension Package
If your local backend runs on the default port 8000:
```powershell
npm run build
```

If port 8000 is occupied by another local service on your machine, configure port 18000:
```powershell
$env:VITE_BACKEND_PORT="18000"
npm run build
```

The compiled Manifest V3 extension is emitted to `extension/dist/`.

---

### Step 4: Start the Local Backend Server
In PowerShell:
```powershell
# Set port if using override (e.g. 18000)
$env:SIGNBRIDGE_PORT="18000"

# Start FastAPI Uvicorn server on loopback
npm run backend:dev
```
Verify the backend is live by opening:
`http://127.0.0.1:18000/health` (or `8000`). It should return:
```json
{"status":"ok","service":"SignBridge AI Backend","phase":3,"model_status":"loaded","model_state":"MODEL_READY"}
```

---

### Step 5: Install Extension in Chrome or Edge

#### Google Chrome:
1. Navigate to `chrome://extensions`.
2. Toggle **Developer mode** (top right) to **ON**.
3. Click **Load unpacked**.
4. Select the `extension/dist` folder in the SignBridge AI directory.

#### Microsoft Edge:
1. Navigate to `edge://extensions`.
2. Toggle **Developer mode** (left sidebar) to **ON**.
3. Click **Load unpacked**.
4. Select the `extension/dist` folder.

