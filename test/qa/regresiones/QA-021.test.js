// QA-007, QA-008, QA-020, QA-021, QA-017 · Ciclo de vida del proceso de Claude: cancelar mata también a sus hijos,
// una salida enorme no agota la memoria, morir por una señal es un error, y nada queda huérfano.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { ejecutar } from '../../../src/claude/runner.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { App } from '../../../src/server/app.js';
import { taller, json, FAKE } from '../ayuda-claude.js';
import { crearEntorno, esperar } from '../entorno.js';

let ta;
before(async () => (ta = await taller('proceso')));
after(() => ta.limpiar());
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function hasta(fn, ms = 8000) {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    if (await fn()) return true;
    await esperar(50);
  }
  return false;
}

test('QA-021: los sandboxes viejos que dejó un servidor muerto se limpian al arrancar (solo «sbx-*» de más de un día)', async () => {
  const ent = await crearEntorno({ nombre: 'sbx' });
  const dirs = join(ent.home, '.cache', 'finhub', 'sandbox');
  const viejo = join(dirs, 'sbx-viejo');
  const nuevo = join(dirs, 'sbx-nuevo');
  const otro = join(dirs, 'otra-cosa');
  for (const d of [viejo, nuevo, otro]) await fsp.mkdir(d, { recursive: true });
  const ayer = new Date(Date.now() - 2 * 86400000);
  await fsp.utimes(viejo, ayer, ayer);
  await fsp.utimes(otro, ayer, ayer);
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  try {
    assert.deepEqual((await fsp.readdir(dirs)).sort(), ['otra-cosa', 'sbx-nuevo']);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
