// QA4 · Diferencial: los cálculos reales (src/core) frente a los oráculos independientes (oraculos.js, escritos solo desde
// el plan). ≥ 500 casos aleatorios por grupo, con semilla impresa, y las fronteras. Donde el plan admite dos lecturas
// (test/oraculos/README.md, «Dudas») el dominio se limita a lo que no depende de esa lectura; ver docs/QA-INFORME.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from './oraculos.js';
import { crearPrng } from '../../src/core/prng.js';
import { totales, presupuestos, mediaCerrados } from '../../src/core/mes.js';
import { saldos, patrimonio, colchon } from '../../src/core/patrimonio.js';
import { estadoCartera, impuestoVenta } from '../../src/core/cartera.js';
import { twr, xirr, comparativa, indicePropio, serieCompleta } from '../../src/core/rentabilidad.js';
import { repartirAportacion } from '../../src/core/reparto.js';
import { proyectarHistorico, proyectarManual, libertadFinanciera, percentil } from '../../src/core/proyeccion.js';
import { pruebaCrisis, rangos12m, interesCompuesto, costeOportunidad, cuotaMeta, comparadorFondos, radarSuscripciones } from '../../src/core/herramientas.js';
import { progresoMeta } from '../../src/core/metas.js';
import { fechaCobro, cobroEnMes } from '../../src/core/recurrentes.js';
import { periodoMes, mesFinanciero, diasEntre, sumarDias, sumarMeses, sumarMesesMes } from '../../src/core/fechas.js';
import { posturaFuente, jaccard, aciertoPorFuente, resolverMezcla } from '../../src/core/conocimiento.js';
import { simular, mapaEfectos } from '../../src/core/descubrimientos.js';
import { construirModelo } from '../../src/core/modelo.js';
import { leer } from '../../src/core/formato/index.js';
import { items } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const SEMILLA = Number(process.env.FINHUB_SEMILLA ?? 20261106);
const N = 600;
const prng = crearPrng(SEMILLA);
const e = (a, b) => prng.entero(a, b);
const azar = (l) => l[e(0, l.length - 1)];
const fecha = (a0 = 2020, a1 = 2028) => `${e(a0, a1)}-${String(e(1, 12)).padStart(2, '0')}-${String(e(1, 28)).padStart(2, '0')}`;
const sello = (i, extra = '') => `semilla ${SEMILLA}, caso ${i}${extra ? `: ${extra}` : ''}`;
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} frente a ${b} (±${tol})`);
const NAT = ['ingreso', 'consumo', 'inversion', 'ahorro', 'traspaso'];

test(`mes: entradas, consumo con compensaciones, invertido, ahorrado, traspasos, queda y tasa (${N} casos)`, () => {
  const lista = NAT.map((n, i) => ({ id: `g${i}`, nombre: `G${i}`, naturaleza: n }));
  const dic = Object.fromEntries(lista.map((g) => [g.id, { naturaleza: g.naturaleza }]));
  for (let i = 0; i < N; i++) {
    const movs = Array.from({ length: e(0, 30) }, () => {
      const g = azar(lista);
      const m = { fecha: '2026-11-03', concepto: 'x', importe: e(-500000, 500000) || 1, grupo: g.id };
      if (g.naturaleza === 'traspaso' && prng.siguiente() < 0.4) m.compensa = 'g1';
      return m;
    });
    const r = totales(movs, lista);
    const o = O.resumenMes(movs, dic);
    for (const k of ['entradas', 'consumo', 'invertido', 'ahorrado', 'traspasos', 'queda']) assert.equal(r[k], o[k], sello(i, k));
    if (r.entradas > 0) cerca(r.tasaPb, o.tasaAhorroPb, 0, sello(i, 'tasa'));
    if (r.entradas === 0) assert.equal(r.tasaPb, null, sello(i, 'entradas 0: no concluyente'));
  }
});

test('compensación mayor que el gasto; sin entradas no concluyente', () => {
  const g = [{ id: 'c', nombre: 'C', naturaleza: 'consumo' }, { id: 't', nombre: 'T', naturaleza: 'traspaso' }];
  const movs = [{ importe: -1000, grupo: 'c' }, { importe: 2500, grupo: 't', compensa: 'c' }];
  const r = totales(movs, g);
  const o = O.resumenMes(movs, { c: { naturaleza: 'consumo' }, t: { naturaleza: 'traspaso' } });
  assert.equal(r.consumo, -1500);
  assert.equal(r.consumo, o.consumo);
  assert.equal(r.tasaPb, null);
});

test('presupuesto: colores exactos en el 90 % y el 100 %, con y sin presupuesto del mes', () => {
  const G = (p) => [{ id: 'c', nombre: 'C', naturaleza: 'consumo', presupuesto: p }];
  const color = (gastado, p, delMes = {}) => presupuestos({ porGrupo: new Map([['c', { consumo: gastado }]]) }, G(p), delMes)[0].color;
  const T = [[8999, 10000], [9000, 10000], [9001, 10000], [9999, 10000], [10000, 10000], [10001, 10000], [0, 10000], [89999, 100000], [90000, 100000], [90001, 100000], [100000, 100000], [100001, 100000]];
  const NOMBRE = { verde: 'verde', ambar: 'ambar', rojo: 'rojo' };
  for (const [g, p] of T) assert.equal(color(g, p), NOMBRE[O.colorPresupuesto(g, p)], `${g}/${p}`);
  assert.equal(color(95, 100, { c: 100 }), 'ambar', 'el del mes manda');
  assert.equal(color(95, 90, { c: 100 }), 'ambar');
  assert.equal(O.presupuestoEfectivo(100, 200), 200);
  assert.equal(color(1000000, 1), 'rojo');
  for (let i = 0; i < N; i++) {
    const p = e(1, 1e7);
    const g = e(0, 2e7);
    assert.equal(color(g, p), O.colorPresupuesto(g, p), sello(i, `${g}/${p}`));
  }
});

test(`media de los últimos 6 cerrados por grupo y total, con redondeo bancario (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const meses = [];
    for (let k = 0; k < e(0, 12); k++) {
      const consumo = e(0, 300000);
      meses.push({ mes: sumarMesesMes('2026-01', k), estado: azar(['cerrado', 'cerrado', 'abierto', 'reabierto']), consumo, porG: new Map([['a', { consumo }]]) });
    }
    const ref = '2026-10';
    const r = mediaCerrados(meses.map((m) => ({ mes: m.mes, estado: m.estado, totales: { consumo: m.consumo, entradas: 0, invertido: 0, ahorrado: 0, porGrupo: m.porG } })), ref);
    const o = O.mediaUltimos6Cerrados(meses.map((m) => ({ mes: m.mes, estado: m.estado, consumoPorGrupo: { a: m.consumo } })), ref);
    if (o.total === null) assert.equal(r, null, sello(i));
    else {
      assert.equal(r.meses.length, o.mesesUsados.length ?? o.mesesUsados, sello(i));
      assert.equal(r.consumo, o.total, sello(i, 'total'));
      assert.equal(r.porGrupo.get('a'), o.porGrupo.a, sello(i, 'grupo'));
    }
  }
});

