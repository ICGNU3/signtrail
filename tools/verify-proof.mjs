#!/usr/bin/env node
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SUPPORTED_VERSIONS = new Set(['1.0', '1.1']);
const HEX_64 = /^[a-f0-9]{64}$/i;
const VERIFICATION_ID = /^ST-\d{8}-[A-F0-9]{10}$/;
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_EVENTS = 500;

const TOP_LEVEL_REQUIRED = [
  'format', 'version', 'verificationId', 'documentName', 'originalHash',
  'signedHash', 'createdAt', 'completedAt', 'pageCount', 'fields', 'events',
  'verificationScope', 'identityAssurance', 'integrity'
];
const TOP_LEVEL_ALLOWED = new Set([
  ...TOP_LEVEL_REQUIRED, 'completionEvidence', 'receiptMeaning'
]);
const FIELD_KEYS = new Set(['id', 'type', 'page', 'completed', 'required', 'assignedTo', 'placement']);
const PLACEMENT_KEYS = new Set(['x', 'y', 'width', 'height']);
const EVENT_KEYS = new Set(['type', 'title', 'timestamp', 'page', 'fieldId']);
const INTEGRITY_KEYS = new Set(['algorithm', 'digest']);
const FIELD_TYPES = new Set(['signature', 'initials', 'print_name', 'date', 'email', 'address', 'text', 'checkbox']);
const ASSIGNEES = new Set(['self', 'recipient']);

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function validTimestamp(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(new Date(value).getTime());
}

function safeHexEqual(left, right) {
  if (!HEX_64.test(left || '') || !HEX_64.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left.toLowerCase(), 'hex'), Buffer.from(right.toLowerCase(), 'hex'));
}

function fail(reason) {
  const error = new Error(reason);
  error.name = 'SignTrailVerificationError';
  throw error;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be a JSON object.`);
}

function assertShape(value, required, allowed, label) {
  assertObject(value, label);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing required property "${key}".`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported property "${key}".`);
  }
}

function assertString(value, label, { minLength = 0, maxLength = Infinity } = {}) {
  if (typeof value !== 'string' || value.length < minLength || value.length > maxLength) {
    fail(`${label} is invalid.`);
  }
}

function assertBoundedNumber(value, label, { minimum = 0, exclusiveMinimum = false, maximum = 1 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} is invalid.`);
  if (exclusiveMinimum ? value <= minimum : value < minimum) fail(`${label} is invalid.`);
  if (value > maximum) fail(`${label} is invalid.`);
}

function serializedReceiptBytes(capsule) {
  let serialized;
  try {
    serialized = JSON.stringify(capsule);
  } catch {
    fail('Integrity receipt cannot be serialized as JSON.');
  }
  if (typeof serialized !== 'string') fail('Integrity receipt cannot be serialized as JSON.');
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_RECEIPT_BYTES) fail('Integrity receipt exceeds the supported 2 MB limit.');
  return serialized;
}

function validateFields(fields) {
  if (!Array.isArray(fields)) fail('Receipt field records are missing.');
  for (let index = 0; index < fields.length; index += 1) {
    const label = `Field ${index + 1}`;
    const field = fields[index];
    assertShape(field, [...FIELD_KEYS], FIELD_KEYS, label);
    assertString(field.id, `${label} id`, { minLength: 1, maxLength: 100 });
    if (!FIELD_TYPES.has(field.type)) fail(`${label} type is invalid.`);
    if (!Number.isInteger(field.page) || field.page < 1) fail(`${label} page is invalid.`);
    if (typeof field.completed !== 'boolean') fail(`${label} completed flag is invalid.`);
    if (typeof field.required !== 'boolean') fail(`${label} required flag is invalid.`);
    if (!ASSIGNEES.has(field.assignedTo)) fail(`${label} assignee is invalid.`);

    assertShape(field.placement, [...PLACEMENT_KEYS], PLACEMENT_KEYS, `${label} placement`);
    assertBoundedNumber(field.placement.x, `${label} placement x`);
    assertBoundedNumber(field.placement.y, `${label} placement y`);
    assertBoundedNumber(field.placement.width, `${label} placement width`, { exclusiveMinimum: true });
    assertBoundedNumber(field.placement.height, `${label} placement height`, { exclusiveMinimum: true });
  }
}

function validateEvents(events) {
  if (!Array.isArray(events)) fail('Receipt event records are missing.');
  if (events.length > MAX_EVENTS) fail(`Receipt event trail exceeds ${MAX_EVENTS} events.`);
  for (let index = 0; index < events.length; index += 1) {
    const label = `Event ${index + 1}`;
    const event = events[index];
    assertShape(event, ['type', 'title', 'timestamp'], EVENT_KEYS, label);
    assertString(event.type, `${label} type`, { minLength: 1, maxLength: 80 });
    assertString(event.title, `${label} title`, { minLength: 1, maxLength: 200 });
    if (!validTimestamp(event.timestamp)) fail(`${label} timestamp is invalid.`);
    if (event.page != null && (!Number.isInteger(event.page) || event.page < 1)) fail(`${label} page is invalid.`);
    if (event.fieldId != null) assertString(event.fieldId, `${label} fieldId`, { minLength: 1, maxLength: 100 });
  }
}

