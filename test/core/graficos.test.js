import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalaLineal, lineas, sankey, treemap, rango, barras, extension } from '../../src/core/graficos/geometria.js';
import { crearPrng } from '../../src/core/prng.js';

test('escala lineal y extensión', () => {
  const e = escalaLineal([0, 10], [100, 0]);
  assert.deepEqual([e(0), e(5), e(10)], [100, 50, 0]);
  assert.equal(escalaLineal([3, 3], [0, 10])(3), 5, 'dominio nulo: centrado');
  assert.deepEqual(extension([[1, 5], [-2, NaN]]), [-2, 5]);
  assert.deepEqual(extension([[]]), [0, 1]);
});

test('líneas: puntos dentro del lienzo, rejilla de 3 y banda cerrada', () => {
  const g = lineas({ series: [{ valores: [100, 110, 105] }, { valores: [100, 90, 120] }], ancho: 440, alto: 150, banda: [[95, 95, 95], [125, 125, 125]] });
  for (const p of g.puntos.join(' ').split(' ')) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 440 && y >= 0 && y <= 150, p);
  }
  assert.equal(g.rejilla.length, 3);
  assert.deepEqual([g.min, g.max], [90, 125]);
  assert.equal(g.banda.split(' ').length, 6);
  assert.equal(g.ultimo[1].x, g.x(2));
  assert.equal(lineas({ series: [{ valores: [5] }], ancho: 100, alto: 50 }).puntos[0], '12,23', 'un solo punto no divide por cero (centrado)');
});

test('sankey: lo que entra = lo que sale (con «Queda»), sin solapes de etiquetas', () => {
  const g = sankey({ entradas: [{ nombre: 'Nómina', valor: 285000 }, { nombre: 'Extras', valor: 10000 }], salidas: [{ nombre: 'Vivienda', valor: 84230 }, { nombre: 'Cartera', valor: 60000 }, { nombre: 'Ocio', valor: 2000 }, { nombre: 'Comida', valor: 1500 }] });
  const queda = g.der.at(-1);
  assert.equal(queda.nombre, 'Queda');
  assert.equal(queda.valor, 295000 - 147730);
  const altoIzq = g.izq.reduce((a, s) => a + s.h, 0);
  const altoDer = g.der.reduce((a, s) => a + s.h, 0);
  assert.ok(Math.abs(altoIzq - altoDer) < 0.1, 'mismo grosor total a ambos lados');
  for (let i = 1; i < g.der.length; i++) assert.ok(g.der[i].etiquetaY - g.der[i - 1].etiquetaY >= 12 - 1e-9);
  assert.equal(g.enlaces.length, g.izq.length + g.der.length);
  const vacio = sankey({ entradas: [], salidas: [] });
  assert.deepEqual([vacio.izq, vacio.der], [[], []]);
});

test('treemap: las celdas cubren exactamente el área y no se solapan', () => {
  const prng = crearPrng('treemap');
  for (let k = 0; k < 50; k++) {
    const datos = Array.from({ length: prng.entero(1, 8) }, (_, i) => ({ nombre: `c${i}`, valor: prng.entero(1, 100) }));
    const c = treemap({ datos, ancho: 400, alto: 170 });
    const area = c.reduce((a, r) => a + r.w * r.h, 0);
    assert.ok(Math.abs(area - 400 * 170) < 400 * 170 * 1e-3, `área ${area}`);
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        const [a, b] = [c[i], c[j]];
        const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(!(sx > 0.05 && sy > 0.05), `sin solapes (más allá del redondeo): ${sx} × ${sy}`);
      }
  }
  assert.deepEqual(treemap({ datos: [{ nombre: 'x', valor: 0 }] }), [], 'los valores 0 no se dibujan');
});

test('rango y barras', () => {
  assert.deepEqual(rango({ desde: -1, hasta: 9 }), { x0: 75, x: 71.25, w: 37.5, signo: 'mixto' });
  assert.equal(rango({ desde: -17, hasta: -2 }).signo, 'negativo');
  assert.equal(rango({ desde: 10, hasta: 50 }).w, 37.5, 'se recorta al dominio');
  const b = barras({ valores: [10, -5, 20], ancho: 100, alto: 50 });
  assert.equal(b.length, 3);
  assert.ok(b[1].y >= b[0].y, 'la negativa empieza en la base');
  assert.equal(Math.round(b[2].h + b[1].h), 50, 'de −5 a 20 ocupa todo el alto');
});
