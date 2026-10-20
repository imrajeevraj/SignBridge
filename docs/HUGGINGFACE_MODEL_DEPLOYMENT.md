# SignBridge AI — Private Hugging Face Model Provisioning & Render Deployment Guide

**Target Architecture:** Private Hugging Face Model Repository → Render Python Web Service (`signbridge-api`)  
**Model Architecture:** PyTorch Custom GRU (`signbridge-custom-gru`, v2 `[32, 172]`, 30 Hz)  
**Expected Checkpoint SHA-256:** `69b2c34ce82b9f8d5171cd912c8b898d659f084f30224e3c54f1c3a4c648da7d`  
**License Notice:** Research and academic use only; no commercial redistribution permission.

---

## 1. Overview & Provisioning Flow

On Render's ephemeral free-tier cloud instances, model packages must be dynamically provisioned at container startup without checking large model weights into the application Git repository.

```
+-----------------------------------------------------------------------------------------+
|                               Hugging Face Model Hub                                    |
|   Private Model Repository: https://huggingface.co/<namespace>/<repo-name>              |
|   Immutable Revision: <40-char commit SHA>                                              |
+-----------------------------------------------------------------------------------------+
                                         |
                                         | HTTPS (Read-Only Token Auth)
                                         v
+-----------------------------------------------------------------------------------------+
|                           Render Web Service (signbridge-api)                           |
|                                                                                         |
| 1. Startup: FastAPI starts instantly -> /health responds HTTP 200 (MODEL_LOADING)        |
| 2. Provisioner: Checks if /tmp/signbridge/models/... is already present and valid        |
| 3. Download: Downloads package into isolated staging directory via snapshot_download()  |
| 4. Verification:                                                                        |
|    - Computes SHA-256 for all files in CHECKSUMS.sha256 manifest                        |
|    - Validates checkpoint hash matches known 69b2c34ce82...                             |
|    - Validates metadata.json schema, v2 [32, 172] shape, and ISL labels                 |
|    - Validates evaluation.json provenance and signer-independence                       |
| 5. Promotion: Atomically moves staging directory to active SIGNBRIDGE_MODEL_DIR         |
| 6. Loading: ModelRegistry loads checkpoint -> State transitions to MODEL_READY           |
| 7. Inference: Authenticated WebSocket /ws/infer accepts 32-frame landmark windows       |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Licensing & Dataset Provenance Pre-Flight Check

> [!IMPORTANT]
> **Dataset License Compliance:** The ISL500 dataset source is restricted to **research and academic use only** with no commercial redistribution permission.
>
> 1. You must create a **Private** Hugging Face model repository. Never make the repository public.
> 2. Ensure only authorized team members have access to the repository.
> 3. Do not upload weights or datasets to public storage or CDN buckets.

---

## 3. Step-by-Step Model Upload to Hugging Face

### Step 3.1: Create Private Model Repository on Hugging Face
1. Log in to [Hugging Face](https://huggingface.co/).
2. Click on your profile icon at top-right and select **New Model**.
3. Set **Model name** (e.g. `signbridge-isl500-remediated`).
4. Select **Owner** (your personal username or organization).
5. Set **Visibility** to **Private** (mandatory).
6. Click **Create model**.

### Step 3.2: Create a Fine-Grained Access Token
1. Go to [Hugging Face Settings → Access Tokens](https://huggingface.co/settings/tokens).
2. Click **Create new token**.
3. Select **Token type: Fine-grained**.
4. Set **Token name**: `signbridge-render-read-only`.
5. Under **Permissions**, select:
   - **Repositories**: Select your newly created model repository.
   - **Repository Permissions**: Check **Read access to contents/metadata**.
   - Do **NOT** grant write access.
6. Click **Create token** and copy the token (`hf_...`). Store it safely in your password manager.

### Step 3.3: Upload Package Files from Local Machine
From your local project root (`D:\SignBridge AI`), run the following PowerShell commands:

```powershell
Set-Location 'D:\SignBridge AI'

