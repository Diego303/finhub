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

test('QA-016: «conocimiento» no recibe borradores, análisis ni ideas tuyas (el servidor lo rechaza)', () => {
  const s = serv();
  for (const extra of [{ borrador: 'cartera/borradores/2026-10-20-equilibrada.md' }, { analisis: 'analisis/2026-11-03-escenarios-12m.md' }, { idea: 'subir el ETF al 10 %' }]) {
    assert.throws(() => s.parametros('conocimiento', { pregunta: 'x', ...extra }, M), (e) => e.estado === 400, JSON.stringify(extra));
  }
  // en privado sí
  const p = s.parametros('privado', { pregunta: 'x', borrador: 'cartera/borradores/2026-10-20-equilibrada.md' }, M);
  assert.equal(p.bloquesExtra[0].nivel, 'privado', 'el borrador es privado');
});
