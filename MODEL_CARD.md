# Model Card: SignBridge Custom ISL GRU (`isl500-v2-remediated`)

---

### 1. Model Summary
- **Model Name**: SignBridge Custom ISL GRU
- **Model ID**: `signbridge-custom-gru`
- **Model Version**: `1.0.0`
- **Architecture**: 2-layer Gated Recurrent Unit (GRU) with LayerNorm and Dropout ($p=0.2$)
- **Parameters**: 223,747 parameters
- **Format**: Safetensors (`weights.safetensors`, 895,052 bytes)
- **Primary Domain**: Isolated Indian Sign Language (ISL) recognition from temporal landmark sequences.

---

### 2. Intended Use
- **Primary Application**: Demonstrating live sign recognition and floating captions inside video meetings (e.g. Google Meet Web) for deaf and hard-of-hearing communication accessibility.
- **Input Data Contract**: Schema `signbridge.custom-gru.v2`
  - Shape: `[32, 172]` (32 sequential frames $\times$ 172 normalized features per frame)
  - Features: 42 Left Hand $(x, y)$ + 42 Right Hand $(x, y)$ + 84 Pose $(x, y, v)$ + 4 Missing Indicator Masks.
  - Sampling Rate: 30 Hz nominal.
- **Output Classes (3)**:
  - `Family` (Positive sign)
  - `Goodafternoon` (Positive sign)
  - `NO_SIGN` (Trained neutral rejection sink)

---

### 3. Out-of-Scope & Unintended Uses
- **Continuous Discourse**: Not designed for continuous conversational signing or complex grammar translation.
- **Emergency or Critical Services**: Not certified for emergency medical, legal, or high-stakes translation.
- **Other Sign Languages**: Trained on Indian Sign Language (ISL); not directly applicable to American Sign Language (ASL) or British Sign Language (BSL).

---

### 4. Training Data & Preprocessing
- **Source**: ISL500 isolated sign research dataset.
- **Dataset Size**: 15 training clips, 6 validation clips, 4 held-out test clips.
- **Feature Extraction**: Extracted using MediaPipe Hand Landmarker and Pose Landmarker with deterministic bounding-box normalization.
- **Negative Mining**: Trained with explicit negative clips mapped to `NO_SIGN` class to eliminate false positives during pauses.

---

### 5. Quantitative Evaluation
- **Closed-Set Top-1 Clip Accuracy**: **100% (4 / 4 held-out clips)**.
- **Closed-Set Window Accuracy**: **100% (16 / 16 windows)**.
- **Open-Set False Acceptance Rate**: **0.0% (0 / 11 windows on held-out unknown signs)**.
- **Inference Latency**: Median 6.57 ms on loopback CPU.
- **Decision Boundary**: Rejection threshold $\tau = 0.80$ with temperature scaling $T = 0.50$.

