// QA-014, QA-015, QA-016, QA-019 · Registro completo y sin perder líneas; parámetros que monta el servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { ejecutarTrabajo } from '../../../src/claude/motor.js';
import { leerRegistro } from '../../../src/claude/registro.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { taller, ficherosEjemplo, modeloDe, json, HOY } from '../ayuda-claude.js';

let ta;
const fs_ = ficherosEjemplo();
const M = modeloDe(fs_);
before(async () => (ta = await taller('registro')));
after(() => ta.limpiar());
const serv = () => new ServicioClaude({ env: process.env, almacen: { textos: () => [...fs_].map(([ruta, texto]) => ({ ruta, texto, legible: true, version: 'v' })) } });

test('QA-019: el servidor valida lo que manda el navegador (pulso sin fecha, temas raros, sin pregunta)', () => {
  const s = serv();
  for (const p of [{}, { fecha: 'ayer' }, { fecha: '2026-02-30' }, { fecha: '2999-01-01' }, { fecha: HOY.replace(/.*/, '2020-01-01'), temas: 'x' }, { fecha: '2020-01-01', temas: [1, {}] }]) {
    assert.throws(() => s.parametros('pulso', p, M), (e) => e.estado === 400, JSON.stringify(p));
  }
  assert.throws(() => s.parametros('rex-web', {}, M), (e) => e.estado === 400);
  assert.throws(() => s.parametros('rex-web', { pregunta: { a: 1 } }, M), (e) => e.estado === 400);
  assert.deepEqual(Object.keys(s.parametros('rex-web', { pregunta: 'hola', fuentes: ['mias'], cualquierCosa: 1 }, M)).sort(), ['pregunta', 'temas'], 'solo lo que el trabajo admite');
  const t = trabajo('pulso');
  assert.ok(t.comprobar({ notas: [{ fecha: HOY, efectos: {} }] }, { params: {}, modelo: M }).length > 0, 'sin fecha pedida, la regla no se da por cumplida');
});
