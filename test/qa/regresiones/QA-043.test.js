// QA-043 (cifras): el color del presupuesto se decidía con el porcentaje ya redondeado a puntos básicos: 1.000,01 € de
// gasto sobre 100.000,00 € de… un gasto apenas por encima del 100 % (o del 90 %) salía del color de abajo. Rojo es > 100 %.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presupuestos } from '../../../src/core/mes.js';

const color = (gastado, p) => presupuestos({ porGrupo: new Map([['c', { consumo: gastado }]]) }, [{ id: 'c', nombre: 'C', naturaleza: 'consumo', presupuesto: p }])[0].color;

test('los límites son exactos, también con presupuestos grandes', () => {
  assert.equal(color(90000, 100000), 'verde');
  assert.equal(color(90001, 100000), 'ambar');
  assert.equal(color(100000, 100000), 'ambar');
  assert.equal(color(100001, 100000), 'rojo');
  assert.equal(color(9000000, 10000000), 'verde');
  assert.equal(color(9000001, 10000000), 'ambar');
  assert.equal(color(10000001, 10000000), 'rojo');
  assert.equal(color(1, 0), 'rojo');
  assert.equal(color(0, 0), 'verde');
});
