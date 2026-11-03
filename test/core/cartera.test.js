// Cartera (§4.3) contra valores calculados a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costes, valorActivoEn, estadoCartera, impuestoVenta, exposicion, clasesVsObjetivo, flujosExternos, terMedio } from '../../src/core/cartera.js';
import { dietz, twr, xirr, comparativa, serieCompleta, indicePropio, rebase } from '../../src/core/rentabilidad.js';
import { repartirAportacion } from '../../src/core/reparto.js';
import { crearPrng } from '../../src/core/prng.js';
import { construirModelo } from '../../src/core/modelo.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const op = (id, fecha, tipo, activo, importe, extra = {}) => ({ id, fecha, tipo, activo: typeof activo === 'string' ? { activo } : activo, importe, ...extra });
const cerca = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) < tol, `${msg ?? ''} ${a} ≠ ${b}`);

test('Dietz modificado: R = (V1 − V0 − ΣF) / (V0 + Σ w·F)', () => {
  cerca(dietz(100000, 115000, [{ fecha: '2026-01-16', importe: 10000 }], '2026-01-01', '2026-01-31'), 5000 / 105000);
  cerca(dietz(100000, 110000, [], '2026-01-01', '2026-02-01'), 0.1);
  cerca(dietz(100000, 95000, [{ fecha: '2026-01-31', importe: -10000 }], '2026-01-01', '2026-01-31'), 5000 / 100000, 1e-9, 'una retirada al final pesa 0');
  assert.equal(dietz(0, 100, [], '2026-01-01', '2026-01-31'), null, 'sin capital: no se puede');
  assert.equal(dietz(1, 1, [], '2026-01-01', '2026-01-01'), null);
});

test('TWR encadenado y «aprox.» con pocas fotos o huecos', () => {
  const pts = [{ fecha: '2026-01-31', valor: 100000 }, { fecha: '2026-02-28', valor: 110000 }, { fecha: '2026-03-31', valor: 121000 }, { fecha: '2026-04-30', valor: 121000 }];
  const r = twr(pts, []);
  cerca(r.tasa, 0.21);
  assert.equal(r.aprox, false);
  assert.equal(r.periodos, 3);
  const conAportacion = twr([{ fecha: '2026-01-31', valor: 100000 }, { fecha: '2026-02-28', valor: 160000 }], [{ fecha: '2026-02-28', importe: 50000 }]);
  cerca(conAportacion.tasa, 0.1, 1e-9, 'aportar al final no es rentabilidad');
  assert.equal(conAportacion.aprox, true, 'solo 2 fotos');
  assert.equal(twr([{ fecha: '2026-01-31', valor: 1 }, { fecha: '2026-06-30', valor: 2 }, { fecha: '2026-07-31', valor: 2 }, { fecha: '2026-08-31', valor: 2 }], []).aprox, true, 'hueco de más de 2 meses');
  assert.equal(twr([{ fecha: '2026-01-31', valor: 1 }], []).tasa, null);
});

test('XIRR: el ejemplo de la documentación de Excel (37,336 %), sin solución y varias soluciones (§9.7)', () => {
  const excel = [['2008-01-01', -1000000], ['2008-03-01', 275000], ['2008-10-30', 425000], ['2009-02-15', 325000], ['2009-04-01', 275000]].map(([fecha, importe]) => ({ fecha, importe }));
  cerca(xirr(excel).tasa, 0.373362535, 1e-6);
  cerca(xirr([{ fecha: '2021-01-01', importe: -100000 }, { fecha: '2022-01-01', importe: 110000 }]).tasa, 0.1, 1e-7);
  assert.equal(xirr([{ fecha: '2021-01-01', importe: 100 }, { fecha: '2022-01-01', importe: 110 }]).tasa, null);
  const dos = xirr([{ fecha: '2020-01-01', importe: -10000 }, { fecha: '2020-12-31', importe: 23000 }, { fecha: '2021-12-31', importe: -13200 }]);
  assert.deepEqual([dos.tasa, dos.motivo], [null, 'varias soluciones posibles']);
  assert.equal(xirr([{ fecha: '2020-01-01', importe: -1 }]).tasa, null);
});

