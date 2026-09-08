const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PROOF_BYTES = 2 * 1024 * 1024;
const MAX_CREATE_BODY_BYTES = MAX_PDF_BYTES + 512 * 1024;
const MAX_COMPLETE_BODY_BYTES = MAX_PDF_BYTES + MAX_PROOF_BYTES + 512 * 1024;
const MAX_FIELDS = 100;
const MAX_EVENTS = 500;
const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 30;
const COMPLETION_LOCK_MS = 5 * 60 * 1000;
const ALLOWED_FIELD_TYPES = new Set([
  "signature",
  "initials",
  "print_name",
  "date",
  "email",
  "address",
  "text",
  "checkbox"
]);
const PROOF_TOP_LEVEL_KEYS = new Set([
  "format", "version", "verificationId", "documentName", "originalHash", "signedHash",
  "createdAt", "completedAt", "pageCount", "fields", "events", "verificationScope",
  "identityAssurance", "integrity"
]);
const PROOF_FIELD_KEYS = new Set(["id", "type", "page", "completed", "required", "assignedTo", "placement"]);
const PROOF_PLACEMENT_KEYS = new Set(["x", "y", "width", "height"]);
const PROOF_EVENT_KEYS = new Set(["type", "title", "timestamp", "page", "fieldId"]);
const PROOF_INTEGRITY_KEYS = new Set(["algorithm", "digest"]);

const encoder = new TextEncoder();

function baseHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra
  };
}

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders({ "Content-Type": "application/json; charset=utf-8", ...extra })
  });
}

function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function decodeHeader(value) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

function viewerIdentity(request) {
  const email = sanitizeText(request.headers.get("oai-authenticated-user-email"), 254).toLowerCase();
  const name = sanitizeText(decodeHeader(request.headers.get("oai-authenticated-user-full-name")), 200);
  return { email, name };
}

function requireAuthenticatedIdentity(request, purpose = "use hosted signature links") {
  const identity = viewerIdentity(request);
  if (!identity.email) {
    throw httpError(`Sign in with ChatGPT to ${purpose}. Local PDF signing and handoff export remain available without sign-in.`, 401);
  }
  return identity;
}

function requireBindings(env) {
  if (!env?.DB || !env?.DOCUMENTS) {
    throw httpError("SignTrail storage is not provisioned.", 503);
  }
}

function requireSameOriginMutation(request, maxBodyBytes) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!origin || origin !== url.origin) throw httpError("Cross-site mutation requests are not allowed.", 403);
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw httpError("Cross-site mutation requests are not allowed.", 403);
  }
  const rawLength = request.headers.get("Content-Length");
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0 || length > maxBodyBytes) {
      throw httpError("The request body is too large.", 413);
    }
  }
}

function requireMultipart(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw httpError("Expected multipart form data.", 415);
  }
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : encoder.encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function looksLikePdf(bytes) {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(`${label} is invalid.`);
}

function assertExactKeys(value, allowed, label) {
  assertObject(value, label);
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) throw httpError(`${label} contains unsupported data.`);
}

function finiteRounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : NaN;
}

function validateFields(rawFields, pageCount) {
  if (!Array.isArray(rawFields) || rawFields.length < 1 || rawFields.length > MAX_FIELDS) {
    throw httpError(`A signature request must contain 1 to ${MAX_FIELDS} recipient fields.`);
  }
  const seenIds = new Set();
  return rawFields.map((raw, index) => {
    assertObject(raw, `Field ${index + 1}`);
    const type = sanitizeText(raw.type, 30);
    if (!ALLOWED_FIELD_TYPES.has(type)) throw httpError(`Field ${index + 1} has an unsupported type.`);
    const pageIndex = Math.trunc(Number(raw.pageIndex));
    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) throw httpError(`Field ${index + 1} has an invalid page.`);
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) {
      throw httpError(`Field ${index + 1} has invalid placement coordinates.`);
    }
    const id = sanitizeText(raw.id, 100) || `field-${index + 1}`;
    if (seenIds.has(id)) throw httpError(`Field IDs must be unique. Duplicate: ${id}`);
    seenIds.add(id);
    return {
      id,
      type,
      pageIndex,
      x: finiteRounded(x),
      y: finiteRounded(y),
      width: finiteRounded(width),
      height: finiteRounded(height),
      required: raw.required !== false,
      assignedTo: "recipient"
    };
  });
}