# Install huggingface_hub in backend virtual environment if not already present
.\backend\.venv\Scripts\python.exe -m pip install huggingface_hub

# Authenticate local CLI (or supply token via script)
$env:HF_TOKEN = "your_write_capable_hf_token_here"
$repo_id = "<your-namespace>/signbridge-isl500-remediated"

# Upload the complete local model run directory to Hugging Face
.\backend\.venv\Scripts\python.exe -c "
import os
from pathlib import Path
from huggingface_hub import HfApi

api = HfApi(token=os.environ['HF_TOKEN'])
repo_id = '$repo_id'
local_dir = Path('ml/runs/isl500-v2-remediated')

files_to_upload = [
    'weights.safetensors',
    'metadata.json',
    'evaluation.json',
    'labels.json',
    'CHECKSUMS.sha256',
    'LICENSE-NOTES.md',
    'open-set.json',
]

for filename in files_to_upload:
    file_path = local_dir / filename
    if file_path.is_file():
        print(f'Uploading {filename}...')
        api.upload_file(
            path_or_fileobj=str(file_path),
            path_in_repo=filename,
            repo_id=repo_id,
            repo_type='model',
            commit_message=f'Upload verified model package: {filename}',
        )
print('Upload complete.')
"
```

### Step 3.4: Obtain and Pin the Immutable Commit SHA
1. Open your repository on Hugging Face: `https://huggingface.co/<your-namespace>/signbridge-isl500-remediated/commits/main`.
2. Click on the latest commit.
3. Copy the **full 40-character commit hash** (e.g. `a1b2c3d4e5f67890123456789abcdef012345678`).
4. This hash will be used as `HF_MODEL_REVISION`. **Never use `main` in production.**

---

## 4. Render Cloud Service Configuration