test(`saldos con dos patas y a:, ajustes y deuda; patrimonio; colchón (${N} casos)`, () => {
  const TIPOS = ['corriente', 'ahorro', 'inversion', 'efectivo', 'deuda'];
  for (let i = 0; i < N; i++) {
    const cuentas = Array.from({ length: e(1, 5) }, (_, k) => ({ id: `c${k}`, nombre: `C${k}`, tipo: azar(TIPOS), saldo_inicial: { importe: e(0, 9000000), fecha: '2000-01-01' }, colchon: prng.siguiente() < 0.3 }));
    const movs = Array.from({ length: e(0, 30) }, () => {
      const m = { fecha: fecha(), importe: e(-500000, 500000), cuenta: azar(cuentas).id };
      if (prng.siguiente() < 0.3) m.a = azar(cuentas).id;
      if (prng.siguiente() < 0.1) m.ajuste = true;
      return m;
    });
    const { porCuenta } = saldos(cuentas, movs);
    for (const c of cuentas) {
      const ini = c.tipo === 'deuda' ? -c.saldo_inicial.importe : c.saldo_inicial.importe;
      assert.equal(porCuenta[c.id], O.saldoCuenta(c.id, ini, movs), sello(i, c.id));
    }
    const cartera = e(0, 9000000);
    // la deuda ya resta en porCuenta; el oráculo espera el saldo con su signo
    const paraO = cuentas.map((c) => ({ id: c.id, tipo: c.tipo, saldo: porCuenta[c.id] }));
    const po = O.patrimonioNeto(paraO.map((c) => (c.tipo === 'deuda' ? { ...c, tipo: 'corriente' } : c)), [{ id: 'x', valor: cartera, aportadoNeto: 0 }]);
    assert.equal(patrimonio(porCuenta, cuentas, cartera), po.patrimonio, sello(i, 'patrimonio'));
    // conservar: un traspaso entre mis cuentas no cambia el total
    const suma = (x) => Object.values(x).reduce((a, b) => a + b, 0);
    const antes = suma(saldos(cuentas, movs).porCuenta);
    const con = saldos(cuentas, [...movs, { fecha: '2026-01-01', importe: -123, cuenta: cuentas[0].id, a: cuentas.at(-1).id }]).porCuenta;
    assert.equal(suma(con), antes, sello(i, 'el traspaso conserva'));
    const medio = e(0, 300000);
    const col = colchon(porCuenta, cuentas, medio);
    const oc = O.colchonMeses(col.total, medio);
    if (medio === 0) assert.equal(col.meses, null);
    else cerca(col.meses, oc.meses, 1e-9, sello(i, 'colchón'));
  }
});

const TRAMOS = O.TRAMOS_PLAN;
test(`impuesto: tramos 6.000/50.000/200.000/300.000 ±1 céntimo y ±1 euro, plusvalía negativa y ${N} aleatorios`, () => {
  const LIM = [600000, 5000000, 20000000, 30000000];
  for (const l of LIM) for (const d of [-100, -1, 0, 1, 100]) cerca(impuestoVenta(l + d, TRAMOS), O.impuestoEstimado(l + d), 1, `${l}${d}`);
  for (const p of [0, -1, -100000]) assert.equal(impuestoVenta(p, TRAMOS), 0);
  // cada euro de más en un tramo paga el tipo de ese tramo
  for (let k = 0; k < TRAMOS.length; k++) {
    const b = TRAMOS[k].desde + 100;
    cerca(impuestoVenta(b + 10000, TRAMOS) - impuestoVenta(b, TRAMOS), Math.round((10000 * TRAMOS[k].pb) / 10000), 1, `tramo ${k}`);
  }
  for (let i = 0; i < N; i++) {
    const p = e(-100000, 60000000);
    cerca(impuestoVenta(p, TRAMOS), O.impuestoEstimado(p), 2, sello(i, String(p)));
  }
});

