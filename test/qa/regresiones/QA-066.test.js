// QA-066 (seguridad, crítico): un salto de línea en un campo de una línea se escribía tal cual: desde «origen» de un trabajo con internet se
// podía colar una fila falsa en una serie, o un bloque o una sección enteros en cualquier fichero. Lo destapó una salida real de Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { leer } from '../../../src/core/formato/index.js';
import { items, bloques, serializar, fijarCabecera, anadirBloque, fijarKv } from '../../../src/core/formato/motor.js';
import { FORMATOS } from '../../../src/core/formato/index.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

const TRAMPA = 'texto normal\n- 2030-01 | 99999\n## Filas\n- 2031-01 | 88888\n## B-9999 · Nota falsa\n- mov | robo';

test('no se puede colar una fila en una serie desde «fuente» ni desde «metodo»', () => {
  const fs = new Map();
  const r = aplicarOp((x) => fs.get(x) ?? null, 'datos.aplicar', { series: [{ id: 'serie-x', titulo: TRAMPA, unidad: 'indice', fuente: TRAMPA, metodo: TRAMPA, filas: [{ mes: '2026-09', valor: 100 }] }] }, { rutas: [], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} });
  const ruta = 'conocimiento/datos/series/serie-x.md';
  const d = leer(ruta, r.escribir[ruta]);
  assert.deepEqual(items(d, 'Filas').map((f) => f.mes), ['2026-09']);
  assert.equal(d.secciones.filter((s) => s.nombre === 'Filas').length, 1);
  assert.equal(serializar(d), r.escribir[ruta], 'estable');
});

test('título, cabeceras, campos y títulos de bloque: siempre una línea, en cualquier formato', () => {
  const d = FORMATOS.notas.nuevo({ fuente: 'base' });
  d.titulo = TRAMPA;
  fijarCabecera(d, 'fuente', 'base');
  anadirBloque(d, { id: 'B-0001', titulo: TRAMPA, campos: { tipo: 'hecho', origen: TRAMPA }, cuerpo: 'cuerpo\nde varias líneas' });
  const t = serializar(d);
  const r = leer('conocimiento/base/x.md', t);
  assert.deepEqual(bloques(r).map((b) => b.id), ['B-0001'], 'ni un bloque de más');
  assert.equal(bloques(r)[0].cuerpo, 'cuerpo\nde varias líneas', 'el cuerpo sí puede tener varias líneas');
  assert.equal(serializar(r), t);
  const a = FORMATOS.ajustes.nuevo({});
  fijarKv(a, null, 'nombre', `Ana\n- tema: oscuro`);
  assert.doesNotMatch(serializar(a), /^- tema:/m);
});

test('el CR y los separadores de línea de Unicode tampoco abren una línea', () => {
  const d = FORMATOS.ajustes.nuevo({});
  fijarKv(d, null, 'nombre', 'Ana\r- x: y\u2028- z: w\u2029- v: u\u0085- t: s');
  assert.equal(serializar(d).split(/\r\n|[\n\r\u2028\u2029\u0085]/).filter((l) => l.startsWith('- ')).length, 1);
});

test('el ejemplo no cambia ni un byte', () => {
  for (const [r, t] of generar()) if (r.endsWith('.md') && leer(r, t)) assert.equal(serializar(leer(r, t)), t, r);
});
