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

test('QA-006: un tool_use prohibido se detecta ya en el stream parcial, y uno anterior al init también', async () => {
  const parcial = await correr('ingesta', [{ init: {} }, { toolUse: 'Bash', enStream: true }, { colgar: true }]);
  assert.equal(parcial.codigo, 'guardia');
  assert.match(parcial.motivos.join(), /Bash/);
  assert.deepEqual(parcial.herramientas.map((h) => h.nombre), ['Bash'], 'queda registrado');
  const antes = await correr('ingesta', [{ toolUse: 'Write' }, { colgar: true }]);
  assert.equal(antes.codigo, 'guardia');
  const texto = await correr('privado', [{ deltas: 'hola antes del init' }, { colgar: true }], { initMs: 500 });
  assert.equal(texto.estado, 'error');
  for (const h of ['Read', 'Task', 'mcp__huddle__enviar', 'WebFetch']) assert.equal((await correr('privado', [{ init: {} }, { toolUse: h }, { colgar: true }])).codigo, 'guardia', h);
  assert.deepEqual(await fsp.readdir(ta.base), [], 'sin sandboxes');
});
