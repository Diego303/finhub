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

test('QA-007: cancelar, el timeout y la guardia matan al proceso y a sus hijos', async () => {
  for (const modo of ['cancelar', 'timeout', 'guardia']) {
    const pidf = join(ta.dir, `pid-${modo}`);
    const pasos = [{ init: {} }, { hijo: pidf }, ...(modo === 'guardia' ? [{ esperar: 100 }, { toolUse: 'Bash' }] : []), { colgar: true }];
    const ac = new AbortController();
    const p = ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion(pasos), senal: ac.signal, timeoutMs: modo === 'timeout' ? 3000 : 6000 });
    assert.ok(await hasta(() => fsp.stat(pidf).then(() => true, () => false)), 'arrancó el hijo');
    const pid = +(await fsp.readFile(pidf, 'utf8'));
    if (modo === 'cancelar') ac.abort();
    const r = await p;
    assert.equal(r.estado, 'error', modo);
    assert.ok(await hasta(() => !vivo(pid), 7000), `${modo}: el hijo ${pid} sigue vivo`);
    assert.deepEqual(await fsp.readdir(ta.base), [], `${modo}: sandbox borrado`);
  }
});
