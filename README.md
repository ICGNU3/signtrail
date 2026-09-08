# SignTrail v0.3.3

SignTrail is a browser-based PDF signing workspace and ChatGPT Sites signature-request application. It supports local self-signing, recipient-assigned fields, hosted signee links, signed PDF export, byte-match integrity receipts, local signed-document history, and sender management of hosted requests.

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
