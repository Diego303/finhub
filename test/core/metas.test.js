// F6: progreso de metas, consumo de 12 meses, proyección (determinismo, casos cerrados) y libertad financiera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progresoMeta, consumo12 } from '../../src/core/metas.js';
import { historicoMezcla, proyectarHistorico, proyectarManual, parseSupuestos, percentil, libertadFinanciera, inflacionMedia, componentesDe, indiceDeClase } from '../../src/core/proyeccion.js';
import { resumenMetas, perfiles } from '../../src/core/metas-resumen.js';
import { construirModelo } from '../../src/core/modelo.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
const BASE = generar();
const M = modeloDe(BASE);

const cuentas = [
  { id: 'corriente', tipo: 'corriente', saldo_inicial: { importe: 100000, fecha: '2026-01-01' } },
  { id: 'hucha', tipo: 'ahorro', saldo_inicial: { importe: 50000, fecha: '2026-01-01' } },
];
const mov = (fecha, importe, extra = {}) => ({ fecha, importe, concepto: 'x', ...extra });
const meta = (campos) => ({ id: 'm', titulo: 'Meta', campos: { objetivo: 400000, ...campos } });

test('progreso: cuenta, grupo y manual; cumplida; avisos sin romper', () => {
  const movimientos = [mov('2026-08-02', -20000, { cuenta: 'corriente', a: 'hucha' }), mov('2026-09-02', -20000, { cuenta: 'corriente', a: 'hucha' }), mov('2026-10-02', -20000, { cuenta: 'corriente', a: 'hucha' }), mov('2026-10-05', -15000, { grupo: 'viaje' }), mov('2026-12-01', -99999, { grupo: 'viaje' })];
  const ctx = { cuentas, movimientos, hoy: HOY };
  const c = progresoMeta(meta({ se_alimenta_de: { tipo: 'cuenta', valor: 'hucha' }, aportacion: { mensual: 20000 } }), ctx);
  assert.deepEqual([c.llevas, c.falta, c.pb, c.encuadre], [110000, 290000, 2750, 'llevas']);
  assert.deepEqual([c.meses, c.fechaEstimada], [15, '2028-02-03']); // 2.900 / 200 = 14,5 → 15 meses
  const g = progresoMeta(meta({ se_alimenta_de: { tipo: 'grupo', valor: 'viaje' } }), ctx);
  assert.equal(g.llevas, 15000, 'solo hasta hoy');
  assert.equal(g.fechaEstimada, null, 'sin aportación no hay fecha');
  const man = progresoMeta(meta({ se_alimenta_de: { tipo: 'manual', valor: 300000 } }), ctx);
  assert.deepEqual([man.pb, man.encuadre, man.falta], [7500, 'te faltan', 100000]);
  const lista = progresoMeta(meta({ se_alimenta_de: { tipo: 'manual', valor: 500000 } }), ctx);
  assert.deepEqual([lista.pb, lista.falta, lista.meses, lista.lista], [12500, 0, 0, true]);
  const cumplida = progresoMeta(meta({ se_alimenta_de: { tipo: 'manual', valor: 0 }, estado: { estado: 'cumplida', fecha: '2026-05-18' } }), ctx);
  assert.deepEqual([cumplida.pb, cumplida.lista, cumplida.fechaCumplida], [10000, false, '2026-05-18']);
  assert.match(progresoMeta(meta({}), ctx).avisos[0], /no dice de dónde/);
  assert.match(progresoMeta(meta({ se_alimenta_de: { tipo: 'cuenta', valor: 'nada' } }), ctx).avisos[0], /no existe/);
});

test('media de 3 meses y fecha deseada: aportación necesaria y «a tiempo»', () => {
  const movimientos = [8, 9, 10].map((m) => mov(`2026-${String(m).padStart(2, '0')}-02`, -30000, { cuenta: 'corriente', a: 'hucha' }));
  movimientos.push(mov('2026-11-02', -90000, { cuenta: 'corriente', a: 'hucha' })); // del mes en curso: no cuenta en la media
  const ctx = { cuentas, movimientos, hoy: HOY };
  const r = progresoMeta(meta({ se_alimenta_de: { tipo: 'cuenta', valor: 'hucha' }, aportacion: { media3m: true }, fecha_deseada: '2027-03-01' }), ctx);
  assert.equal(r.aportacion, 30000);
  assert.equal(r.aportacionOrigen, 'media3m');
  assert.equal(r.llevas, 230000);
  assert.equal(r.meses, 6); // 1.700 / 300 = 5,67
  assert.equal(r.fechaEstimada, '2027-05-03');
  assert.equal(r.aTiempo, false);
  assert.equal(r.necesaria, 42500); // 1.700 en 4 meses (nov → mar)
  // las metas del ejemplo: Japón llega un mes tarde con 200 €/mes y le harían falta 220 €
  const japon = resumenMetas(M, HOY).metas.find((x) => x.id === 'japon');
  assert.deepEqual([japon.llevas, japon.falta, japon.meses, japon.fechaEstimada, japon.necesaria, japon.aTiempo], [180000, 220000, 11, '2027-10-03', 22000, false]);
});

