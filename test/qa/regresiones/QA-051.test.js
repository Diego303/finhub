// QA-051 (cifras): cambiar la naturaleza de un grupo aplicándola a lo anotado, o borrarlo, cambia los totales de meses cerrados
// sin dejar rastro: el mes no quedaba marcado «editado tras cierre». Renombrar una etiqueta no cambia ninguna cifra: no marca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { leer } from '../../../src/core/formato/index.js';
import { valores } from '../../../src/core/formato/motor.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

function mundo() {
  const fs = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
  const op = (n, a) => {
    const r = aplicarOp((x) => fs.get(x) ?? null, n, a, { ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng: crearPrng(9), hoy: '2026-11-03', rutas: [...fs.keys()] });
    for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
  };
  return { fs, op };
}
const marca = (m, r = 'mes/2026-10.md') => valores(leer(r, m.fs.get(r)), 'Cierre').editado_tras_cierre === true;

test('aplicar la naturaleza a lo anotado marca los meses cerrados afectados; no aplicarla, no', () => {
  const a = mundo();
  assert.equal(marca(a), false);
  a.op('grupo.cambiarNaturaleza', { id: 'ocio', naturaleza: 'inversion', aplicarAMovimientos: true });
  assert.equal(marca(a), true);
  const b = mundo();
  b.op('grupo.cambiarNaturaleza', { id: 'ocio', naturaleza: 'inversion', aplicarAMovimientos: false });
  assert.equal(marca(b), false, 'lo anotado conserva su naturaleza: las cifras no cambian');
});

test('borrar un grupo marca los meses cerrados con movimientos suyos, con o sin destino', () => {
  for (const destino of ['comida', null]) {
    const m = mundo();
    m.op('grupo.borrar', { id: 'ocio', destino });
    assert.equal(marca(m), true, String(destino));
  }
});

test('renombrar una etiqueta no marca nada', () => {
  const m = mundo();
  m.op('etiqueta.renombrar', { de: 'fijo', a: 'fijos' });
  assert.equal(marca(m), false);
});
