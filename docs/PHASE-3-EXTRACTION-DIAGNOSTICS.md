# Phase 3 extraction diagnostics — 2026-10-20

The original zero-window result was real. Two separate causes required the two
user-approved v2 amendments. Neither amendment changes the preserved v1 contract.

## Why v1 rejected the probes

| Actual source | Native decode | v1 samples at cap 15 Hz | Usable frames | Longest consecutive run | Windows |
|---|---|---:|---:|---:|---:|
| INCLUDE sick, MVI_9363.MOV | 44 frames, 25 FPS | 27 | 22 | 11 | 0 |
| INCLUDE healthy, MVI_5175.MOV | 95 frames, 25 FPS | 57 | 47 | 24 | 0 |
| ISL500 User001 Water | 153 decoded / 172 declared, about 29.61 FPS | 78 | 0 | 0 | 0 |
| ISL500 User001 Sit | 149 decoded / 150 declared, about 29.61 FPS | 76 | 0 | 0 | 0 |

INCLUDE resets came from missing hands (5 and 10 sampled frames respectively).
All eleven required pose points passed; no gap exceeded 250 ms. Counting all
detected frames across interruptions would incorrectly manufacture a sequence.
Water/Sit failed hip visibility at indices 23/24 throughout their upper-body
recordings, even though 23/18 frames respectively contained detected hands.
The source's declared frame count is not treated as successfully decoded frames.

The complete per-frame pose checks, timestamps, masks, normalization checks,
reset reasons and rolling 32-frame candidate rejection ledgers are preserved in
[phase-3-completion-probes.json](phase-3-completion-probes.json). Native PyAV
decoding is used only to audit the source. The browser worker extracts features.
The MOV browser dimensions were 1920×1088 versus PyAV 1920×1080; this observed
decoder difference is recorded rather than silently normalized away.

MediaPipe's Tasks results do not expose detector confidence for each hand or
pose detection. These diagnostic fields are explicitly null. Handedness
classification scores and per-pose-point visibility are different quantities;
they are not substituted for detection confidence.

## Approved v2 and sampling amendment

[The v2 contract](11B-DATA-CONTRACTS-V2.md) keeps the original 161 geometry slots
and appends eleven pose validity masks. Shoulders remain mandatory; unavailable
other pose points are zero with mask 0. A usable frame still requires at least
one fully valid detected hand. No hand is invented. The original v1 extractor,
32 frames, stride 8, increasing timestamps and maximum 250 ms gap are preserved.

V2 alone at 15 Hz did not solve duration: Water/Sit longest runs remained 23/18.
Only one of nine expanded clips produced a window at that rate. The separately
approved sampling amendment caps v2 at 30 distinct decoded frames per second.
Offline extraction records `requestVideoFrameCallback` mediaTime; repeated or
nonincreasing decoded timestamps are skipped. No interpolation, duplicated
frames, padding, mirroring or temporal stretching supplies missing observations.
V1 remains at 15 Hz. The new preprocessing ID is
`tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-v2-native30`.

The live v2 sampler also uses decoded-frame callbacks, with one frame in flight
and a cap of 30 Hz. Its timestamps use the document's monotonic clock so capture
age can be checked by the backend. Offline timestamps are clip media time; both
paths enforce increasing time and the same gap rule. Live frame dropping under
CPU load can change temporal coverage relative to offline extraction and must
be measured on the deployment device.

## Pilot attrition and integrity

Original plan: three known glosses across source User001–User015. Goodmorning
had **zero valid test clips** (longest runs 29, 14 and 20 for User013–015).
The two-class revision was frozen before training or observing model accuracy;
see [the retained original plan](phase-3-pilot-plan.json) and
[the revised plan](phase-3-two-class-plan.json). No samples moved between splits.

Every successful extraction writes the exact worker hash, source SHA-256,
feature SHA-256, actual windows and timestamps. Each diagnostic file includes
all frame observations and every rolling candidate's acceptance/rejection
reason. Detailed local files are under `.cache/phase3-completion/` in the
named extraction batches; [the final audit](phase-3-pilot-extraction-audit.json) records their locations and counts.
The strict dataset loader checks shape, masks, absent-coordinate zeros, source
and extractor linkage, class coverage, signer separation and cross-split exact
source/window duplicates before training.

Some HEVC clips triggered transient Chrome decoder/presentation failures. An
initial long extraction stopped before writing its final manifest. Completed
feature files were recovered by matching frozen catalog IDs/source hashes and
the packaged worker hash; their bytes were preserved. Subsequent extraction
handles per-clip errors, and now saves incremental manifests/reports so later
failures do not discard completed clips. A seek/presentation failure now stops
that clip immediately and records the source time, last decoded PTS and retained
window count. Previously completed valid windows can be retained; no window
crosses the failed segment. For example, User004-Family stopped at requested
5800 ms (duration 5807 ms), after 171 distinct decoded observations, retaining
three genuine complete windows. User014-Goodnight stopped at 4233 ms, with only
22 consecutive usable observations, and still retained zero windows. These are
partial decodes, not claims that the entire source decoded successfully.
Fresh-session retries are recorded separately; source videos and validity rules
are unchanged.

An independent repeat of User002-Goodafternoon produced exactly the same three
windows, timestamps and sampling ledger: maximum absolute feature difference 0.
See [the real extraction parity result](phase-3-real-extraction-parity.json).
This supplements the synthetic cross-language golden-vector tests; it is not
an accuracy result or a guarantee across different browser/detector versions.

## Reproduction

Use the setup and research commands in [the training guide](08-DATASETS-AND-TRAINING.md).
`npm run ml:extract -- CATALOG NEW_OUTPUT` invokes the packaged production worker.
`python -m ml.probe_video VIDEO NEW_JSON` independently audits native PTS/frame
counts with optional PyAV 18.1.0. The diagnostic inspector is opt-in for offline
research; normal webcam sessions do not save video or landmark history.
