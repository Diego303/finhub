// QA-055 (cifras, 1–2 céntimos): el impuesto se redondeaba en cada tramo y luego se sumaba; se redondea una vez, al final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impuestoVenta } from '../../../src/core/cartera.js';

const T = [{ desde: 0, hasta: 150, pb: 1900 }, { desde: 150, hasta: 300, pb: 2100 }, { desde: 300, hasta: null, pb: 2300 }];

test('redondeo solo al final, mitad al par', () => {
  // 150 × 0,19 = 28,5 · 150 × 0,21 = 31,5 · 50 × 0,23 = 11,5 → 71,5 → 72 (al par); por tramos daría 28 + 32 + 12 = 72
  assert.equal(impuestoVenta(350, T), 72);
  // 25 × 0,19 = 4,75 · por tramos: una sola parte
  assert.equal(impuestoVenta(25, T), 5);
  // 151: 28,5 + 0,21 = 28,71 → 29; por tramos daría 28 + 0 = 28
  assert.equal(impuestoVenta(151, T), 29);
  assert.equal(impuestoVenta(0, T), 0);
  assert.equal(impuestoVenta(-5, T), 0);
});
