# Datasets and training — Phase 3 implementation

This document was absent and is newly derived from implemented code. The
authoritative geometry remains `11-DATA-CONTRACTS.md`. Its Phase 2 statements
about transport are historical; Phase 3 transport is specified separately in
`09-ML-INFERENCE-PIPELINE.md`. V1 geometry, ordering and sampling are unchanged;
the separately approved v2 policy is in `11B-DATA-CONTRACTS-V2.md`.

## Current evidence

The original zero-window probes and native OpenHands evaluation are retained as
historical evidence. The approved additive v2 contract and native30 sampling
policy now yield genuine ISL500 windows. See the current
[dataset audit](PHASE-3-DATASET-AUDIT.md),
[extraction diagnostics](PHASE-3-EXTRACTION-DIAGNOSTICS.md) and
[training results](PHASE-3-TRAINING-RESULTS.md). No participants were recorded.
Synthetic **TEST FIXTURE** packages remain rejected by the normal application.

## Reproduce the research pilot

The pinned source list includes 57 videos (about 1.08 GB), research/academic use
only. Its exact source paths, source-reported User IDs, splits, byte counts and
LFS SHA-256 values are in `ml/research/isl500-pilot-sources.json`. The downloader
verifies every file. Original three-class and revised two-class catalogs are
both retained; use the latter for the frozen pilot described in
`docs/phase-3-two-class-plan.json`. Every output path below must be new.

```powershell
.\backend\.venv\Scripts\python.exe -m ml.research.fetch_isl500_pilot ml/data/isl500-source
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run build
npm run ml:extract -- ml/data/isl500-source/known-two-class-catalog.json ml/data/isl500-known
npm run ml:extract -- ml/data/isl500-source/unknown-catalog.json ml/data/isl500-unknown
.\backend\.venv\Scripts\python.exe -m ml.inspect_dataset ml/data/isl500-known/manifest.json
.\backend\.venv\Scripts\python.exe -m ml.train ml/data/isl500-known/manifest.json ml/runs/isl500-v2-reproduction --seed 42 --epochs 100 --batch-size 16 --patience 12 --hidden-size 128 --layers 2 --dropout 0.2 --learning-rate 0.001 --device cpu
.\backend\.venv\Scripts\python.exe -m ml.evaluate ml/data/isl500-known/manifest.json ml/runs/isl500-v2-reproduction --output ml/runs/isl500-v2-reproduction/recheck.json
.\backend\.venv\Scripts\python.exe -m ml.evaluate_open_set ml/data/isl500-known/manifest.json ml/data/isl500-unknown/manifest.json ml/runs/isl500-v2-reproduction ml/runs/isl500-v2-reproduction/open-set.json
```

Inspect extraction failures before training. Browser/codec differences can change
coverage; do not claim a reproduction has identical metrics without comparing
source, worker, feature and manifest hashes. The recorded run used multiple
extraction batches and explicit recovery/retries, merged against one frozen
catalog with `python -m ml.merge_extractions CATALOG NEW_OUTPUT MANIFEST...`.
Do not merge different schemas, sampling policies or extractor hashes.

Training uses AdamW, deterministic seed, gradient clipping, validation-loss early
stopping and validation-only temperature/threshold calibration. Final test clips
never choose hyperparameters. Overlapping windows are correlated, so primary
accuracy uses one mean-logit decision per original clip. Separate window metrics
describe the live prediction unit. Unknown glosses are evaluation-only, and the
closed-set threshold is frozen before their test evaluation; it does not by
itself establish reliable unknown rejection.

## Data preparation

Choose one language and vocabulary actually present in a lawfully usable corpus.
Record source/license, consent where required, stable pseudonymous signer IDs and
near-duplicate clip groups. Do not infer identity from videos. Unknown signer IDs
must be resolved from dataset metadata before claiming signer independence.
All clips from a signer, exact source checksum, or near-duplicate group must stay
in one split. The loader checks these rules and rejects repeated exact feature
windows across splits. Near-duplicate grouping is a curator-supplied audit field;
there is no automatic perceptual-video deduplicator. Audit that field before use.

Create a local `catalog.json`. This is its structure, **not real training data**:

```json
{
  "purpose": "real_labeled_data",
  "dataset_id": "YOUR_VERIFIED_DATASET",
  "language": "ISL",
  "source": "DATASET_RECORD_AND_REVISION",
  "license": "VERIFIED_LICENSE",
  "labels": ["VERIFIED_LABEL_A", "VERIFIED_LABEL_B"],
  "samples": [{
    "id": "clip-001", "label": "VERIFIED_LABEL_A", "signer_id": "participant-001",
    "duplicate_group": "original-clip-001", "split": "train",
    "video_path": "videos/clip-001.mp4", "source_sha256": "ACTUAL_SHA256"
  }]
}
```

