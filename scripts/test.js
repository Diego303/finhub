#!/usr/bin/env node
// Lanza node:test solo sobre ficheros *.test.js (test/fake-claude.js y las grabaciones no son tests).
// Uso: node scripts/test.js [carpeta…] [--cobertura]   · funciona en Node 20 (sin globs en --test).
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const cobertura = args.includes('--cobertura');
const carpetas = args.filter((a) => !a.startsWith('--'));

function buscarTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : buscarTests(ruta);
    return e.name.endsWith('.test.js') ? [ruta] : [];
  });
}

const ficheros = (carpetas.length ? carpetas : ['test']).flatMap((c) => buscarTests(join(raiz, c))).sort();
if (!ficheros.length) {
  console.error('No hay ficheros *.test.js en', carpetas.join(', ') || 'test/');
  process.exit(1);
}
// Los e2e manejan un navegador real con toasts que caducan: van después y de uno en uno, para que la carga
// de los demás ficheros (en paralelo) no los vuelva intermitentes.
const esE2e = (f) => relative(raiz, f).split(/[\\/]/).includes('e2e');
const tandas = [ficheros.filter((f) => !esE2e(f)), ficheros.filter(esE2e)].filter((t) => t.length);
let estado = 0;
for (const [i, tanda] of tandas.entries()) {
  const serie = tanda.some(esE2e) ? ['--test-concurrency=1'] : [];
  const opciones = ['--test', ...serie, ...(cobertura ? ['--experimental-test-coverage'] : []), ...tanda.map((f) => relative(raiz, f))];
  if (i > 0) console.log('\n— e2e (navegador), de uno en uno —');
  const r = spawnSync(process.execPath, opciones, { cwd: raiz, stdio: 'inherit', env: { ...process.env, TZ: process.env.TZ || 'Europe/Madrid' } });
  if ((r.status ?? 1) !== 0) estado = r.status ?? 1;
}
process.exit(estado);
