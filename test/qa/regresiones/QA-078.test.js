// QA-078 (medio): con Claude real, la historia aproximada se quedó en 2003-12: EURUSD=X de Yahoo no llega más atrás y el BCE no responde a WebFetch,
// así que la crisis de 2000 seguía sin datos. Y al ampliar la historia por segunda vez, la nota de la primera fuente aproximada se borraba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';

test('para convertir a euros antes de 2003-12 se dice de dónde sacar los tipos del BCE', () => {
  const S = { id: 'x', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: '2026-10', primero: '2003-12' };
  const e = trabajo('datos').entrada(modeloDe(ficherosEjemplo()), { series: [S], hoy: HOY, historia: true });
  assert.match(e.tarea, /api\.frankfurter\.dev\/v1\/2000-01-01\.\.2003-12-31\?to=USD/);
});

test('ampliar la historia dos veces conserva las dos notas de fuente', () => {
  const ruta = 'conocimiento/datos/series/serie-x.md';
  const fs = new Map([[ruta, '# Serie · x\nesquema: 1\nid: serie-x\nunidad: indice\nfrecuencia: mensual\nfuente: ETF https://a.example\nmetodo: m\nsintetica: no\nactualizado: 2026-11-01\n## Filas\n- 2009-10 | 100\n']]);
  const ctx = { rutas: [], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} };
  const una = (filas, fuente) => {
    const r = aplicarOp((x) => fs.get(x) ?? null, 'datos.aplicar', { series: [{ id: 'serie-x', unidad: 'indice', fuente, metodo: 'm', filas }] }, ctx);
    fs.set(ruta, r.escribir[ruta]);
  };
  una([{ mes: '2009-09', valor: 99, aproximacion: true }], 'Primera https://b.example');
  una([{ mes: '2009-08', valor: 98, aproximacion: true }], 'Segunda https://c.example');
  una([{ mes: '2009-11', valor: 101 }], 'ETF otra vez https://a.example');
  const f = /^fuente: (.*)$/m.exec(fs.get(ruta))[1];
  assert.match(f, /^ETF otra vez https:\/\/a\.example/);
  assert.match(f, /antes de 2009-10 \(aproximación\): Primera https:\/\/b\.example/);
  assert.match(f, /antes de 2009-09 \(aproximación\): Segunda https:\/\/c\.example/);
});
