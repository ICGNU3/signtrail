# SignTrail v0.3.3

SignTrail is a browser-based PDF signing workspace and ChatGPT Sites signature-request application. It supports local self-signing, recipient-assigned fields, hosted signee links, signed PDF export, byte-match integrity receipts, local signed-document history, and sender management of hosted requests.

## Portable proof verification

SignTrail integrity receipts can be verified outside the browser app with the zero-dependency Node.js verifier:

```bash
npm run verify:proof -- ./document-signed.pdf ./document-ST-20260907-ABCDEF1234-integrity-receipt.json
```

A successful verification checks the receipt structure and declared evidence semantics, recomputes the receipt's canonical SHA-256 integrity digest, and confirms that the supplied PDF's SHA-256 matches the signed-document fingerprint in the receipt.

The verifier intentionally preserves SignTrail's evidence boundary: a successful result proves byte-match integrity. It does not establish legal identity, provide a trusted timestamp, or guarantee enforceability.

The verifier supports SignTrail proof-capsule versions `1.0` and `1.1` and exits non-zero when either the receipt or PDF fails verification. It uses only Node.js built-ins, so another system can verify a SignTrail handoff without running the SignTrail application.

### Machine-readable verification

Automation, agents, CI jobs, and workflow systems can request a single JSON result. When invoking through npm, use `--silent` so npm's own banner/output cannot contaminate stdout:

```bash
npm --silent run verify:proof -- ./document-signed.pdf ./receipt.json --json
```

Success:

```json
{"verified":true,"verificationId":"ST-20260907-ABCDEF1234","version":"1.1","verificationScope":"byte-for-byte-document-match","identityAssurance":"none","receiptMeaning":"byte-match-integrity-only"}
```

Failure exits non-zero and returns:

```json
{"verified":false,"error":"Signed PDF SHA-256 does not match the receipt."}
```

The full success object also includes the original and signed hashes plus the completion timestamp.

### Proof-capsule contract

`schemas/signtrail-proof-capsule.schema.json` publishes the portable receipt shape as JSON Schema Draft 2020-12. It describes both supported versions and makes the v1.1 evidence semantics explicit. The verifier enforces the same required top-level properties and nested field, placement, event, and integrity-record shapes. Local v1.0 receipts may contain document filenames longer than the hosted-service filename limit, subject to the overall 2 MB receipt-size limit.

Applications can also call the verifier directly:

```js
import { readFile } from 'node:fs/promises';
import { verifyProofCapsule } from './tools/verify-proof.mjs';

const pdf = await readFile('document-signed.pdf');
const receipt = JSON.parse(await readFile('receipt.json', 'utf8'));
const proof = verifyProofCapsule(pdf, receipt);

if (proof.ok) {
  // Advance a workflow using the verified evidence.
}
```

Programmatic verification enforces the same 2 MB receipt-size limit as the CLI, using the UTF-8 size of the serialized receipt object.

See `examples/verify-proof.mjs` for a runnable integration example.

## v0.3.3 correction

The hosted-link workflow is now genuinely post-finalization:

1. Prepare recipient fields.
2. Select **Finalize recipient document**.
3. SignTrail generates one immutable recipient-ready PDF byte array and locks the editor.
4. The document enters **Finalized · link pending**.
5. A separate **Create signee link** action appears.
6. SignTrail verifies the current ChatGPT owner session.
7. Link creation uploads the already-finalized bytes without rebuilding the PDF.
8. Success changes the action to **View signee link**.

A failed hosted upload leaves the document finalized and exposes the same retry action. No fake link is shown.

## Deployment status

This package is intended to update the existing owner-only ChatGPT Sites deployment while preserving D1 `DB` and R2 `DOCUMENTS`. Automated API, security, and Chromium browser gates pass. A live owner-only update acceptance run is still required because this environment cannot access the user's deployed Site or provisioned identity/storage resources.

External signed-out signees cannot open an owner-only Site. After owner-only Gate 7A passes, change the Site audience to **Anyone on the internet** only for Gate 7B external-recipient acceptance.

Read `00_DEPLOY_THIS_PACKAGE.md` first.
