// Cálculos del mes (§4.1) y del patrimonio (§4.2), contra valores calculados a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/core/mes.js';
import * as P from '../../src/core/patrimonio.js';
import { construirModelo } from '../../src/core/modelo.js';
import { generar } from '../../scripts/generar-ejemplo.js';
import { crearPrng } from '../../src/core/prng.js';

const G = [
  { id: 'sueldo', nombre: 'Sueldo', naturaleza: 'ingreso' },
  { id: 'ocio', nombre: 'Ocio', naturaleza: 'consumo', presupuesto: 15000 },
  { id: 'comida', nombre: 'Comida', naturaleza: 'consumo', presupuesto: 30000 },
  { id: 'vivienda', nombre: 'Vivienda', naturaleza: 'consumo', presupuesto: 80000 },
  { id: 'cartera', nombre: 'Cartera', naturaleza: 'inversion' },
  { id: 'colchon', nombre: 'Colchón', naturaleza: 'ahorro' },
  { id: 'devoluciones', nombre: 'Devoluciones', naturaleza: 'traspaso' },
];
const mv = (importe, grupo, extra = {}) => ({ fecha: '2026-11-05', concepto: 'x', importe, grupo, ...extra });

test('totales: compensa resta del consumo de su grupo y no es un ingreso (manda el plan, §3.2)', () => {
  const t = M.totales([mv(285000, 'sueldo'), mv(-6500, 'ocio'), mv(-4800, 'ocio'), mv(2400, 'devoluciones', { compensa: 'ocio' }), mv(-60000, 'cartera'), mv(-20000, 'colchon'), mv(-50000, null, { a: 'remunerada', naturaleza: 'traspaso' }), mv(-1000, 'ocio', { naturaleza: 'inversion' })], G);
  assert.equal(t.entradas, 285000, 'el Bizum NO suma a Entradas');
  assert.equal(t.consumo, 6500 + 4800 - 2400);
  assert.equal(t.porGrupo.get('ocio').consumo, 8900);
  assert.equal(t.porGrupo.get('ocio').compensado, 2400);
  assert.equal(t.invertido, 61000, 'la naturaleza del movimiento manda sobre la del grupo');
  assert.equal(t.ahorrado, 20000);
  assert.equal(t.traspasos, -50000, 'traspaso entre cuentas: neutro');
  assert.equal(t.queda, 285000 - 8900 - 61000 - 20000);
  assert.equal(t.tasaPb, Math.round(((61000 + 20000) / 285000) * 10000));
});

test('tasa sin entradas: «no concluyente» (§9.1); sin grupo o con grupo borrado: aparte, sin perderse (§9.2)', () => {
  const t = M.totales([mv(-500, 'ocio'), mv(-300, null), mv(-200, 'grupo-borrado')], G);
  assert.equal(t.tasaPb, null);
  assert.equal(t.entradas, 0);
  assert.equal(t.sinGrupo.length, 2);
  assert.equal(t.consumo, 500);
  assert.equal(M.totales([], G).queda, 0);
});

test('presupuestos: el del mes sobrescribe al del grupo; semáforo ≤90 % verde, ≤100 % ámbar, >100 % rojo', () => {
  const t = M.totales([mv(-13500, 'ocio'), mv(-30001, 'comida'), mv(-72000, 'vivienda')], G);
  const p = Object.fromEntries(M.presupuestos(t, G, { ocio: 14000 }).map((x) => [x.grupo, x]));
  assert.deepEqual([p.ocio.presupuesto, p.ocio.pct, p.ocio.color, p.ocio.delMes], [14000, 9643, 'ambar', true]);
  assert.deepEqual([p.comida.pct, p.comida.color], [10000, 'ambar']);
  assert.equal(p.vivienda.color, 'verde');
  assert.equal(M.presupuestos(M.totales([mv(-30100, 'comida')], G), G).find((x) => x.grupo === 'comida').color, 'rojo');
  assert.equal(M.presupuestos(t, G, { cartera: 1 }).some((x) => x.grupo === 'cartera'), false, 'solo grupos de consumo');
});

test('media de los 6 últimos meses CERRADOS y variación', () => {
  const meses = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ mes: m, estado: m === '2026-09' ? 'reabierto' : m === '2026-11' ? 'abierto' : 'cerrado', totales: M.totales([mv(-10000 * (i + 1), 'ocio')], G) }));
  const med = M.mediaCerrados(meses, '2026-11');
  assert.deepEqual(med.meses, ['2026-10', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04'], 'salta el reabierto y el actual');
  assert.equal(med.consumo, Math.round((80000 + 60000 + 50000 + 40000 + 30000 + 20000) / 6));
  assert.equal(med.porGrupo.get('ocio'), med.consumo);
  assert.equal(M.variacionPb(110, 100), 1000);
  assert.equal(M.variacionPb(1, 0), null);
  assert.equal(M.mediaCerrados(meses, '2026-03'), null);
});

