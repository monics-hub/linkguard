// Construye las extensiones a partir de:
//   src/common/   → código compartido (idéntico en ambos navegadores)
//   src/chrome/   → adaptador + manifest + entrada del background de Chrome
//   src/firefox/  → adaptador + manifest + entrada del background de Firefox
//   src/icons/    → iconos
// Resultado: dist/chrome/ y dist/firefox/ (cargables tal cual) y sus .zip.
//
// Uso:  node build.mjs            (sin dependencias)
//       npm install && node build.mjs   → incluye además la librería tldts si está instalada
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const TLDTS = path.join(ROOT, 'node_modules', 'tldts', 'dist', 'index.umd.min.js');
const hasTldts = existsSync(TLDTS);
const today = new Date().toISOString().slice(0, 10);

for (const browser of ['chrome', 'firefox']) {
  const out = path.join(DIST, browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, 'platform'), { recursive: true });

  cpSync(path.join(SRC, 'common'), path.join(out, 'common'), { recursive: true });
  cpSync(path.join(SRC, 'icons'), path.join(out, 'icons'), { recursive: true });
  for (const f of ['platform.js', 'background.js']) cpSync(path.join(SRC, browser, f), path.join(out, 'platform', f));

  const manifest = JSON.parse(readFileSync(path.join(SRC, browser, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  writeFileSync(path.join(out, 'common', 'data', 'build-info.js'),
    `// Generado por build.mjs\n(function (root) { (root.PG = root.PG || {}).BUILD = ${JSON.stringify({ browser, version: pkg.version, date: today, tldts: hasTldts })}; })(globalThis);\n`);

  if (hasTldts) {
    mkdirSync(path.join(out, 'vendor'), { recursive: true });
    cpSync(TLDTS, path.join(out, 'vendor', 'tldts.umd.min.js'));
    const opt = path.join(out, 'common', 'options', 'options.html');
    writeFileSync(opt, readFileSync(opt, 'utf8').replace('<!--TLDTS-->', '<script src="../../vendor/tldts.umd.min.js"></script>'));
  }

  const zip = path.join(DIST, `linkguard-${browser}-${pkg.version}.zip`);
  rmSync(zip, { force: true });
  try {
    execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
    console.log(`✓ ${browser}: dist/${browser}/  +  ${path.relative(ROOT, zip)}`);
  } catch (_) {
    console.log(`✓ ${browser}: dist/${browser}/  (instala "zip" para generar también el .zip)`);
  }
}
console.log(hasTldts ? 'Motor de dominios: tldts (node_modules)' : 'Motor de dominios: PSL integrada (src/common/data/psl-data.js)');