test('propiedad (§11): TWR = TIR si no hay flujos intermedios', () => {
  const prng = crearPrng('twr-tir');
  for (let i = 0; i < 100; i++) {
    const V0 = prng.entero(1000, 9999999);
    const V1 = Math.round(V0 * (0.4 + prng.siguiente() * 2));
    const t = twr([{ fecha: '2020-01-01', valor: V0 }, { fecha: '2022-01-01', valor: V1 }], []);
    const x = xirr([{ fecha: '2020-01-01', importe: -V0 }, { fecha: '2022-01-01', importe: V1 }]);
    cerca(t.anualizada, x.tasa, 1e-6);
  }
});

test('coste fiscal FIFO con participaciones, aproximado sin ellas, traspaso que conserva el coste (§4.3)', () => {
  const { porActivo } = costes([
    op('OP-1', '2026-01-02', 'aportacion', 'a', 100000, { participaciones: 10_000000 }),
    op('OP-2', '2026-02-02', 'aportacion', 'a', 120000, { participaciones: 10_000000 }),
    op('OP-3', '2026-03-02', 'venta', 'a', 200000, { participaciones: 15_000000 }),
  ]);
  const a = porActivo.get('a');
  assert.equal(a.coste, 60000, 'vendidas 15: sale 1.000 + 600 de coste');
  assert.equal(a.unidades, 5_000000);
  assert.equal(a.aproximado, false);
  const t = costes([op('OP-1', '2026-01-02', 'aportacion', 'x', 100000), op('OP-2', '2026-03-01', 'traspaso', { origen: 'x', destino: 'y' }, 75000)], { valorEstimado: () => 150000 });
  assert.deepEqual([t.porActivo.get('x').coste, t.porActivo.get('y').coste], [50000, 50000], 'traspasar la mitad del valor mueve la mitad del coste');
  assert.equal(t.porActivo.get('x').aproximado, true);
  const total = costes([op('OP-1', '2026-01-02', 'aportacion', 'x', 100000), op('OP-2', '2026-03-01', 'traspaso', { origen: 'x', destino: 'y' }, 999)]);
  assert.equal(total.porActivo.get('y').coste, 100000, 'sin valor previo: se traspasa todo el coste');
  assert.match(total.avisos[0], /se traspasa todo su coste/);
  const raro = costes([op('OP-9', '2026-01-02', 'venta', 'z', 500)]);
  assert.match(raro.avisos[0], /sin nada aportado antes/, 'venta antes de aportar: aviso, sin romper (§9.6)');
  const com = costes([op('OP-1', '2026-01-02', 'aportacion', 'w', 100000), op('OP-2', '2026-01-02', 'comision', 'w', -200), op('OP-3', '2026-01-03', 'ajuste', 'w', -1000)]);
  assert.equal(com.porActivo.get('w').coste, 100000 + 200 - 1000, 'la comisión suma al coste; el ajuste lo corrige');
});

test('valor de un activo: última foto + flujos posteriores («faltan valores»); sin foto → por lo aportado (§9.5)', () => {
  const fotos = [{ fecha: '2026-10-31', filas: [{ activo: 'a', valor: 150000 }] }];
  const ops = [op('OP-1', '2026-01-02', 'aportacion', 'a', 100000), op('OP-2', '2026-11-02', 'aportacion', 'a', 30000), op('OP-3', '2026-11-02', 'aportacion', 'b', 5000)];
  assert.deepEqual(valorActivoEn('a', '2026-11-03', fotos, ops), { valor: 180000, fechaFoto: '2026-10-31', posteriores: 1 });
  assert.equal(valorActivoEn('b', '2026-11-03', fotos, ops), null);
  const e = estadoCartera({ activos: [{ id: 'a', titulo: 'A', campos: { clase: 'rv' } }, { id: 'b', titulo: 'B', campos: {} }], operaciones: ops, fotos, hasta: '2026-11-03' });
  assert.equal(e.valor, 185000);
  assert.equal(e.coste, 135000);
  assert.equal(e.plusvalia, 50000);
  assert.equal(e.plusvaliaPb, Math.round((50000 / 135000) * 10000));
  assert.equal(e.faltanValores, true);
  assert.equal(e.porActivo.get('b').valorado, false);
  assert.ok(e.avisos.some((x) => /sin valorar/.test(x)));
  const usd = estadoCartera({ activos: [{ id: 'u', titulo: 'U', campos: { divisa: 'USD' } }], operaciones: [op('OP-1', '2026-01-02', 'aportacion', 'u', 100)], fotos: [], hasta: '2026-11-03' });
  assert.equal(usd.noConcluyente, true, 'divisa sin tipo de cambio: no concluyente (§9.20)');
  assert.equal(flujosExternos(ops).length, 3);
  assert.deepEqual(flujosExternos([op('OP-1', '2026-01-02', 'dividendo', 'a', 1240), op('OP-2', '2026-01-03', 'traspaso', { origen: 'a', destino: 'b' }, 5)]), [{ fecha: '2026-01-02', importe: -1240, activo: 'a' }]);
});