In your [Render Dashboard](https://dashboard.render.com/):

### Navigate to `signbridge-api` Service
1. Select the `signbridge-api` web service.
2. Go to **Environment** settings.
3. Add or update the following environment variables:

| Key | Value | Purpose |
|---|---|---|
| `SIGNBRIDGE_MODEL_SOURCE` | `huggingface` | Tells provisioner to fetch from Hugging Face |
| `HF_MODEL_REPO_ID` | `<namespace>/signbridge-isl500-remediated` | Target private repository ID |
| `HF_MODEL_REVISION` | `<full-40-char-commit-sha>` | Immutable commit hash for security |
| `HF_TOKEN` | `hf_...` | Read-only fine-grained Hugging Face token |
| `SIGNBRIDGE_MODEL_DIR` | `/tmp/signbridge/models/isl500-v2-remediated` | Ephemeral target model directory |
| `SIGNBRIDGE_AUTO_LOAD_MODEL` | `true` | Automatically provisions at startup |
| `SIGNBRIDGE_HOST` | `0.0.0.0` | Bind host for Render container |
| `SIGNBRIDGE_ALLOWED_ORIGINS` | `https://signbridge-web.onrender.com,https://signbridge-2mpr.onrender.com` | CORS origins |
| `SIGNBRIDGE_TRUSTED_HOSTS` | `signbridge-api-mjbw.onrender.com,*.onrender.com` | Allowed host headers |

4. Click **Save Changes**. Render will automatically trigger a deployment.

---

## 5. Verification & Health Monitoring

### Health Endpoint Check
Query the `/health` endpoint while the container boots:

```bash
curl -i https://signbridge-api-mjbw.onrender.com/health
```

#### During Provisioning:
```json
{
  "status": "ok",
  "service": "SignBridge AI Backend",
  "phase": 3,
  "model_status": "not_loaded",
  "model_state": "MODEL_LOADING"
}
```

#### After Successful Verification:
```json
{
  "status": "ok",
  "service": "SignBridge AI Backend",
  "phase": 3,
  "model_status": "loaded",
  "model_state": "MODEL_READY"
}
```

### Model Info Endpoint Check
Query the `/model/info` endpoint:

```bash
curl -s https://signbridge-api-mjbw.onrender.com/model/info
```

Expected response:
```json
{
  "model_status": "loaded",
  "state": "MODEL_READY",
  "available": true,
  "model_name": "signbridge-custom-gru",
  "model_id": "signbridge-custom-gru",
  "model_type": "custom_gru",
  "sign_language": "ISL",
  "model_version": "1",
  "feature_schema": "signbridge.custom-gru.v2",
  "sequence_shape": [32, 172],
  "sampling_hz": 30,
  "supported_sign_languages": ["ISL"],
  "labels": ["Family", "Goodafternoon", "NO_SIGN"],
  "vocabulary_size": 3,
  "checkpoint_sha256": "69b2c34ce82b9f8d5171cd912c8b898d659f084f30224e3c54f1c3a4c648da7d",
  "confidence_threshold": 0.8,
  "calibrated": true,
  "message": "Validated local checkpoint loaded."
}
```

---

## 6. Cold-Start & Memory Profile on Render Free Tier

- **Free-Tier RAM:** 512 MB.
- **Measured Resident Memory (RSS):** ~146 MB (71% free headroom).
- **Download Time:** ~3-5 seconds on Render's internal gigabit network (895 KB safetensors + metadata).
- **Cold-Start Behavior:**
  - After 15 minutes of inactivity, free-tier instances spin down.
  - On the first inbound request, Render starts the container (~30-50s).
  - FastAPI starts instantly and answers `/health` immediately (`MODEL_LOADING`).
  - Model provisioner fetches, verifies, and promotes the model package in the background.
  - The frontend webcam studio retries connection until `MODEL_READY` is announced.

---

## 7. Security Best Practices

1. **Token Protection:** `HF_TOKEN` must exist **only** as a secret environment variable in Render's dashboard. Never add it to Git, `render.yaml`, or frontend client builds.
2. **Read-Only Scope:** Use fine-grained tokens scoped to read-only access for that specific repository.
3. **Immutable Pinning:** Always pin `HF_MODEL_REVISION` to a 40-character commit SHA. Never use branch names or mutable tags (`main`, `latest`), which can allow unverified weight swaps.
4. **Local Verification:** The provisioner strictly validates the SHA-256 of all files against both `CHECKSUMS.sha256` and the hardcoded `EXPECTED_CHECKPOINT_SHA256` before loading into PyTorch.
5. **No Code Execution:** Checkpoints are stored in `.safetensors` format (pure numeric tensors, zero pickle/code execution vectors).

---

## 8. Troubleshooting & Recovery

| Issue / Symptom | Root Cause | Solution |
|---|---|---|
| `model_state: "MODEL_UNAVAILABLE"` (`Hugging Face authentication failed`) | `HF_TOKEN` is missing, expired, or lacks read permissions on the private repo. | Verify `HF_TOKEN` in Render Environment settings. Ensure token has read access to the repo. |
| `model_state: "MODEL_UNAVAILABLE"` (`Repository or revision not found`) | Typo in `HF_MODEL_REPO_ID` or `HF_MODEL_REVISION` does not exist in the repo. | Check repo URL and verify commit SHA exists in the commit history. |
| `model_state: "MODEL_INCOMPATIBLE"` (`Model integrity verification failed`) | A file was corrupted during transfer or `weights.safetensors` does not match expected SHA-256. | Re-upload files to Hugging Face and check that local checksums match `CHECKSUMS.sha256`. |
| Container runs out of memory (OOM) | Memory exceeded during dependency installation or model forward pass. | Verify that CPU PyTorch (`torch`) is used. Avoid running multiple concurrent inferences simultaneously on free tier. |
| Token rotation needed | Token was accidentally exposed or scheduled rotation. | Generate new fine-grained read-only token in Hugging Face, update `HF_TOKEN` in Render Environment, and revoke old token. |
| Rollback to previous model version | New model revision introduced unexpected behavior. | Set `HF_MODEL_REVISION` to the previous commit SHA in Render Environment settings. The service will download and load the previous version upon restart. |

