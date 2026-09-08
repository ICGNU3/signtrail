#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { verifyProofCapsule } from '../tools/verify-proof.mjs';

const [pdfPath, receiptPath] = process.argv.slice(2);

if (!pdfPath || !receiptPath) {
  console.error('Usage: node examples/verify-proof.mjs <signed.pdf> <integrity-receipt.json>');
  process.exitCode = 2;
} else {
  try {
    const [pdfBytes, receiptText] = await Promise.all([
      readFile(pdfPath),
      readFile(receiptPath, 'utf8'),
    ]);
    const result = verifyProofCapsule(pdfBytes, JSON.parse(receiptText));
    console.log(JSON.stringify({ verified: true, ...result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ verified: false, error: error?.message || String(error) }, null, 2));
    process.exitCode = 1;
  }
}
