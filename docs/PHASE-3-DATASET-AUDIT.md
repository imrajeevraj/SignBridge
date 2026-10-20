# Phase 3 dataset audit — 2026-10-20

A genuine, checksum-verified **two-class ISL research pilot** now contains 25
usable source clips and 97 complete v2 windows. This is a feasibility dataset,
not sufficient evidence of broad sign-language recognition quality.

| Split | Source-reported signers with usable clips | Clips | Windows | Family / Goodafternoon clips |
|---|---:|---:|---:|---:|
| Train | 8 | 15 | 67 | 8 / 7 |
| Validation | 3 | 6 | 14 | 3 / 3 |
| Test | 2 | 4 | 16 | 2 / 2 |

Splits were frozen by source User ID: train User001–009, validation User010–012,
test User013–015. User008 has no usable training clips and User014 no usable test
clips. Five of the 30 targeted two-class recordings were excluded by the unchanged
32-frame continuity requirements. The successful User004-Family extraction is a
partial decode: three complete windows preceded an end-of-clip presentation timeout.
No signer was reassigned. Source IDs are metadata, not identities inferred from
video or independently authenticated participants.

The original three-class plan included Goodmorning. It was removed **before any
training or model accuracy was observed**, solely because all three test clips
failed extraction. Both plans are retained. This extraction-conditioned selection
biases evaluation toward clips with visible, continuously detected signing.

Unsupported glosses Goodevening and Goodnight were reserved for evaluation only.
Of 12 targeted clips, four yielded windows: validation 2 clips / 6 windows from
User010; test 2 clips / 11 windows from User013. Their source glosses are absent
from the trained vocabulary. Eight failures remain excluded; User014-Goodnight
still has no valid window after a diagnostic partial decode. No genuine neutral
activity corpus was available; absent-hand protocol tests do not replace one.

## Provenance and terms

All 57 original candidate/unknown downloads (1,075,545,904 bytes) match their
pinned source LFS SHA-256 and byte counts. They contain no duplicate source hashes.
The strict loader also checks feature hashes, exact window duplication across
splits, source/duplicate groups and signer separation. Near-duplicate grouping is
source-path based; there is no perceptual deduplication or independent identity
verification. Full source paths and hashes are in
`ml/research/isl500-pilot-sources.json`; no guessed labels or ASL data were added.

ISL500 revision: `bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32`.
The [source card](https://huggingface.co/datasets/ISL500/ISL-DATA/blob/bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32/README.md)
permits research and academic use; it supplies no commercial grant or standard
license identifier. This local run follows that stated purpose. It does not
establish independent verification of uploader rights or participant consent.
Raw videos/features/weights remain local ignored research assets, not a publicly
redistributed product. No new participants were recorded.

The [machine-readable extraction audit](phase-3-pilot-extraction-audit.json)
records exact counts, source/diagnostic hashes, rejected IDs, per-frame reason
counts, rolling-candidate outcomes, resets, decoded sampling and partial-decode
failures. Full candidate ledgers remain at the local paths named there.
Known manifest SHA-256:
`d7af42594a48ef8d32f04ad7332277eb8a3144b3de35e9722f988d319f5f5048`.

Reproduction commands: [training guide](08-DATASETS-AND-TRAINING.md).
Data quality limits and results: [training results](PHASE-3-TRAINING-RESULTS.md)
and [model card](PHASE-3-MODEL-CARD.md). The initial audit below is historical;
its zero-training-data status was superseded by this explicitly approved v2 run.

---

# Historical feasibility audit — 2026-10-19

**No training-ready compatible corpus has been established.** Four actual videos
were processed with the packaged v1 worker; none produced a complete window.
These are feasibility probes, not representative dataset-quality measurements.

| Source | Verified availability / terms | Decision |
|---|---|---|
| [INCLUDE, Zenodo 4010759](https://zenodo.org/records/4010759) | Real labeled MOV files retrieved from the published archive; CC-BY-4.0 record. Two member CRCs and local SHA-256s checked; full archive checksum not checked. Signer IDs unresolved for these probes. | Preserve lawful reference probes. Zero v1 windows; do not invent signer metadata or training splits. |
| [OpenHands](https://github.com/AI4Bharat/OpenHands) INCLUDE poses/checkpoint | Apache-2.0 code; dataset terms remain separate. Native Holistic input differs from the current Tasks Vision geometry. Prior authentic 64-sample native evaluation is in PHASE-3-MODEL-AUDIT.md. | Offline baseline only; no conversion by relabeling tensors. |
| [ISL500 / ISL-DATA](https://huggingface.co/datasets/ISL500/ISL-DATA/blob/bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32/README.md) | Card describes 500 words, 15 users, one video per word/user. Actual API lists User001..User015; inspected User001 contains 500 videos. Raw files individually available. Card restricts use to research/academia; no standard license identifier or commercial grant. | Two checksum-verified research probes only. Both fail v1 hip visibility. Do not redistribute or assume permission for commercial deployment; confirm stewardship/participant permissions before a broader release. |
| [ISLTranslate](https://github.com/Exploration-Lab/ISLTranslate) | Published sentence/phrase-aligned continuous ISL. README discusses noncommercial attribution terms. No isolated word boundaries verified. | Not selected: sentence labels cannot become isolated-sign labels by assumption. |
| [HWGAT study](https://arxiv.org/abs/2407.14224) | Paper describes a larger isolated ISL corpus. A freely downloadable, clearly licensed raw release was not verified in this audit. | Candidate for follow-up, not claimed available or used. |

## Exact new probes

Repository revision: `bf1fc5a65ce5ccccdd25eba01f55558db2ccbf32`.
Source folder: `Videos/User001/`. Labels and signer ID come from source paths,
not visual identification. Source LFS SHA-256 equals downloaded file SHA-256.

| Source filename | Bytes | SHA-256 |
|---|---:|---|
| Water__session117__clip006.mp4 | 21684603 | `2b0cdf026855d56bebeb1202c444e555f48a211e94109dd9dd69e03d91b6f0cc` |
| Sit__session119__clip011.mp4 | 18797843 | `50dce7dc498caa7a4d177cd9eb3c55491b7cae3c35815b247363090afff8efcf` |

The probe catalog deliberately has no validation/test coverage and is rejected by
the training loader. Water/Sit are source glosses, not an approved product vocabulary.
No ASL, synthesized movements, guessed labels or guessed signer IDs were added.
No neutral class is present; unknown/neutral accuracy cannot be measured here.

## Reproduce the new research probes

```powershell
python -m ml.research.fetch_isl500_probes ml/data/isl500-probes
backend/.venv/Scripts/python.exe -m pip install -r ml/requirements-extraction.txt
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = 'D:\SignBridge AI\.cache\chrome-for-testing-155\chrome-win64\chrome.exe'
npm run build
npm run ml:extract -- ml/data/isl500-probes/catalog.json ml/data/isl500-probes-v1
backend/.venv/Scripts/python.exe -m ml.probe_video ml/data/isl500-probes/Water__session117__clip006.mp4 ml/data/water-native.json
```

Use new output paths. Downloads are ignored local research assets; no third-party
training scripts are executed. PyAV 18.1.0 is an optional source-decoding diagnostic,
not a feature extractor. Version 19.0.1 requires Python >=3.12 and was not installed
in this Python 3.11 environment.

If a compatible corpus remains unavailable, follow
[the consent-based procedure](PHASE-3-COLLECTION-PROCEDURE.md). Proposed future
signer-disjoint splits must be frozen before training and evaluated only after
class coverage and duplicate-group audits. No split or accuracy is claimed today.
