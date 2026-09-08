import test from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest, testing } from "../worker/api.js";

const ORIGIN = "https://signtrail.example";
const OWNER_EMAIL = "owner@example.com";
const RECIPIENT_EMAIL = "signed.in@example.com";

class FakeD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.startsWith("SELECT COUNT(*) AS count FROM envelopes WHERE creator_email")) {
      const [email, since] = this.args;
      return { count: this.db.rows.filter(row => row.creator_email === email && row.created_at >= since).length };
    }
    if (this.sql.includes("WHERE recipient_token_hash = ?")) return this.db.rows.find(row => row.recipient_token_hash === this.args[0]) || null;
    if (this.sql.includes("WHERE manage_token_hash = ?")) return this.db.rows.find(row => row.manage_token_hash === this.args[0]) || null;
    if (this.sql.includes("WHERE id = ?")) return this.db.rows.find(row => row.id === this.args[0]) || null;
    throw new Error(`Unsupported first SQL: ${this.sql}`);
  }
  async run() {
    if (this.sql.startsWith("DELETE FROM envelope_creation_quota")) {
      const [now] = this.args;
      let changes = 0;
      for (const [key, row] of this.db.quotas) {
        if (row.expires_at < now) {
          this.db.quotas.delete(key);
          changes += 1;
        }
      }
      return { success: true, meta: { changes } };
    }
    if (this.sql.startsWith("INSERT INTO envelope_creation_quota")) {
      const [bucketKey, creatorEmail, windowName, expiresAt, limit] = this.args;
      const existing = this.db.quotas.get(bucketKey);
      if (!existing) {
        this.db.quotas.set(bucketKey, { bucket_key: bucketKey, creator_email: creatorEmail, window_name: windowName, count: 1, expires_at: expiresAt });
        return { success: true, meta: { changes: 1 } };
      }
      if (existing.count >= Number(limit)) return { success: true, meta: { changes: 0 } };
      existing.count += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("INSERT INTO envelopes")) {
      const [
        id, recipientHash, manageHash, documentName, title, message, recipientEmail,
        createdAt, sourceKey, fieldsJson, pageCount, originalHash, creatorEmail, creatorName, expiresAt
      ] = this.args;
      this.db.rows.push({
        id,
        recipient_token_hash: recipientHash,
        manage_token_hash: manageHash,
        document_name: documentName,
        title,
        message,
        recipient_email: recipientEmail,
        created_at: createdAt,
        status: "sent",
        opened_at: null,
        last_opened_at: null,
        opened_count: 0,
        verified_opener_email: null,
        verified_opener_name: null,
        completed_by_email: null,
        completed_by_name: null,
        completed_at: null,
        source_key: sourceKey,
        signed_key: null,
        proof_key: null,
        fields_json: fieldsJson,
        page_count: pageCount,
        original_hash: originalHash,
        signed_hash: null,
        verification_id: null,
        creator_email: creatorEmail,
        creator_name: creatorName,
        expires_at: expiresAt,
        completion_claim: null,
        completion_claimed_at: null
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE envelopes SET status = CASE")) {
      const [openedAt, lastOpenedAt, identityEmail, storedEmail, identityName, storedName, id] = this.args;
      const row = this.db.rows.find(item => item.id === id);
      if (!row) return { meta: { changes: 0 } };
      if (row.status === "sent") row.status = "opened";
      row.opened_at ||= openedAt;
      row.last_opened_at = lastOpenedAt;
      row.opened_count += 1;
      if (identityEmail) row.verified_opener_email = storedEmail;
      if (identityName) row.verified_opener_name = storedName;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE envelopes SET completion_claim = ?")) {
      const [claim, claimedAt, id, staleBefore] = this.args;
      const row = this.db.rows.find(item => item.id === id);
      const lockAvailable = row && row.status !== "completed" && (!row.completion_claim || !row.completion_claimed_at || row.completion_claimed_at < staleBefore);
      if (!lockAvailable) return { success: true, meta: { changes: 0 } };
      row.completion_claim = claim;
      row.completion_claimed_at = claimedAt;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE envelopes SET completion_claim = NULL")) {
      const [id, claim] = this.args;
      const row = this.db.rows.find(item => item.id === id);
      if (!row || row.status === "completed" || row.completion_claim !== claim) return { meta: { changes: 0 } };
      row.completion_claim = null;
      row.completion_claimed_at = null;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE envelopes SET status = 'completed'")) {
      const [completedAt, signedKey, proofKey, signedHash, verificationId, identityEmail, storedEmail, identityName, storedName, id, claim] = this.args;
      const row = this.db.rows.find(item => item.id === id);
      if (!row || row.status === "completed" || row.completion_claim !== claim) return { success: true, meta: { changes: 0 } };
      Object.assign(row, {
        status: "completed",
        completed_at: completedAt,
        signed_key: signedKey,
        proof_key: proofKey,
        signed_hash: signedHash,
        verification_id: verificationId,
        completion_claim: null,
        completion_claimed_at: null
      });
      if (identityEmail) row.completed_by_email = storedEmail;
      if (identityName) row.completed_by_name = storedName;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith("DELETE FROM envelopes")) {
      const before = this.db.rows.length;
      this.db.rows = this.db.rows.filter(row => row.id !== this.args[0]);
      return { success: true, meta: { changes: before - this.db.rows.length } };
    }
    throw new Error(`Unsupported run SQL: ${this.sql}`);
  }
}

class FakeD1 {
  rows = [];
  quotas = new Map();
  prepare(sql) { return new FakeD1Statement(this, sql); }
}

class FakeR2 {
  objects = new Map();
  async put(key, value, options = {}) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, { bytes, options });
  }
  async get(key) {
    const record = this.objects.get(key);
    if (!record) return null;
    return { body: record.bytes, size: record.bytes.byteLength, httpMetadata: record.options.httpMetadata || {} };
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

function env(overrides = {}) {
  return { DB: new FakeD1(), DOCUMENTS: new FakeR2(), ...overrides };
}

function identityHeaders(email = OWNER_EMAIL, name = "SignTrail Owner") {
  return {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name)
  };
}

