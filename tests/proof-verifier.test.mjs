import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { canonicalize, verifyProofCapsule } from '../tools/verify-proof.mjs';

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function makeFixture(version = '1.1') {
  const pdf = Buffer.from('%PDF-1.7\nsynthetic SignTrail fixture\n%%EOF\n');
  const payload = {
    format: 'signtrail-proof-capsule',
    version,
    verificationId: 'ST-20260907-ABCDEF1234',
    documentName: 'fixture.pdf',
    originalHash: sha256Hex(Buffer.from('%PDF-1.7\noriginal\n%%EOF\n')),
    signedHash: sha256Hex(pdf),
    createdAt: '2026-09-07T20:00:00.000Z',
    completedAt: '2026-09-07T20:01:00.000Z',
    pageCount: 1,
    fields: [{
      id: 'field-1',
      type: 'signature',
      page: 1,
      completed: true,
      required: true,
      assignedTo: 'recipient',
      placement: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 }
    }],
    events: [{ type: 'document_finalized', title: 'Document finalized', timestamp: '2026-09-07T20:01:00.000Z' }],
    verificationScope: 'byte-for-byte-document-match',
    identityAssurance: 'none',
    ...(version === '1.1' ? {
      completionEvidence: 'client-attested-field-state',
      receiptMeaning: 'byte-match-integrity-only'
    } : {})
  };
  const digest = sha256Hex(Buffer.from(canonicalize(payload), 'utf8'));
  return { pdf, capsule: { ...payload, integrity: { algorithm: 'SHA-256', digest } } };
}

test('valid v1.1 proof passes', () => {
  const { pdf, capsule } = makeFixture('1.1');
  assert.equal(verifyProofCapsule(pdf, capsule).ok, true);
});

test('valid v1.0 proof passes', () => {
  const { pdf, capsule } = makeFixture('1.0');
  assert.equal(verifyProofCapsule(pdf, capsule).ok, true);
});

test('modified PDF fails', () => {
  const { capsule } = makeFixture();
  const modifiedPdf = Buffer.from('%PDF-1.7\nmodified\n%%EOF\n');
  assert.throws(() => verifyProofCapsule(modifiedPdf, capsule), /Signed PDF SHA-256 does not match/);
});

test('modified receipt fails digest validation', () => {
  const { pdf, capsule } = makeFixture();
  const modified = structuredClone(capsule);
  modified.documentName = 'tampered.pdf';
  assert.throws(() => verifyProofCapsule(pdf, modified), /integrity digest does not match/);
});

test('invalid digest fails', () => {
  const { pdf, capsule } = makeFixture();
  capsule.integrity.digest = '0'.repeat(64);
  assert.throws(() => verifyProofCapsule(pdf, capsule), /integrity digest does not match/);
});

test('unsupported version fails', () => {
  const { pdf, capsule } = makeFixture();
  capsule.version = '2.0';
  assert.throws(() => verifyProofCapsule(pdf, capsule), /format or version is not supported/);
});

test('receipt rejects embedded signature image data', () => {
  const { pdf, capsule } = makeFixture();
  const payload = structuredClone(capsule);
  delete payload.integrity;
  payload.fields[0].signatureDataUrl = 'data:image/png;base64,AAAA';
  payload.integrity = {
    algorithm: 'SHA-256',
    digest: sha256Hex(Buffer.from(canonicalize(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'integrity'))), 'utf8'))
  };
  assert.throws(() => verifyProofCapsule(pdf, payload), /signature image data/);
});

test('CLI --json emits one machine-readable success object', async () => {
  const { pdf, capsule } = makeFixture();
  const dir = await mkdtemp(join(tmpdir(), 'signtrail-proof-'));
  const pdfPath = join(dir, 'signed.pdf');
  const receiptPath = join(dir, 'receipt.json');
  await Promise.all([
    writeFile(pdfPath, pdf),
    writeFile(receiptPath, JSON.stringify(capsule))
  ]);

  const run = spawnSync(process.execPath, ['tools/verify-proof.mjs', pdfPath, receiptPath, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  const output = JSON.parse(run.stdout);
  assert.equal(output.verified, true);
  assert.equal(output.verificationId, capsule.verificationId);
  assert.equal(output.verificationScope, 'byte-for-byte-document-match');
  assert.equal(output.identityAssurance, 'none');
  assert.equal(output.receiptMeaning, 'byte-match-integrity-only');
});

test('CLI --json emits machine-readable failure', async () => {
  const { capsule } = makeFixture();
  const dir = await mkdtemp(join(tmpdir(), 'signtrail-proof-'));
  const pdfPath = join(dir, 'signed.pdf');
  const receiptPath = join(dir, 'receipt.json');
  await Promise.all([
    writeFile(pdfPath, Buffer.from('%PDF-1.7\nchanged\n%%EOF\n')),
    writeFile(receiptPath, JSON.stringify(capsule))
  ]);

  const run = spawnSync(process.execPath, ['tools/verify-proof.mjs', pdfPath, receiptPath, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  assert.equal(run.stderr, '');
  const output = JSON.parse(run.stdout);
  assert.equal(output.verified, false);
  assert.match(output.error, /Signed PDF SHA-256 does not match/);
});

test('published JSON Schema describes both supported receipt versions', async () => {
  const schema = JSON.parse(await readFile('schemas/signtrail-proof-capsule.schema.json', 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(schema.properties.version.enum, ['1.0', '1.1']);
  assert.equal(schema.properties.verificationScope.const, 'byte-for-byte-document-match');
  assert.equal(schema.properties.identityAssurance.const, 'none');
  assert.ok(schema.allOf.some(rule => rule.then?.required?.includes('receiptMeaning')));
});