test('impuesto si vendieras hoy: tramos progresivos sobre la plusvalía positiva', () => {
  const tramos = [{ desde: 0, hasta: 600000, pb: 1900 }, { desde: 600000, hasta: 5000000, pb: 2100 }, { desde: 5000000, hasta: 20000000, pb: 2300 }, { desde: 20000000, hasta: null, pb: 2700 }];
  assert.equal(impuestoVenta(1000000, tramos), 114000 + 84000, '10.000 €: 6.000 × 19 % + 4.000 × 21 %');
  assert.equal(impuestoVenta(500000, tramos), 95000);
  assert.equal(impuestoVenta(-5000, tramos), 0);
  assert.equal(impuestoVenta(30000000, tramos), 114000 + 924000 + 3450000 + 2700000);
});

test('reparto de la aportación (§4.3): el ejemplo de la maqueta, mínimos y propiedades', () => {
  const pos = [['msci', 1648000, 5000], ['em', 302000, 1000], ['small', 261000, 800], ['ndx', 195000, 500], ['rf', 284000, 1000], ['plan', 247000, 700], ['cash', 250000, 1000]].map(([id, valor, pesoPb]) => ({ id, valor, pesoPb }));
  const r = Object.fromEntries(repartirAportacion({ activos: pos, aportacion: 60000 }).map((x) => [x.id, x.importe]));
  assert.deepEqual([r.em, r.rf, r.cash, r.msci], [10000, 18000, 32000, 0], 'como la maqueta: 100 · 180 · 320');
  const conMinimo = repartirAportacion({ activos: [{ id: 'a', valor: 0, pesoPb: 9000 }, { id: 'b', valor: 0, pesoPb: 1000, minimo: 15000 }], aportacion: 60000 });
  assert.deepEqual(conMinimo.map((x) => x.importe), [60000, 0], 'b no llega a su mínimo: todo para a');
  const enObjetivo = repartirAportacion({ activos: [{ id: 'a', valor: 70000, pesoPb: 7000 }, { id: 'b', valor: 30000, pesoPb: 3000 }], aportacion: 10000 });
  assert.deepEqual(enObjetivo.map((x) => x.importe), [7000, 3000], 'todo en objetivo: por pesos');
  const prng = crearPrng('reparto');
  for (let i = 0; i < 500; i++) {
    const activos = Array.from({ length: prng.entero(1, 8) }, (_, k) => ({ id: `a${k}`, valor: prng.entero(0, 5000000), pesoPb: prng.entero(0, 5000), minimo: prng.siguiente() < 0.2 ? prng.entero(1000, 20000) : undefined }));
    const aportacion = prng.entero(1, 500000);
    const res = repartirAportacion({ activos, aportacion, redondeo: prng.elegir([1, 100, 1000, 5000]) });
    assert.equal(res.reduce((a, x) => a + x.importe, 0), aportacion, 'Σ = aportación');
    assert.ok(res.every((x) => x.importe >= 0), 'nunca negativo');
  }
});

