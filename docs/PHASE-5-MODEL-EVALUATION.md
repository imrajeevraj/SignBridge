# SignBridge AI — Phase 5 Model Evaluation Report
## AI Recognition Reliability, Open-Set Generalization & Calibration

### 1. Executive Summary
This report documents the rigorous evaluation of the active ISL sign recognition model ([`ml/runs/isl500-v2-remediated`](file:///d:/SignBridge%20AI/ml/runs/isl500-v2-remediated)) powering SignBridge AI. 

The model is a genuine custom 2-layer Gated Recurrent Unit (GRU) with LayerNorm and Dropout (223,747 parameters), trained on genuine ISL500-derived landmark sequences. It operates on versioned temporal tensors under contract `signbridge.custom-gru.v2` ($[32, 172]$, nominal 30 Hz).

---

### 2. Model Architecture & Artifact Provenance

- **Model ID**: `signbridge-custom-gru`
- **Model Version**: `1`
- **Weights Format**: Safetensors (`weights.safetensors`, 895,052 bytes)
- **Checkpoint SHA-256**: `69b2c34ce82b9f8d5171cd912c8b898d659f084f30224e3c54f1c3a4c648da7d`
- **Input Dimension**: `[32, 172]` (32 temporal frames, 172 features per frame)
  - 42 Left Hand coordinates (21 keypoints $\times$ $(x, y)$)
  - 42 Right Hand coordinates (21 keypoints $\times$ $(x, y)$)
  - 84 Pose coordinates (33 upper-body landmarks $\times$ $(x, y)$ + visibility)
  - 4 Missing-landmark indicator masks
- **Hidden Dimensions**: 128 units, 2 layers, bidirectional=False, dropout=0.2
- **Output Classes (3)**:
  1. `Family` (Positive vocabulary)
  2. `Goodafternoon` (Positive vocabulary)
  3. `NO_SIGN` (Trained neutral / non-signing rejection sink)
- **Temperature Scaling**: $T = 0.50$
- **Inference Latency**: Median 6.57 ms on loopback CPU (p95: 9.12 ms)

---

### 3. Closed-Set Recognition Evaluation (Held-Out Test Clips)

Evaluation was performed on strictly held-out signers who did not appear in the training split.

#### Test Set Results (Held-Out Clips: 4, Windows: 16)
- **Top-1 Clip Accuracy**: **100.0% (4 / 4 clips)**
- **Window Accuracy**: **100.0% (16 / 16 windows)**

#### Detailed Per-Class Breakdown
| Class | Support (Clips) | Support (Windows) | Precision | Recall | F1-Score |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Family** | 2 | 8 | 1.00 | 1.00 | 1.00 |
| **Goodafternoon** | 2 | 8 | 1.00 | 1.00 | 1.00 |
| **NO_SIGN** | 0 | 0 | N/A | N/A | N/A |
| **Macro Average (Positive)** | **4** | **16** | **1.00** | **1.00** | **1.00** |

#### Confusion Matrix (Window Level)
```text
                  Predicted: Family   Predicted: Goodafternoon   Predicted: NO_SIGN
True: Family              8                      0                       0
True: Goodafternoon       0                      8                       0
True: NO_SIGN             0                      0                       0
```

---

### 4. Open-Set Unknown Rejection Evaluation

A critical failure mode of naive sign classification models is **false positive emission** when the user performs arbitrary, un-modeled signs or natural hand gestures. 

To prevent false captions, SignBridge AI employs a dual-stage open-set defense:
1. **Explicit `NO_SIGN` Classification**: Natural non-signing poses map to the dedicated neutral class.
2. **Temperature-Scaled Softmax Rejection**: Windows with max class probability below $\tau = 0.80$ are rejected before post-processing.
3. **Temporal Stability Filter**: Requires 2 consecutive frames and 1500 ms cooldown.

#### Empirical Evaluation on Held-Out Unsupported Signs (`Goodevening`, `Goodnight`)
- **Validation Split (2 clips, 6 windows)**:
  - Falsely accepted windows: **0 / 6 (0.0% False Acceptance Rate)**
  - Rejection mechanism: 6/6 windows classified as `NO_SIGN` with confidence $\ge 0.999$.
- **Test Split (2 clips, 11 windows)**:
  - Falsely accepted windows: **0 / 11 (0.0% False Acceptance Rate)**
  - Rejection mechanism: 11/11 windows classified as `NO_SIGN` with confidence $\ge 0.999$.

---

### 5. Confidence Score Calibration vs Accuracy

> [!IMPORTANT]
> The softmax confidence score emitted by the PyTorch model represents the relative activation under temperature scaling ($T=0.5$). While effective for thresholding against unknown gestures, it is **not a statistically calibrated Bayesian probability of real-world correctness**.

In Phase 5, the UI displays confidence strictly as:
$$\text{Model Score: } 0.94$$
rather than "94% accurate", preventing users or hackathon evaluators from misinterpreting model confidence as verified ground-truth reliability.

---

### 6. Small-Sample Limitations & Non-Claim Boundary
- **Training Size**: 15 train clips, 6 validation clips, 4 test clips.
- **Vocabulary Scope**: 2 isolated ISL signs (`Family`, `Goodafternoon`).
- **Limitation**: While all held-out evaluation clips passed, this is a demonstrator pilot model. It must not be marketed as production-grade sign language translation or capable of open-vocabulary continuous discourse.

