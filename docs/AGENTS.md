# AGENTS.md — SignBridge AI Agent Instructions

> This document applies to the entire repository. Codex MUST read `PROJECT_DOCS_INDEX.md`, then the relevant files in `docs/`, before altering architecture, model code, capture permissions, or data contracts.

## Mission
Build **SignBridge AI**: a Chrome Manifest V3 extension that shows local live captions from **isolated signs in a limited, explicitly labeled vocabulary** during a user-approved webcam or virtual-meeting capture session. Start with a one-signer hackathon MVP, not a general sign-language interpreter. Focus on user consent, verifiable model behavior, and clear progress through phases.

## Important definitions
- **Codex / GitHub Copilot** are coding assistants, NOT gesture-recognition engines.
- **MediaPipe Holistic / Hand Landmarker** supplies pretrained landmark detection; it does NOT translate sign language.
- **AI4Bharat INCLUDE** supplies an Indian Sign Language dataset / reference implementations / listed pretrained checkpoints; integrate its models ONLY with their native input contract.
- **WLASL I3D / Pose-TGCN** supplies ASL baselines; no assumption of ISL compatibility.
- A separately trained **landmark + GRU** model is a fallback; it is NOT pretrained for sign language unless a compatible checkpoint is actually loaded.

## Source-of-truth reading order
1. `PROJECT_DOCS_INDEX.md`
2. `docs/00-PROJECT-VISION.md`
3. `docs/01-REQUIREMENTS-AND-SCOPE.md`
4. `docs/02-SYSTEM-ARCHITECTURE.md`
5. Read the document matching the requested task.
6. Before touching ML, read `docs/06-MODEL-SELECTION.md`, `docs/07-PRETRAINED-MODELS.md`, `docs/08-DATASETS-AND-TRAINING.md`, `docs/09-ML-INFERENCE-PIPELINE.md`, and `docs/11-DATA-CONTRACTS.md`.
7. Before touching tab capture, read `docs/05-CHROME-EXTENSION-DESIGN.md` and `docs/12-SECURITY-AND-PRIVACY.md`.
8. Before delivering, read `docs/14-TESTING-AND-ACCEPTANCE.md`.

## Work policy
- **Implement only the phase requested**. If no phase specified, start Phase 1 from `docs/13-IMPLEMENTATION-ROADMAP.md`.
- Inspect existing repository and preserve user code and changes. Do not blindly overwrite files or recreate projects.
- Work in small verifiable increments. Implement, type-check, run tests, inspect build artifacts, then report results.
- Avoid placeholder results presented as real. Any fake frames/predictions must be visibly labeled **SIMULATION / TEST FIXTURE** and disabled outside tests.
- A missing checkpoint must return `MODEL_NOT_READY` and no sign captions.
- Never claim full sentence-level translation, ASL↔ISL equivalence, production accuracy, or remote-participant caption delivery.
- Don't download unknown checkpoints, datasets, or execute third-party training scripts blindly: review source, version, checksum, license and expected format.
- Pin compatible dependency versions (lockfiles) after validation; don't invent package versions.
- Use local/bundled JavaScript, WASM and model files inside the MV3 extension (no remote executable code).
- Explicit user action is necessary for capture; provide an unmistakable Stop control and live capture indicator.
- Do not upload/store video, audio, or sign landmarks without clear user opt-in. No microphone capture in MVP.
- Build an accessible Shadow DOM caption overlay that does not modify meeting platform controls.
- Process **one selected signer** initially; multi-party recognition is out of scope.
- Keep ASL and ISL training sets, labels, checkpoints and model metadata separated.

## Standard implementation targets
- Extension: Chrome MV3, TypeScript (strict), React, Vite, locally packaged MediaPipe Tasks Vision.
- Backend: Python FastAPI, WebSocket, Pydantic, localhost-only by default.
- ML: PyTorch, reproducible preprocessing, model registry with checkpoint metadata and authentic labels.
- Tests: Vitest (extension), Pytest (backend/ML), build artifact validation; browser smoke tests where feasible.
- Supported development OS: Windows PowerShell first; maintain portable paths when possible.

## Phase gates
- **P1:** real extension build, real UI/settings, localhost health API; recognition controls disabled.
- **P2:** real webcam landmarks and deterministic feature contract; no translated captions yet.
- **P3:** verified pretrained baseline OR properly trained custom sign model; honest evaluation.
- **P4:** user-triggered tab capture, ROI selection, lifecycle handling; working path to backend.
- **P5:** end-to-end captions, security/privacy audit, error behavior, latency/accuracy report and demo.

## Deliverable report after every task
1. What changed (file paths); 2. Commands run; 3. Tests/build results (passed/failed/not run); 4. Honest feature status; 5. Blockers/risks; 6. Next smallest step.

## Prohibited shortcuts
- Never map generic gestures such as thumbs-up to an ISL/ASL word without sign-language validation.
- Never pass custom `(32,161)` features directly to an INCLUDE or WLASL checkpoint unless an inspected adapter proves equivalence.
- Never insert a token sign caption because a UI animation fired.
- Never infer individual identities or perform face recognition.
- Never assert page-injected captions are visible to others on the call.