Supply real clips for every selected class in **train, validation and test**, with
disjoint signers. Explicit split assignments are deterministic and preserved.
Source checksums are computed; a supplied checksum must match. Do not share
participant identity mappings or private videos in Git. `ml/data/` is ignored.

```powershell
npm run build
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run ml:extract -- ml/data/catalog.json ml/data/extracted-v1
.\backend\.venv\Scripts\python.exe -m ml.inspect_dataset ml/data/extracted-v1/manifest.json
.\backend\.venv\Scripts\python.exe -m ml.train ml/data/extracted-v1/manifest.json ml/runs/isl-v1 --epochs 100 --batch-size 32 --patience 12 --seed 42 --device cpu
.\backend\.venv\Scripts\python.exe -m ml.evaluate ml/data/extracted-v1/manifest.json ml/runs/isl-v1 --output ml/runs/isl-v1/recheck.json
```

Output directories must not already exist. Offline extraction opens an isolated
extension page and processes explicitly named local files. It never requests a
camera or microphone. It uses the **same built vision-worker.js** as the studio,
records its SHA-256, uses CPU detectors and seeks local video at 15 Hz. Complete
32-frame windows/stride 8 only; no padding/interpolation. Missing hands or invalid
pose reset the buffer. Clips >300 seconds and malformed videos fail explicitly.
Zero-window clips are rejected in `extraction-report.json`; missing class coverage
then prevents training. Slower live sampling remains a domain-shift risk: training
at the cap does not establish accuracy at every supported frame interval.

Each exported clip contains source hash, extractor hash, feature/preprocessing
versions, numeric windows with timestamps and measured extraction diagnostics.
The generated manifest records feature-file checksums and preserves labels, signer,
split, source and license. Loader validates shapes, finiteness, masks, absent-hand
zeros, increasing timestamps, gaps and provenance. Python performs no additional
coordinate normalization. Shared JSON golden geometry pins TypeScript output and
Python training/inference input parity.

## Training and export

Default: batch-first GRU, input 161, hidden128, two layers, recurrent dropout .2;
last hidden output → dense64 → ReLU → class logits. CLI overrides hidden size,
layers, dropout, batch size, epochs, patience, learning rate and seed. No assumed
sign vocabulary. AdamW lr .001, weight decay .0001, gradient clipping1, plateau
scheduler factor .5/patience4, best validation loss and early stopping patience12.
Seeds cover Python/numpy/torch and the shuffled loader; deterministic algorithms
are requested. CPU works; `--device cuda` requires a separately compatible CUDA
PyTorch installation. CUDA was unavailable and untested here.

Temperature and confidence threshold are selected on held-out validation windows,
matching live per-window logits. Threshold chooses >=90% empirical precision with
at least five accepted validation windows, otherwise .8 and `calibrated=false`.
Windows from one clip are correlated; this is not statistical confidence or
open-set calibration. Test metrics count clips (mean window logits), with confusion
matrix, macro/per-class metrics, accepted coverage, latency and dataset statistics.
Optional `--neutral-label` must name an actual labeled class. Its false-positive
rate is reported only when present. Unknown rejection is null without suitable data.

Export includes `weights.safetensors`, `metadata.json`, `evaluation.json`, ordered
labels and SHA-256 links. Embedded safetensors schema/label hashes must match.
The loader rejects wrong shapes, missing/corrupt artifacts, bad labels/languages,
nonfinite weights and packages without held-out signer evidence. Hashes ensure
integrity, not scientific authenticity: independently inspect source/evaluation
before installing a package. CLI training rejects test data; only Python unit
tests can enable fixture training/loading explicitly.

A real INCLUDE MOV extraction probe decoded27 samples,22 ready and5 no-hands.
Its duration/usable segment was too short for32frames, so it correctly yielded
zero windows. A second real MOV produced57frames (47ready,10no-hands) but
also zero complete windows due to continuity resets. No signer identity was inferred and the probe is not a training set.
See [probe evidence](phase-3-extraction-probes.json).

Still unverified: usable dataset extraction across codecs, full genuine training,
human-verified class meanings, unseen signer accuracy, neutral/open-set behavior,
and live-versus-offline sampling robustness. A malformed-video extraction attempt
correctly failed; that does not establish successful extraction of a real sign clip.
