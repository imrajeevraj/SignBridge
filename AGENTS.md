# SignBridge AI repository conventions

Read the project reference instructions in `docs/AGENTS.md` and the numbered
documents relevant to the task. Preserve these user-supplied references. If
`PROJECT_DOCS_INDEX.md` or a referenced document is absent, report the gap before
implementing a future feature that depends on its contract. The user authorized
the new custom schema in `docs/11-DATA-CONTRACTS.md`. The numbered phase gates in
`docs/13-IMPLEMENTATION-ROADMAP.md` take precedence over condensed summaries.

- The current repository is Phase 3 PARTIAL (genuine two-class research model and backend inference; unsupported-sign rejection and real-time studio acceptance failed). Use strict TypeScript, typed Python, npm workspaces and the existing component boundaries.
- `extension/src/background` owns extension lifecycle and privileged backend requests. Register listeners synchronously at module scope. Never rely on service-worker global memory for durable state.
- `communication/messages.ts` owns discriminated message contracts. Treat incoming values as unknown and validate at runtime. Future commands must return `NOT_IMPLEMENTED` until genuinely implemented.
- Content scripts run only on the manifest's meeting origins. They must be idempotent and must not change native meeting controls. Future captions should use an isolated Shadow DOM and only genuine predictions.
- The offscreen HTML is packaged but inactive. Do not add `offscreen`, `tabCapture`, camera, microphone or broad host permissions before implementing explicit user consent and lifecycle cleanup.
- Webcam streams are allowed only after Start in the visible studio. Release tracks/worker on Stop, error, hide and exit. No recording, external runtime scripts, fake predictions or implied sign-model readiness. Local numeric-window inference requires separate explicit consent, origin/token authorization and a validated compatible trained package. ASL and ISL are separate sign languages; caption output language is a separate preference.
- Keep model/WASM/font/icon assets local and preserve MV3 CSP. Vite development pages are previews, never the unpacked extension source.
- FastAPI binds to loopback by default. Keep CORS explicit, never wildcard with credentials. Do not add secrets or upload user media.
- Use `npm ci`, `npm run assets:setup` and `npm run backend:setup`. Run `npm run validate` and `npm run backend:test` after changes. For extension integration changes, build and run `npm run test:e2e`; README documents the Windows browser fallback and occupied-port override. Automated tests must never activate a physical camera.
- Do not claim checks passed unless executed. Update docs/PHASE-3-VERIFICATION.md with evidence and remaining limitations; preserve historical Phase 1/2 records.
- Keep changes focused. Do not publish or deploy without user authorization.

Build boundary: Vite emits dashboard/webcam/offscreen HTML and a module service worker;
separate IIFE builds emit `content.js` and classic `vision-worker.js`. Preserve deterministic manifest paths
and run the package validator rather than assuming a normal React build suffices.

Phase 3 protocol: docs/09-ML-INFERENCE-PIPELINE.md. Do not alter approved geometry
in docs/11-DATA-CONTRACTS.md. Native pretrained models remain offline unless a
separately versioned, reviewed compatible adapter exists. Never enable test_fixture
packages via application configuration; Python tests alone may opt in to fixtures.
