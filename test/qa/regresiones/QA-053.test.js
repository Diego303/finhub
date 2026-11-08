// QA-053 (cifras): con la caída ya medida desde el pico (QA-044), «meses en recuperar» seguía midiendo la vuelta al valor inicial:
// si la cartera subía y luego caía sin bajar del inicio, decía 0 meses tras una caída del 25 %.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruebaCrisis } from '../../../src/core/herramientas.js';
import { sumarMesesMes } from '../../../src/core/fechas.js';

const clases = [{ id: 'rv', nombre: 'RV', indice: 'i', grupo: 'rv' }];
const filas = [{ clase: 'rv', peso: 10000, id: 'a', nombre: 'A' }];
const correr = (niveles, hastaK, aportacion = 0) => {
  const serie = niveles.map((valor, k) => ({ mes: sumarMesesMes('2020-01', k), valor }));
  return pruebaCrisis({ filas, clases, series: (id) => (id === 'i' ? serie : null), periodo: { desde: '2020-01', hasta: sumarMesesMes('2020-01', hastaK) }, valor: 100000, aportacion });
};

test('se recupera al volver al pico de antes de la caída', () => {
  const r = correr([100, 160, 120, 140, 159, 161, 170], 2);
  assert.equal(r.caidaPb, -2500);
  assert.equal(r.recuperaSin, 5, 'el 161 ya supera el pico de 160');
});

test('cayendo desde el principio, sigue siendo volver al inicio; si no se recupera, null; sin caída, 0', () => {
  assert.equal(correr([100, 50, 80, 100, 110], 1).recuperaSin, 3);
  assert.equal(correr([100, 50, 60], 1).recuperaSin, null);
  assert.equal(correr([100, 110, 120], 2).recuperaSin, 0);
});

test('aportando se recupera antes o a la vez', () => {
  const r = correr([100, 75, 50, 60, 70, 80, 90, 100, 110], 2, 10000);
  assert.equal(r.recuperaSin, 7);
  assert.ok(r.recuperaCon !== null && r.recuperaCon <= r.recuperaSin);
});
