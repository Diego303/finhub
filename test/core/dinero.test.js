import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/core/dinero.js';
import { crearPrng } from '../../src/core/prng.js';

const c = (s) => {
  const r = D.parseImporte(s);
  assert.ok(r.ok, `«${s}» debería leerse: ${r.error}`);
  return r.valor;
};
const malo = (s) => assert.equal(D.parseImporte(s).ok, false, `«${s}» no debería leerse`);

test('importes aceptados del plan §3.1 → céntimos', () => {
  assert.equal(c('1234,56'), 123456);
  assert.equal(c('1.234,56'), 123456);
  assert.equal(c('-12,5'), -1250);
  assert.equal(c('−12,5'), -1250); // U+2212
  assert.equal(c('12.5'), 1250);
  assert.equal(c('+24'), 2400);
  assert.equal(c('1 234,56'), 123456);
  assert.equal(c('1 234,56'), 123456);
  assert.equal(c(',5'), 50);
  assert.equal(c('0,00'), 0);
  assert.equal(Object.is(c('-0'), -0), false, 'nunca -0');
  assert.equal(c('1.234.567,89'), 123456789);
});

test('reglas de ambigüedad del punto (docs/FORMATOS.md §1.1)', () => {
  assert.equal(c('1.234'), 123400, 'punto con grupos de 3 = miles');
  assert.equal(c('12.50'), 1250, 'punto con 2 decimales = decimal');
  malo('1.2345');
  malo('12.34,5');
});

test('importes imposibles', () => {
  for (const s of ['', 'abc', '12,345', '1,2,3', '40 €', '--5', '1e3', '0x10', '12,', '٣']) malo(s);
  malo('100000000000,01'); // > 10^13 céntimos
});

test('formato canónico de fichero y de interfaz', () => {
  assert.equal(D.formatearImporte(-123456), '-1.234,56');
  assert.equal(D.formatearImporte(5), '0,05');
  assert.equal(D.formatearImporte(-5), '-0,05');
  assert.equal(D.formatearImporte(100000000), '1.000.000,00');
  assert.equal(D.formatearEuros(4832049), '48.320 €');
  assert.equal(D.formatearEuros(-123456, 2), '−1.234,56 €');
  assert.equal(D.formatearEuros(-40, 0), '0 €', 'redondea a 0 sin signo');
  assert.equal(D.formatearPct(1240), '+12,4 %');
  assert.equal(D.formatearPct(-170, 0), '−2 %');
});

test('porcentajes en puntos básicos y decimales escalados', () => {
  assert.deepEqual([D.parsePorcentaje('19').valor, D.parsePorcentaje('0,12').valor, D.parsePorcentaje('2,5 %').valor, D.parsePorcentaje('-1').valor], [1900, 12, 250, -100]);
  assert.equal(D.parsePorcentaje('0,125').ok, false, 'el pb no admite más de 2 decimales');
  assert.deepEqual([D.formatearPorcentaje(12), D.formatearPorcentaje(1900), D.formatearPorcentaje(250)], ['0,12', '19', '2,5']);
  assert.equal(D.parseDecimal('15,2310').valor, 15231000);
  assert.equal(D.formatearDecimal(15231000), '15,231');
  assert.equal(D.parseDecimal('1,1234567').ok, false);
});

test('redondeo bancario (mitad al par) y operaciones exactas', () => {
  assert.deepEqual([1, 3, 5, 7, -5].map((x) => D.dividirRedondeo(x, 2)), [0, 2, 2, 4, -2]);
  assert.equal(D.dividirRedondeo(10, 3), 3);
  assert.equal(D.aplicarPb(10001, 1900), 1900); // 1900,19 → 1900
  assert.equal(D.aplicarPb(250, 1900), 48); // 47,5 → 48 (par)
  assert.equal(D.aplicarPb(150, 1900), 28); // 28,5 → 28 (par)
  assert.equal(D.proporcionPb(1000, 2974), 3362);
  assert.equal(D.proporcionPb(1, 0), null, 'entradas 0 → no concluyente (§9.1)');
  assert.equal(D.redondearA(23456, 1000), 23000);
  assert.equal(D.redondearA(1500, 1000), 2000);
  assert.throws(() => D.dividirRedondeo(1, 0));
  assert.throws(() => D.sumar(0.5));
  assert.throws(() => D.sumar(Number.MAX_SAFE_INTEGER, 1));
});

test('repartir: la suma es exactamente el total y respeta pesos 0', () => {
  assert.deepEqual(D.repartir(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(D.repartir(-100, [1, 2]), [-33, -67]);
  assert.deepEqual(D.repartir(600, [0, 3, 0, 1]), [0, 450, 0, 150]);
  assert.deepEqual(D.repartir(60000, [0, 0]), [30000, 30000], 'todo a 0 → a partes iguales');
  assert.deepEqual(D.repartir(5, []), []);
  assert.throws(() => D.repartir(10, [1, -1]));
});

test('propiedad: formatear y volver a leer no pierde ni un céntimo', () => {
  const prng = crearPrng('dinero-ida-vuelta');
  for (let i = 0; i < 5000; i++) {
    const escala = 10 ** prng.entero(0, 12);
    const v = Math.round((prng.siguiente() * 2 - 1) * escala) || 0;
    assert.equal(D.parseImporte(D.formatearImporte(v)).valor, v);
    assert.equal(D.parsePorcentaje(D.formatearPorcentaje(v % 1e8)).valor, v % 1e8 || 0);
    assert.equal(D.parseDecimal(D.formatearDecimal(v)).valor, v);
  }
});

test('propiedad: repartir suma el total y cada parte se aleja < 1 de lo proporcional', () => {
  const prng = crearPrng('dinero-repartir');
  for (let i = 0; i < 2000; i++) {
    const total = prng.entero(-1e7, 1e7);
    const pesos = Array.from({ length: prng.entero(1, 9) }, () => prng.entero(0, 10000));
    const r = D.repartir(total, pesos);
    assert.equal(r.reduce((a, b) => a + b, 0), total);
    const sp = pesos.reduce((a, b) => a + b, 0);
    if (sp > 0) r.forEach((x, k) => assert.ok(Math.abs(x - (total * pesos[k]) / sp) < 1 + 1e-9));
  }
});

test('propiedad: sumar importes en cualquier orden da lo mismo (sin floats)', () => {
  const prng = crearPrng('dinero-suma');
  const lista = Array.from({ length: 3000 }, () => prng.entero(-500000, 500000));
  const a = D.sumar(lista);
  assert.equal(D.sumar(prng.barajar(lista)), a);
  assert.equal(D.sumar(...lista.slice(0, 1500), ...lista.slice(1500)), a);
});
