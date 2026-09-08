# SignTrail v0.3.1 Public Deployment Hardening — Fix Report

## Outcome

**Implementation outcome:** patched and regression-tested.

**Public-release acceptance outcome:** **blocked pending one real ChatGPT Sites build and owner-only deployment acceptance run.** This environment could not install the full Sites toolchain because its internal npm mirror did not contain `@cloudflare/vite-plugin`; therefore typecheck, production build, real D1/R2 migrations, and real Sign in with ChatGPT headers remain unverified here.

## Vulnerable paths closed

1. Anonymous callers could create unlimited hosted PDF records.
2. Recipient and management bearer secrets appeared in request URLs.
3. A management token alone authorized status, downloads, and deletion.
4. Client completion data could omit required fields or add arbitrary receipt properties.
5. Two completion requests could overwrite each other.
6. The recipient API disclosed the sender-entered recipient email label.
7. Completed links could continue serving the prepared source PDF.
8. Old runtime dependencies loaded directly from third-party CDNs.
9. User-facing language overstated what the self-hashed receipt proves.

## Security invariants now enforced

- Hosted-link creation requires an authenticated ChatGPT email and a same-origin mutation request.
- D1 enforces atomic per-creator fixed-window creation quotas, so parallel requests cannot all pass a count-before-write race.
- Recipient and management secrets travel only in dedicated request headers.
- The share token begins in the URL fragment, moves to per-tab `sessionStorage`, and is removed from both visible URLs.
- Management requires both the bearer secret and the same authenticated creator email.
- Links expire after 1–30 days; the UI creates seven-day links.
- The server compares the exact field set, placement, assignment, required flags, hashes, and document metadata before completion.
- Unsupported receipt properties, unknown field IDs, altered placement, and missing required completion evidence are rejected.
- The server stores a sanitized v1.1 byte-match integrity receipt and never accepts field values or signature images into it.
- Completion uses a single-winner claim and unique R2 keys; losing or repeated completions return `409`.
- Completed recipient document access resolves to the signed PDF.
- PDF.js, pdf-lib, and JSZip are pinned npm dependencies copied into same-origin deployment assets at build time.
- PDF.js JavaScript, XFA, and eval support are disabled; CMaps, ICC profiles, standard fonts, WASM, and the worker are same-origin assets.
- A self-only Content Security Policy and restrictive browser headers are applied by the worker.

## Files changed

- `worker/api.js`
- `worker/index.js`
- `drizzle/0001_public_deployment_hardening.sql`
- `public/signtrail.html`
- `public/signtrail.js`
- `public/signtrail.css`
- `public/pdf-loader.mjs`
- `build/copy-signtrail-vendor.mjs`
- `package.json`
- `tests/api-contract.test.mjs`
- `tests/browser_acceptance.py`
- Deployment, architecture, security, acceptance, and handoff documents

## Verification gates

### Applicability and syntax — PASS

- `node --check public/signtrail.js`
- `node --check worker/api.js`
- `node --check worker/index.js`
- `node --check build/copy-signtrail-vendor.mjs`
- `python -m py_compile tests/browser_acceptance.py`

### Security closure — PASS in focused harness

`node --test tests/api-contract.test.mjs`

Four tests passed. The suite verifies:

- unsigned creation rejected;
- cross-site mutation rejected;
- duplicate field IDs rejected;
- atomic per-account quota enforced under four concurrent creation attempts;
- recipient secret required in a header;
- recipient email omitted from public data;
- expired links rejected;
- incomplete and extra-property receipts rejected;
- concurrent completion produces exactly one `200` and one `409`;
- the stored receipt is sanitized to v1.1;
- source access resolves to signed bytes after completion;
- management without identity or with the wrong identity is rejected;
- same-origin authenticated management download and deletion remain functional.

### Preserved browser behavior — PASS in Chromium harness

`python tests/browser_acceptance.py`

- five blank recipient fields created;
- owner prevented from filling recipient fields;
- fragment share link created;
- all five fields completed on mobile;
- required count reached zero;
- signed export and handoff export remained available;
- no horizontal overflow;
- no page exceptions;
- no console errors.

### Repository build and live platform — BLOCKED/UNKNOWN

Attempted:

```text
npm install --ignore-scripts --no-audit --no-fund
```

The environment returned `404` for `@cloudflare/vite-plugin` from its internal npm mirror. Consequently these remain required during owner-only deployment acceptance:

- dependency installation and generated lockfile;
- vendor-copy prebuild;
- TypeScript check;
- production Sites build;
- migration execution against real D1;
- object lifecycle against real R2;
- real Sign in with ChatGPT creator binding;
- real CSP/worker/module loading;
- live rate-limit behavior.

## Remaining risk

- The integrity receipt proves byte matching and server-side schema sanitation, not legal identity, intent, or enforceability.
- Field completion remains client-attested; the server cannot prove that visible PDF content semantically corresponds to each field without implementing trusted server-side PDF reconstruction.
- Link-open counts can include scanners, previews, reloads, forwarding, or another person.
- A bearer recipient link can be used by anyone who obtains it until expiry or deletion.
- Fixed-window quotas permit boundary bursts (for example, requests immediately before and after a window rollover); authenticated creation, 25 MB body limits, seven-day default expiry, and platform-level controls bound but do not eliminate storage-abuse risk.
