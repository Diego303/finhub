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

test('QA-003: sin evento init la ejecución NO es válida, aunque el proceso acabe bien y rápido', async () => {
  const r = await correr('ingesta', [{ responder: VALIDO }]);
  assert.equal(r.estado, 'error');
  assert.equal(r.codigo, 'sin_init');
  // y el motor no entrega propuesta
  const m = modeloDe(ficherosEjemplo());
  const t = await ejecutarTrabajo({ trabajo: trabajo('ingesta'), modelo: m, params: { texto: 'x', fichero: 'a.txt', fuente: 'pizarra' }, hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, comando: await ta.guion([{ responder: VALIDO }]), timeoutMs: 4000 } });
  assert.equal(t.estado, 'error');
  assert.equal(t.json, undefined);
});
