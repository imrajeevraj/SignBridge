# Local inference protocol — signbridge.inference.v1

This newly created document describes Phase 3. `11-DATA-CONTRACTS.md` geometry
remains unchanged; its historical no-transmission statement is superseded **only
after explicit Enable local inference**. No data is sent to a meeting provider.

## Lifecycle and architecture

Visible studio Start → existing opt-in camera → local worker → model-selected
32×161 v1 or 32×172 v2 features. The worker transfers an emitted feature window to that studio; raw video
stays there. Inference requires an additional user action, ready model and token.
One WebSocket request per studio is in flight; one backend model job globally.
No unbounded retry or work queue. The registry states are `MODEL_NOT_INSTALLED`,
`MODEL_LOADING`, `MODEL_READY`, `MODEL_ERROR`, `MODEL_INCOMPATIBLE`,
`MODEL_UNAVAILABLE`. Only READY may infer. Loading happens outside the event loop.
There is one selected custom GRU package per backend start, so no model selector
is displayed. Native incompatible models remain offline research scripts.

`GET /health` reports phase3, backend health and registry state. `GET /model/info`
returns model ID/version/type/language, exact schema/shape, ordered labels/count,
checkpoint hash, confidence policy and message. Missing model: available false,
empty labels, null identifiers. An online backend does not imply model readiness.

## Local authorization and setup

Bind defaults to `127.0.0.1`; permitted hosts are localhost/127.0.0.1. HTTP CORS is
the exact preview origin `http://127.0.0.1:5173`. WebSocket additionally checks an
exact origin allowlist. In Chrome, copy the extension ID from chrome://extensions
or the complete studio origin shown in the panel:

```powershell
$env:SIGNBRIDGE_PORT = '18000'
$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_EXTENSION_ORIGINS = 'chrome-extension://YOUR_32_LETTER_EXTENSION_ID'
# Local research pilot; read its model card and limitations before enabling:
$env:SIGNBRIDGE_MODEL_DIR = 'D:\SignBridge AI\ml\runs\isl500-v2-pilot'
npm run build
npm run backend:dev
```

The ID placeholder must be replaced by Chrome's actual a–p identifier. Multiple
authorized extension origins may be comma separated. Wildcards are rejected.
The backend creates a random token in ignored `backend/.local/inference-token`
or accepts a private 32–128 character `SIGNBRIDGE_TOKEN`. Copy that file's contents
into the studio password field; do not commit it, put it in Vite env or share it.
Token stays in page memory, is cleared after connection, and is never persisted
in Chrome settings. File creation requests owner-only POSIX permissions; Windows
uses the user's inherited directory ACL, so protect the local user account/folder.
Restart with a new token to rotate it. No token is returned by an HTTP endpoint.

Open studio, Start webcam, Refresh model status, enter token and Enable. A missing
model keeps Enable disabled. Stop/Esc/hide/exit/error closes inference and camera;
disconnect resets active output and requires explicit reconnect. No camera starts
automatically. Recognition controls never start meeting/tab capture.

## WebSocket messages

Connect `/ws/infer` with an allowed browser Origin. Authenticate within five seconds:

```json
{"type":"authenticate","protocol":"signbridge.inference.v1","token":"PRIVATE_SESSION_TOKEN"}
```

Reply: `authenticated`, protocol, current `model` info. A predict message contains:

| Field | Contract |
|---|---|
| type / protocol | `predict` / `signbridge.inference.v1` |
| request_id / model_id | 1–80 ASCII alphanumeric, underscore or hyphen |
| schema_version | `signbridge.custom-gru.v1` or approved `signbridge.custom-gru.v2` |
| sequence_id | increasing nonnegative integer, never bool |
| sequence_shape | `[32,161]` for v1; `[32,172]` for v2 |
| sampling_hz | 15 (legacy default) for v1; explicitly 30 for v2 |
| captured_at_ms / sent_at_ms | finite Unix epoch ms, sent >= captured |
| features | exactly 5152 (v1) or 5504 (v2) finite JSON numbers, row-major float32-compatible |

Presence masks must be binary, absent hand slots zero. Any no-hands row returns
`NO_SIGN` without model execution. Unsupported fields, schemas, shapes, numeric
strings, bool features, NaN/Infinity and out-of-float32 values are rejected.
V2 additionally validates eleven pose masks, mandatory shoulders and zero
coordinates for absent optional pose points. Model metadata, request schema,
shape and sampling policy must agree. A model schema change stops capture and
clears buffers; the user must explicitly restart. See `11B-DATA-CONTRACTS-V2.md`.
Capture age >5 seconds, timestamps >1 second ahead, nonincreasing sequence/capture
or one of 32 remembered request IDs are stale. Maximum prediction rate is10/s.

Prediction replies include type/protocol, both correlated IDs, model ID, capture
time, label or null, confidence or null, accepted, `ACCEPTED`/`UNKNOWN`/`NO_SIGN`,
and model-job latency_ms. Low confidence and a trained neutral class never return
a visible sign label. Structured errors contain type `error`, protocol, request_id
when validated, code and generic message, never input landmarks or tokens.

Bounds: 262144 UTF-8 bytes/message, two active sockets, five-second authentication,
30-second idle disconnect, one model execution thread, three-second prediction
timeout. Uvicorn uses ws_max_size262144/ws_max_queue1/limit_concurrency16. A timed
out thread retains its busy slot until it actually finishes. Python cannot kill
a hung native inference thread: shutdown may wait; restart the backend for a
genuinely hung model. There is no process-isolation recovery in this milestone.

## Output filtering and measurement

Studio minimum confidence cannot undercut model threshold. Defaults: .8,
two consecutive windows, 1500ms cooldown. Duplicate accepted labels do not add
history repeatedly. An uncertain/neutral/no-sign observation or invalid continuity resets
the sign segment; uncertain outputs clear the current label. Stale responses,
old generations and results for a different model/request are ignored/rejected.
History is bounded to ten labels and can be cleared. Nothing generates sentences.

Diagnostics: worker processing and feature+buffer ms, FPS, window accumulation,
model latency, request round trip, latest-frame-to-response, and round trip minus
model time (non-model overhead, not pure network time). At15FPS a32-frame window
spans about2.07s, before stability/cooldown. CPU/memory and live sign accuracy have
not been benchmarked. Confidence is not correctness; unknown signs can receive
high confidence from a closed-set classifier.