test('consumo de 12 meses: sin el mes en curso; con menos meses se anualiza y se marca', () => {
  const c = consumo12(M, HOY);
  assert.equal(c.meses, 11);
  assert.equal(c.estimado, true);
  assert.ok(Number.isInteger(c.consumo) && c.consumo > 0);
});

test('proyección con histórico constante: todos los caminos iguales y fórmula cerrada', () => {
  const historico = { meses: Array.from({ length: 24 }, (_, i) => `2020-${i}`), r: new Float64Array(24).fill(0.01), ipc: new Float64Array(24).fill(0.01) };
  const n = proyectarHistorico({ inicial: 100000, aportacion: 10000, anios: 2, historico, real: false, caminos: 50 });
  const f = 1.01 ** 12;
  const v1 = 100000 * f + (10000 * (f - 1)) / 0.01;
  assert.equal(n.p50[1], Math.round(v1));
  assert.equal(n.p10[2], n.p90[2]);
  assert.equal(n.p50[2], Math.round(v1 * f + (10000 * (f - 1)) / 0.01));
  // real: la rentabilidad es igual al IPC → crecimiento real 0 → solo lo aportado
  const r = proyectarHistorico({ inicial: 100000, aportacion: 10000, anios: 2, historico, real: true, caminos: 50 });
  assert.deepEqual(r.p50, [100000, 220000, 340000]);
  assert.deepEqual(r.puesto, [100000, 220000, 340000]);
  assert.match(proyectarHistorico({ inicial: 0, aportacion: 0, anios: 1, historico: { meses: [], r: new Float64Array(5), ipc: null } }).error, /al menos un año/);
});

test('proyección determinista: misma semilla, mismo resultado; y < 300 ms con 40 años', () => {
  const a = resumenMetas(M, HOY, { anios: 40, aportacion: 0 });
  const t0 = performance.now();
  const b = resumenMetas(M, HOY, { anios: 40, aportacion: 0 });
  assert.ok(performance.now() - t0 < 300, 'rápida');
  assert.deepEqual(a.proyeccion, b.proyeccion);
  const p = a.proyeccion;
  assert.equal(p.anios.length, 41);
  for (let i = 0; i < 41; i++) {
    assert.ok(Number.isInteger(p.p10[i]) && p.p10[i] <= p.p50[i] && p.p50[i] <= p.p90[i]);
    assert.equal(p.puesto[i], a.inicial);
  }
  // con otra semilla cambia (no es una constante disfrazada)
  const hist = historicoMezcla(componentesDe(perfiles(M)[0].filas, M.clases), (id) => M.serie(id));
  const s1 = proyectarHistorico({ inicial: a.inicial, aportacion: 60000, anios: 20, historico: hist });
  const s2 = proyectarHistorico({ inicial: a.inicial, aportacion: 60000, anios: 20, historico: hist, semilla: 'otra' });
  assert.notDeepEqual(s1.p50, s2.p50);
  assert.deepEqual(s1, proyectarHistorico({ inicial: a.inicial, aportacion: 60000, anios: 20, historico: hist }));
  // valor fijado: si cambia el algoritmo, la semilla o el PRNG, este test lo dice
  assert.equal(s1.p50[20], resumenMetas(M, HOY).proyeccion.p50[20]);
  assert.equal(s1.p50[20], 24238276);
  // años fuera de rango se limitan a 1–40
  assert.equal(proyectarHistorico({ inicial: 0, aportacion: 0, anios: 99, historico: hist, caminos: 10 }).anios.length, 41);
});

