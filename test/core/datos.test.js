// Datos de mercado (§7.3): manifiesto y revisión de las filas que propone el trabajo «datos».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifiesto, revisarFilas } from '../../src/core/datos.js';

test('manifiesto: una entrada por id, con unidad, proxy y método', () => {
  const m = parseManifiesto(readFileSync(join(import.meta.dirname, '../../semilla/datos-manifiesto.md'), 'utf8'));
  assert.equal(new Set(m.map((x) => x.id)).size, m.length);
  assert.ok(m.length >= 15);
  const ipc = m.filter((x) => x.id.startsWith('ipc-'));
  assert.equal(ipc.length, 7);
  assert.ok(m.every((x) => ['indice', 'porcentaje', 'tipo-cambio'].includes(x.unidad) && x.metodo && x.proxy));
});

test('revisar filas: solo meses nuevos y completos, sin repetidos, saltos ni valores imposibles', () => {
  const tienes = [{ mes: '2026-07', valor: 100 }];
  const r = revisarFilas(tienes, [
    { mes: '2026-06', valor: 99 }, // ya lo tienes
    { mes: '2026-08', valor: 101 },
    { mes: '2026-08', valor: 999 }, // repetido
    { mes: '2026-09', valor: 160 }, // salto del 58 %
    { mes: '2026-10', valor: 103 },
    { mes: '2026-11', valor: 104 }, // mes en curso
    { mes: '2026-13', valor: 1 },
  ], { mesActual: '2026-11' });
  assert.deepEqual(r.filas, [{ mes: '2026-08', valor: 101 }, { mes: '2026-10', valor: 103 }]);
  assert.ok(r.avisos.some((a) => /repetido/.test(a)));
  assert.ok(r.avisos.some((a) => /40 %/.test(a)));
  assert.ok(r.avisos.some((a) => /aún no ha terminado/.test(a)));
  assert.ok(r.avisos.some((a) => /no válido/.test(a)));
  assert.ok(r.avisos.some((a) => /hueco entre 2026-08 y 2026-10/.test(a)));
  // un tipo (porcentaje) puede ser 0 o negativo y saltar
  assert.equal(revisarFilas([{ mes: '2026-07', valor: 0.5 }], [{ mes: '2026-08', valor: -0.2 }], { unidad: 'porcentaje', mesActual: '2026-11' }).filas.length, 1);
  assert.equal(revisarFilas([], [{ mes: '2026-08', valor: 0 }], { mesActual: '2026-11' }).filas.length, 0, 'un índice no puede ser 0');
});
