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
const opciones = ['--test', ...(cobertura ? ['--experimental-test-coverage'] : []), ...ficheros.map((f) => relative(raiz, f))];
const r = spawnSync(process.execPath, opciones, { cwd: raiz, stdio: 'inherit', env: { ...process.env, TZ: process.env.TZ || 'Europe/Madrid' } });
process.exit(r.status ?? 1);
