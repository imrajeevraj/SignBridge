# Consent-based ISL collection procedure — not yet performed

This is a reproducible fallback plan, not evidence that participants or recordings
exist. The application does not gain recording permission or automatic recording.

1. Work with a competent ISL signer/annotator to choose a small authentic vocabulary
   and document regional variants. Do not invent glosses from generic gestures.
2. Obtain explicit participant consent covering local video storage, numerical
   features, training, evaluation, retention/deletion dates and any permitted
   sharing. Keep consent/identity mappings private, separate from pseudonymous IDs.
   Use an explicit recording tool with visible Start/Stop; no covert capture.
3. For the unchanged v1, frame nose, shoulders, elbows, wrists, pinkies and hips.
   Keep hands and all 11 pose points visible. Capture natural signs with neutral
   context; do not slow, loop, repeat or pad a short sign merely to force a window.
   If natural examples systematically cannot meet v1, stop and review the schema.
4. Suggested pilot target: 8 independently verified classes, 15 consenting signers,
   5 natural repetitions per class across multiple sessions. This target has not
   been collected and is not a guarantee of statistical adequacy.
5. Freeze pseudonymous signers 01–09 for training, 10–12 for validation, 13–15 for
   final test before extraction. Keep all takes/near-duplicates from one signer in
   that split. Do not infer signer identity from images. Retain SHA-256 provenance.
6. Collect separately annotated no-sign activities and unsupported ISL signs from
   validation/test signers. Keep unsupported glosses out of training labels. Use
   validation only for rejection thresholds; report final test false acceptance
   separately. No-hand frames are useful behavior tests but are not valid v1
   training windows. Do not call them trained neutral examples.
7. Build the catalog format in 08-DATASETS-AND-TRAINING.md, supplying source consent
   reference, usage terms, label, signer, duplicate group, split and local path.
   Keep raw media/features under ignored ml/data with appropriate local access.
8. Run the packaged extractor. Review every diagnostics JSON, raw decode metadata,
   class/signer attrition and representative annotation boundaries. Require real
   complete windows and class coverage in all three splits before training.
9. Freeze a manifest checksum; train using the existing documented ml.train CLI,
   fixed seed and validation-only early stopping/calibration. Evaluate test clips
   once, reporting confusion matrix, macro metrics, unseen signers, rejection,
   latency and sample counts. Never tune against final test results.
10. Review the model card and local WS/studio predictions on consented real signs,
    then separately perform physical-camera lifecycle acceptance. Apply agreed
    deletion rules and document withdrawals, including retraining implications.

No continuous translation, clinical suitability, demographic fairness or
commercial rights follow from completing this small pilot.