export function verifyProofCapsule(pdfBytes, capsule) {
  const rawText = serializedReceiptBytes(capsule);

  const required = capsule?.version === '1.1'
    ? [...TOP_LEVEL_REQUIRED, 'completionEvidence', 'receiptMeaning']
    : TOP_LEVEL_REQUIRED;
  assertShape(capsule, required, TOP_LEVEL_ALLOWED, 'Receipt');

  if (capsule.format !== 'signtrail-proof-capsule' || !SUPPORTED_VERSIONS.has(capsule.version)) {
    fail('Receipt format or version is not supported.');
  }
  if (!VERIFICATION_ID.test(capsule.verificationId || '')) fail('Verification ID is missing or malformed.');
  assertString(
    capsule.documentName,
    'Document name',
    capsule.version === '1.1' ? { minLength: 1, maxLength: 180 } : { minLength: 1 }
  );
  if (!HEX_64.test(capsule.originalHash || '') || !HEX_64.test(capsule.signedHash || '')) {
    fail('Document fingerprints are missing or malformed.');
  }
  if (!validTimestamp(capsule.createdAt)) fail('Creation timestamp is invalid.');
  if (!validTimestamp(capsule.completedAt)) fail('Completion timestamp is invalid.');
  if (!Number.isInteger(capsule.pageCount) || capsule.pageCount < 1) fail('Page count is invalid.');

  validateFields(capsule.fields);
  validateEvents(capsule.events);

  if (capsule.identityAssurance !== 'none' || capsule.verificationScope !== 'byte-for-byte-document-match') {
    fail('Receipt declares an unsupported verification scope or identity assurance level.');
  }
  if (Object.hasOwn(capsule, 'completionEvidence') && capsule.completionEvidence !== 'client-attested-field-state') {
    fail('Receipt declares unsupported completion evidence semantics.');
  }
  if (Object.hasOwn(capsule, 'receiptMeaning') && capsule.receiptMeaning !== 'byte-match-integrity-only') {
    fail('Receipt declares unsupported receipt meaning.');
  }

  if (/signatureDataUrl|data:image\/png;base64/i.test(rawText)) {
    fail('Receipt improperly contains signature image data.');
  }

  assertShape(capsule.integrity, ['algorithm', 'digest'], INTEGRITY_KEYS, 'Receipt integrity record');
  if (capsule.integrity.algorithm !== 'SHA-256' || !HEX_64.test(capsule.integrity.digest || '')) {
    fail('Receipt integrity record is missing or malformed.');
  }

  const { integrity, ...payload } = capsule;
  const computedReceiptDigest = sha256Hex(Buffer.from(canonicalize(payload), 'utf8'));
  if (!safeHexEqual(computedReceiptDigest, integrity.digest)) {
    fail('Receipt integrity digest does not match its contents.');
  }

  const bytes = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) fail('Signed PDF is empty or exceeds the supported 25 MB limit.');
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') fail('Signed document does not look like a PDF.');

  const observedSignedHash = sha256Hex(bytes);
  if (!safeHexEqual(observedSignedHash, capsule.signedHash)) {
    fail('Signed PDF SHA-256 does not match the receipt.');
  }

  return {
    ok: true,
    verificationId: capsule.verificationId,
    version: capsule.version,
    signedHash: capsule.signedHash.toLowerCase(),
    originalHash: capsule.originalHash.toLowerCase(),
    completedAt: capsule.completedAt,
    verificationScope: capsule.verificationScope,
    identityAssurance: capsule.identityAssurance,
    receiptMeaning: capsule.version === '1.1' ? capsule.receiptMeaning : 'byte-match-integrity-only',
  };
}

function machineResult(result) {
  return {
    verified: true,
    verificationId: result.verificationId,
    version: result.version,
    signedHash: result.signedHash,
    originalHash: result.originalHash,
    completedAt: result.completedAt,
    verificationScope: result.verificationScope,
    identityAssurance: result.identityAssurance,
    receiptMeaning: result.receiptMeaning,
  };
}

async function runCli(argv) {
  const jsonMode = argv.includes('--json');
  const positional = argv.filter(arg => arg !== '--json');
  const [pdfPath, receiptPath] = positional;
  if (!pdfPath || !receiptPath || positional.length !== 2) {
    const message = 'Usage: npm run verify:proof -- <signed.pdf> <integrity-receipt.json> [--json]';
    if (jsonMode) console.log(JSON.stringify({ verified: false, error: message }));
    else console.error(message);
    return 2;
  }

  try {
    const [pdfBytes, receiptBytes] = await Promise.all([readFile(pdfPath), readFile(receiptPath)]);
    if (receiptBytes.length > MAX_RECEIPT_BYTES) fail('Integrity receipt exceeds the supported 2 MB limit.');

    let capsule;
    try {
      capsule = JSON.parse(receiptBytes.toString('utf8'));
    } catch {
      fail('Integrity receipt is not valid JSON.');
    }

    const result = verifyProofCapsule(pdfBytes, capsule);
    if (jsonMode) {
      console.log(JSON.stringify(machineResult(result)));
    } else {
      console.log('✓ Receipt structure and semantics valid');
      console.log('✓ Receipt integrity digest valid');
      console.log('✓ Signed PDF SHA-256 matches receipt');
      console.log('');
      console.log('SIGNTRAIL PROOF VERIFIED');
      console.log(`Verification ID: ${result.verificationId}`);
      console.log(`Verification scope: ${result.verificationScope}`);
      console.log(`Identity assurance: ${result.identityAssurance}`);
      console.log('Meaning: byte-match integrity only; this does not prove legal identity or enforceability.');
    }
    return 0;
  } catch (error) {
    const message = error?.message || String(error);
    if (jsonMode) console.log(JSON.stringify({ verified: false, error: message }));
    else console.error(`SIGNTRAIL PROOF INVALID: ${message}`);
    return 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) process.exitCode = await runCli(process.argv.slice(2));
