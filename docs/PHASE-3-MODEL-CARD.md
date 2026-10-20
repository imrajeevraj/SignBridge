# Model card — genuine v2 research pilot, Phase 3 partial

**Research prototype; unsupported-sign rejection failed.** A genuine compatible
model is available locally, but it is unsuitable for general signing or reliable
accessibility use. It is not selected automatically by the default backend.

## Identity and artifacts

- Package: `ml/runs/isl500-v2-pilot/`, model ID `signbridge-custom-gru`, version `1`.
- Language/task: Indian Sign Language, isolated signs, one signer, exactly two
  source glosses in order: **Family**, **Goodafternoon**. No ASL equivalence,
  sentence translation, meeting capture or remote captions.
- Architecture: PyTorch GRU, 2 layers × 128 hidden, dropout .2, final hidden →
  dense64/ReLU → 2 logits. Safetensors weights, strict shape/hash loading.
- Input: float32 `[batch,32,172]`, `signbridge.custom-gru.v2`, sampling cap 30 Hz.
  Original161 geometry slots plus11 explicit optional-pose masks; both shoulders
  and at least one valid detected hand remain mandatory. Stride8, no padding,
  strictly increasing timestamps, reset at gaps above250ms.
- Preprocessing: `tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30`.
  Worker SHA-256: `103b76cc71ca73ca511cdf694812d5839df6bbb7f8158277b351a195c5bae5da`.
- Weights SHA-256: `b657712b1c7f5a6ae8107f33e7a74ac535ee100817518494e1495bbfc17ab031`.
- Labels SHA-256: `622c9361e9e45934e5b4275efbdfd4432c8a33cf99d028ab3ca2f22e926a9376`.
- Full metadata, hashes and architecture: [export record](phase-3-trained-metadata.json).
  The local package includes `CHECKSUMS.sha256`, `labels.json` and license notes.

## Training provenance

ISL500/ISL-DATA revision `bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32`.
[Source card](https://huggingface.co/datasets/ISL500/ISL-DATA/blob/bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32/README.md):
research/academic use only; no commercial grant. No independent participant
consent audit was performed. Videos/features/weights remain local ignored
research artifacts. Do not treat these terms as a redistribution license.

Training:15 clips/67 windows/8 source-reported signers; validation:6/14/3;
test:4/16/2, with no cross-split source User IDs or exact source/window duplicates.
Some planned signers/clips were lost to extraction validity. Source gloss labels
were used without independent expert linguistic review. Data and original
three-class feasibility revision: [dataset audit](PHASE-3-DATASET-AUDIT.md).

Seed42, CPU, AdamW lr.001, batch16,100 epochs; best validation epoch100.
No pretrained sign weights or synthetic training data. The separate native
OpenHands baseline below is not the initialization or live adapter for this GRU.

## Evaluation and rejection

Held-out known clips:4/4 correct, macro-F1 1.0, per-class recall2/2 each;
16/16 correlated windows correct. CPU forward median13.83ms/p95 31.84ms.
These tiny numbers do not establish generalization across cameras, people,
lighting, dialects or continuous conversation.

**Unsupported test glosses:11/11 windows falsely accepted,2/2 clips affected.**
Validation unsupported glosses also failed6/6. Failure persists at the studio's
.8 default threshold. Confidence near1 is not correctness. No genuine neutral
activity set was available. A direct absent-hand request returns NO_SIGN, but
that protocol safeguard does not solve unsupported signs with visible hands.

Temperature .5 and model threshold .5 were fitted to known validation windows.
`calibrated:true` describes that narrow fitting procedure. The four known test
clips have ECE0/NLL≈0 because their probabilities round to1; the observed
unsupported-sign failure demonstrates why this cannot mean generally calibrated
confidence. Exact results: [training report](PHASE-3-TRAINING-RESULTS.md).

## Usage and limits

For explicit local research only, follow the README's model directory, exact
extension-origin and private-token setup. A missing, corrupt, incompatible or
TEST FIXTURE package stays unavailable; no random fallback labels are supplied.
Camera and numeric-window inference require separate explicit actions. Stop,
Esc, hide and exit release resources. V1 remains a separate supported contract.

Physical webcam, real consenting signer, anatomical handedness, sustained device
performance and genuine neutral activity remain unverified. Source-video replay
is documented separately in [final verification](PHASE-3-FINAL-VERIFICATION.md).
Do not present offline feature inference as physical-camera acceptance.

Next required experiment: genuine training negatives and neutral activity, a
rejection method chosen on development/validation data, and a new untouched
held-out test set. The exposed test clips must not silently become a fresh test
for subsequent tuning. Phase4 meeting capture is outside this work.

## Authentic research checkpoint

OpenHands INCLUDE LSTM, ISL263, four-layer bidirectional128+attention. Input
`[N,2,T,27]`, native Holistic clip features. Genuine checkpoint successfully loaded
and evaluated on64 published test clips. Top1:3/64 (4.6875%); a confidently wrong
prediction occurred at0.9553. This is unsuitable as a reliable studio recognizer.
Native upstream batch-axis behavior is preserved and materially limits this
batch-one evaluation. No unknown/neutral or signer-independent result is available.

Full provenance, checksums, licenses, preprocessing and sample-level results:
[model audit](PHASE-3-MODEL-AUDIT.md). Source licenses are preserved under
`ml/research/`; research assets are local ignored downloads. Pose member CRCs and
hashes were checked; the incomplete full archive MD5 was not verified.

