// F7: las 7 herramientas (§4.6), la prueba de crisis y los rangos (§4.5), el Panel y Tu año (§4.8).
// Casos cerrados calculados a mano y comprobaciones contra el ejemplo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../../src/core/herramientas.js';
import { resumenAlAbrir, kpisPanel, lineaDeTiempo, flujoDelMes, ultimoPulso, saludo, patrimonioEn } from '../../src/core/panel.js';
import { tuAnio, aciertoPorFuente } from '../../src/core/tu-ano.js';
import { construirModelo } from '../../src/core/modelo.js';
import { leer } from '../../src/core/formato/index.js';
import { valores } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
const BASE = generar();
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
const M = modeloDe(BASE);
const cerca = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('calculadoras: interés compuesto, valor futuro, cuota para una meta', () => {
  assert.equal(H.valorFuturo({ capital: 100000, anios: 1, tasa: 0.12 }), 112000);
  assert.equal(H.valorFuturo({ mensual: 1000, anios: 1, tasa: 0 }), 12000);
  assert.deepEqual(H.interesCompuesto({ capital: 100000, anios: 2, tasa: 0.1 }), { pones: 100000, intereses: 21000, total: 121000, interesPb: 1736 });
  const ic = H.interesCompuesto({ capital: 1000000, mensual: 30000, anios: 20, tasa: 0.05 });
  assert.equal(ic.pones, 1000000 + 30000 * 240);
  assert.equal(ic.total, ic.pones + ic.intereses);
  assert.equal(H.cuotaMeta({ objetivo: 1500000, inicial: 200000, meses: 36, tasa: 0 }), 36112); // 13.000 / 36 = 361,11 → 361,12
  const c = H.cuotaMeta({ objetivo: 1500000, inicial: 200000, meses: 36, tasa: 0.02 });
  assert.ok(H.valorFuturo({ capital: 200000, mensual: c, anios: 3, tasa: 0.02 }) >= 1500000);
  assert.ok(H.valorFuturo({ capital: 200000, mensual: c - 2, anios: 3, tasa: 0.02 }) < 1500000);
  assert.equal(H.cuotaMeta({ objetivo: 100, inicial: 500, meses: 12 }), 0, 'ya la tienes');
  assert.equal(H.cuotaMeta({ objetivo: 100, meses: 0 }), null);
});

test('coste de oportunidad y comparador de fondos', () => {
  assert.deepEqual(H.costeOportunidad({ importe: 50000, mensual: 1000, anios: 10, tasa: 0, consumoAnual: 3650000 }), { puntual: 50000, mensual: 120000, diasPuntual: 5, diasMensual: 12 });
  const o = H.costeOportunidad({ importe: 15000, anios: 20, tasa: 0.04 });
  assert.equal(o.puntual, Math.round(15000 * 1.04 ** 20));
  assert.equal(o.diasPuntual, null, 'sin consumo no hay días de libertad');
  const igual = H.comparadorFondos({ inicial: 1000000, mensual: 30000, anios: 30, bruta: 0.06, terA: 0.002, terB: 0.002 });
  assert.equal(igual.diferencia, 0);
  const cero = H.comparadorFondos({ inicial: 1000000, mensual: 30000, anios: 2, bruta: 0.01, terA: 0.01, terB: 0.02 });
  assert.deepEqual(cero.a, [1000000, 1360000, 1720000], 'con bruta = TER no crece');
  assert.ok(cero.finalB < cero.finalA);
  const real = H.comparadorFondos({ inicial: 1000000, mensual: 30000, anios: 30, bruta: 0.06, terA: 0.0012, terB: 0.018 });
  assert.equal(real.a.length, 31);
  assert.ok(real.diferencia > 5000000, 'un 1,7 % más de TER cuesta decenas de miles en 30 años');
});

