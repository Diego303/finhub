import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../src/core/formato/servicio.js';

test('config.json: ida y vuelta, tolerante y con errores claros', () => {
  const t = S.serializarConfig({ carpeta: '/mnt/d/GoogleDrive/FINANZAS', recientes: ['/mnt/d/FINANZAS'] });
  assert.deepEqual(S.parsearConfig(t).valor, { esquema: 1, carpeta: '/mnt/d/GoogleDrive/FINANZAS', recientes: ['/mnt/d/FINANZAS'] });
  assert.equal(S.serializarConfig(S.parsearConfig(t).valor), t);
  assert.match(S.parsearConfig('{roto').error, /JSON no válido/);
  assert.equal(S.parsearConfig('[]').ok, false);
  assert.equal(S.parsearConfig('{"carpeta":3}').ok, false);
  const viejo = S.parsearConfig('﻿{"carpeta":"/x","recientes":[1,"/y"]}');
  assert.deepEqual(viejo.valor.recientes, ['/y']);
  assert.ok(viejo.avisos.length);
});

test('candado: campos obligatorios', () => {
  const c = { equipo: 'SOBREMESA', pid: 123, inicio: '2026-11-03T18:02:00Z', latido: '2026-11-03T18:05:00Z', version: '0.0.0' };
  assert.deepEqual(S.parsearCandado(S.serializarCandado(c)).valor, c);
  assert.match(S.parsearCandado('{"equipo":"X","inicio":"a","latido":"b"}').error, /pid/);
});

test('JSONL: las líneas malas se apartan sin perder las buenas; el registro no guarda el prompt', () => {
  const buena = { runId: 'r1', trabajo: 'pulso', inicio: '2026-11-03T08:02:00', estado: 'ok' };
  const t = [JSON.stringify(buena), '{roto', JSON.stringify({ ...buena, estado: 'raro' }), JSON.stringify({ ...buena, prompt: 'mis datos' }), ''].join('\n');
  const { filas, malas } = S.parsearJsonl(t, S.validarRegistro);
  assert.deepEqual(filas, [buena]);
  assert.deepEqual(malas.map((m) => m.linea), [2, 3, 4]);
  assert.match(malas[2].error, /no puede contener el texto de entrada/);
  assert.equal(S.validarPapelera({ id: 'p1', ruta: 'metas.md', borrado: '2026-11-03T10:00', expira: '2026-12-03' }), null);
  assert.ok(S.validarPapelera({ id: 'p1', ruta: 'x', borrado: 'ayer', expira: '2026-12-03' }));
});