test(`cartera con participaciones: FIFO y coste iguales; valor con la foto y los flujos posteriores (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const activos = ['a', 'b'];
    const ops = [];
    const uds = { a: 0, b: 0 };
    let d = '2024-01-05';
    for (let k = 0; k < e(1, 15); k++) {
      d = sumarDias(d, e(1, 40));
      const id = azar(activos);
      if (uds[id] > 0 && prng.siguiente() < 0.3) {
        const u = e(1, uds[id]);
        ops.push({ id: `OP-${k}`, fecha: d, tipo: 'venta', activo: { activo: id }, importe: e(1, 400000), participaciones: u });
        uds[id] -= u;
      } else {
        const u = e(1, 5e8);
        ops.push({ id: `OP-${k}`, fecha: d, tipo: 'aportacion', activo: { activo: id }, importe: e(100, 800000), participaciones: u });
        uds[id] += u;
      }
    }
    const fotos = prng.siguiente() < 0.5 ? [] : [{ fecha: sumarDias('2024-01-05', e(0, 300)), filas: activos.map((x) => ({ activo: x, valor: e(0, 5000000) })) }];
    const hasta = '2030-01-01'; // después de todo: la foto puede ser posterior a la última operación
    const r = estadoCartera({ activos: activos.map((x) => ({ id: x, titulo: x, campos: {} })), operaciones: ops, fotos, hasta });
    const o = O.resumenCartera({ operaciones: ops.map((x) => ({ fecha: x.fecha, tipo: x.tipo, activo: x.activo.activo, importe: x.importe, participaciones: x.participaciones })), fotos: fotos.map((f) => ({ fecha: f.fecha, valores: Object.fromEntries(f.filas.map((y) => [y.activo, y.valor])) })) });
    for (const id of activos) {
      const fr = r.porActivo.get(id);
      const fo = o.porActivo[id];
      if (!fo) continue;
      if (!fr) {
        assert.equal(fo.coste, 0, sello(i, `${id} sin posición`));
        continue;
      }
      assert.equal(fr.coste, fo.coste, sello(i, `coste FIFO de ${id}`));
      assert.equal(fr.costeAproximado, false, sello(i));
      // valor: si hay foto, la misma cuenta (posición cerrada aparte)
      if (fotos.length && uds[id] > 0) assert.equal(fr.valor, fo.valor, sello(i, `valor de ${id}: ${JSON.stringify(fotos)} ${JSON.stringify(ops)}`));
    }
  }
});

test('ventas mayores que lo aportado; operaciones antes de la primera foto; traspasos que no cambian el total; divisas', () => {
  const A = (id, campos = {}) => ({ id, titulo: id, campos });
  const op = (fecha, tipo, a, importe, extra = {}) => ({ id: `OP-${fecha}`, fecha, tipo, activo: { activo: a }, importe, ...extra });
  const venta = estadoCartera({ activos: [A('a')], operaciones: [op('2026-01-01', 'aportacion', 'a', 1000), op('2026-02-01', 'venta', 'a', 5000)], fotos: [], hasta: '2026-03-01' });
  assert.equal(venta.porActivo.get('a')?.coste ?? 0, 0, 'el coste no baja de 0');
  const antes = estadoCartera({ activos: [A('a')], operaciones: [op('2026-01-01', 'aportacion', 'a', 1000)], fotos: [{ fecha: '2026-02-01', filas: [{ activo: 'a', valor: 1200 }] }], hasta: '2026-03-01' });
  assert.equal(antes.porActivo.get('a').valor, 1200, 'lo anterior a la foto ya está en la foto');
  const sinFoto = estadoCartera({ activos: [A('a')], operaciones: [op('2026-01-01', 'aportacion', 'a', 1000)], fotos: [], hasta: '2026-03-01' });
  assert.equal(sinFoto.porActivo.get('a').valor, 1000, 'sin foto, lo aportado');
  assert.equal(sinFoto.porActivo.get('a').valorado, false);
  const tr = { id: 'T', fecha: '2026-02-01', tipo: 'traspaso', activo: { origen: 'a', destino: 'b' }, importe: 500 };
  const con = estadoCartera({ activos: [A('a'), A('b')], operaciones: [op('2026-01-01', 'aportacion', 'a', 1000), tr], fotos: [{ fecha: '2026-01-15', filas: [{ activo: 'a', valor: 1000 }] }], hasta: '2026-03-01' });
  assert.equal(con.coste, 1000, 'el traspaso no cambia el coste total');
  assert.equal(con.valor, 1000, 'ni el valor total');
  // USD sin tipo: no concluyente y aviso
  const usd = estadoCartera({ activos: [A('a', { divisa: 'USD' })], operaciones: [op('2026-01-01', 'aportacion', 'a', 1000)], fotos: [], hasta: '2026-03-01' });
  assert.equal(usd.noConcluyente, true);
  assert.match(usd.avisos.join(), /otra divisa sin tipo de cambio/);
});

test(`TWR: Dietz encadenado (${N} casos); «aprox.» con pocas fotos; sin flujos, TWR anualizado = TIR`, () => {
  for (let i = 0; i < N; i++) {
    const fotos = [];
    let d = '2024-01-31';
    for (let k = 0; k < e(2, 14); k++) {
      fotos.push({ fecha: d, valor: e(100000, 5000000) });
      d = sumarDias(d, e(20, 60));
    }
    const flujos = Array.from({ length: e(0, 8) }, () => ({ fecha: sumarDias(fotos[0].fecha, e(1, Math.max(1, diasEntre(fotos[0].fecha, fotos.at(-1).fecha)))), importe: e(-30000, 60000) }));
    const r = twr(fotos, flujos);
    const o = O.twrDietz(fotos, flujos);
    if (o.estado !== 'ok') continue; // capital medio ≤ 0: lectura distinta (duda 26)
    cerca(r.tasa, o.twr, 1e-9, sello(i, 'twr'));
    if (fotos.length <= 2) assert.equal(r.aprox, true, sello(i, 'aprox'));
  }
  const trece = Array.from({ length: 13 }, (_, k) => ({ fecha: `${sumarMesesMes('2025-01', k)}-28`, valor: 100000 + k * 1000 }));
  assert.equal(twr(trece, []).aprox, false, '13 fotos mensuales no son aprox.');
  assert.equal(twr(trece.slice(0, 2), []).aprox, true);
  for (let i = 0; i < 200; i++) {
    const v0 = e(1000, 1e7);
    const v1 = e(1000, 3e7);
    const dias = e(365, 4000);
    const t0 = '2020-01-01';
    const t1 = sumarDias(t0, dias);
    const a = twr([{ fecha: t0, valor: v0 }, { fecha: t1, valor: v1 }], []).anualizada;
    const b = xirr([{ fecha: t0, importe: -v0 }, { fecha: t1, importe: v1 }]);
    if (b.tasa !== null) cerca(a, b.tasa, 1e-6, sello(i, 'TWR = TIR'));
  }
});

test(`XIRR: mismo resultado que el oráculo cuando ambos concluyen (${N} casos); fronteras`, () => {
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const flujos = Array.from({ length: e(2, 12) }, () => ({ fecha: fecha(2020, 2026), importe: e(-500000, -100) })).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    flujos.push({ fecha: '2027-01-01', importe: e(100, 8000000) });
    const r = xirr(flujos);
    const o = O.xirr(flujos);
    if (o.estado === 'ok' && r.tasa !== null) {
      cerca(r.tasa, o.tasa, 1e-5, sello(i, JSON.stringify(flujos).slice(0, 200)));
      ok++;
      const vna = flujos.reduce((a, f) => a + f.importe / (1 + r.tasa) ** (diasEntre(flujos[0].fecha, f.fecha) / 365), 0);
      const escala = flujos.reduce((a, f) => a + Math.abs(f.importe), 0);
      if (r.tasa > -0.5) assert.ok(Math.abs(vna) < 1e-5 * escala, sello(i, `VNA ${vna} sobre ${escala}`));
    }
    if (r.tasa === null && o.estado === 'ok') assert.ok(o.tasa > 10 || o.tasa < -0.99, sello(i, `no concluyente con ${o.tasa}`));
  }
  assert.ok(ok > N * 0.8, `${ok} comparados`);
  const NC = [[{ fecha: '2026-01-01', importe: -100 }, { fecha: '2026-06-01', importe: -100 }], [{ fecha: '2026-01-01', importe: 100 }, { fecha: '2026-06-01', importe: 100 }], [{ fecha: '2026-01-01', importe: -100 }], [], [{ fecha: '2026-01-01', importe: 0 }, { fecha: '2026-06-01', importe: 0 }]];
  for (const f of NC) {
    assert.equal(xirr(f).tasa, null, JSON.stringify(f));
    assert.notEqual(O.xirr(f).estado, 'ok', JSON.stringify(f));
  }
  // todos el mismo día: no hay tiempo → no concluyente, nunca un número
  assert.equal(xirr([{ fecha: '2026-01-01', importe: -100 }, { fecha: '2026-01-01', importe: 110 }]).tasa, null);
  // un año exacto
  cerca(xirr([{ fecha: '2025-01-01', importe: -100 }, { fecha: '2026-01-01', importe: 110 }]).tasa, 0.1, 1e-6, '10 %');
  // varias soluciones (cambios de signo repetidos): no concluyente en los dos
  const varias = [{ fecha: '2020-01-01', importe: -100 }, { fecha: '2021-01-01', importe: 230 }, { fecha: '2022-01-01', importe: -132 }];
  assert.equal(xirr(varias).tasa, null, 'dos raíces');
  assert.notEqual(O.xirr(varias).estado, 'ok');
  // un día: una rentabilidad modesta anualizada se puede calcular o se dice que no; nunca NaN
  const undia = xirr([{ fecha: '2026-01-01', importe: -100 }, { fecha: '2026-01-02', importe: 101 }]);
  assert.ok(undia.tasa === null || Number.isFinite(undia.tasa));
});

test(`comparativa con tus mismas aportaciones (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const filas = Array.from({ length: 24 }, (_, k) => ({ mes: sumarMesesMes('2024-01', k), valor: e(50, 500) * 1e6 }));
    const serie = Object.fromEntries(filas.map((f) => [f.mes, f.valor]));
    const flujos = Array.from({ length: e(1, 8) }, () => ({ fecha: `${sumarMesesMes('2024-01', e(0, 23))}-15`, importe: e(1000, 500000) }));
    const r = comparativa(serieCompleta(filas), flujos, { hasta: '2025-12-31' });
    const o = O.comparativaMismasAportaciones(flujos, serie);
    assert.equal(o.estado, 'ok');
    cerca(r.valor, o.valorFinal, 2, sello(i));
  }
});

