const fs = require('node:fs');
const path = require('node:path');
const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.resolve(__dirname, '../public/pdfjs');
fs.mkdirSync(target, {recursive: true});
fs.copyFileSync(path.join(source, 'build/pdf.worker.min.mjs'), path.join(target, 'pdf.worker.min.mjs'));
for (const directory of ['standard_fonts', 'wasm']) {
  fs.cpSync(path.join(source, directory), path.join(target, directory), {recursive: true});
}
