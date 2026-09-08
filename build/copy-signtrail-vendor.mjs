import { copyFile, cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'public/vendor/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/vendor/pdf.worker.min.mjs'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'public/vendor/pdf-lib.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'public/vendor/jszip.min.js']
];

await mkdir(resolve(root, 'public/vendor'), { recursive: true });
for (const [source, destination] of targets) {
  const sourcePath = resolve(root, source);
  const destinationPath = resolve(root, destination);
  await copyFile(sourcePath, destinationPath);
  console.log(`Vendored ${source} -> ${destination}`);
}

for (const directory of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
  const source = resolve(root, 'node_modules/pdfjs-dist', directory);
  const destination = resolve(root, 'public/vendor/pdfjs', directory);
  await cp(source, destination, { recursive: true, force: true });
  console.log(`Vendored pdfjs-dist/${directory} -> public/vendor/pdfjs/${directory}`);
}
