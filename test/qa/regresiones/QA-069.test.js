// QA-069 (cifras, medio): el mismo fallo de QA-063 en los rangos a 12 meses: con un histórico corto o sin 2000 y 2008, el «peor caso» salía suave y sin avisar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangos12m } from '../../../src/core/herramientas.js';

const hist = (desde, n) => {
  const meses = [];
  let [a, m] = desde.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; a++; }
  }
  return { meses, r: Float64Array.from(meses, () => 0.01) };
};

test('rangos con menos de 10 años: avisa de histórico corto', () => {
  assert.match(rangos12m(hist('2022-01', 58)).aviso, /histórico corto/);
});
test('rangos con más de 10 años pero sin 2000 ni 2008: avisa', () => {
  assert.match(rangos12m(hist('2009-10', 205)).aviso, /no incluye las crisis de 2000 y 2008/);
});
test('rangos con toda la historia: sin aviso', () => {
  assert.equal(rangos12m(hist('1999-01', 300)).aviso, null);
});