test('histórico de la mezcla: meses comunes, efectivo con el tipo del BCE, avisos', () => {
  const comp = componentesDe([{ nombre: 'World', peso: 9000, clase: 'rv-desarrollados' }, { nombre: 'Monetario', peso: 1000, clase: 'efectivo' }], M.clases);
  assert.deepEqual(comp.map((c) => [c.indice, c.grupo]), [['msci-world-nr-eur', 'rv'], [null, 'efectivo']]);
  const h = historicoMezcla(comp, (id) => M.serie(id));
  assert.equal(h.meses[0], '2000-02');
  assert.equal(h.r.length, h.meses.length);
  assert.ok(h.ipc);
  assert.deepEqual(h.avisos, []);
  const world = new Map(M.serie('msci-world-nr-eur').map((f) => [f.mes, f.valor]));
  const bce = new Map(M.serie('bce-deposito').map((f) => [f.mes, f.valor]));
  const i = 100;
  const esperado = 0.9 * (world.get(h.meses[i]) / world.get(h.meses[i - 1]) - 1) + 0.1 * (bce.get(h.meses[i]) / 100 / 12);
  assert.ok(Math.abs(h.r[i] - esperado) < 1e-12);
  const sin = historicoMezcla([{ nombre: 'Raro', peso: 10000, indice: 'no-existe', grupo: 'rv' }], (id) => M.serie(id));
  assert.match(sin.avisos.join(' '), /no hay serie «no-existe»/);
  assert.equal(sin.r.length, 0);
  assert.equal(indiceDeClase('rv-tecnologia', M.clases), 'nasdaq-100-eur');
  assert.equal(indiceDeClase('mixto', M.clases), 'rf-euro-agregada', 'por la clase parecida');
});

test('modo manual: supuestos de Ajustes, volatilidad 0 → fórmula; nominal suma la inflación', () => {
  const sup = parseSupuestos('rv 6 · 0 | rf 2 · 0 | efectivo 0 · 0');
  assert.deepEqual(sup.rv, { mu: 0.06, sigma: 0 });
  assert.match(parseSupuestos('rv seis').error, /debe ser/);
  const componentes = [{ nombre: 'a', peso: 5000, grupo: 'rv' }, { nombre: 'b', peso: 5000, grupo: 'rf' }];
  const r = proyectarManual({ inicial: 1000000, aportacion: 0, anios: 1, componentes, supuestos: sup, real: true, caminos: 20 });
  assert.equal(r.p50[1], 1040000); // 4 % real
  assert.equal(r.p10[1], r.p90[1]);
  const n = proyectarManual({ inicial: 1000000, aportacion: 0, anios: 1, componentes, supuestos: sup, real: false, inflacion: 0.02, caminos: 20 });
  assert.equal(n.p50[1], 1060800); // 1,04 × 1,02
  const mixto = proyectarManual({ inicial: 1000000, aportacion: 0, anios: 1, componentes: [{ nombre: 'm', peso: 10000, grupo: 'mixto' }], supuestos: sup, caminos: 5 });
  assert.equal(mixto.p50[1], 1040000);
  // el modo manual también se elige desde Ajustes
  const fs = new Map(BASE);
  fs.set('ajustes.md', fs.get('ajustes.md').replace('- proyeccion: datos', '- proyeccion: manual\n- proyeccion_manual: rv 5,5 · 14 | rf 1,5 · 4 | efectivo 0,5 · 0,5'));
  const rm = resumenMetas(modeloDe(fs), HOY);
  assert.equal(rm.proyeccion.modo, 'manual');
  assert.ok(rm.proyeccion.p10[20] < rm.proyeccion.p50[20] && rm.proyeccion.p50[20] < rm.proyeccion.p90[20]);
  const ipc = inflacionMedia(M.serie('ipc-espana'));
  assert.ok(ipc > 0 && ipc < 0.1);
});

test('percentil y libertad financiera', () => {
  assert.equal(percentil([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentil([0, 10], 0.1), 1);
  assert.equal(percentil([], 0.5), null);
  const proy = { anios: [0, 1, 2, 3], p50: [100, 200, 400, 800] };
  assert.deepEqual(libertadFinanciera(proy, 10, 25), { objetivo: 250, anio: 2, masDe: null });
  assert.deepEqual(libertadFinanciera(proy, 100, 25), { objetivo: 2500, anio: null, masDe: 3 });
  assert.deepEqual(libertadFinanciera(proy, null), { objetivo: null, anio: null, masDe: null });
});

test('perfiles: tu objetivo primero y luego las plantillas', () => {
  const pl = [{ perfil: 'conservadora', titulo: 'Conservadora · 40/60', filas: [{ nombre: 'x', peso: 10000, clase: 'renta-fija' }] }];
  const ps = perfiles(M, pl);
  assert.deepEqual(ps.map((p) => p.id), ['objetivo', 'conservadora']);
  assert.equal(ps[0].filas.reduce((s, f) => s + f.peso, 0), 10000);
  const r = resumenMetas(M, HOY, { perfil: 'conservadora', plantillas: pl, anios: 10 });
  assert.equal(r.perfil.id, 'conservadora');
  assert.equal(r.proyeccion.anios.length, 11);
  assert.equal(r.aportacion, 60000, 'por defecto, los recurrentes de inversión');
});
