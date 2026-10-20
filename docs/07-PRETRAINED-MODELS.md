# 07 — Pretrained Models and Integration Notes

## What 'pretrained' means here
A checkpoint trained for landmark **detection** (MediaPipe) is different from a checkpoint trained to map movement to **signed-language words**. Never conflate the two. Codex or Copilot can write code to integrate and test models; they do not independently supply signed-language model weights.

## Choice A — AI4Bharat INCLUDE (preferred first ISL trial)
- Repository: https://github.com/AI4Bharat/INCLUDE
- Work: **Isolated Indian Sign Language Recognition** (INCLUDE; INCLUDE-50 subset).
- Repository contains `generate_keypoints.py`, `runner.py`, `evaluate.py`, training/evaluation code and `pretrained_links.json`.
- Its README describes preprocessing with **MediaPipe Hands and BlazePose**, then model paths that include transformer/LSTM configurations; these are *not* the same as the 161-feature fallback schema.
- An initial checkpoint candidate for constrained experimentation: a **no-CNN INCLUDE-50 LSTM or small Transformer** if its weight URL is accessible and its output/latency passes actual tests. Do not assert it is fastest without measuring.

### Required verification steps
1. Clone / inspect repository without replacing current app code.
2. Record commit hash and inspect `requirements.txt`, `configs.py`, `generate_keypoints.py`, `runner.py`, `evaluate.py`, `pretrained_links.json`.
3. Download dataset and weights only under permitted terms. `pretrained_links.json` contains some placeholder `"link"` values; follow only genuine checked URLs.
4. Run provided inference offline on a reference clip; capture model architecture, expected tensor shape, label list, mapping, normalization and class count.
5. Build a **native model adapter** from extension feature extraction to expected model features only if exact equivalence is proven. Easier initial option: perform native extraction in Python for testing, then optimize.
6. Measure CPU inference; if too slow, consider a lightweight supervised model trained on an appropriate ISL subset.
7. Create `model_config.json` with SHA-256, checkpoint ID, pipeline adapter version, label hash, signed language, metrics and license references.

### Example command patterns — not asserted executable until repository dependencies validated
```bash
git clone https://github.com/AI4Bharat/INCLUDE reference/INCLUDE
# Work inside isolated environment; inspect README and dependency conflicts first.
# Repository suggests: python generate_keypoints.py ...
# Repository suggests: python runner.py --dataset include50 --model transformer ...
# Repository suggests: python evaluate.py --data_dir <directory>
```

## Choice B — WLASL I3D (ASL only)
- Repository: https://github.com/dxli94/WLASL
- Source offers pre-trained I3D weights and `test_i3d.py`; original pretrained backbones include Kinetics-initialized components.
- Input is processed video clips, not arbitrary new 161-dimensional MediaPipe vectors.
- Stronger video semantics possibility, but likely heavier than lightweight landmark model on a typical hackathon laptop. Benchmark, don't guess.
- **Do not use for ISL** or claim general conversation translation.
- WLASL repository states C-UDA and noncommercial academic/computational usage restrictions. Review the actual agreement before redistribution or commercial plans.

## Choice C — WLASL Pose-TGCN (ASL only)
- Repository includes a Pose-TGCN example and pretrained checkpoint links; needs its native body-keypoint format, splits and graph topology.
- Potential keypoint efficiency, but extracting a different subset/order and feeding a pretrained model is invalid without a reliable conversion.
- Follow original `test_tgcn.py`, not a generic homebrew inference function.

## Choice D — MediaPipe Holistic (vision encoder / landmark extractor)
- Docs: https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js
- Provides pretrained holistic pose, hands, face landmark detection. Its published layout includes 33 pose, 21 × 2 hands and a large set of facial landmarks (553 combined total).
- Efficient conceptual basis for a sign pipeline, yet **does not itself recognize signs**.
- Packaging needs a compatible `.task` asset and WASM resources deployed locally into extension build. Test the current API and asset availability.
- When using webcam in Chrome, use the video-specific `detectForVideo` mode and consistent monotonically advancing timestamps; actual API invocation depends on current library version.

## Choice E — MediaPipe Hand Landmarker / Gesture Recognizer
- Hand Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Gesture Recognizer: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
- Canned Gesture Recognizer categories include `Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`, `Victory`, `ILoveYou`, and `None`.
- These are **not** a validated complete sign-language vocabulary. A `Victory` gesture does not automatically imply a particular signed word.

## Choice F — Custom GRU (backup model)
- Input `float32[32,161]` defined in `11-DATA-CONTRACTS.md`.
- PyTorch classifier such as 2-layer GRU with hidden 128 → FC 64 → output N classes; optional dropout.
- Must train from labeled data, reserve unseen signer splits, and check false positives. Do not call it pretrained until genuinely fine-tuned/initialized from relevant checkpoint.
- Advantage: small controllable inference footprint; disadvantage: quality and generalization constrained by training data.

## Model-asset requirements
A checkpoint package should include:
```text
models/<model_id>/
  model.pt | model.onnx | model.tflite
  labels.json
  model_config.json
  LICENSE-NOTES.md
  CHECKSUMS.sha256
```

Minimum model_config:
```json
{
  "model_id": "example-isolated-isl-v1",
  "signed_language": "ISL",
  "architecture": "reference-native-or-gru",
  "input_schema_id": "reference-extractor-version",
  "preprocess_version": "v1",
  "sequence_length": 32,
  "num_classes": 51,
  "checkpoint_sha256": "<actual-digest>",
  "labels_sha256": "<actual-digest>",
  "license_reviewed": false
}
```
This is a **schema illustration**, not an existing checkpoint. Class count and length must be replaced by values read from the real model. `license_reviewed:false` means deployment blocked until review.