test('exposición estimada y clases frente a objetivo', () => {
  const activos = [
    { id: 'mw', titulo: 'MW', campos: { clase: 'rv', exposicion: { fecha: '2026-09', dimensiones: { region: [{ nombre: 'EE. UU.', pb: 7000 }, { nombre: 'Europa', pb: 3000 }] } } } },
    { id: 'rf', titulo: 'RF', campos: { clase: 'renta-fija', exposicion: { fecha: '2026-06', dimensiones: { region: [{ nombre: 'Europa', pb: 10000 }] } } } },
    { id: 'cash', titulo: 'Efectivo', campos: { clase: 'efectivo' } },
  ];
  const porActivo = new Map([['mw', { id: 'mw', valor: 100000, clase: 'rv', ter: 12 }], ['rf', { id: 'rf', valor: 50000, clase: 'renta-fija', ter: 10 }], ['cash', { id: 'cash', valor: 50000, clase: 'efectivo' }]]);
  const e = exposicion(porActivo, activos, 'region');
  assert.deepEqual(e.filas.map((f) => [f.nombre, f.valor, f.pb]), [['Europa', 80000, 4000], ['EE. UU.', 70000, 3500], ['Sin desglose', 50000, 2500]]);
  assert.deepEqual(e.fechas, { mw: '2026-09', rf: '2026-06' });
  const c = clasesVsObjetivo(porActivo, [{ activo: 'mw', peso: 6000 }, { activo: 'rf', peso: 3000 }, { activo: 'cash', peso: 1000 }], [{ id: 'rv', nombre: 'RV' }], { umbralPb: 100 });
  assert.deepEqual(c.map((x) => [x.clase, x.actualPb, x.objetivoPb, x.aviso]), [['rv', 5000, 6000, true], ['renta-fija', 2500, 3000, true], ['efectivo', 2500, 1000, true]]);
  assert.equal(c[0].nombre, 'RV');
  cerca(terMedio(porActivo), (12 * 100000 + 10 * 50000) / 200000);
});

test('comparativa con tus mismas aportaciones, huecos interpolados (§9.8) e índice propio', () => {
  const serie = serieCompleta([{ mes: '2026-01', valor: 100 }, { mes: '2026-03', valor: 200 }]);
  assert.deepEqual(serie.get('2026-02'), { valor: 150, interpolado: true });
  const c = comparativa(serie, [{ fecha: '2026-01-02', importe: 10000 }, { fecha: '2026-02-02', importe: 15000 }], { hasta: '2026-03-31' });
  assert.equal(c.valor, 20000 + 20000, '100 u. a 100 + 100 u. a 150 → 200 u. × 200');
  assert.equal(c.interpolados, 1);
  const conInicial = comparativa(serie, [], { inicial: { fecha: '2026-01-31', valor: 50000 }, hasta: '2026-03-15' });
  assert.equal(conInicial.valor, 100000);
  const fuera = comparativa(serie, [{ fecha: '2025-12-02', importe: 100 }], { hasta: '2026-03-31' });
  assert.deepEqual(fuera.fuera, ['2025-12'], 'sin dato ese mes: se excluye y se avisa');
  const meses = ['2026-01', '2026-02', '2026-03'];
  const sube = new Map([['2026-01', { valor: 100 }], ['2026-02', { valor: 110 }], ['2026-03', { valor: 121 }]]);
  const ip = indicePropio([{ peso: 5000, serie: sube }, { peso: 5000, serie: null }], meses);
  cerca(ip.get('2026-03'), 100 * 1.05 * 1.05, 1e-9);
  assert.deepEqual(rebase(sube, meses).map((x) => Math.round(x)), [100, 110, 121]);
});

test('ejemplo: la cartera de octubre cuadra con la foto y con el cierre del mes', () => {
  const f = {};
  for (const [r, t] of generar()) if (r.endsWith('.md')) f[r] = { texto: t, version: 'v' };
  const m = construirModelo(f);
  const e = estadoCartera({ activos: m.activos, operaciones: m.operaciones, fotos: m.fotos, hasta: '2026-10-31' });
  assert.equal(e.valor, m.mes('2026-10').cierre.cartera);
  assert.equal(e.faltanValores, false);
  const nov = estadoCartera({ activos: m.activos, operaciones: m.operaciones, fotos: m.fotos, hasta: '2026-11-03' });
  assert.equal(nov.valor - e.valor, 60000, 'la aportación del 2 nov se suma a la foto de octubre');
  assert.equal(nov.faltanValores, true);
  assert.ok(!nov.porActivo.has('fondo-sp500'), 'el fondo traspasado y archivado no cuenta');
  assert.equal(nov.porActivo.get('msci-world').costeAproximado, true, 'recibió un traspaso: coste aproximado');
});
