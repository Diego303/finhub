// QA-075 (alto, decidido por ti): con ETF de 2009 en adelante, la prueba de crisis decía «no hay series con datos» en 2000 y 2008. El plan (§7.3) y el
// manifiesto piden filas anteriores marcadas «aproximación» (índice de precio más dividendos), el formato ya las admitía, pero el trabajo «datos» no podía
// marcarlas ni añadir meses ANTERIORES al primero que tienes: solo posteriores al último.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar } from '../../../src/claude/validar.js';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { revisarFilas } from '../../../src/core/datos.js';
import { pruebaCrisis } from '../../../src/core/herramientas.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { crearPrng } from '../../../src/core/prng.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';

const D = trabajo('datos');
const TIENES = [{ mes: '2009-10', valor: 100 }, { mes: '2009-11', valor: 100.6 }];

test('la salida de «datos» puede marcar filas como aproximación', () => {
  assert.deepEqual(validar({ series: [{ id: 'x', origen: 'https://x.example', filas: [{ mes: '2008-01', valor: 80, aproximacion: true }, { mes: '2026-10', valor: 1 }] }] }, D.esquema), []);
});

test('se aceptan meses anteriores al primero que tienes, con su marca, y con control de saltos hacia atrás', () => {
  const r = revisarFilas(TIENES, [{ mes: '2009-08', valor: 95, aproximacion: true }, { mes: '2009-09', valor: 97, aproximacion: true }, { mes: '2009-10', valor: 50 }, { mes: '2009-12', valor: 101 }], { id: 'msci-world-nr-eur', mesActual: '2026-11' });
  assert.deepEqual(r.filas, [{ mes: '2009-08', valor: 95, aproximacion: true }, { mes: '2009-09', valor: 97, aproximacion: true }, { mes: '2009-12', valor: 101 }]);
  const roto = revisarFilas(TIENES, [{ mes: '2009-08', valor: 30, aproximacion: true }, { mes: '2009-09', valor: 30, aproximacion: true }], { id: 'msci-world-nr-eur', mesActual: '2026-11' });
  assert.deepEqual(roto.filas, [], 'un salto de más del 40 % con tu primer mes no pasa, ni lo que sigue en esa escala');
});

test('al guardar, los meses anteriores van delante, marcados, y la fuente original se conserva', () => {
  const fs = new Map([['conocimiento/datos/series/serie-x.md', '# Serie · x\nesquema: 1\nid: serie-x\nunidad: indice\nfrecuencia: mensual\nfuente: ETF https://a.example\nmetodo: m\nsintetica: no\nactualizado: 2026-11-01\n## Filas\n- 2009-10 | 100\n- 2009-11 | 100,6\n']]);
  const r = aplicarOp((x) => fs.get(x) ?? null, 'datos.aplicar', { series: [{ id: 'serie-x', unidad: 'indice', fuente: 'Índice de precio https://b.example', metodo: 'm', filas: [{ mes: '2009-08', valor: 95, aproximacion: true }, { mes: '2009-09', valor: 97, aproximacion: true }, { mes: '2009-12', valor: 101 }] }] }, { rutas: [], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} });
  const t = r.escribir['conocimiento/datos/series/serie-x.md'];
  assert.match(t, /## Filas\n- 2009-08 \| 95 \| aproximación\n- 2009-09 \| 97 \| aproximación\n- 2009-10 \| 100\n- 2009-11 \| 100,6\n- 2009-12 \| 101\n/);
  assert.match(t, /fuente: ETF https:\/\/a\.example · antes de 2009-10 \(aproximación\): Índice de precio https:\/\/b\.example/);
});

test('el prompt dice dónde empieza tu serie y cómo añadir historia aproximada', () => {
  const e = D.entrada(modeloDe(ficherosEjemplo()), { series: [{ id: 'x', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: '2026-10', ultimoValor: 774.21, primero: '2009-10', primeroValor: 100 }], hoy: HOY });
  assert.match(e.bloques[0].contenido, /empieza en 2009-10 \(valor 100\)/);
  assert.match(e.tarea, /aproximacion/);
  const yo = { manifiesto: () => [{ id: 'x', que: 'x', unidad: 'indice', proxy: 'p', metodo: 'm' }] };
  const [s] = ServicioClaude.prototype.estadoDatos.call(yo, { series: [{ id: 'x' }], serie: () => TIENES });
  assert.deepEqual([s.primero, s.primeroValor], ['2009-10', 100]);
});

test('la prueba de crisis avisa si usa meses aproximados', () => {
  const filasSerie = [];
  for (let a = 2007; a <= 2012; a++) for (let m = 1; m <= 12; m++) filasSerie.push({ mes: `${a}-${String(m).padStart(2, '0')}`, valor: 100 + (a - 2007) * 3 - (a === 2008 ? 30 : 0), aproximacion: a < 2010 });
  const clases = [{ id: 'rv', nombre: 'RV', indice: 'x', grupo: 'rv' }];
  const r = pruebaCrisis({ filas: [{ nombre: 'Fondo', peso: 10000, clase: 'rv' }], clases, series: (id) => (id === 'x' ? filasSerie : null), periodo: { desde: '2007-10', hasta: '2009-03' }, valor: 100000 });
  assert.ok(!r.error, r.error);
  assert.ok(r.avisos.some((a) => /aproximad/.test(a)), JSON.stringify(r.avisos));
});
