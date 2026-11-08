// QA-044 (cifras): la «caída máxima» de la prueba de crisis se medía desde el valor inicial, no desde el pico: si la cartera
// subía antes de caer, enseñaba una caída menor que la real (de +20 % a −16 % sobre el inicio es una caída del 30 %).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruebaCrisis } from '../../../src/core/herramientas.js';
import { sumarMesesMes } from '../../../src/core/fechas.js';

const clases = [{ id: 'rv', nombre: 'RV', indice: 'i', grupo: 'rv' }];
const filas = [{ clase: 'rv', peso: 10000, id: 'a', nombre: 'A' }];
const correr = (niveles, hastaK = niveles.length - 1) => {
  const serie = niveles.map((valor, k) => ({ mes: sumarMesesMes('2020-01', k), valor }));
  return pruebaCrisis({ filas, clases, series: (id) => (id === 'i' ? serie : null), periodo: { desde: '2020-01', hasta: sumarMesesMes('2020-01', hastaK) }, valor: 100000 });
};

test('sube y luego cae: la caída es desde el pico', () => {
  const r = correr([100, 120, 84, 100, 130]);
  assert.equal(r.caidaPb, -3000);
  assert.equal(r.mesMinimo, '2020-03');
  assert.equal(r.valorMinimo, 84000);
});

test('si cae desde el principio, sigue dando lo mismo; sin caída, 0', () => {
  assert.equal(correr([100, 80, 50, 90, 110]).caidaPb, -5000);
  const s = correr([100, 110, 120]);
  assert.equal(s.caidaPb, 0);
  assert.equal(s.recuperaSin, 0);
});

test('la mayor caída gana a la primera, aunque el valor más bajo sea otro', () => {
  const r = correr([100, 90, 200, 120]);
  assert.equal(r.caidaPb, -4000);
  assert.equal(r.mesMinimo, '2020-04');
});
