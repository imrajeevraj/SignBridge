# Research adaptation notices

`openhands_baseline.py` adapts architecture and normalization from AI4Bharat
OpenHands, copyright2021 The AI4Bhārat team, Apache License2.0; see
`OpenHands-LICENSE.txt`. Modified here to isolate CPU inference, safe checkpoint
metadata loading, restricted numeric data loading and reproducible measurements.
Upstream RNN batch semantics are preserved, not silently fixed.

`include_load_audit.py` adapts INCLUDE's LSTM architecture, copyright2021
AI4Bharat, MIT; see `INCLUDE-LICENSE.txt`. Modified to perform strict safe loading
without importing unrelated legacy training dependencies. No recognition output
is claimed from that load audit.

Dataset poses: AI4Bharat OpenHands publication, Zenodo record6674324, CC-BY-4.0.
INCLUDE corpus: Sridhar and collaborators/AI4Bharat, Zenodo record4010759.
See the model audit for URLs, revisions, checksums, limitations and attribution.