function validateEnvelopeMetadata(raw) {
  assertObject(raw, "Envelope metadata");
  const documentName = sanitizeText(raw.documentName, 180) || "document.pdf";
  const pageCount = Math.trunc(Number(raw.pageCount));
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 1000) throw httpError("The page count is invalid.");
  const originalHash = sanitizeText(raw.originalHash, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(originalHash)) throw httpError("The prepared document fingerprint is invalid.");
  const recipientEmail = sanitizeText(raw.recipientEmail, 254).toLowerCase();
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw httpError("The recipient email label is invalid.");
  const expiresInDaysRaw = raw.expiresInDays == null ? DEFAULT_EXPIRY_DAYS : Math.trunc(Number(raw.expiresInDays));
  if (!Number.isInteger(expiresInDaysRaw) || expiresInDaysRaw < 1 || expiresInDaysRaw > MAX_EXPIRY_DAYS) {
    throw httpError(`Link expiry must be between 1 and ${MAX_EXPIRY_DAYS} days.`);
  }
  return {
    documentName,
    title: sanitizeText(raw.title, 120) || `Please sign ${documentName}`,
    message: sanitizeText(raw.message, 1000),
    recipientEmail,
    pageCount,
    originalHash,
    expiresInDays: expiresInDaysRaw,
    fields: validateFields(raw.fields, pageCount)
  };
}

function sameNumber(left, right) {
  return Number.isFinite(Number(left)) && Math.abs(Number(left) - Number(right)) <= 0.000001;
}

function validIsoTimestamp(value) {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(new Date(value).getTime());
}

