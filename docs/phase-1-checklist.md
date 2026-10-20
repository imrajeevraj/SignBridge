# Phase 1 verification record

Verified on **18 October 2026** on Windows, Node 20.20.0, npm 11.12.1 and
Python 3.11.9. No inference or capture was implemented.

| Acceptance check | Result / evidence |
| --- | --- |
| Workspace and dependencies | npm workspace, package lock, local Python venv and complete Python requirements lock created; installed successfully |
| Strict TypeScript | `npm run typecheck` and the build's `tsc --noEmit` passed |
| Frontend behavior | `npm test`: **29 passed**, 6 files |
| Backend behavior | `npm run backend:test`: **13 passed**, no warnings |
| Backend dependency consistency | `python -m pip check`: no broken requirements |
| Production packaging | `npm run build`: passed for default port 8000 and alternate port 18000 |
| MV3 integrity | Manifest, service worker, popup/options HTML, content IIFE, offscreen HTML, referenced assets/imports, icon dimensions and CSP validated |
| Actual unpacked extension | Playwright integration: **1 passed**, Chrome for Testing **155.0.8059.84**, live FastAPI on 18000 |
| Dashboard and persistence | Browser test verified health Online, actual Chrome storage persistence after reload, all future commands rejected and recognition controls disabled |
| Content and offscreen | Browser verified passive content script on a synthetic Meet URL, no DOM/media insertion and zero active offscreen contexts |
| Runtime errors | No dashboard JavaScript or console errors observed in successful browser test |
| Visual review | Dark/light full dashboard and 420px popup-width screenshots inspected; no horizontal overflow |
| Dependency audit | npm install/lock update reported **0 vulnerabilities** |
| Browser fallback setup | Pinned stable Chrome downloader provided and executed against the cached official archive |
| Documentation | README, architecture diagram, roadmap, provisional extractor interface notes, repository conventions and PowerShell commands written |

## Commands executed

```powershell
npm install
python scripts/generate-icons.py
python scripts/setup-backend.py
npm run typecheck
npm test
npm run backend:test
.\backend\.venv\Scripts\python.exe -m pip check
npm run build
npx playwright install chromium
npm run test:browser:setup

$env:VITE_BACKEND_PORT = '18000'
$env:SIGNBRIDGE_PORT = '18000'
$env:SIGNBRIDGE_CHROMIUM_PATH = (Join-Path (Get-Location) '.cache\chrome-for-testing-155\chrome-win64\chrome.exe')
npm run build
npm run test:e2e
```

The final delivered `extension/dist` was rebuilt without the port override and
targets the default **127.0.0.1:8000**. Rebuild with both port variables set to use
18000 on this host. The complete extension was browser-tested with this alternate
port; the final default-port package also passed type and artifact validation.

## Issues found and resolved

- The initial import validator depended on the legacy TypeScript compiler API;
  TypeScript 7 changed that interface. It now uses a dedicated module lexer.
- The current Starlette test client deprecated HTTPX 0.x. Dependencies now use
  compatible HTTPX2, with a clean test run and frozen dependency graph.
- Browser testing caught rejection of a legitimate dashboard tab's health check.
  Sender authorization now checks the exact extension page URL and a regression
  test covers both the dashboard tab and a forbidden meeting content script.
- The integration test initially relied on tab URLs without `tabs` permission;
  it now probes content-script listeners by tab ID within its isolated profile.
  No additional production permission was introduced.

## Environment constraints and scope limits

- Port 8000 was occupied by **Coding Streak Guardian**; that process was left
  untouched. Port 18000 was used for the real backend/browser test.
- Playwright's bundled Chromium 156 failed to launch due to a Windows side-by-side
  configuration error. Stable Chrome for Testing 155 launched and passed the
  integration test. README documents the reproducible executable override.
- Real Meet/Teams/Zoom meetings were not joined. The content test used a synthetic
  page on a declared meeting origin; actual capture and captions are later phases.
- No camera, media permission, offscreen creation, inference, ML model or sign
  accuracy has been tested or claimed. ASL and ISL remain distinct in contracts.
- User-supplied numbered reference docs that arrived during implementation were
  read and preserved. Their referenced `PROJECT_DOCS_INDEX.md`, scope/vision,
  capture/privacy, model data-contract and acceptance documents were not present
  at the final inspection. Read them when supplied before implementing dependent
  later-phase work; do not invent the missing classifier input contract.

Next smallest step: **Phase 2 — Webcam + MediaPipe Landmarks**, after reading the
complete supplied project reference set. Keep sign captions disabled until a
genuine recognition model and validated output mapping exist.
