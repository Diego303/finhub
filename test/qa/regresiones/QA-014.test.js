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

test('QA-014: el registro lleva destino, uso, ids de entrada y código de error', async () => {
  const lento = { servicio: ta.servicio, sesiones: ta.sesiones(), hoy: HOY, modelo: M };
  const r = await ejecutarTrabajo({ ...lento, trabajo: trabajo('rex-web'), params: { pregunta: 'x', temas: [] }, runner: { sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { toolUse: 'WebSearch' }, { responder: json({ respuesta_md: 'ok', citas: [], cifras_usadas: [] }) }]) } });
  const l = r.registro;
  assert.equal(l.trabajo, 'rex-web');
  assert.ok(Number.isFinite(l.duracionMs));
  assert.deepEqual(l.herramientas.map((h) => h.nombre), ['WebSearch']);
  assert.deepEqual(l.destino, trabajo('rex-web').escribe);
  assert.equal(l.estado, 'ok');
  assert.deepEqual(l.uso, { input_tokens: 10, output_tokens: 20 });
  assert.ok(Array.isArray(l.ids) && l.ids.length > 0, 'ids de entrada');
  const c = await ejecutarTrabajo({ ...lento, trabajo: trabajo('ingesta'), params: { texto: 'x', fichero: 'a.txt', fuente: 'pizarra' }, runner: { sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { toolUse: 'Bash' }, { colgar: true }]), timeoutMs: 4000 } });
  assert.equal(c.registro.codigo, 'guardia');
  assert.deepEqual(c.registro.herramientas.map((h) => h.nombre), ['Bash']);
});