async function validateAndSanitizeProofCapsule(proof, row, actualSignedHash, completedAt) {
  assertExactKeys(proof, PROOF_TOP_LEVEL_KEYS, "The integrity receipt");
  if (proof.format !== "signtrail-proof-capsule" || proof.version !== "1.0") throw httpError("The integrity receipt format is unsupported.");
  if (!/^ST-\d{8}-[A-F0-9]{10}$/.test(String(proof.verificationId || ""))) throw httpError("The verification ID is invalid.");
  if (sanitizeText(proof.documentName, 180) !== row.document_name) throw httpError("The receipt document name does not match the prepared document.");
  if (String(proof.signedHash || "").toLowerCase() !== actualSignedHash) throw httpError("The receipt signed hash does not match the uploaded signed PDF.");
  if (String(proof.originalHash || "").toLowerCase() !== row.original_hash) throw httpError("The receipt original hash does not match the prepared document.");
  if (Math.trunc(Number(proof.pageCount)) !== Number(row.page_count)) throw httpError("The receipt page count does not match the prepared document.");
  if (proof.verificationScope !== "byte-for-byte-document-match" || proof.identityAssurance !== "none") throw httpError("The receipt verification scope is unsupported.");
  if (!validIsoTimestamp(proof.createdAt) || !validIsoTimestamp(proof.completedAt)) throw httpError("The receipt timestamps are invalid.");
  assertExactKeys(proof.integrity, PROOF_INTEGRITY_KEYS, "The receipt integrity record");
  if (proof.integrity.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/i.test(String(proof.integrity.digest || ""))) throw httpError("The receipt integrity record is missing.");
  const { integrity, ...submittedPayload } = proof;
  const submittedDigest = await sha256Hex(encoder.encode(canonicalize(submittedPayload)));
  if (submittedDigest !== String(integrity.digest).toLowerCase()) throw httpError("The receipt integrity digest does not match its contents.");

  const expectedFields = JSON.parse(row.fields_json);
  if (!Array.isArray(proof.fields) || proof.fields.length !== expectedFields.length) throw httpError("The receipt field set does not match the signature request.");
  const submittedById = new Map();
  for (let index = 0; index < proof.fields.length; index += 1) {
    const field = proof.fields[index];
    assertExactKeys(field, PROOF_FIELD_KEYS, `Receipt field ${index + 1}`);
    assertExactKeys(field.placement, PROOF_PLACEMENT_KEYS, `Receipt field ${index + 1} placement`);
    const id = sanitizeText(field.id, 100);
    if (!id || submittedById.has(id)) throw httpError("The receipt contains missing or duplicate field IDs.");
    submittedById.set(id, field);
  }

  const sanitizedFields = expectedFields.map((expected, index) => {
    const submitted = submittedById.get(expected.id);
    if (!submitted) throw httpError(`The receipt is missing expected field ${expected.id}.`);
    if (submitted.type !== expected.type || Number(submitted.page) !== Number(expected.pageIndex) + 1 || Boolean(submitted.required) !== Boolean(expected.required) || submitted.assignedTo !== "recipient") {
      throw httpError(`Receipt field ${expected.id} does not match the prepared field definition.`);
    }
    const placement = submitted.placement;
    if (!sameNumber(placement.x, expected.x) || !sameNumber(placement.y, expected.y) || !sameNumber(placement.width, expected.width) || !sameNumber(placement.height, expected.height)) {
      throw httpError(`Receipt field ${expected.id} has altered placement data.`);
    }
    const completed = submitted.completed === true;
    if (expected.required && !completed) throw httpError(`Required field ${expected.id} is not marked complete.`);
    return {
      id: expected.id,
      type: expected.type,
      page: Number(expected.pageIndex) + 1,
      completed,
      required: Boolean(expected.required),
      assignedTo: "recipient",
      placement: {
        x: finiteRounded(expected.x),
        y: finiteRounded(expected.y),
        width: finiteRounded(expected.width),
        height: finiteRounded(expected.height)
      }
    };
  });

  if (!Array.isArray(proof.events) || proof.events.length > MAX_EVENTS) throw httpError(`The receipt event trail must contain at most ${MAX_EVENTS} events.`);
  const expectedIds = new Set(expectedFields.map(field => field.id));
  const sanitizedEvents = proof.events.map((event, index) => {
    assertExactKeys(event, PROOF_EVENT_KEYS, `Receipt event ${index + 1}`);
    const type = sanitizeText(event.type, 80);
    const title = sanitizeText(event.title, 200);
    if (!type || !title || !validIsoTimestamp(event.timestamp)) throw httpError(`Receipt event ${index + 1} is invalid.`);
    const clean = { type, title, timestamp: new Date(event.timestamp).toISOString() };
    if (event.page != null) {
      const page = Math.trunc(Number(event.page));
      if (!Number.isInteger(page) || page < 1 || page > Number(row.page_count)) throw httpError(`Receipt event ${index + 1} has an invalid page.`);
      clean.page = page;
    }
    if (event.fieldId != null) {
      const fieldId = sanitizeText(event.fieldId, 100);
      if (!expectedIds.has(fieldId)) throw httpError(`Receipt event ${index + 1} references an unknown field.`);
      clean.fieldId = fieldId;
    }
    return clean;
  });

  const sanitizedPayload = {
    format: "signtrail-proof-capsule",
    version: "1.1",
    verificationId: proof.verificationId,
    documentName: row.document_name,
    originalHash: row.original_hash,
    signedHash: actualSignedHash,
    createdAt: row.created_at,
    completedAt,
    pageCount: Number(row.page_count),
    fields: sanitizedFields,
    events: sanitizedEvents,
    verificationScope: "byte-for-byte-document-match",
    identityAssurance: "none",
    completionEvidence: "client-attested-field-state",
    receiptMeaning: "byte-match-integrity-only"
  };
  const digest = await sha256Hex(encoder.encode(canonicalize(sanitizedPayload)));
  return { ...sanitizedPayload, integrity: { algorithm: "SHA-256", digest } };
}