test('alquilar o comprar: caso sin intereses calculado a mano y cuota francesa', () => {
  cerca(H.cuotaPrestamo(10000000, 0.03, 300), 47421, 1); // 100.000 € al 3 % a 25 años: 474,21 €
  // compra al contado, sin gastos ni rentabilidades: el que compra invierte el alquiler que se ahorra
  const r = H.alquilarComprar({ precio: 20000000, alquiler: 80000, entrada: 1, impuestos: 0, mantenimiento: 0, revalorizacion: 0, tipo: 0, rentabilidad: 0, subidaAlquiler: 0, horizonte: 10 });
  assert.deepEqual([r.comprar, r.alquilar, r.diferencia, r.deuda], [20000000 + 80000 * 120, 20000000, 80000 * 120, 0]);
  const normal = H.alquilarComprar({ precio: 25000000, alquiler: 95000, ibi: 40000, comunidad: 6000 });
  assert.ok(normal.deuda > 0 && normal.vivienda > 25000000);
  assert.equal(normal.diferencia, normal.comprar - normal.alquilar);
});

test('radar de suscripciones: coste anual por frecuencia, las que no usas y su coste de oportunidad', () => {
  const r = H.radarSuscripciones(M, { hoy: HOY });
  assert.deepEqual(r.filas.map((f) => [f.id, f.anual]), [['gimnasio', 47880], ['spotify-netflix', 32376], ['idiomas', 5999], ['revista', 5988], ['prime', 4990], ['nube', 3588]]);
  assert.equal(r.total, 100821);
  assert.deepEqual(r.filas.filter((f) => f.marcada).map((f) => f.id), ['idiomas', 'revista'], 'por defecto, las que no usas');
  assert.equal(r.ahorro, 11987);
  assert.equal(r.futuro, H.valorFuturo({ mensual: Math.round(11987 / 12), anios: 20, tasa: 0.04 }));
  const otra = H.radarSuscripciones(M, { hoy: HOY, marcadas: new Set(['gimnasio']) });
  assert.equal(otra.ahorro, 47880);
});

test('IPC personal: pesos de tu consumo, tasas interanuales de cada componente y grupos sin mapear', () => {
  const r = H.ipcPersonal(M, HOY);
  assert.equal(r.mes, '2026-10');
  assert.deepEqual(r.sinMapear.map((x) => x.nombre), ['Regalos']);
  cerca(r.filas.reduce((a, f) => a + f.pesoPb, 0), 10000, 3);
  const viv = r.filas.find((f) => f.grupo === 'vivienda');
  const s = new Map(M.serie('ipc-vivienda').map((f) => [f.mes, f.valor]));
  cerca(viv.tasa, s.get('2026-10') / s.get('2025-10') - 1, 1e-12);
  const mapeado = r.filas.reduce((a, f) => a + f.consumo, 0);
  cerca(r.personal, r.filas.reduce((a, f) => a + (f.consumo / mapeado) * f.tasa, 0), 1e-12);
  const g = new Map(M.serie('ipc-espana').map((f) => [f.mes, f.valor]));
  cerca(r.general, g.get('2026-10') / g.get('2025-10') - 1, 1e-12);
  assert.ok(r.excluidoPb > 0 && r.excluidoPb < 1000);
  assert.equal(H.interanual([{ mes: '2026-01', valor: 1 }]), null);
});

