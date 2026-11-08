// QA-003 a QA-006 · La guardia no se puede saltar: sin init no hay ejecución válida, un init malformado aborta,
// el ruido en el stream no tira el servidor y un tool_use prohibido se ve también en el stream parcial.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { ejecutar } from '../../../src/claude/runner.js';
import { revisarInit } from '../../../src/claude/guardia.js';
import { ejecutarTrabajo } from '../../../src/claude/motor.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { taller, ficherosEjemplo, modeloDe, json, HOY } from '../ayuda-claude.js';

let ta;
before(async () => (ta = await taller('guardia')));
after(() => ta.limpiar());
const VALIDO = json({ notas: [], predicciones: [] });
const correr = async (id, pasos, extra = {}) => ejecutar(trabajo(id), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion(pasos), initMs: 3000, timeoutMs: 4000, ...extra });

test('QA-005: líneas raras en el stream (null, números, content que no es lista) no tiran el proceso', async () => {
  const r = await correr('ingesta', [{ init: {} }, { linea: 'null' }, { linea: '123' }, { linea: '"texto"' }, { linea: '[]' }, { linea: 'esto no es json' }, { emitir: { type: 'assistant', message: { content: 5 } } }, { emitir: { type: 'assistant', message: { content: [null, 7, { type: 'tool_use' }] } } }, { emitir: { type: 'assistant', message: null } }, { emitir: { type: 'stream_event', event: null } }, { emitir: { type: 'rate_limit_event' } }, { emitir: { type: 'system', subtype: 'status' } }, { stderr: 'ruido en stderr' }, { responder: VALIDO }]);
  assert.equal(r.codigo, 'guardia', 'un tool_use sin nombre no está permitido');
  const ok = await correr('ingesta', [{ init: {} }, { linea: 'null' }, { linea: '123' }, { linea: '"texto"' }, { linea: 'esto no es json' }, { emitir: { type: 'assistant', message: { content: 5 } } }, { emitir: { type: 'stream_event', event: null } }, { responder: VALIDO }]);
  assert.equal(ok.estado, 'ok');
  assert.match(ok.texto, /```json/);
});