async function dbFirst(env, sql, ...args) {
  return env.DB.prepare(sql).bind(...args).first();
}

async function dbRun(env, sql, ...args) {
  return env.DB.prepare(sql).bind(...args).run();
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function numericEnv(env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function fixedWindow(now, durationMs) {
  const startMs = Math.floor(now.getTime() / durationMs) * durationMs;
  return {
    startsAt: new Date(startMs).toISOString(),
    expiresAt: new Date(startMs + durationMs).toISOString()
  };
}

async function reserveCreationQuota(env, email, windowName, window, limit, errorMessage) {
  const bucketKey = await sha256Hex(`${email}\n${windowName}\n${window.startsAt}`);
  const result = await dbRun(
    env,
    `INSERT INTO envelope_creation_quota (bucket_key, creator_email, window_name, count, expires_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1 WHERE count < ?`,
    bucketKey,
    email,
    windowName,
    window.expiresAt,
    limit
  );
  if (changedRows(result) !== 1) throw httpError(errorMessage, 429);
}

async function enforceCreationQuota(env, email, now) {
  const shortLimit = numericEnv(env, "SIGNTRAIL_CREATE_LIMIT_10M", 5);
  const dailyLimit = numericEnv(env, "SIGNTRAIL_CREATE_LIMIT_24H", 20);
  const shortWindow = fixedWindow(now, 10 * 60 * 1000);
  const dailyWindow = fixedWindow(now, 24 * 60 * 60 * 1000);

  await dbRun(env, "DELETE FROM envelope_creation_quota WHERE expires_at < ?", now.toISOString()).catch(() => {});
  await reserveCreationQuota(env, email, "24h", dailyWindow, dailyLimit, "Daily hosted-link creation limit reached.");
  await reserveCreationQuota(env, email, "10m", shortWindow, shortLimit, "Hosted-link creation limit reached. Try again later.");
}

function isExpired(row, now = Date.now()) {
  const time = Date.parse(row.expires_at || "");
  return Number.isFinite(time) && time <= now;
}

function requireRecipientToken(request) {
  const token = sanitizeText(request.headers.get("X-SignTrail-Recipient-Token"), 128);
  if (!token || token.length < 30) throw httpError("This signature link is missing or invalid.", 401);
  return token;
}

function requireManageToken(request) {
  const token = sanitizeText(request.headers.get("X-SignTrail-Manage-Token"), 128);
  if (!token || token.length < 30) throw httpError("The management credential is missing or invalid.", 401);
  return token;
}

async function findRecipientEnvelope(env, token) {
  const tokenHash = await sha256Hex(token);
  return dbFirst(env, "SELECT * FROM envelopes WHERE recipient_token_hash = ?", tokenHash);
}

async function findManagedEnvelope(env, token) {
  const tokenHash = await sha256Hex(token);
  return dbFirst(env, "SELECT * FROM envelopes WHERE manage_token_hash = ?", tokenHash);
}

function requireRecipientEnvelope(row) {
  if (!row) throw httpError("This signature link is invalid or has been deleted.", 404);
  if (isExpired(row)) throw httpError("This signature link has expired. Ask the sender to create a new request.", 410);
  return row;
}

function requireCreator(row, request) {
  const identity = requireAuthenticatedIdentity(request, "manage hosted signature requests");
  if (!row.creator_email || identity.email !== String(row.creator_email).toLowerCase()) {
    throw httpError("This hosted request belongs to a different signed-in account.", 403);
  }
  return identity;
}

function envelopePublicView(row, request) {
  const identity = viewerIdentity(request);
  const completed = row.status === "completed";
  return {
    envelopeId: row.id,
    documentName: row.document_name,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    completedAt: row.completed_at || "",
    fields: completed ? [] : JSON.parse(row.fields_json),
    pageCount: Number(row.page_count),
    originalHash: row.original_hash,
    signedHash: row.signed_hash || "",
    verificationId: row.verification_id || "",
    documentEndpoint: "/api/recipient/document",
    signedPdfEndpoint: completed ? "/api/recipient/signed.pdf" : "",
    proofCapsuleEndpoint: completed ? "/api/recipient/proof.json" : "",
    viewer: identity.email ? { authenticated: true, email: identity.email, name: identity.name || identity.email } : { authenticated: false, email: "", name: "" },
    trackingDisclosure: "Opening this private link records a link-open event. Counts may include reloads, previews, scanners, forwarded links, or another person. A verified opener email is recorded only after optional Sign in with ChatGPT."
  };
}

function managementView(row) {
  const completed = row.status === "completed";
  return {
    envelopeId: row.id,
    documentName: row.document_name,
    title: row.title,
    message: row.message,
    recipientEmail: row.recipient_email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: isExpired(row),
    status: isExpired(row) && !completed ? "expired" : row.status,
    openedAt: row.opened_at,
    lastOpenedAt: row.last_opened_at,
    openedCount: Number(row.opened_count || 0),
    verifiedOpenerEmail: row.verified_opener_email || "",
    verifiedOpenerName: row.verified_opener_name || "",
    completedByEmail: row.completed_by_email || "",
    completedByName: row.completed_by_name || "",
    completedAt: row.completed_at,
    signedHash: row.signed_hash || "",
    verificationId: row.verification_id || "",
    signedPdfAvailable: completed && Boolean(row.signed_key),
    proofCapsuleAvailable: completed && Boolean(row.proof_key)
  };
}

async function createEnvelope(request, env) {
  requireSameOriginMutation(request, MAX_CREATE_BODY_BYTES);
  requireMultipart(request);
  const identity = requireAuthenticatedIdentity(request, "create hosted signature links");
  const now = new Date();
  await enforceCreationQuota(env, identity.email, now);

  const form = await request.formData().catch(() => null);
  if (!form) throw httpError("Expected multipart form data.");
  const document = form.get("document");
  const metadataText = form.get("metadata");
  if (!(document instanceof File)) throw httpError("A prepared PDF is required.");
  if (document.size < 5 || document.size > MAX_PDF_BYTES) throw httpError("The prepared PDF must be between 5 bytes and 25 MB.");
  if (typeof metadataText !== "string" || metadataText.length > 100_000) throw httpError("Envelope metadata is missing or too large.");

  let metadataRaw;
  try { metadataRaw = JSON.parse(metadataText); } catch { throw httpError("Envelope metadata is not valid JSON."); }
  const metadata = validateEnvelopeMetadata(metadataRaw);
  const bytes = new Uint8Array(await document.arrayBuffer());
  if (!looksLikePdf(bytes)) throw httpError("The uploaded document is not a valid PDF.");
  const actualHash = await sha256Hex(bytes);
  if (actualHash !== metadata.originalHash) throw httpError("The prepared PDF fingerprint does not match the metadata.");

  const id = crypto.randomUUID();
  const recipientToken = randomToken();
  const manageToken = randomToken();
  const [recipientHash, manageHash] = await Promise.all([sha256Hex(recipientToken), sha256Hex(manageToken)]);
  const sourceKey = `envelopes/${id}/source.pdf`;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + metadata.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  await env.DOCUMENTS.put(sourceKey, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "no-store" },
    customMetadata: { envelopeId: id, documentName: metadata.documentName }
  });
  try {
    await dbRun(
      env,
      `INSERT INTO envelopes (
        id, recipient_token_hash, manage_token_hash, document_name, title, message,
        recipient_email, created_at, status, source_key, fields_json, page_count, original_hash,
        creator_email, creator_name, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?)`,
      id,
      recipientHash,
      manageHash,
      metadata.documentName,
      metadata.title,
      metadata.message,
      metadata.recipientEmail,
      createdAt,
      sourceKey,
      JSON.stringify(metadata.fields),
      metadata.pageCount,
      metadata.originalHash,
      identity.email,
      identity.name,
      expiresAt
    );
  } catch (error) {
    await env.DOCUMENTS.delete(sourceKey).catch(() => {});
    throw error;
  }

  const origin = new URL(request.url).origin;
  return json({
    envelopeId: id,
    shareUrl: `${origin}/#sign=${encodeURIComponent(recipientToken)}`,
    manageToken,
    createdAt,
    expiresAt,
    privacy: "The recipient link and management credential are bearer secrets. The management credential also requires the creator's signed-in ChatGPT account."
  }, 201);
}