test(`reparto: Σ = aportación, sin negativos, redondeo, mínimos y objetivos raros (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const n = e(1, 6);
    const pesos = O.dividirMitadPar ? Array.from({ length: n }, () => e(1, 100)) : [];
    const suma = pesos.reduce((a, b) => a + b, 0);
    let resto = 10000;
    const pb = pesos.map((p, k) => {
      if (k === n - 1) return resto;
      const x = Math.floor((p / suma) * 10000);
      resto -= x;
      return x;
    });
    const raro = prng.siguiente() < 0.1;
    const activos = pb.map((p, k) => ({ id: `a${k}`, valor: e(0, 5000000), pesoPb: raro ? e(0, 8000) : p, objetivoPb: raro ? 0 : p, ...(prng.siguiente() < 0.2 ? { minimo: e(1, 50000) } : {}) }));
    const aportacion = azar([e(1, 999), e(1000, 500000), 100000, 1000, 500]);
    const r = repartirAportacion({ activos, aportacion, redondeo: 1000 });
    assert.equal(r.reduce((a, x) => a + x.importe, 0), aportacion, sello(i, 'Σ = aportación'));
    assert.ok(r.every((x) => x.importe >= 0), sello(i, 'sin negativos'));
    const noMultiplos = r.filter((x) => x.importe % 1000 !== 0);
    assert.ok(noMultiplos.length <= 1, sello(i, `redondeo: ${JSON.stringify(r)}`));
    if (!raro) {
      const v = O.comprobarReparto(Object.fromEntries(r.map((x) => [x.id, x.importe])), { aportacion, activos: activos.map((a) => ({ ...a })), redondeo: 1000 });
      assert.deepEqual(v.filter((t) => !/mínimo/.test(t)), [], sello(i));
    }
  }
  // fronteras: aportación menor que el redondeo, todo en objetivo, objetivos que no suman 100, sin activos
  assert.equal(repartirAportacion({ activos: [{ id: 'a', valor: 0, pesoPb: 5000 }, { id: 'b', valor: 100000, pesoPb: 5000 }], aportacion: 500 }).reduce((s, x) => s + x.importe, 0), 500);
  const objetivo = repartirAportacion({ activos: [{ id: 'a', valor: 100000, pesoPb: 5000 }, { id: 'b', valor: 100000, pesoPb: 5000 }], aportacion: 100000 });
  assert.deepEqual(objetivo.map((x) => x.importe), [50000, 50000], 'en objetivo: por pesos');
  assert.deepEqual(repartirAportacion({ activos: [], aportacion: 100 }), []);
  assert.deepEqual(repartirAportacion({ activos: [{ id: 'a', valor: 1, pesoPb: 10000 }], aportacion: 0 }).map((x) => x.importe), [0]);
  const conMin = repartirAportacion({ activos: [{ id: 'a', valor: 0, pesoPb: 9000 }, { id: 'b', valor: 0, pesoPb: 1000, minimo: 50000 }], aportacion: 100000 });
  assert.deepEqual(conMin.map((x) => x.importe), [100000, 0], 'quien no llega a su mínimo recibe 0 y va al resto');
});

test('proyección: propiedades con semilla, casos sin azar exactos y 40 años en < 300 ms', () => {
  const MESES = (n) => Array.from({ length: n }, (_, k) => sumarMesesMes('2000-01', k));
  const hist = (r, ipc = null) => ({ meses: MESES(120), r: Array(120).fill(r), ...(ipc !== null ? { ipc: Array(120).fill(ipc) } : {}) });
  const base = { inicial: 1000000, aportacion: 50000, anios: 10, caminos: 200 };
  // r = 0: V + A·12·año
  const cero = proyectarHistorico({ ...base, historico: hist(0), real: false });
  for (let a = 0; a <= 10; a++) assert.equal(cero.p50[a], 1000000 + 50000 * 12 * a);
  // serie plana sin aportar: V (1+r)^(12·año)
  const plana = proyectarHistorico({ ...base, aportacion: 0, historico: hist(0.005), real: false });
  for (let a = 0; a <= 10; a++) cerca(plana.p50[a], 1000000 * 1.005 ** (12 * a), 1, `año ${a}`);
  // rentabilidad = IPC en real: no cambia
  const real = proyectarHistorico({ ...base, aportacion: 0, historico: hist(0.002, 0.002), real: true });
  for (let a = 0; a <= 10; a++) assert.equal(real.p50[a], 1000000);
  // valor 0 y aportación 0
  const nada = proyectarHistorico({ ...base, inicial: 0, aportacion: 0, historico: { meses: MESES(60), r: Array.from({ length: 60 }, (_, k) => (k % 2 ? 0.03 : -0.02)) }, real: false });
  assert.ok(nada.p50.every((x) => x === 0));
  // propiedades con histórico aleatorio
  const p = crearPrng(SEMILLA + 3);
  for (let i = 0; i < 50; i++) {
    const largo = 60 + p.entero(0, 300);
    const historico = { meses: MESES(largo), r: Array.from({ length: largo }, () => p.normal(0.005, 0.04)) };
    const s = { inicial: p.entero(0, 1e7), aportacion: p.entero(0, 2e5), anios: p.entero(1, 25), historico, real: false, caminos: 200 };
    const r1 = proyectarHistorico(s);
    const r2 = proyectarHistorico(s);
    assert.deepEqual(r1.p50, r2.p50, 'misma semilla, mismo resultado');
    const v = O.comprobarProyeccion({ estado: 'ok', anos: r1.anios.slice(1), p10: r1.p10.slice(1), p50: r1.p50.slice(1), p90: r1.p90.slice(1) }, { anos: s.anios });
    assert.deepEqual(v, [], sello(i));
  }
  // manual y nominal
  const man = proyectarManual({ inicial: 1000000, aportacion: 0, anios: 5, componentes: [{ peso: 10000, grupo: 'rv', nombre: 'x' }], supuestos: { rv: { mu: 0.05, sigma: 0 } }, real: true, caminos: 100 });
  cerca(man.p50[5], 1000000 * 1.05 ** 5, 5, 'manual sin volatilidad: exacto');
  const nom = proyectarManual({ inicial: 1000000, aportacion: 0, anios: 5, componentes: [{ peso: 10000, grupo: 'rv', nombre: 'x' }], supuestos: { rv: { mu: 0.05, sigma: 0 } }, real: false, inflacion: 0.02, caminos: 100 });
  assert.ok(nom.p50[5] > man.p50[5], 'nominal > real');
  // rendimiento: aportación 0, 40 años, 2.000 caminos
  const h = { meses: MESES(360), r: Array.from({ length: 360 }, () => p.normal(0.005, 0.04)) };
  const t0 = performance.now();
  const g = proyectarHistorico({ inicial: 1e7, aportacion: 0, anios: 40, historico: h, real: false });
  assert.ok(performance.now() - t0 < 300, `${Math.round(performance.now() - t0)} ms`);
  assert.equal(g.p50.length, 41);
  // libertad: alcanzada o «más de N años»
  assert.equal(libertadFinanciera({ anios: [0, 1, 2], p50: [10, 20, 30] }, 1, 20).anio, 1);
  const lejos = libertadFinanciera({ anios: [0, 1, 2], p50: [10, 20, 30] }, 100, 25);
  assert.deepEqual([lejos.anio, lejos.masDe], [null, 2]);
  assert.equal(O.libertadFinanciera({ consumo12m: 100, multiplicador: 25, p50PorAno: [10, 20] }).ano, null);
  assert.equal(percentil([1, 2, 3, 4], 0.5), O.percentil([1, 2, 3, 4], 50));
});

test(`escenarios: p5/p25/p75/p95 y mínimo con la serie histórica (${N / 6} casos)`, () => {
  for (let i = 0; i < N / 6; i++) {
    const niv = [100];
    const r = [];
    for (let k = 0; k < e(24, 180); k++) {
      const x = prng.normal(0.006, 0.04);
      r.push(x);
      niv.push(niv.at(-1) * (1 + x));
    }
    const a = rangos12m({ r, meses: Array.from({ length: r.length }, (_, k) => sumarMesesMes('2000-01', k)) });
    const o = O.rangos12m(niv);
    const pb = (x) => Math.round(x * 10000);
    assert.deepEqual([...a.pesimista, ...a.base, ...a.optimista], [...o.pesimista, ...o.base, ...o.optimista].map(pb), sello(i));
    assert.equal(a.peor, pb(o.peor), sello(i));
  }
  assert.ok(rangos12m({ r: Array(23).fill(0), meses: [] }).error, 'menos de 2 años: no concluyente');
});

const series = (obj) => (id) => obj[id] ?? null;
const clases = [{ id: 'rv', nombre: 'RV', indice: 'i-rv', grupo: 'rv' }, { id: 'rf', nombre: 'RF', indice: 'i-rf', grupo: 'rf', parecida: 'rv' }];

test(`crisis: caída máxima, valor en el mínimo, meses hasta recuperar y aproximación (${N / 6} casos)`, () => {
  for (let i = 0; i < N / 6; i++) {
    const meses = Array.from({ length: 36 }, (_, k) => sumarMesesMes('2008-01', k));
    const nivel = (mu, sg) => {
      let v = 100;
      return meses.map((mes) => {
        const f = { mes, valor: v };
        v *= 1 + prng.normal(mu, sg);
        return f;
      });
    };
    const rv = nivel(-0.005, 0.05);
    const rf = nivel(0.001, 0.01);
    const pesoRv = e(0, 10000);
    const hasta = meses[e(6, 24)];
    const filas = [{ clase: 'rv', peso: pesoRv, id: 'a', nombre: 'A' }, { clase: 'rf', peso: 10000 - pesoRv, id: 'b', nombre: 'B' }].filter((x) => x.peso > 0);
    const r = pruebaCrisis({ filas, clases, series: series({ 'i-rv': rv, 'i-rf': rf }), periodo: { desde: meses[0], hasta }, valor: 1000000 });
    const toObj = (l) => Object.fromEntries(l.map((f) => [f.mes, f.valor]));
    const hastaFin = meses.at(-1);
    const o = O.pruebaCrisis({ pesos: Object.fromEntries(filas.map((f) => [f.clase, f.peso])), series: { rv: toObj(rv), rf: toObj(rf) }, desde: meses[0], hasta, valorInicial: 1000000 });
    assert.equal(o.estado, 'ok');
    cerca(r.caidaPb / 10000, o.caidaMaxima, 0.0001, sello(i, 'caída máxima'));
    assert.ok(hastaFin);
    assert.equal(r.mesMinimo, o.mesMinimo, sello(i, 'mes del mínimo'));
    cerca(r.valorMinimo, o.valorEnMinimo, 1, sello(i, 'valor en el mínimo'));
  }
  // recuperar con y sin aportar; una clase sin datos se aproxima con la parecida, indicado
  const m = Array.from({ length: 13 }, (_, k) => sumarMesesMes('2020-01', k));
  const cae = m.map((mes, k) => ({ mes, valor: k <= 2 ? 100 - 25 * k : 50 + 10 * (k - 2) }));
  const f = [{ clase: 'rv', peso: 10000, id: 'a', nombre: 'A' }];
  const a = pruebaCrisis({ filas: f, clases, series: series({ 'i-rv': cae }), periodo: { desde: m[0], hasta: m[2] }, valor: 100000, aportacion: 10000 });
  assert.equal(a.caidaPb, -5000);
  assert.equal(a.recuperaSin, 7, 'vuelve a 100 en el mes 7');
  assert.ok(a.recuperaCon !== null && a.recuperaCon <= a.recuperaSin, 'aportando no se tarda más');
  const ap = pruebaCrisis({ filas: [{ clase: 'rf', peso: 10000, id: 'b', nombre: 'B' }], clases, series: series({ 'i-rv': cae }), periodo: { desde: m[0], hasta: m[2] }, valor: 100000 });
  assert.deepEqual(ap.aproximaciones.map((x) => x.con), ['RV'], 'clase sin datos → la parecida, indicada');
});

test(`herramientas: interés compuesto, oportunidad y días de libertad, cuota, comparador, radar (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const inicial = e(0, 1e7);
    const mensual = e(0, 2e5);
    const anos = e(1, 40);
    const rPb = azar([0, e(1, 1200), e(-200, -1)]);
    const tasa = rPb / 10000;
    const a = interesCompuesto({ capital: inicial, mensual, anios: anos, tasa });
    const o = O.interesCompuesto({ inicial, mensual, rPb, anos });
    cerca(a.total, o.valorFinal, 1, sello(i, 'compuesto'));
    assert.equal(a.pones, o.aportado, sello(i));
    const consumo = e(0, 5e6);
    const c = costeOportunidad({ importe: inicial, anios: anos, tasa, consumoAnual: consumo });
    const co = O.costeOportunidad({ importe: inicial, periodicidad: 'puntual', rPb, anos, consumoAnual: consumo });
    cerca(c.puntual, co.valorFuturo, 1, sello(i, 'oportunidad'));
    if (consumo > 0) cerca(c.diasPuntual, co.diasLibertad, 1, sello(i, 'días de libertad'));
    else assert.equal(c.diasPuntual, null);
    const cm = costeOportunidad({ mensual, anios: anos, tasa });
    const com = O.costeOportunidad({ importe: mensual, periodicidad: 'mensual', rPb, anos, consumoAnual: 0 });
    cerca(cm.mensual, com.valorFuturo, 1, sello(i, 'oportunidad mensual'));
    const objetivo = e(1, 1e8);
    const meses = e(1, 480);
    const q = cuotaMeta({ objetivo, inicial, meses, tasa });
    const qo = O.cuotaMeta({ objetivo, actual: inicial, rPb, meses });
    cerca(q, qo, 2, sello(i, `cuota de ${objetivo} en ${meses}`));
    const terA = e(0, 200);
    const terB = e(0, 200);
    const f = comparadorFondos({ inicial, mensual, anios: anos, bruta: 0.06, terA: terA / 10000, terB: terB / 10000 });
    const fo = O.comparadorFondos({ inicial, mensual, anos, brutaPb: 600, fondos: [{ id: 'a', terPb: terA }, { id: 'b', terPb: terB }] });
    cerca(f.finalA, fo.finales.a, 1, sello(i, 'comparador'));
    cerca(f.finalB, fo.finales.b, 1, sello(i, 'comparador'));
    if (terA < terB) assert.ok(f.finalA >= f.finalB, sello(i, 'menos TER, más final'));
  }
  const recs = [{ id: 'a', concepto: 'A', importe: -1000, cada: 'mes', etiquetas: ['suscripción'], uso: { estado: 'no' } }, { id: 'b', concepto: 'B', importe: -6000, cada: 'año', etiquetas: ['suscripción'], uso: { estado: 'sí' } }, { id: 'c', concepto: 'C', importe: -500, cada: 'mes', etiquetas: ['suscripción'], uso: { estado: 'no' }, pausado: true }, { id: 'd', concepto: 'D', importe: -999, cada: 'mes', etiquetas: [] }];
  const r = radarSuscripciones({ recurrentes: recs }, { anios: 10, tasa: 0.04 });
  const ro = O.radarSuscripciones(recs.map((x) => ({ ...x, uso: x.uso?.estado })), { rPb: 400, anos: 10 });
  assert.equal(r.total, ro.costeAnualTotal);
  assert.equal(r.ahorro, ro.ahorroAnual);
  cerca(r.futuro, ro.costeOportunidadAhorro, 1, 'oportunidad del radar');
});

