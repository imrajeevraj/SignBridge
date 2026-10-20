# Phase 3 model audit — 2026-10-19

Decision: use the approved custom GRU contract for the live adapter. Keep native
models offline. **No compatible trained live checkpoint is installed.** An
authentic OpenHands checkpoint was evaluated, but it is neither input-compatible
nor sufficiently accurate in this evaluation to enable in the studio.

## Sources inspected

| Candidate | Inspected revision | Source/license |
|---|---|---|
| INCLUDE | `df348f4a640060d4d39f02556d9f96851e8c46c7` | [AI4Bharat/INCLUDE](https://github.com/AI4Bharat/INCLUDE), MIT source |
| OpenHands | `b9ccf9eaf2a71301fc4601a64a6af06fdef04c9b` | [AI4Bharat/OpenHands](https://github.com/AI4Bharat/OpenHands), Apache-2.0 source; repository says no longer maintained |
| WLASL | `ac00e6be631c1a2a486621b65f202219f3964d6b` | [dxli94/WLASL](https://github.com/dxli94/WLASL), ASL; C-UDA academic/noncommercial dataset terms |

INCLUDE inspection covered README, requirements, configs, checkpoint links,
keypoint generation, runner, evaluation, dataset, train_nn, LSTM/transformer and
label maps. OpenHands inspection covered release config/weights, dataset reader,
label ordering, Holistic extraction, transforms, pose flattener, RNN and attention.
WLASL was inspected as an explicitly ASL alternative, not downloaded or evaluated.
Repository source licenses are not an independent grant for every linked model
or third-party video. Check distribution rights before shipping external weights.
No external weights or dataset archives are included in the extension or Git files.

## INCLUDE50 LSTM

- Language: ISL, INCLUDE50's 50-label vocabulary; full INCLUDE has 263 classes.
- Native float32 input: batch × 169 padded frames × 134 features. Interleaved xy
  for 25 upper-body pose points, then 21 hand-1 and 21 hand-2 points.
- Legacy MediaPipe Hands + `Pose(upper_body_only=True)`, not Tasks Vision 1.1.1.
  Missing values use NaN then pandas bidirectional linear interpolation; wholly
  absent groups become zero. Coordinates scale x by 1920 and y by 1080.
  Single-hand ordering uses proximity to pose wrists, unlike the studio's labels.
- Five bidirectional LSTM layers, hidden 256, recurrent dropout .2, temporal max
  pooling, dense 512→50. Native `F.dropout(x,p=.3)` remains active even under
  `.eval()` because the function omits `training=self.training`.
- Other listed architectures: small/large transformer, hidden 256/512,
  2/4 layers, 4/8 attention heads. Six non-CNN checkpoint links are real URLs;
  four CNN entries contain the literal placeholder `link`.
- [Inspected checkpoint URL](https://api.wandb.ai/files/abdur-ai4bharat/include50-no-cnn/1isx5nl6/augs_lstm.pth):
  85,669,566 bytes; SHA-256
  `d3f0b4b17c4c5c25caad11ea1cd0707781dafc5c195c4f2b41b23a5f07cfa147`.
- Loaded with `torch.load(weights_only=True)` and narrowly scoped numpy metadata
  allowlisting. Strict state-dict load: all keys matched; 7,136,306 parameters,
  finite weights. See [load evidence](phase-3-include-load.json).
- No labeled native INCLUDE inference or latency claim: matching legacy features
  were not extracted. Two later raw-clip probes use the different Tasks extractor. OpenHands Holistic poses are not a substitute.
- Dataset: [INCLUDE record](https://zenodo.org/records/4010759), CC-BY-4.0. Large
  raw-video archives were not downloaded in full; a later targeted member read
  obtained two real clips for a separate custom-extractor diagnostic (see
  [probe evidence](phase-3-extraction-probes.json)). Code MIT; no separate checkpoint-specific
  license was verified beyond the repository/release context.

## OpenHands INCLUDE LSTM — genuine offline baseline

- Language: ISL; 263 labels sorted exactly from the published CSV `Word` column,
  including numeric prefixes. No translation or label renaming is applied.
- [Release archive](https://github.com/AI4Bharat/OpenHands/releases/download/checkpoints_v1/include_lstm.zip):
  18,777,287 bytes, SHA-256
  `22e3b923fa066dd37c7ae44899fe00dacc737df61f00c730853b77f7ab58018d`.
  Inner `epoch=294-step=63719.ckpt` SHA-256
  `64120471b35926eceb08ed687c57e7a088e6f148600ea89bf66270fa0b70935b`.
- Native input `[N,2,T,27]` float32 from full-clip Holistic 75-point body+hands;
  use xy, discard z and confidences. Select original indices
  `[0,2,5,11,12,13,14,33,37,38,41,42,45,46,49,50,53,54,58,59,62,63,66,67,70,71,74]`.
- Center is the clip mean of shoulder midpoints; divide by mean shoulder distance.
  No aspect correction. Zero missing coordinates are retained and transformed;
  no hand masks. Degenerate zero shoulder scale disables normalization. No
  fixed-rate resampling in this checkpoint config. Native collator pads to the
  longest clip in a batch; evaluation here uses one full clip per batch.
- Pose flattener converts to `[N,T,54]`; 4-layer bidirectional LSTM hidden 128,
  attention pooling, linear 256→263. Upstream RNN omits `batch_first=True` despite
  passing `[N,T,F]`. This audit deliberately preserves that behavior; batch size
  changes semantics. This is not a reproduction of claimed paper accuracy.
- Strict load passed using modern CPU PyTorch and a small inspected architecture
  adaptation. Legacy Lightning callback class keys are mapped to inert local
  classes within `safe_globals`; no legacy callback code or unrestricted pickle
  loader is executed. Research adaptation licenses are in `ml/research/`.
- Data: [published OpenHands pose record](https://zenodo.org/records/6674324),
  CC-BY-4.0, `INCLUDE.zip` 662,887,244 bytes, published MD5
  `f99f6f3ea50d5d94e0ffae44130a6672`. It contains a stored `Pose_Signs.zip`.
  Full download failed and resume timed out. The baseline used the partial local
  prefix plus verified HTTP ranges to read the nested archive. **Full archive MD5
  was not verified.** ZIP CRCs were checked for each accessed pose member and each
  member's SHA-256 is recorded. Restricted numeric unpickling rejects arbitrary
  globals. This is a narrower integrity check than a complete archive checksum.

### Measured results

[Machine-readable results](phase-3-native-results.json) contain all 64 sample
paths, hashes, labels, predictions, confidence, timing, per-class scores and the
263×263 confusion matrix. Selection: first 64 matching test CSV rows, 37 true
classes, unbalanced and mostly adjectives; no sample selection based on accuracy.

| Metric | Actual result |
|---|---:|
| Correct / evaluated | 3 / 64 |
| Top-1 | 4.6875% |
| Macro precision, all 263 classes; absent classes score zero | 0.9506% |
| Macro recall, same convention | 0.5703% |
| Macro F1, same convention | 0.5577% |
| First forward pass (not model load) | 82.396 ms |
| Subsequent forward median / p95 | 36.928 / 54.641 ms |

CPU PyTorch 2.14.1+cpu, two intra-op threads, batch one. Timings exclude archive
I/O, preprocessing, transport and camera capture. Correct example: `2. quiet`
→ `2. quiet`, confidence 0.9973. Incorrect example: `1. loud` → `55. Thank you`,
confidence 0.9553. High softmax confidence clearly does not guarantee correctness.
Unknown/neutral rejection, false-positive rate and unseen-signer accuracy are
**unmeasured**: this selected test data has no audited neutral set or signer split.

## Live model decision

The studio emits `[32,161]` from a different extractor, normalization, ordering,
masks and time policy. Neither native model may consume that tensor. The live
adapter therefore accepts only `signbridge.custom-gru.v1` safetensors packages.
The architecture/training/export path is implemented; an authentic matching
trained package remains unavailable. No random model is installed as a fallback.
WLASL cannot establish ISL recognition. The unknown/neutral and physical-signer
acceptance gates remain open. Do not proceed to a recognition demo on these scores.

## Reproduce research

Clone the three official sources into `.cache/phase3-audit/` and check out the
exact revisions above. Download the two checkpoint URLs to `include50_lstm.pth`
and `openhands_include_lstm.zip` in that folder; the scripts verify their hashes.
Download the pose record's `INCLUDE.zip` as `INCLUDE-poses.zip`.

```powershell
.\backend\.venv\Scripts\python.exe -m ml.research.include_load_audit
.\backend\.venv\Scripts\python.exe -m ml.research.openhands_baseline --limit 64
# Only for a partial prefix: reports full-archive verification as false
.\backend\.venv\Scripts\python.exe -m ml.research.openhands_baseline --partial-archive --limit 64
```

These commands are explicit research operations. Normal backend/extension startup
does not download checkpoints or datasets.
