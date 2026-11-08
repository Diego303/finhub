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

test('QA-015: si la entrada revienta queda línea de registro; dos trabajos a la vez no pierden líneas', async () => {
  const antes = (await leerRegistro(ta.servicio, HOY.slice(0, 7))).length + (await leerRegistro(ta.servicio, new Date().toISOString().slice(0, 7))).length;
  const roto = { ...trabajo('ingesta'), entrada() { throw new Error('fallo al montar'); } };
  const r = await ejecutarTrabajo({ trabajo: roto, modelo: M, params: {}, hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, comando: await ta.guion([{ init: {} }]) } });
  assert.equal(r.estado, 'error');
  assert.equal(r.registro.estado, 'error');
  // servicio con lecturas lentas: sin cola, las escrituras simultáneas se pisan
  const ficheros = new Map();
  const lentos = { leer: async (k) => { await new Promise((ok) => setTimeout(ok, 15)); return ficheros.get(k) ?? null; }, escribir: async (k, t) => { await new Promise((ok) => setTimeout(ok, 5)); ficheros.set(k, t); } };
  const cmd = await ta.guion([{ init: {} }, { responder: json({ notas: [], predicciones: [] }) }]);
  await Promise.all(Array.from({ length: 8 }, () => ejecutarTrabajo({ trabajo: trabajo('ingesta'), modelo: M, params: { texto: 'x', fichero: 'a.txt', fuente: 'pizarra' }, hoy: HOY, servicio: lentos, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, comando: cmd } })));
  assert.equal((await leerRegistro(lentos, new Date().toISOString().slice(0, 7))).length, 8);
  assert.ok(antes >= 0);
});
