// Genera src/common/data/psl-data.js a partir de la Public Suffix List oficial.
// Uso:  node tools/gen-psl.mjs [ruta/public_suffix_list.dat]
// Para actualizar la lista: descarga https://publicsuffix.org/list/public_suffix_list.dat
// en tools/ y vuelve a ejecutar este script (o `npm run psl`).
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { domainToASCII } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || path.join(here, 'public_suffix_list.dat');
const out = path.join(here, '..', 'src', 'common', 'data', 'psl-data.js');

const text = readFileSync(src, 'utf8');
const rules = [];
for (let line of text.split('\n')) {
  line = line.trim();
  if (!line || line.startsWith('//')) continue;
  line = line.split(/\s/)[0];
  let prefix = '';
  if (line.startsWith('!')) { prefix = '!'; line = line.slice(1); }
  if (line.startsWith('*.')) { prefix = '*.'; line = line.slice(2); }
  // Las reglas vienen en Unicode; los hostnames que entrega new URL() vienen en punycode.
  const ascii = domainToASCII(line) || line;
  rules.push(prefix + ascii.toLowerCase());
}

const stamp = statSync(src).mtime.toISOString().slice(0, 10);
const js = `// GENERADO AUTOMÁTICAMENTE por tools/gen-psl.mjs — no editar a mano.
// Fuente: https://publicsuffix.org/list/public_suffix_list.dat (MPL-2.0)
// Reglas: ${rules.length} · Fecha de la copia: ${stamp}
(function (root) {
  'use strict';
  const PG = (root.PG = root.PG || {});
  PG.PSL_DATA = { date: '${stamp}', rules: ${JSON.stringify(rules.join('\n'))} };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
writeFileSync(out, js);
console.log(`psl-data.js: ${rules.length} reglas (${(js.length / 1024).toFixed(0)} KB)`);