async function openEnvelope(request, env) {
  const token = requireRecipientToken(request);
  const row = requireRecipientEnvelope(await findRecipientEnvelope(env, token));
  const now = new Date().toISOString();
  const identity = viewerIdentity(request);
  await dbRun(
    env,
    `UPDATE envelopes SET
      status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
      opened_at = COALESCE(opened_at, ?),
      last_opened_at = ?,
      opened_count = opened_count + 1,
      verified_opener_email = CASE WHEN ? <> '' THEN ? ELSE verified_opener_email END,
      verified_opener_name = CASE WHEN ? <> '' THEN ? ELSE verified_opener_name END
    WHERE id = ?`,
    now,
    now,
    identity.email,
    identity.email,
    identity.name,
    identity.name,
    row.id
  );
  return json(envelopePublicView({ ...row, status: row.status === "sent" ? "opened" : row.status }, request));
}

async function streamObject(env, key, filename, contentType, disposition = "inline") {
  if (!key) throw httpError("The requested file is not available.", 404);
  const object = await env.DOCUMENTS.get(key);
  if (!object) throw httpError("The requested file was not found.", 404);
  return new Response(object.body, {
    headers: baseHeaders({
      "Content-Type": object.httpMetadata?.contentType || contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`
    })
  });
}

async function recipientDocument(request, env) {
  const row = requireRecipientEnvelope(await findRecipientEnvelope(env, requireRecipientToken(request)));
  if (row.status === "completed") {
    const base = row.document_name.replace(/\.pdf$/i, "") || "document";
    return streamObject(env, row.signed_key, `${base}-signed.pdf`, "application/pdf", "inline");
  }
  return streamObject(env, row.source_key, row.document_name, "application/pdf", "inline");
}

async function recipientCompletedFile(request, env, kind) {
  const row = requireRecipientEnvelope(await findRecipientEnvelope(env, requireRecipientToken(request)));
  if (row.status !== "completed") throw httpError("The signature request is not complete yet.", 409);
  const base = row.document_name.replace(/\.pdf$/i, "") || "document";
  if (kind === "signed.pdf") return streamObject(env, row.signed_key, `${base}-signed.pdf`, "application/pdf", "attachment");
  return streamObject(env, row.proof_key, `${base}-${row.verification_id || "receipt"}-integrity-receipt.json`, "application/json; charset=utf-8", "attachment");
}

async function claimCompletion(env, rowId, claim, now) {
  const staleBefore = new Date(now.getTime() - COMPLETION_LOCK_MS).toISOString();
  const result = await dbRun(
    env,
    `UPDATE envelopes SET completion_claim = ?, completion_claimed_at = ?
     WHERE id = ? AND status <> 'completed' AND (
       completion_claim IS NULL OR completion_claim = '' OR completion_claimed_at IS NULL OR completion_claimed_at < ?
     )`,
    claim,
    now.toISOString(),
    rowId,
    staleBefore
  );
  return changedRows(result) === 1;
}

async function releaseCompletionClaim(env, rowId, claim) {
  await dbRun(
    env,
    `UPDATE envelopes SET completion_claim = NULL, completion_claimed_at = NULL
     WHERE id = ? AND completion_claim = ? AND status <> 'completed'`,
    rowId,
    claim
  ).catch(() => {});
}

async function completeEnvelope(request, env) {
  requireSameOriginMutation(request, MAX_COMPLETE_BODY_BYTES);
  requireMultipart(request);
  const token = requireRecipientToken(request);
  const row = requireRecipientEnvelope(await findRecipientEnvelope(env, token));
  if (row.status === "completed") throw httpError("This signature request has already been completed.", 409);

  const form = await request.formData().catch(() => null);
  if (!form) throw httpError("Expected multipart form data.");
  const signedPdf = form.get("signedPdf");
  const proofFile = form.get("proofCapsule");
  const metadataText = form.get("metadata");
  if (!(signedPdf instanceof File) || !(proofFile instanceof File)) throw httpError("The signed PDF and integrity receipt are required.");
  if (signedPdf.size < 5 || signedPdf.size > MAX_PDF_BYTES) throw httpError("The signed PDF must be between 5 bytes and 25 MB.");
  if (proofFile.size < 2 || proofFile.size > MAX_PROOF_BYTES) throw httpError("The integrity receipt is too large.");

  let metadata = {};
  if (typeof metadataText === "string" && metadataText.length <= 10_000) {
    try { metadata = JSON.parse(metadataText); } catch { throw httpError("Completion metadata is invalid JSON."); }
  }
  const signedBytes = new Uint8Array(await signedPdf.arrayBuffer());
  if (!looksLikePdf(signedBytes)) throw httpError("The completed document is not a valid PDF.");
  const actualSignedHash = await sha256Hex(signedBytes);
  if (metadata.signedHash && sanitizeText(metadata.signedHash, 64).toLowerCase() !== actualSignedHash) throw httpError("The completion fingerprint does not match the signed PDF.");

  let submittedProof;
  try { submittedProof = JSON.parse(await proofFile.text()); } catch { throw httpError("The integrity receipt is not valid JSON."); }
  const completedAt = new Date().toISOString();
  const sanitizedProof = await validateAndSanitizeProofCapsule(submittedProof, row, actualSignedHash, completedAt);
  if (metadata.verificationId && metadata.verificationId !== sanitizedProof.verificationId) throw httpError("The completion verification ID does not match the integrity receipt.");

  const claim = randomToken(18);
  if (!await claimCompletion(env, row.id, claim, new Date(completedAt))) {
    const latest = await dbFirst(env, "SELECT * FROM envelopes WHERE id = ?", row.id);
    if (latest?.status === "completed") throw httpError("This signature request has already been completed.", 409);
    throw httpError("Another completion is currently being processed. Please retry shortly.", 409);
  }

  const signedKey = `envelopes/${row.id}/completions/${claim}/signed.pdf`;
  const proofKey = `envelopes/${row.id}/completions/${claim}/proof.json`;
  const identity = viewerIdentity(request);
  let objectsWritten = false;
  try {
    await Promise.all([
      env.DOCUMENTS.put(signedKey, signedBytes, {
        httpMetadata: { contentType: "application/pdf", cacheControl: "no-store" },
        customMetadata: { envelopeId: row.id, verificationId: sanitizedProof.verificationId }
      }),
      env.DOCUMENTS.put(proofKey, encoder.encode(`${JSON.stringify(sanitizedProof, null, 2)}\n`), {
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
        customMetadata: { envelopeId: row.id, verificationId: sanitizedProof.verificationId }
      })
    ]);
    objectsWritten = true;

    const result = await dbRun(
      env,
      `UPDATE envelopes SET status = 'completed', completed_at = ?, signed_key = ?, proof_key = ?,
        signed_hash = ?, verification_id = ?, completion_claim = NULL, completion_claimed_at = NULL,
        completed_by_email = CASE WHEN ? <> '' THEN ? ELSE completed_by_email END,
        completed_by_name = CASE WHEN ? <> '' THEN ? ELSE completed_by_name END
      WHERE id = ? AND completion_claim = ? AND status <> 'completed'`,
      completedAt,
      signedKey,
      proofKey,
      actualSignedHash,
      sanitizedProof.verificationId,
      identity.email,
      identity.email,
      identity.name,
      identity.name,
      row.id,
      claim
    );
    if (changedRows(result) !== 1) throw httpError("The completion could not be committed because another request won the completion race.", 409);
  } catch (error) {
    if (objectsWritten) await env.DOCUMENTS.delete([signedKey, proofKey]).catch(() => {});
    await releaseCompletionClaim(env, row.id, claim);
    throw error;
  }

  return json({
    envelopeId: row.id,
    status: "completed",
    completedAt,
    verificationId: sanitizedProof.verificationId,
    signedHash: actualSignedHash,
    proofCapsule: sanitizedProof,
    message: "The signed PDF and byte-match integrity receipt were returned to the sender's hosted request history."
  });
}

async function getManagement(request, env) {
  const token = requireManageToken(request);
  const row = await findManagedEnvelope(env, token);
  if (!row) throw httpError("This management credential is invalid or has been deleted.", 404);
  requireCreator(row, request);
  return json(managementView(row));
}

async function managedFile(request, env, kind) {
  const token = requireManageToken(request);
  const row = await findManagedEnvelope(env, token);
  if (!row) throw httpError("This management credential is invalid or has been deleted.", 404);
  requireCreator(row, request);
  if (row.status !== "completed") throw httpError("The signature request is not complete yet.", 409);
  const base = row.document_name.replace(/\.pdf$/i, "") || "document";
  if (kind === "signed.pdf") return streamObject(env, row.signed_key, `${base}-signed.pdf`, "application/pdf", "attachment");
  return streamObject(env, row.proof_key, `${base}-${row.verification_id || "receipt"}-integrity-receipt.json`, "application/json; charset=utf-8", "attachment");
}

async function deleteManagedEnvelope(request, env) {
  requireSameOriginMutation(request, 1024);
  const token = requireManageToken(request);
  const row = await findManagedEnvelope(env, token);
  if (!row) throw httpError("This management credential is invalid or has been deleted.", 404);
  requireCreator(row, request);
  const keys = [row.source_key, row.signed_key, row.proof_key].filter(Boolean);
  if (keys.length) await env.DOCUMENTS.delete(keys);
  await dbRun(env, "DELETE FROM envelopes WHERE id = ?", row.id);
  return json({ deleted: true, envelopeId: row.id });
}

function sessionView(request) {
  const identity = viewerIdentity(request);
  return json({ authenticated: Boolean(identity.email), email: identity.email, name: identity.name || identity.email || "" });
}

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  try {
    requireBindings(env);
    const method = request.method.toUpperCase();
    if (method === "GET" && url.pathname === "/api/session") return sessionView(request);
    if (method === "POST" && url.pathname === "/api/envelopes") return await createEnvelope(request, env);

    if (method === "GET" && url.pathname === "/api/recipient") return await openEnvelope(request, env);
    if (method === "GET" && url.pathname === "/api/recipient/document") return await recipientDocument(request, env);
    if (method === "GET" && /^\/api\/recipient\/(signed\.pdf|proof\.json)$/.test(url.pathname)) {
      return await recipientCompletedFile(request, env, url.pathname.endsWith("signed.pdf") ? "signed.pdf" : "proof.json");
    }
    if (method === "POST" && url.pathname === "/api/recipient/complete") return await completeEnvelope(request, env);

    if (url.pathname === "/api/manage" && method === "GET") return await getManagement(request, env);
    if (url.pathname === "/api/manage" && method === "DELETE") return await deleteManagedEnvelope(request, env);
    if (method === "GET" && /^\/api\/manage\/(signed\.pdf|proof\.json)$/.test(url.pathname)) {
      return await managedFile(request, env, url.pathname.endsWith("signed.pdf") ? "signed.pdf" : "proof.json");
    }

    return errorResponse("API route not found.", 404);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      console.error("SignTrail API error", error);
      return errorResponse("Unexpected server error.", status);
    }
    return errorResponse(error?.message || "Request could not be completed.", status);
  }
}

export const testing = {
  canonicalize,
  sha256Hex,
  validateEnvelopeMetadata,
  validateAndSanitizeProofCapsule,
  viewerIdentity,
  looksLikePdf,
  randomToken,
  isExpired,
  changedRows
};
