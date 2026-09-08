# SignTrail Security and Privacy Boundary

## Secrets

Recipient and management tokens are bearer secrets.

- Recipient tokens are issued in `#sign=...`, copied into per-tab `sessionStorage`, scrubbed from the visible URL, and sent in `X-SignTrail-Recipient-Token`.
- Management tokens stay in the sender browser and are sent in `X-SignTrail-Manage-Token`.
- Management also requires the same authenticated creator email.
- Do not log, forward, screenshot, or publish either token.

## Hosted-link creation controls

- Creating hosted links requires a signed-in ChatGPT email and a same-origin mutation request.
- D1 atomically reserves both ten-minute and daily fixed-window quota buckets before accepting a document upload.
- Defaults are five hosted links per ten-minute window and twenty per UTC-day window per creator; deployment bindings may lower these values.
- Prepared and completed PDFs are each limited to 25 MB; integrity receipts are limited to 2 MB.

## Authentication

- Local signing does not require an account.
- Creating hosted links requires Sign in with ChatGPT.
- A recipient may remain anonymous.
- An authenticated opener email means only that the visitor signed into that ChatGPT account; it does not prove legal identity or intended-recipient status.

## Link tracking

SignTrail records private-link opens, not email opens. Counts can include reloads, mail/security scanners, previews, forwarded links, or another person.

## Receipt semantics

The byte-match integrity receipt records document fingerprints, field definitions/completion flags, and a sanitized event trail. It excludes field values and signature images.

The receipt is not a legal digital signature, trusted timestamp, identity certificate, or proof that a particular human supplied the visible PDF content. Hosted completion evidence is explicitly marked `client-attested-field-state`.

## Data retention

Hosted links expire after 1–30 days; the UI defaults to seven days. Expiry blocks access but does not itself delete storage. The creator must delete a request from hosted history to remove its D1 row and R2 objects.

## PDF processing

- Files are capped at 25 MB.
- PDF.js 6.1.200 is pinned and served same-origin.
- PDF JavaScript, XFA, and eval support are disabled.
- PDF.js worker, CMaps, ICC profiles, standard fonts, and WASM are served same-origin.
- No runtime CDN JavaScript is permitted by CSP.

## Not permitted

Do not use this build for payment-card data, protected health information, government secrets, or any workflow whose law or policy requires a qualified electronic-signature provider, regulated identity proofing, trusted timestamps, archival retention, or independent certificate validation.

## Reporting

Do not include real documents, signatures, bearer tokens, or personal data in a bug report. Provide a minimal synthetic reproducer and the affected version.