test('metas: cuenta, grupo y manual; fecha fija y media de 3 meses; «llevas» y «te faltan» en 49, 50 y 51 %', () => {
  const hoy = '2026-11-15';
  const cuentas = [{ id: 'c', tipo: 'ahorro', saldo_inicial: { importe: 500000, fecha: '2000-01-01' } }];
  const meta = (campos) => ({ id: 'm', titulo: 'M', campos: { objetivo: 1000000, ...campos } });
  const P = (m, movs = []) => progresoMeta(m, { cuentas, movimientos: movs, hoy });
  const conCuenta = P(meta({ se_alimenta_de: { tipo: 'cuenta', valor: 'c' } }));
  assert.equal(conCuenta.llevas, 500000);
  const movs = [{ fecha: '2026-10-01', importe: -30000, grupo: 'g' }, { fecha: '2026-09-01', importe: -30000, grupo: 'g' }, { fecha: '2026-08-01', importe: -30000, grupo: 'g' }];
  const conGrupo = P(meta({ se_alimenta_de: { tipo: 'grupo', valor: 'g' }, aportacion: { media3m: true } }), movs);
  assert.equal(conGrupo.llevas, O.sumaGrupoMeta(movs, 'g'));
  assert.equal(conGrupo.aportacion, O.aportacionMedia3m([30000, 30000, 30000]));
  const f = O.fechaEstimadaMeta({ faltan: conGrupo.falta, aportacion: conGrupo.aportacion, hoy });
  assert.equal(conGrupo.meses, f.meses);
  assert.equal(conGrupo.fechaEstimada, f.fecha);
  const fija = P(meta({ se_alimenta_de: { tipo: 'manual', valor: 250000 }, aportacion: { mensual: 25000 } }));
  assert.equal(fija.meses, 30);
  assert.equal(fija.fechaEstimada, sumarMeses(hoy, 30));
  for (const [pct, enc] of [[49, 'llevas'], [50, 'te faltan'], [51, 'te faltan'], [0, 'llevas'], [100, 'te faltan']]) {
    const r = P(meta({ se_alimenta_de: { tipo: 'manual', valor: pct * 10000 } }));
    assert.equal(r.encuadre, enc, `${pct} %`);
    const o = O.progresoMeta({ objetivo: 1000000, origen: { tipo: 'manual', importe: pct * 10000 } }, {});
    assert.equal(o.encuadre, enc, `oráculo ${pct} %`);
    assert.equal(r.pb, pct * 100);
  }
  assert.equal(P(meta({ se_alimenta_de: { tipo: 'manual', valor: 1200000 } })).falta, 0);
});