test('prueba de crisis: caída, mínimo, recuperación sin y con aportaciones, clase parecida', () => {
  const datos = { s: [100, 90, 80, 90, 100, 110, 110] };
  const series = (id) => (datos[id] ? datos[id].map((valor, i) => ({ mes: `2020-0${i + 1}`, valor })) : null);
  const clases = [{ id: 'x', nombre: 'X', indice: 's', grupo: 'rv' }, { id: 'y', nombre: 'Y', indice: 'nada', grupo: 'rv', parecida: 'x' }];
  const periodo = { desde: '2020-01', hasta: '2020-03' };
  const r = H.pruebaCrisis({ filas: [{ nombre: 'Fondo', peso: 10000, clase: 'x' }], clases, series, periodo, valor: 100000, aportacion: 0 });
  assert.deepEqual([r.caidaPb, r.valorMinimo, r.mesMinimo, r.recuperaSin], [-2000, 80000, '2020-03', 4]);
  cerca(r.sin[3], 90, 1e-9);
  // aportando lo mismo que tienes cada mes, recuperas antes lo puesto (3 meses frente a 4)
  const c = H.pruebaCrisis({ filas: [{ nombre: 'Fondo', peso: 10000, clase: 'x' }], clases, series, periodo, valor: 100000, aportacion: 100000 });
  assert.equal(c.recuperaCon, 3);
  // la clase sin datos usa la parecida, y se dice
  const p = H.pruebaCrisis({ filas: [{ nombre: 'Otro', peso: 10000, clase: 'y' }], clases, series, periodo, valor: 100000 });
  assert.deepEqual(p.aproximaciones, [{ nombre: 'Otro', con: 'X' }]);
  assert.equal(p.caidaPb, -2000);
  // sin recuperación dentro de los datos → null
  const sinRec = H.pruebaCrisis({ filas: [{ nombre: 'F', peso: 10000, clase: 'x' }], clases, series: (id) => (id === 's' ? [100, 90, 80, 85].map((valor, i) => ({ mes: `2020-0${i + 1}`, valor })) : null), periodo, valor: 1 });
  assert.equal(sinRec.recuperaSin, null);
  assert.match(H.pruebaCrisis({ filas: [{ nombre: 'F', peso: 10000, clase: 'z' }], clases, series, periodo, valor: 1 }).error, /no hay series/);
  // los periodos por defecto, con la cartera del ejemplo
  const periodos = H.parseCrisis(M.ajustes.crisis_periodos);
  assert.deepEqual(periodos.map((x) => x.id), ['2000', '2007', '2020', '2021']);
  for (const per of periodos) {
    const e = H.pruebaCrisis({ filas: H.filasCartera(M), clases: M.clases, series: (id) => M.serie(id), periodo: per, valor: 3711735, aportacion: 60000 });
    assert.ok(e.caidaPb < 0 && e.valorMinimo < 3711735, per.nombre);
    assert.equal(e.meses[0], per.desde);
  }
  assert.match(H.parseCrisis('2008 crisis').error, /AAAA-MM/);
  assert.match(H.parseCrisis('2009-01..2008-01 al revés').error, /AAAA-MM/);
});

test('rangos a 12 meses: percentiles de las rentabilidades móviles', () => {
  const constante = { meses: Array.from({ length: 30 }, (_, i) => `m${i}`), r: new Float64Array(30).fill(0.01) };
  const r = H.rangos12m(constante);
  assert.deepEqual([r.pesimista, r.base, r.optimista, r.peor, r.ventanas], [[1268, 1268], [1268, 1268], [1268, 1268], 1268, 19]);
  assert.match(H.rangos12m({ meses: [], r: new Float64Array(10) }).error, /dos años/);
  const ej = H.rangos12m(H.historicoMezcla(H.componentesDe(H.filasCartera(M), M.clases), (id) => M.serie(id)));
  assert.ok(ej.peor <= ej.pesimista[0] && ej.pesimista[1] <= ej.base[1] && ej.base[1] <= ej.optimista[1]);
});

test('escenarios de vida: pausa, más ingresos, más gasto y gasto puntual', () => {
  const base = H.escenariosVida(M, HOY, {});
  for (const x of base.metas) assert.equal(x.antes, x.despues);
  assert.equal(base.libertad.antes, base.libertad.despues);
  const r = H.escenariosVida(M, HOY, { pausaMeses: 6, ingresosMes: 20000, gastoMes: 15000 });
  const japon = r.metas.find((x) => x.id === 'japon');
  assert.deepEqual([japon.antes, japon.despues], ['2027-10-03', '2028-04-03']);
  assert.equal(r.neto, 5000);
  assert.deepEqual(r.aportacion, { antes: 60000, despues: 65000 });
  assert.equal(r.libertad.objetivoDespues - r.libertad.objetivoAntes, 15000 * 12 * 25, 'gastar más sube el objetivo');
  assert.ok(r.tasa.antesPb !== null && r.tasa.despuesPb !== null);
  const puntual = H.escenariosVida(M, HOY, { gastoPuntual: 3000000 });
  assert.ok((puntual.libertad.despues ?? Infinity) >= (puntual.libertad.antes ?? Infinity), 'gastar 30.000 € de la cartera no te adelanta');
});

