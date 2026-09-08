# SignTrail v0.3.3 Post-Finalize Signee Link Fix

## Reported live defect

The owner-only deployment did not present a distinct signee-link action after document finalization. v0.3.2 still opened a combined pre-finalization modal whose button performed both operations.

## Corrected workflow

1. Add at least one Recipient field.
2. Select **Finalize recipient document**.
3. SignTrail generates and hashes the exact recipient-ready PDF bytes, locks field editing, and enters **Finalized · link pending**.
4. A separate **Create signee link** action appears.
5. SignTrail verifies the current ChatGPT owner session through `/api/session`.
6. Link creation uploads the already-finalized byte array; it does not rebuild the PDF.
7. Success changes the action to **View signee link**.
8. Failure preserves the finalized lock and exposes the same retry action without inventing a link.

## Owner-only behavior

Owner-only access does not prevent the authenticated owner from creating or testing the link in the same owner session. It does prevent an external signed-out signee from opening it. External-recipient acceptance still requires temporarily changing the Site audience to **Anyone on the internet**.
