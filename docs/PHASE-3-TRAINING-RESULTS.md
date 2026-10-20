# Genuine ISL GRU training results — 2026-10-20

**A compatible model was genuinely trained; recognition quality is not accepted.**
The two-class pilot got 4/4 held-out known clips correct but falsely accepted
11/11 held-out unsupported-sign windows. These results do not establish reliable
live recognition. No synthetic fixture contributes to the reported accuracy.

## Run and data

Local package: `ml/runs/isl500-v2-pilot/`. Source: pinned ISL500 research videos.
Labels in exact output order: `Family`, `Goodafternoon`.
Input: float32 `[batch,32,172]`, approved v2/native30 policy. The production
MediaPipe worker extracted every actual training window; no Python replacement
normalizer, padded sequence, guessed hand or synthetic movement was used.

| Split | Clips | Windows | Source-reported signers |
|---|---:|---:|---:|
| Train | 15 | 67 | 8 |
| Validation | 6 | 14 | 3 |
| Test | 4 | 16 | 2 |

See [the dataset audit](PHASE-3-DATASET-AUDIT.md) for all exclusions and the
pretraining vocabulary revision. All splits are disjoint by source User ID.
Repeated windows from the same clip never become independent test samples.

Command actually run:

```powershell
.\backend\.venv\Scripts\python.exe -m ml.train .cache/phase3-completion/isl500-known-merged/manifest.json ml/runs/isl500-v2-pilot --seed 42 --epochs 100 --batch-size 16 --patience 12 --hidden-size 128 --layers 2 --dropout 0.2 --learning-rate 0.001 --device cpu
```

PyTorch 2.14.1+cpu, two Torch threads, deterministic algorithms and seed 42.
Two-layer GRU128/dropout .2 → dense64/ReLU → two logits. AdamW, weight decay
.0001, gradient norm cap 1, validation-loss ReduceLROnPlateau and early-stopping
patience 12. This run reached 100 epochs; the best validation-loss epoch was 100,
so early stopping did not trigger. No hyperparameter search or test-driven model
selection was performed. Temperature and threshold were selected from known
validation windows only: temperature .5, threshold .5. The studio's default
minimum confidence remains .8 and cannot undercut the package threshold.

## Held-out known signs

Primary unit: one prediction per source clip, mean logits across its windows.

| Metric | Result |
|---|---:|
| Top-1 | 4/4, 100% |
| Macro precision / recall / F1 | 1.0 / 1.0 / 1.0 |
| Family recall | 2/2 |
| Goodafternoon recall | 2/2 |
| Window top-1 / macro-F1 | 16/16, 100% / 1.0 |
| Accepted clip coverage / accuracy | 100% / 100% |
| CPU forward latency median / p95 | 13.83 / 31.84 ms |

Confusion matrix, rows truth and columns prediction, order Family, Goodafternoon:

```text
[[2, 0],
 [0, 2]]
```

Latency measures 16 individual batch-one model forwards during evaluation;
it excludes camera, decoder, MediaPipe, window accumulation, transport and UI.
It is a local measurement under concurrent host work, not a deployment guarantee.

Known-test calibration: five-bin ECE 0, NLL approximately 0, multiclass Brier
4.11e-21 at clip level (2.73e-21 at window level). Float32 softmax rounded these
known confidences to 1.0. **Those numbers are not evidence of calibrated unknown
behavior**: they come from four easy closed-set clips and the unsupported signs
below also received near-1 confidence. The `calibrated: true` metadata field
means the closed-set validation fitting criterion passed, nothing broader.

Independent package reload/re-evaluation reproduced the confusion matrix and
accuracy. Four actual held-out feature windows also passed authenticated FastAPI
WebSocket parity against direct model inference, including exact accepted labels
and confidence within 1e-6. A separately labeled protocol mutation verified
`NO_SIGN` for absent hands; that is not a real neutral-activity measurement.

## Unsupported signs: failed rejection

Goodevening and Goodnight were never trained as known labels. Thresholds were
frozen before this evaluation; no test-based threshold adjustment followed.

| Split | Clips / windows | False accepted windows | Clips with any false acceptance |
|---|---:|---:|---:|
| Validation, User010 | 2 / 6 | 6/6, 100% | 2/2 |
| Test, User013 | 2 / 11 | 11/11, 100% | 2/2 |

The same 100% window false-acceptance rate holds at the studio default .8
threshold. Unsupported confidence ranged from .999930 to 1.0 on test windows.
This audit measures per-window thresholds, not stability/cooldown behavior or
physical-camera false positives. Raising an ordinary softmax threshold cannot
be presumed to solve these confidently wrong predictions. Genuine neutral
activity was not available and its false-positive rate is **unmeasured**.

## Artifacts and limits

- [Full evaluation and epoch history](phase-3-training-evaluation.json)
- [Reloaded package evaluation](phase-3-training-recheck.json)
- [Unsupported-sign observations](phase-3-open-set-evaluation.json)
- [Real backend serving verification](phase-3-real-backend-verification.json)
- [Exact exported metadata](phase-3-trained-metadata.json)

Weights SHA-256:
`b657712b1c7f5a6ae8107f33e7a74ac535ee100817518494e1495bbfc17ab031`.
The local package also contains safetensors, labels.json, evaluation.json,
metadata.json, LICENSE-NOTES.md and CHECKSUMS.sha256. Original videos/features
and model packages are ignored local research assets.

Limitations: two classes, one source recording per word/user, only four known
test clips, correlated windows, source-reported signer IDs, substantial
extraction attrition, no neutral corpus, no physical-camera validation or expert
linguistic review, and a complete failure on the tested unsupported glosses.
The next experiment needs genuine training negatives/neutral activity and a
new untouched evaluation set. Reusing these exposed test clips for tuning would
require clearly labeling them development data rather than claiming a fresh test.