test('datos del Sankey y suma de meses', () => {
  const t = M.totales([mv(285000, 'sueldo'), mv(-6500, 'ocio'), mv(-60000, 'cartera'), mv(-20000, 'colchon'), mv(2400, 'devoluciones', { compensa: 'ocio' })], G);
  const s = M.datosSankey(t, G);
  assert.deepEqual(s.entradas, [{ nombre: 'Sueldo', valor: 285000 }]);
  assert.deepEqual(s.salidas.map((x) => [x.nombre, x.valor, x.tipo]), [['Ocio', 4100, 'consumo'], ['Cartera', 60000, 'inversion'], ['Colchón', 20000, 'ahorro']]);
  const año = M.sumarTotales([t, t]);
  assert.equal(año.entradas, 570000);
  assert.equal(año.porGrupo.get('ocio').consumo, 8200);
  assert.equal(año.tasaPb, t.tasaPb);
});

test('propiedad: queda = entradas − consumo − invertido − ahorrado, para cualquier mes', () => {
  const prng = crearPrng('totales');
  for (let i = 0; i < 300; i++) {
    const movs = Array.from({ length: prng.entero(0, 40) }, () => mv(prng.entero(-99999, 99999), prng.elegir([...G.map((g) => g.id), null]), prng.siguiente() < 0.1 ? { compensa: 'ocio' } : {}));
    const t = M.totales(movs, G);
    assert.equal(t.queda, t.entradas - t.consumo - t.invertido - t.ahorrado);
    const sumaGrupos = [...t.porGrupo.values()].reduce((a, v) => a + v.consumo, 0);
    assert.equal(sumaGrupos, t.consumo, 'el consumo por grupos suma el total');
  }
});

const C = [
  { id: 'corriente', nombre: 'C', tipo: 'corriente', saldo_inicial: { importe: 100000, fecha: '2026-01-01' } },
  { id: 'remunerada', nombre: 'R', tipo: 'ahorro', colchon: true, saldo_inicial: { importe: 300000, fecha: '2026-01-01' } },
  { id: 'tarjeta', nombre: 'T', tipo: 'deuda', saldo_inicial: { importe: 20000, fecha: '2026-01-01' } },
  { id: 'vieja', nombre: 'V', tipo: 'ahorro', archivada: true },
];

test('saldos: dos patas con «a:», sin cuenta → la corriente, deuda que resta, fechas anteriores al saldo inicial', () => {
  const movs = [
    { fecha: '2025-12-31', importe: -99999, cuenta: 'corriente' },
    { fecha: '2026-01-05', importe: -20000, cuenta: 'corriente', a: 'remunerada' },
    { fecha: '2026-01-06', importe: -3000 },
    { fecha: '2026-01-07', importe: -5000, cuenta: 'tarjeta' },
    { fecha: '2026-01-08', importe: -10000, cuenta: 'corriente', a: 'tarjeta' },
    { fecha: '2026-02-01', importe: -1, cuenta: 'corriente' },
    { fecha: '2026-01-09', importe: 5, cuenta: 'inexistente' },
  ];
  const s = P.saldos(C, movs, '2026-01-31');
  assert.deepEqual(s.porCuenta, { corriente: 100000 - 20000 - 3000 - 10000, remunerada: 320000, tarjeta: -20000 - 5000 + 10000, vieja: 0 });
  assert.deepEqual(s.desconocidas, ['inexistente']);
  assert.equal(P.cuentaPorDefecto(C), 'corriente');
  assert.equal(P.patrimonio(s.porCuenta, C, 50000), 67000 + 320000 - 15000 + 50000);
  assert.deepEqual(P.colchon(s.porCuenta, C, 150000), { total: 320000, meses: 320000 / 150000 });
  assert.equal(P.colchon(s.porCuenta, C, 0).meses, null);
});

test('valor de la cartera: última foto por activo hasta la fecha, sin los archivados', () => {
  const fotos = [{ fecha: '2026-01-31', filas: [{ activo: 'a', valor: 100 }, { activo: 'b', valor: 50 }] }, { fecha: '2026-02-28', filas: [{ activo: 'a', valor: 120 }] }, { fecha: '2026-03-31', filas: [{ activo: 'a', valor: 999 }] }];
  assert.deepEqual(P.valorCartera(fotos, '2026-02-28'), { valor: 170, activos: 2, valorado: true });
  assert.equal(P.valorCartera(fotos, '2026-02-28', { archivados: ['b'] }).valor, 120);
  assert.deepEqual(P.valorCartera(fotos, '2025-12-31'), { valor: 0, activos: 0, valorado: false });
});

test('la foto de cierre reproduce al céntimo los 11 cierres del ejemplo', () => {
  const f = {};
  for (const [r, t] of generar()) if (r.endsWith('.md')) f[r] = { texto: t, version: 'v' };
  const m = construirModelo(f);
  const archivados = m.activos.filter((a) => a.campos.archivado).map((a) => a.id);
  const todos = m.meses.flatMap((id) => m.mes(id).movimientos);
  let n = 0;
  for (const id of m.meses) {
    const x = m.mes(id);
    if (x.estado.estado !== 'cerrado') continue;
    const foto = P.fotoCierre({ cuentas: m.cuentas, movimientos: todos, fotos: m.fotos, hasta: x.periodo.hasta, archivados });
    assert.deepEqual(foto.saldos, x.cierre.saldos, id);
    assert.equal(foto.cartera, x.cierre.cartera, id);
    assert.equal(foto.patrimonio, x.cierre.patrimonio, id);
    n++;
  }
  assert.equal(n, 11);
});
