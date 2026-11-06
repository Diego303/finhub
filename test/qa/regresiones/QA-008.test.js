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

test('QA-008: una salida enorme (con o sin saltos de línea) se corta con un error claro', async () => {
  const sinSaltos = await ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { enorme: 3_000_000 }, { colgar: true }]), maxSalida: 1_000_000, timeoutMs: 4000 });
  assert.equal(sinSaltos.estado, 'error');
  assert.match(sinSaltos.motivos.join(), /demasiado grande/);
  const muchas = await ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, ...Array(40).fill({ deltas: 'x'.repeat(50000) }), { colgar: true }]), maxSalida: 200_000, timeoutMs: 4000 });
  assert.equal(muchas.estado, 'error');
});
