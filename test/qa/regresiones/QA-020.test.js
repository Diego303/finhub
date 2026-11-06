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
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await fn()) return true;
    await esperar(50);
  }
  return false;
}

test('QA-020: si el proceso muere por una señal o sale con error, es un fallo con su mensaje, no una «salida sin JSON»', async () => {
  const senal = await ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { senal: 'SIGKILL' }]) });
  assert.deepEqual([senal.estado, senal.codigo], ['error', 'fallo']);
  const salida = await ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { stderr: 'algo fue mal' }, { salir: 3 }]) });
  assert.deepEqual([salida.estado, salida.codigo], ['error', 'fallo']);
  assert.match(salida.motivos.join(), /algo fue mal/);
  const limite = await ejecutar(trabajo('ingesta'), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { emitir: { type: 'result', subtype: 'success', is_error: true, result: "You've hit your usage limit", session_id: 'x' } }, { salir: 1 }]) });
  assert.deepEqual([limite.estado, limite.codigo], ['error', 'limite']);
});