function mutationHeaders(extra = {}) {
  return { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", ...extra };
}

function apiRequest(path, options = {}) {
  return new Request(`${ORIGIN}${path}`, options);
}

async function parseJson(response) {
  const value = await response.json();
  assert.ok(value);
  return value;
}

function tokenFromShareUrl(shareUrl) {
  return new URLSearchParams(new URL(shareUrl).hash.slice(1)).get("sign");
}

async function createEnvelope(appEnv, { fields, owner = OWNER_EMAIL, expiresInDays = 7 } = {}) {
  const preparedPdf = new TextEncoder().encode("%PDF-1.4\nprepared-signtrail-document\n%%EOF");
  const originalHash = await testing.sha256Hex(preparedPdf);
  const metadata = {
    version: "1.0",
    documentName: "agreement.pdf",
    title: "Please sign the agreement",
    message: "Review every required field.",
    recipientEmail: "person@example.com",
    originalHash,
    pageCount: 1,
    expiresInDays,
    fields: fields || [
      { id: "name", type: "print_name", pageIndex: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.06, required: true, assignedTo: "recipient" },
      { id: "signature", type: "signature", pageIndex: 0, x: 0.1, y: 0.25, width: 0.3, height: 0.08, required: true, assignedTo: "recipient" }
    ]
  };
  const form = new FormData();
  form.append("document", new File([preparedPdf], "agreement.pdf", { type: "application/pdf" }));
  form.append("metadata", JSON.stringify(metadata));
  const response = await handleApiRequest(apiRequest("/api/envelopes", {
    method: "POST",
    body: form,
    headers: mutationHeaders(identityHeaders(owner))
  }), appEnv);
  return { response, preparedPdf, originalHash, metadata };
}

async function makeProof({ metadata, originalHash, signedPdf, fieldOverrides = {}, topLevelExtra = null }) {
  const signedHash = await testing.sha256Hex(signedPdf);
  const payload = {
    format: "signtrail-proof-capsule",
    version: "1.0",
    verificationId: "ST-20260729-ABCDEF1234",
    documentName: metadata.documentName,
    originalHash,
    signedHash,
    createdAt: "2026-07-29T20:00:00.000Z",
    completedAt: "2026-07-29T20:05:00.000Z",
    pageCount: metadata.pageCount,
    fields: metadata.fields.map(field => ({
      id: field.id,
      type: field.type,
      page: field.pageIndex + 1,
      completed: true,
      required: field.required !== false,
      assignedTo: "recipient",
      placement: { x: field.x, y: field.y, width: field.width, height: field.height },
      ...(fieldOverrides[field.id] || {})
    })),
    events: [{ type: "field_completed", title: "Required fields completed", timestamp: "2026-07-29T20:04:00.000Z", page: 1, fieldId: metadata.fields[0].id }],
    verificationScope: "byte-for-byte-document-match",
    identityAssurance: "none"
  };
  if (topLevelExtra) Object.assign(payload, topLevelExtra);
  const digest = await testing.sha256Hex(new TextEncoder().encode(testing.canonicalize(payload)));
  return { proof: { ...payload, integrity: { algorithm: "SHA-256", digest } }, signedHash };
}

async function complete(appEnv, recipientToken, proof, signedPdf, signedHash, identityEmail = RECIPIENT_EMAIL) {
  const form = new FormData();
  form.append("signedPdf", new File([signedPdf], "agreement-signed.pdf", { type: "application/pdf" }));
  form.append("proofCapsule", new File([JSON.stringify(proof)], "receipt.json", { type: "application/json" }));
  form.append("metadata", JSON.stringify({ signedHash, verificationId: proof.verificationId }));
  return handleApiRequest(apiRequest("/api/recipient/complete", {
    method: "POST",
    body: form,
    headers: mutationHeaders({ ...identityHeaders(identityEmail, "Signed In Person"), "X-SignTrail-Recipient-Token": recipientToken })
  }), appEnv);
}

test("hosted-link creation requires same-origin authenticated sender, rejects duplicate fields, and rate-limits", async () => {
  const unsignedEnv = env();
  const prepared = new TextEncoder().encode("%PDF-1.4\nsmall\n%%EOF");
  const hash = await testing.sha256Hex(prepared);
  const metadata = { documentName: "x.pdf", originalHash: hash, pageCount: 1, fields: [{ id: "x", type: "signature", pageIndex: 0, x: 0, y: 0, width: 0.2, height: 0.1 }] };
  const form = new FormData();
  form.append("document", new File([prepared], "x.pdf", { type: "application/pdf" }));
  form.append("metadata", JSON.stringify(metadata));
  const unsigned = await handleApiRequest(apiRequest("/api/envelopes", { method: "POST", body: form, headers: mutationHeaders() }), unsignedEnv);
  assert.equal(unsigned.status, 401);

  const crossSiteForm = new FormData();
  crossSiteForm.append("document", new File([prepared], "x.pdf", { type: "application/pdf" }));
  crossSiteForm.append("metadata", JSON.stringify(metadata));
  const crossSite = await handleApiRequest(apiRequest("/api/envelopes", { method: "POST", body: crossSiteForm, headers: { Origin: "https://evil.example", ...identityHeaders() } }), unsignedEnv);
  assert.equal(crossSite.status, 403);

  const duplicateEnv = env();
  const duplicate = await createEnvelope(duplicateEnv, { fields: [
    { id: "same", type: "signature", pageIndex: 0, x: 0, y: 0, width: 0.2, height: 0.1 },
    { id: "same", type: "date", pageIndex: 0, x: 0.3, y: 0, width: 0.2, height: 0.1 }
  ] });
  assert.equal(duplicate.response.status, 400);
  assert.equal(duplicateEnv.DB.rows.length, 0);

  const limitedEnv = env({ SIGNTRAIL_CREATE_LIMIT_10M: 1, SIGNTRAIL_CREATE_LIMIT_24H: 2 });
  const attempts = await Promise.all([
    createEnvelope(limitedEnv),
    createEnvelope(limitedEnv),
    createEnvelope(limitedEnv),
    createEnvelope(limitedEnv)
  ]);
  assert.deepEqual(attempts.map(item => item.response.status).sort(), [201, 429, 429, 429]);
  assert.equal(limitedEnv.DB.rows.length, 1);
  assert.equal([...limitedEnv.DB.quotas.values()].find(row => row.window_name === "10m")?.count, 1);
});

test("recipient credentials stay in headers, public view omits recipient email, and expired links fail closed", async () => {
  const appEnv = env();
  const createdResult = await createEnvelope(appEnv);
  assert.equal(createdResult.response.status, 201);
  const created = await parseJson(createdResult.response);
  assert.match(created.shareUrl, /^https:\/\/signtrail\.example\/#sign=/);
  assert.ok(created.manageToken.length > 30);
  const recipientToken = tokenFromShareUrl(created.shareUrl);
  assert.ok(recipientToken.length > 30);

  const missingHeader = await handleApiRequest(apiRequest("/api/recipient"), appEnv);
  assert.equal(missingHeader.status, 401);

  const open = await handleApiRequest(apiRequest("/api/recipient", { headers: { "X-SignTrail-Recipient-Token": recipientToken } }), appEnv);
  assert.equal(open.status, 200);
  const publicPayload = await parseJson(open);
  assert.equal(Object.hasOwn(publicPayload, "recipientEmail"), false);
  assert.equal(publicPayload.documentEndpoint, "/api/recipient/document");
  assert.match(publicPayload.trackingDisclosure, /reloads|previews|scanners/);

  appEnv.DB.rows[0].expires_at = "2020-01-01T00:00:00.000Z";
  const expired = await handleApiRequest(apiRequest("/api/recipient", { headers: { "X-SignTrail-Recipient-Token": recipientToken } }), appEnv);
  assert.equal(expired.status, 410);
});

test("completion rejects forged evidence, sanitizes the receipt, and only one completion wins", async () => {
  const appEnv = env();
  const { response, originalHash, metadata } = await createEnvelope(appEnv);
  const created = await parseJson(response);
  const recipientToken = tokenFromShareUrl(created.shareUrl);
  const signedPdf = new TextEncoder().encode("%PDF-1.4\nsigned-signtrail-document\n%%EOF");

  const incomplete = await makeProof({ metadata, originalHash, signedPdf, fieldOverrides: { signature: { completed: false } } });
  const incompleteResponse = await complete(appEnv, recipientToken, incomplete.proof, signedPdf, incomplete.signedHash);
  assert.equal(incompleteResponse.status, 400);
  assert.equal(appEnv.DB.rows[0].status, "sent");

  const withUnknown = await makeProof({ metadata, originalHash, signedPdf, topLevelExtra: { privateFieldValue: "should never be accepted" } });
  const unknownResponse = await complete(appEnv, recipientToken, withUnknown.proof, signedPdf, withUnknown.signedHash);
  assert.equal(unknownResponse.status, 400);
  assert.equal(appEnv.DB.rows[0].status, "sent");

  const valid = await makeProof({ metadata, originalHash, signedPdf });
  const racedResponses = await Promise.all([
    complete(appEnv, recipientToken, valid.proof, signedPdf, valid.signedHash),
    complete(appEnv, recipientToken, valid.proof, signedPdf, valid.signedHash)
  ]);
  assert.deepEqual(racedResponses.map(response => response.status).sort(), [200, 409]);
  const completedResponse = racedResponses.find(response => response.status === 200);
  const completed = await parseJson(completedResponse);
  assert.equal(completed.proofCapsule.version, "1.1");
  assert.equal(completed.proofCapsule.completionEvidence, "client-attested-field-state");
  assert.equal(completed.proofCapsule.receiptMeaning, "byte-match-integrity-only");
  assert.equal(JSON.stringify(completed.proofCapsule).includes("privateFieldValue"), false);
  assert.equal(appEnv.DB.rows[0].completed_by_email, RECIPIENT_EMAIL);
  assert.equal(appEnv.DB.rows[0].completion_claim, null);
  assert.equal(appEnv.DOCUMENTS.objects.size, 3);

  const sourceAfterCompletion = await handleApiRequest(apiRequest("/api/recipient/document", { headers: { "X-SignTrail-Recipient-Token": recipientToken } }), appEnv);
  assert.equal(sourceAfterCompletion.status, 200);
  assert.deepEqual(new Uint8Array(await sourceAfterCompletion.arrayBuffer()), signedPdf);
});

test("management requires both the bearer credential and the creator account", async () => {
  const appEnv = env();
  const { response, originalHash, metadata } = await createEnvelope(appEnv);
  const created = await parseJson(response);
  const recipientToken = tokenFromShareUrl(created.shareUrl);
  const signedPdf = new TextEncoder().encode("%PDF-1.4\nmanaged-signed-document\n%%EOF");
  const valid = await makeProof({ metadata, originalHash, signedPdf });
  assert.equal((await complete(appEnv, recipientToken, valid.proof, signedPdf, valid.signedHash)).status, 200);

  const noIdentity = await handleApiRequest(apiRequest("/api/manage", { headers: { "X-SignTrail-Manage-Token": created.manageToken } }), appEnv);
  assert.equal(noIdentity.status, 401);
  const wrongIdentity = await handleApiRequest(apiRequest("/api/manage", { headers: { ...identityHeaders("attacker@example.com"), "X-SignTrail-Manage-Token": created.manageToken } }), appEnv);
  assert.equal(wrongIdentity.status, 403);

  const manageHeaders = { ...identityHeaders(), "X-SignTrail-Manage-Token": created.manageToken };
  const managed = await handleApiRequest(apiRequest("/api/manage", { headers: manageHeaders }), appEnv);
  assert.equal(managed.status, 200);
  const managedPayload = await parseJson(managed);
  assert.equal(managedPayload.signedPdfAvailable, true);
  assert.equal(managedPayload.proofCapsuleAvailable, true);

  const signedDownload = await handleApiRequest(apiRequest("/api/manage/signed.pdf", { headers: manageHeaders }), appEnv);
  assert.equal(signedDownload.status, 200);
  assert.deepEqual(new Uint8Array(await signedDownload.arrayBuffer()), signedPdf);

  const deleteWrongOrigin = await handleApiRequest(apiRequest("/api/manage", { method: "DELETE", headers: { ...manageHeaders, Origin: "https://evil.example" } }), appEnv);
  assert.equal(deleteWrongOrigin.status, 403);
  const deleted = await handleApiRequest(apiRequest("/api/manage", { method: "DELETE", headers: mutationHeaders(manageHeaders) }), appEnv);
  assert.equal(deleted.status, 200);
  assert.equal(appEnv.DB.rows.length, 0);
  assert.equal(appEnv.DOCUMENTS.objects.size, 0);
});
