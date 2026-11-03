#!/usr/bin/env node
// Comprobaciones estáticas sin dependencias: `pnpm check`.
// 1) sin dependencias de runtime · 2) sin lockfiles de npm/yarn · 3) sintaxis de todo el JS
// 4) imports solo relativos o `node:` · 5) HTML solo a través de web/esc.js · 6) sin datos personales evidentes
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = join(import.meta.dirname, '..');
const errores = [];
const error = (fichero, msg) => errores.push(`${fichero}: ${msg}`);

// 1) package.json
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
for (const campo of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
  if (pkg[campo] && Object.keys(pkg[campo]).length) error('package.json', `«${campo}» debe estar vacío (cero dependencias de runtime)`);
}
const devPermitidas = new Set(['@playwright/test']);
for (const d of Object.keys(pkg.devDependencies || {})) if (!devPermitidas.has(d)) error('package.json', `devDependency no permitida: ${d}`);
if (pkg.type !== 'module') error('package.json', 'falta "type": "module"');
if (!String(pkg.packageManager || '').startsWith('pnpm@')) error('package.json', 'packageManager debe ser pnpm');

// 2) lockfiles ajenos
for (const f of ['package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json']) if (existsSync(join(raiz, f))) error(f, 'usa pnpm, no npm ni yarn');

// recorrido
const IGNORAR = new Set(['.git', 'node_modules', 'coverage']);
function recorrer(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORAR.has(e.name)) return [];
    const ruta = join(dir, e.name);
    return e.isDirectory() ? recorrer(ruta) : [ruta];
  });
}
const todos = recorrer(raiz);
const js = todos.filter((f) => ['.js', '.mjs'].includes(extname(f)) && !relative(raiz, f).startsWith('docs/'));

// 3) sintaxis
for (const f of js) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) error(relative(raiz, f), 'error de sintaxis\n' + r.stderr.trim());
}

// 4) imports: solo relativos, absolutos del propio servidor (/core/…) o node:
const reImport = /(?:^|[^\w.])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w.])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
for (const f of js) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(reImport)) {
    const spec = m[1] || m[2] || m[3];
    // Playwright (devDependency) solo en los e2e y en el script de capturas (herramientas de desarrollo)
    const rel = relative(raiz, f).replaceAll('\\', '/');
    const e2e = (rel.startsWith('test/e2e/') || rel === 'scripts/capturas.js') && spec === '@playwright/test';
    if (!e2e && !(spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/') || spec.startsWith('node:'))) {
      error(relative(raiz, f), `import no permitido «${spec}» (solo relativos o node:)`);
    }
  }
}

// 5) inserción de HTML solo en web/esc.js (que escapa con esc())
const reHtml = /\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML\s*\(|document\.write\s*\(/;
for (const f of js) {
  const rel = relative(raiz, f).replaceAll('\\', '/');
  if (rel === 'web/esc.js' || rel === 'scripts/check.js' || rel.startsWith('test/')) continue;
  readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
    if (reHtml.test(linea)) error(`${rel}:${i + 1}`, 'inserción de HTML fuera de web/esc.js; usa pintar()/html`` con esc()');
  });
}

// 6) datos personales evidentes en lo que se versiona como ejemplo, semilla o test
const reIban = /\bES\d{2}[ ]?(?:\d{4}[ ]?){5}\b/;
const reEmail = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/;
for (const f of todos.filter((f) => /^(ejemplo|semilla|test)\//.test(relative(raiz, f).replaceAll('\\', '/')))) {
  if (!['.md', '.js', '.json', '.jsonl', '.txt'].includes(extname(f))) continue;
  const src = readFileSync(f, 'utf8');
  if (reIban.test(src)) error(relative(raiz, f), 'parece contener un IBAN');
  const email = src.match(reEmail);
  if (email && !/(example\.(com|org)|noreply@anthropic\.com)$/.test(email[0])) error(relative(raiz, f), `parece contener un email: ${email[0]}`);
}

if (errores.length) {
  console.error(`✗ check: ${errores.length} problema(s)\n` + errores.map((e) => '  · ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ check: ${js.length} ficheros JS revisados, sin dependencias, imports y HTML correctos`);
