import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPrng, hashTexto } from '../../src/core/prng.js';

test('misma semilla → misma secuencia (determinismo, regla 7)', () => {
  const a = crearPrng(42);
  const b = crearPrng(42);
  for (let i = 0; i < 1000; i++) assert.equal(a.siguiente(), b.siguiente());
  const x = crearPrng('proyeccion');
  const y = crearPrng('proyeccion');
  assert.deepEqual(Array.from({ length: 50 }, () => x.normal()), Array.from({ length: 50 }, () => y.normal()));
});

test('semillas distintas → secuencias distintas; valores en [0,1)', () => {
  const a = crearPrng(1);
  const b = crearPrng(2);
  let iguales = 0;
  for (let i = 0; i < 1000; i++) {
    const va = a.siguiente();
    assert.ok(va >= 0 && va < 1);
    if (va === b.siguiente()) iguales++;
  }
  assert.ok(iguales < 3);
  assert.equal(hashTexto('a'), hashTexto('a'));
  assert.notEqual(hashTexto('a'), hashTexto('b'));
});

test('normal(0,1): media ≈ 0 y desviación ≈ 1; entero y barajar', () => {
  const p = crearPrng('normal');
  const xs = Array.from({ length: 20000 }, () => p.normal());
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  assert.ok(Math.abs(m) < 0.03, `media ${m}`);
  assert.ok(Math.abs(sd - 1) < 0.03, `desviación ${sd}`);
  for (let i = 0; i < 1000; i++) {
    const n = p.entero(3, 5);
    assert.ok(n >= 3 && n <= 5 && Number.isInteger(n));
  }
  const lista = [1, 2, 3, 4, 5];
  const b = p.barajar(lista);
  assert.deepEqual([...b].sort(), lista);
  assert.deepEqual(lista, [1, 2, 3, 4, 5], 'no toca la original');
});
