# SignBridge ML — Phase 3 partial

The custom GRU architecture, exact-feature dataset loader, training/evaluation,
package export and CPU inference adapter are implemented. A genuine local research
package exists at `ml/runs/isl500-v2-pilot`:4/4 known test clips correct, but11/11
unsupported test windows falsely accepted. Real-time studio acceptance also failed
on this host. See the final verification report; this is not a reliable sign model.
Synthetic unit-test packages cannot be loaded by the application.

- [Dataset format and training commands](../docs/08-DATASETS-AND-TRAINING.md)
- [Model audit and authentic offline results](../docs/PHASE-3-MODEL-AUDIT.md)
- [Live protocol and local authorization](../docs/09-ML-INFERENCE-PIPELINE.md)
- [Model card](../docs/PHASE-3-MODEL-CARD.md)

Run CLIs from the repository root using `backend/.venv/Scripts/python.exe -m ml.train`
or `ml.inspect_dataset`, `ml.evaluate`, `ml.research.openhands_baseline` and
`ml.research.include_load_audit`. See each `--help`. Raw data/runs/models belong
in ignored `ml/data`, `ml/runs`, `ml/models`; never commit participant data.

The shared live architecture is `backend/app/inference/gru.py`. Exact browser
preprocessing is reused by `scripts/extract-dataset.mjs`; Python does not implement
an alternative feature normalization. `tests/golden-vector.json` is TEST FIXTURE
geometry shared by TypeScript and Python, not sign-language data.