test('panel: resumen al abrir, KPI, línea de tiempo (cuadra con los cierres) y flujo', () => {
  assert.deepEqual([saludo('07:10'), saludo('15:00'), saludo('22:30'), saludo('03:00')], ['Buenos días', 'Buenas tardes', 'Buenas noches', 'Buenas noches']);
  const r = resumenAlAbrir(M, { fecha: '2026-11-17', hora: '09:00' });
  assert.equal(r.nombre, 'Alex');
  assert.deepEqual([r.ayer.consumo, r.ayer.conceptos], [6500, ['Concierto']]);
  assert.deepEqual(r.meta, { titulo: 'Viaje a Japón', falta: 220000 });
  assert.equal(resumenAlAbrir(M, { fecha: HOY, hora: '09:00' }).ayer.consumo, 0);
  const k = kpisPanel(M, HOY);
  const p = patrimonioEn(M, HOY);
  assert.equal(k.patrimonio.valor, p.patrimonio);
  assert.equal(k.patrimonio.cartera, 3711735);
  assert.ok(k.colchon.meses > 3 && k.colchon.meses < 5);
  assert.equal(k.colchon.meta, 'Colchón 6 meses');
  assert.equal(k.tasa.mesPb, 3257);
  assert.equal(k.tasa.meses, 11);
  assert.ok(Math.abs(k.cartera.twr - 0.161) < 0.001);
  const l = lineaDeTiempo(M, HOY);
  assert.equal(l.meses.length, 12);
  // el patrimonio de fin de octubre es el de la foto del cierre de octubre
  const cierre = valores(leer('mes/2026-10.md', BASE.get('mes/2026-10.md')), 'Cierre');
  assert.equal(l.patrimonio[10], cierre.patrimonio);
  assert.equal(l.puestoTotal + l.mercado, l.patrimonio[11] - l.patrimonio[0]);
  assert.deepEqual(l.hitos.map((h) => [h.id, h.indice]), [['H-0001', 2], ['H-0002', 6], ['H-0003', 9], ['H-0004', 10]]);
  const f = flujoDelMes(M, HOY);
  assert.equal(f.partes.reduce((a, x) => a + x.valor, 0), f.entradas);
  assert.equal(ultimoPulso(M).fecha, '2026-11-03');
});

test('tu año: totales, mejor mes, cartera, pulsos, metas; grupo que más bajó frente al año anterior', () => {
  const t = tuAnio(M, 2026, HOY);
  assert.equal(t.meses.length, 11);
  assert.equal(t.completo, false);
  assert.equal(t.ahorro.total, 1060000); // invertido + ahorrado de enero a noviembre
  assert.deepEqual(t.mejorMes, { mes: '2026-03', pb: 3509 });
  assert.equal(t.patrimonio.cambio, t.patrimonio.fin - t.patrimonio.inicio);
  assert.equal(t.grupoBaja, null, 'el ejemplo no tiene 2025 completo');
  assert.equal(t.cartera.desde, '2025-12-31');
  assert.deepEqual(t.metas, { cumplidas: ['Fondo para el portátil'], total: 4 });
  assert.equal(t.fuente, null, 'menos de 5 resueltas por fuente: «—»');
  assert.ok(t.pulsos.notas > 0);
  // con enero–marzo de 2025 y sin ocio en 2026, el grupo que más baja es Ocio (−100 %)
  const fs = new Map(BASE);
  for (const m of ['01', '02', '03']) {
    fs.set(`mes/2025-${m}.md`, BASE.get(`mes/2026-${m}.md`).replaceAll('2026', '2025'));
    fs.set(`mes/2026-${m}.md`, BASE.get(`mes/2026-${m}.md`).split('\n').filter((l) => !/\| ocio \|/.test(l)).join('\n'));
  }
  const g = tuAnio(modeloDe(fs), 2026, HOY).grupoBaja;
  assert.deepEqual([g.id, g.pb, g.meses], ['ocio', -10000, 3]);
  // acierto por fuente
  const preds = Array.from({ length: 6 }, (_, i) => ({ fuente: 'a', estado: i < 4 ? 'acertada' : 'fallida', resuelta: '2026-05-01' }));
  assert.deepEqual(aciertoPorFuente(preds), [{ fuente: 'a', resueltas: 6, acertadas: 4, aciertoPb: 6667 }]);
  assert.equal(aciertoPorFuente(preds.slice(0, 4))[0].aciertoPb, null);
});
