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

export function verifyProofCapsule(pdfBytes, capsule) {
  assertObject(capsule, 'Receipt');
  if (capsule.format !== 'signtrail-proof-capsule' || !SUPPORTED_VERSIONS.has(capsule.version)) {
    fail('Receipt format or version is not supported.');
  }
  if (!VERIFICATION_ID.test(capsule.verificationId || '')) fail('Verification ID is missing or malformed.');
  if (!HEX_64.test(capsule.originalHash || '') || !HEX_64.test(capsule.signedHash || '')) {
    fail('Document fingerprints are missing or malformed.');
  }
  if (!validTimestamp(capsule.completedAt)) fail('Completion timestamp is invalid.');
  if (capsule.createdAt != null && !validTimestamp(capsule.createdAt)) fail('Creation timestamp is invalid.');
  if (!Number.isInteger(capsule.pageCount) || capsule.pageCount < 1) fail('Page count is invalid.');
  if (!Array.isArray(capsule.fields) || !Array.isArray(capsule.events)) fail('Receipt field or event records are missing.');
  if (capsule.events.length > MAX_EVENTS) fail(`Receipt event trail exceeds ${MAX_EVENTS} events.`);
  if (capsule.identityAssurance !== 'none' || capsule.verificationScope !== 'byte-for-byte-document-match') {
    fail('Receipt declares an unsupported verification scope or identity assurance level.');
  }
  if (capsule.version === '1.1' && (
    capsule.completionEvidence !== 'client-attested-field-state' ||
    capsule.receiptMeaning !== 'byte-match-integrity-only'
  )) {
    fail('Hosted integrity receipt declares unsupported evidence semantics.');
  }

  const rawText = JSON.stringify(capsule);
  if (/signatureDataUrl|data:image\/png;base64/i.test(rawText)) {
    fail('Receipt improperly contains signature image data.');
  }

  assertObject(capsule.integrity, 'Receipt integrity record');
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