test(`fechas: mes financiero, periodos que cruzan el año, días 29–31 y 29-feb (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const ini = azar([1, 2, 15, 25, 28, e(1, 28)]);
    const mes = `${e(2000, 2040)}-${String(e(1, 12)).padStart(2, '0')}`;
    assert.deepEqual(periodoMes(mes, ini), O.periodoDeMes(mes, ini), sello(i, `${mes} desde ${ini}`));
    const f = `${mes}-${String(e(1, 28)).padStart(2, '0')}`;
    assert.equal(mesFinanciero(f, ini), O.mesDeFecha(f, ini), sello(i, f));
    const dia = e(1, 31);
    assert.equal(fechaCobro(mes, dia, 1), O.fechaCobroMensual(mes, dia), sello(i, `cobro ${mes} día ${dia}`));
    const g = fecha(2000, 2040);
    const n = e(-5000, 5000);
    assert.equal(sumarDias(g, n), O.sumarDias(g, n), sello(i));
    assert.equal(diasEntre(g, sumarDias(g, n)), O.diasEntre(g, O.sumarDias(g, n)), sello(i));
    const k = e(-200, 200);
    assert.equal(sumarMeses(g, k), O.sumarMeses(g, k), sello(i));
  }
  for (const f of ['2024-02-29', '2028-02-29', '2026-12-31', '2027-01-01', '2026-03-29', '2026-03-31', '2026-10-25', '2026-10-31']) for (const ini of [1, 25, 28]) assert.equal(mesFinanciero(f, ini), O.mesDeFecha(f, ini), `${f} desde ${ini}`);
  for (const a of [2024, 2026, 2028, 2100]) assert.equal(cobroEnMes({ cada: 'año', dia: { dia: 29, mes: 2 } }, `${a}-02`), O.fechaCobroAnual(a, '29-02'), String(a));
});

test(`conocimiento: postura con vida media de 90 días, acierto y Jaccard (${N} casos)`, () => {
  for (let i = 0; i < N; i++) {
    const hoy = '2026-11-03';
    const notas = Array.from({ length: e(0, 12) }, () => ({ fecha: sumarDias(hoy, -e(0, 800)), postura: azar(['alcista', 'bajista', 'neutral', undefined]) }));
    const a = posturaFuente(notas, hoy);
    const o = O.posturaFuente(notas, hoy);
    if (o === null) assert.equal(a, null, sello(i));
    else cerca(a, o, 1e-9, sello(i, 'postura'));
    const estados = Array.from({ length: e(0, 12) }, () => ({ fuente: 'x', estado: azar(['acertada', 'fallida', 'pendiente', 'no-medible']) }));
    const ac = aciertoPorFuente(estados).get('x');
    const oa = O.aciertoFuente(estados);
    if (oa.texto === '—') assert.equal(ac?.aciertoPb ?? null, null, sello(i));
    else cerca(ac.aciertoPb / 100, oa.pct, 0.01, sello(i, 'acierto'));
    const pal = ['bolsa', 'tipos', 'euro', 'banco', 'central', 'inflación', 'crece', 'baja', 'sube', 'deuda'];
    const t = () => Array.from({ length: e(1, 8) }, () => azar(pal)).join(' ');
    const x = t();
    const y = t();
    const j = O.jaccardTitulos(x, y);
    cerca(jaccard(x, y), j.interseccion / j.union, 1e-9, sello(i, `«${x}» / «${y}»`));
  }
});

test(`simulador: pesos por clase de todo o de un activo frente al oráculo, de 0 a 50 % (${N / 3} casos); no toca la cartera`, () => {
  const fs = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
  const M = construirModelo(Object.fromEntries([...fs].map(([r, texto]) => [r, { texto, version: 'v' }])));
  const hoy = '2026-11-03';
  const lista = [...estadoCartera({ activos: M.activos, operaciones: M.operaciones, fotos: M.fotos, hasta: hoy }).porActivo.values()].filter((p) => p.valor > 0);
  const activos = lista.map((p) => ({ id: p.id, valor: p.valor, clase: p.clase ?? 'sin-clase', terPb: 0 }));
  const d = M.descubrimientos[0];
  const nombre = (id) => M.clases.find((c) => c.id === id)?.nombre ?? id;
  const antes = JSON.stringify(M.operaciones);
  for (let i = 0; i < N / 3; i++) {
    const pct = azar([0, 50, e(0, 50), e(0, 5000) / 100]);
    const origen = azar(lista).id;
    const modo = azar(['todo', 'activo']);
    const r = simular(M, hoy, d, { pct, de: modo === 'todo' ? 'todo' : `activo:${origen}` });
    const o = O.simularDescubrimiento({ activos, xPb: Math.round(pct * 100), modo, activoOrigen: origen, descubrimiento: { clase: 'descubrimiento', terPb: 0 } });
    assert.equal(o.estado, 'ok');
    cerca(r.pesoPb / 10000, o.pesoDescubrimiento, 0.0002, sello(i, 'peso'));
    for (const c of r.clases) {
      const id = M.clases.find((x) => x.nombre === c.nombre)?.id;
      if (!id || !(id in o.pesosClase)) continue;
      cerca(c.despuesPb / 10000, o.pesosClase[id], 0.0002, sello(i, `${nombre(id)} con ${pct} % de ${modo}`));
    }
  }
  assert.equal(JSON.stringify(M.operaciones), antes, 'no toca la cartera');
  assert.equal(O.simularDescubrimiento({ activos, xPb: 5001, modo: 'todo', descubrimiento: { clase: 'x', terPb: 0 } }).estado, 'fuera de rango');
  assert.equal(simular(M, hoy, d, { pct: 80 }).pesoPb, 5000, 'lo limita a 50 %');
  assert.equal(simular(M, hoy, d, { pct: -5 }).pesoPb, 0);
});

test('mapa de efectos y selectores frente al oráculo', () => {
  const nota = (id, ef) => ({ id, titulo: id, campos: { fecha: '2026-11-03', efectos: { s: ef } } });
  for (let i = 0; i < N; i++) {
    const lista = Array.from({ length: e(1, 8) }, () => azar(['▲', '▼', '•']));
    const c = mapaEfectos({ ajustes: { sectores_efectos: ['s'] }, mundo: [{ fecha: '2026-11-03', notas: lista.map((x, k) => nota(`n${k}`, x)) }] }, '2026-11-03', 1).filas[0].celdas[0];
    assert.equal(c.signo, O.celdaMapaEfectos(lista), sello(i, lista.join('')));
  }
  const fuentes = [{ id: 'a', familia: 'yt', postura: -0.3, acierto: 65 }, { id: 'b', familia: 'yt', postura: 0.2, acierto: 64.99 }, { id: 'c', familia: 'prensa', postura: null, acierto: null }];
  const resumen = fuentes.map((f) => ({ ...f, acierto: { aciertoPb: f.acierto === null ? null : Math.round(f.acierto * 100) } }));
  for (const t of ['@postura<=-0,3', '@postura>0', '@familia=yt', '@familia!=yt', '@acierto>=65', '@acierto<65']) {
    const sel = items(leer('conocimiento/_mezclas.md', `# M\nesquema: 1\n- m | Mezcla | ${t}\n`))[0].miembros;
    const a = resolverMezcla(sel, resumen).fuentes.slice().sort();
    const o = O.resolverMezcla([t], fuentes).ids.slice().sort();
    assert.deepEqual(a, o, t);
  }
});

test('índice propio con pesos: la mezcla de dos series constantes es la mezcla de sus rentabilidades', () => {
  const s = (r) => {
    let v = 100;
    return Array.from({ length: 13 }, (_, k) => {
      const f = { mes: sumarMesesMes('2025-01', k), valor: v };
      v *= 1 + r;
      return f;
    });
  };
  const toObj = (l) => Object.fromEntries(l.map((f) => [f.mes, f.valor]));
  const o = O.mezclarSeries({ a: 6000, b: 4000 }, { a: toObj(s(0.01)), b: toObj(s(0.02)) });
  const meses = s(0).map((f) => f.mes);
  const a = indicePropio([{ peso: 6000, serie: serieCompleta(s(0.01)) }, { peso: 4000, serie: serieCompleta(s(0.02)) }], meses);
  const ult = o.niveles.at?.(-1) ?? o.niveles[meses.at(-1)];
  assert.ok(ult > 100);
  cerca(a.get(meses.at(-1)), ult, 1e-6, 'índice');
});
