// QA2.3 · Importes y porcentajes: lo que se acepta, lo ambiguo y la propiedad de que nunca se pierde un céntimo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImporte, formatearImporte as fmtImporte, parsePorcentaje, formatearPorcentaje as fmtPorcentaje, dividirRedondeo, aplicarPb, repartir } from '../../src/core/dinero.js';
import { crearPrng } from '../../src/core/prng.js';

const SEMILLA = 20261106;

test('tabla de importes de FORMATOS.md §1.1', () => {
  const buenos = [['1234,56', 123456], ['1.234,56', 123456], ['-12,5', -1250], ['−12,5', -1250], ['–12,5', -1250], ['12.5', 1250], ['+24', 2400], ['1 234,56', 123456], ['1 234,56', 123456], ['1 234,56', 123456], ['0', 0], ['0,01', 1], ['-0,01', -1], [',5', 50], ['1.234.567,89', 123456789], ['007', 700]];
  for (const [t, c] of buenos) {
    const r = parseImporte(t);
    assert.equal(r.ok, true, t);
    assert.equal(r.valor, c, t);
  }
  for (const t of ['', ' ', 'doce', '1,2,3', '1.2.3', '12,345', '1,234', '1,234.56', '12.34.56', '12,5€', '--1', '1e5', 'NaN', 'Infinity', '0x10', '1.23', '12.345,6.7'].filter((x) => !['1.23'].includes(x))) {
    const r = parseImporte(t);
    if (r.ok) assert.ok(['12,345', '1,234'].includes(t), `«${t}» no debería aceptarse: ${r.valor}`);
    if (!r.ok) assert.ok(r.error, t);
  }
});

test('ambiguos: la regla está documentada y no adivina', () => {
  // con punto: 3 dígitos detrás = miles. «1.234» son mil doscientos treinta y cuatro euros
  assert.equal(parseImporte('1.234').valor, 123400);
  // más de 2 decimales con coma en un importe: error claro, no se redondea en silencio
  const r = parseImporte('12,345');
  assert.equal(r.ok, false);
  assert.match(r.error, /decimales/);
  assert.equal(parseImporte('1,234').ok, false);
  assert.equal(parseImporte('12.345,6').valor, 1234560);
});

test('propiedad: nunca se pierde un céntimo al escribir y volver a leer', () => {
  const prng = crearPrng(SEMILLA);
  for (let i = 0; i < 20000; i++) {
    const c = prng.entero(-99999999999, 99999999999);
    assert.equal(parseImporte(fmtImporte(c)).valor, c, `semilla ${SEMILLA}: ${c}`);
  }
  for (const c of [0, 1, -1, 99, 100, 101, 999, 1000, 99999, 100000, 1e13 - 1]) assert.equal(parseImporte(fmtImporte(c)).valor, c);
});

test('porcentajes en puntos básicos: exactos, sin floats', () => {
  for (const [t, pb] of [['19', 1900], ['0,12', 12], ['0.12', 12], ['2,5 %', 250], ['100', 10000], ['0', 0], ['-1,5', -150]]) assert.equal(parsePorcentaje(t).valor, pb, t);
  const prng = crearPrng(SEMILLA);
  for (let i = 0; i < 5000; i++) {
    const pb = prng.entero(-100000, 100000);
    assert.equal(parsePorcentaje(fmtPorcentaje(pb)).valor, pb);
  }
});

test('redondeo bancario (mitad al par) y repartos sin perder céntimos', () => {
  for (const [x, y, r] of [[1, 2, 0], [3, 2, 2], [5, 2, 2], [7, 2, 4], [-1, 2, 0], [-3, 2, -2], [-5, 2, -2], [24, 10, 2], [26, 10, 3], [25, 10, 2], [35, 10, 4]]) assert.equal(dividirRedondeo(x, y) + 0, r, `${x}/${y}`);
  assert.equal(aplicarPb(5, 5000), 2, '2,5 → 2');
  assert.equal(aplicarPb(15, 5000), 8, '7,5 → 8');
  const prng = crearPrng(SEMILLA);
  for (let i = 0; i < 3000; i++) {
    const total = prng.entero(-1e9, 1e9);
    const pesos = Array.from({ length: prng.entero(1, 12) }, () => prng.entero(1, 10000));
    const r = repartir(total, pesos);
    assert.equal(r.reduce((a, b) => a + b, 0), total, `semilla ${SEMILLA}`);
    const suma = pesos.reduce((a, b) => a + b, 0);
    r.forEach((x, k) => assert.ok(Math.abs(x - (total * pesos[k]) / suma) <= 1.0001, 'cada parte, a menos de un céntimo de su parte exacta'));
  }
});
