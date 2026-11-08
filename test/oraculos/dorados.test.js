// Casos dorados calculados A MANO: el razonamiento va en el comentario de cada caso.
// Las expresiones con Math.pow son fórmulas cerradas escritas a mano, independientes del solver.
// «LECTURA» marca un valor que depende de una duda del README: si la implementación real difiere
// ahí, hay que decidir quién tiene razón, no asumir un fallo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as o from './oraculos.js';

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} no está cerca de ${b} (±${tol})`);
const E = (euros) => Math.round(euros * 100); // euros → céntimos

// ───────────── Redondeo ─────────────

test('redondeo: mitad al par', () => {
  // 25/10 = 2,5 → 2 · 35/10 = 3,5 → 4 · −25/10 = −2,5 → −2 · 26/10 = 2,6 → 3
  assert.equal(o.dividirMitadPar(25, 10), 2);
  assert.equal(o.dividirMitadPar(35, 10), 4);
  assert.equal(o.dividirMitadPar(-25, 10), -2);
  assert.equal(o.dividirMitadPar(26, 10), 3);
  assert.equal(o.redondearMitadPar(2.5), 2);
  assert.equal(o.redondearMitadPar(3.5), 4);
  assert.equal(o.redondearMitadPar(-0.2), 0);
  assert.throws(() => o.dividirMitadPar(1, 0), RangeError);
});

// ───────────── Fechas ─────────────

test('fechas: mes natural', () => {
  assert.deepEqual(o.periodoDeMes('2026-11', 1), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(o.periodoDeMes('2028-02', 1), { desde: '2028-02-01', hasta: '2028-02-29' }); // 2028 bisiesto
  assert.deepEqual(o.periodoDeMes('2026-02', 1), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.equal(o.mesDeFecha('2026-12-31', 1), '2026-12');
});

test('fechas: mes financiero del plan: noviembre con inicio 25 va del 25-10 al 24-11', () => {
  assert.deepEqual(o.periodoDeMes('2026-11', 25), { desde: '2026-10-25', hasta: '2026-11-24' });
  assert.equal(o.mesDeFecha('2026-10-25', 25), '2026-11');
  assert.equal(o.mesDeFecha('2026-11-24', 25), '2026-11');
  assert.equal(o.mesDeFecha('2026-11-25', 25), '2026-12');
  assert.equal(o.mesDeFecha('2026-10-24', 25), '2026-10');
});

test('fechas: meses que cruzan el año', () => {
  // Enero de 2027 con inicio 25: del 25-12-2026 al 24-01-2027. El fichero es el mes que TERMINA.
  assert.deepEqual(o.periodoDeMes('2027-01', 25), { desde: '2026-12-25', hasta: '2027-01-24' });
  assert.equal(o.mesDeFecha('2026-12-25', 25), '2027-01');
  assert.equal(o.mesDeFecha('2026-12-31', 25), '2027-01');
  assert.equal(o.mesDeFecha('2027-01-24', 25), '2027-01');
  assert.equal(o.mesSiguiente('2026-12'), '2027-01');
  assert.equal(o.mesAnterior('2027-01'), '2026-12');
});

test('fechas: días 29–31 y 29 de febrero con inicio 28 (el máximo de FORMATOS)', () => {
  // Marzo de 2028 con inicio 28: 28-02 → 27-03. El 29-02 cae dentro.
  assert.deepEqual(o.periodoDeMes('2028-03', 28), { desde: '2028-02-28', hasta: '2028-03-27' });
  assert.equal(o.mesDeFecha('2028-02-29', 28), '2028-03');
  assert.equal(o.mesDeFecha('2028-02-27', 28), '2028-02');
  // Día 30 y 31 de enero con inicio 25 → pertenecen a febrero (25-01 → 24-02).
  assert.equal(o.mesDeFecha('2026-01-30', 25), '2026-02');
  assert.equal(o.mesDeFecha('2026-01-31', 25), '2026-02');
  // Inicio 25 con febrero de por medio: marzo de 2026 va del 25-02 al 24-03.
  assert.deepEqual(o.periodoDeMes('2026-03', 25), { desde: '2026-02-25', hasta: '2026-03-24' });
});

test('fechas: mes_inicio_dia fuera de 1–28 → defecto y aviso (FORMATOS); las funciones puras lo rechazan', () => {
  assert.deepEqual(o.normalizarMesInicioDia(31), { dia: 1, aviso: true });
  assert.deepEqual(o.normalizarMesInicioDia(29), { dia: 1, aviso: true });
  assert.deepEqual(o.normalizarMesInicioDia(28), { dia: 28, aviso: false });
  assert.throws(() => o.periodoDeMes('2026-02', 30), RangeError);
});

test('fechas: recurrente con día que no existe → último del mes (FORMATOS)', () => {
  assert.equal(o.fechaCobroMensual('2026-02', 31), '2026-02-28');
  assert.equal(o.fechaCobroMensual('2028-02', 31), '2028-02-29');
  assert.equal(o.fechaCobroMensual('2026-02', 29), '2026-02-28');
  assert.equal(o.fechaCobroMensual('2026-04', 31), '2026-04-30');
  assert.equal(o.fechaCobroMensual('2026-01', 31), '2026-01-31');
  assert.equal(o.fechaCobroAnual(2026, '14-11'), '2026-11-14');
  assert.equal(o.fechaCobroAnual(2026, '31-02'), null); // imposible en FORMATOS
  assert.equal(o.fechaCobroAnual(2026, '29-02'), '2026-02-28'); // LECTURA
  assert.equal(o.fechaCobroAnual(2028, '29-02'), '2028-02-29');
});

test('fechas: validez, bisiestos y aritmética de días', () => {
  assert.equal(o.fechaValida('2026-02-29'), false);
  assert.equal(o.fechaValida('2028-02-29'), true);
  assert.equal(o.fechaValida('2026-11-31'), false);
  assert.equal(o.fechaValida('2026-13-01'), false);
  assert.equal(o.esBisiesto(2000), true); // divisible por 400
  assert.equal(o.esBisiesto(1900), false); // por 100 y no por 400
  assert.equal(o.diasEntre('2028-02-28', '2028-03-01'), 2); // pasa por el 29
  assert.equal(o.diasEntre('2026-02-28', '2026-03-01'), 1);
  assert.equal(o.diasEntre('2026-01-01', '2027-01-01'), 365);
  assert.equal(o.sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(o.sumarMeses('2026-01-31', 1), '2026-02-28');
});

test('fechas: no dependen de la zona horaria', () => {
  const antes = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      // 2026-03-29 es cambio de hora en Madrid; los días no se alteran.
      assert.equal(o.diasEntre('2026-03-28', '2026-03-30'), 2);
      assert.equal(o.sumarDias('2026-03-28', 1), '2026-03-29');
      assert.equal(o.mesDeFecha('2026-12-31', 25), '2027-01');
    }
  } finally {
    if (antes === undefined) delete process.env.TZ;
    else process.env.TZ = antes;
  }
});

// ───────────── Mes ─────────────

const GRUPOS = {
  sueldo: { naturaleza: 'ingreso' },
  ocio: { naturaleza: 'consumo' },
  super: { naturaleza: 'consumo' },
  cartera: { naturaleza: 'inversion' },
  colchon: { naturaleza: 'ahorro' },
  devoluciones: { naturaleza: 'traspaso' },
};

test('mes: el ejemplo del plan (el Bizum no es una entrada)', () => {
  // Entradas 2.850. Ocio = 65 − 24 = 41. Invertido 600. Ahorrado 0.
  // Queda = 2.850 − 41 − 600 = 2.209. Tasa = 600 / 2.850 = 21,0526… % → 2105 pb.
  const r = o.resumenMes(
    [
      { importe: E(2850), grupo: 'sueldo' },
      { importe: E(-600), grupo: 'cartera' },
      { importe: E(24), grupo: 'devoluciones', compensa: 'ocio' },
      { importe: E(-65), grupo: 'ocio', naturaleza: 'consumo' },
    ],
    GRUPOS,
  );
  assert.equal(r.entradas, E(2850));
  assert.equal(r.consumo, E(41));
  assert.equal(r.consumoPorGrupo.ocio, E(41));
  assert.equal(r.compensaciones, E(24));
  assert.equal(r.invertido, E(600));
  assert.equal(r.ahorrado, 0);
  assert.equal(r.queda, E(2209));
  cerca(r.tasaAhorro, 600 / 2850);
  assert.equal(r.tasaAhorroPb, 2105);
});

test('mes: compensación mayor que el gasto deja el grupo en negativo y resta del total', () => {
  // Ocio = 10 − 30 = −20. Súper = 100. Consumo = 80. Queda = 1.000 − 80 = 920. LECTURA: sin suelo.
  const r = o.resumenMes(
    [
      { importe: E(1000), grupo: 'sueldo' },
      { importe: E(-10), grupo: 'ocio' },
      { importe: E(30), grupo: 'devoluciones', compensa: 'ocio' },
      { importe: E(-100), grupo: 'super' },
    ],
    GRUPOS,
  );
  assert.equal(r.consumoPorGrupo.ocio, E(-20));
  assert.equal(r.consumo, E(80));
  assert.equal(r.queda, E(920));
});

test('mes: invertido, ahorrado y traspasos sin compensa neutros', () => {
  // Entradas 2.000. Consumo 500. Invertido 300. Ahorrado 200. El traspaso de 70 no cuenta.
  // Queda = 2.000 − 500 − 300 − 200 = 1.000. Tasa = 500 / 2.000 = 25 %.
  const r = o.resumenMes(
    [
      { importe: E(2000), grupo: 'sueldo' },
      { importe: E(-500), grupo: 'super' },
      { importe: E(-300), grupo: 'cartera' },
      { importe: E(-200), grupo: 'colchon' },
      { importe: E(70), grupo: 'devoluciones' },
    ],
    GRUPOS,
  );
  assert.equal(r.entradas, E(2000));
  assert.equal(r.traspasos, E(70));
  assert.equal(r.queda, E(1000));
  assert.equal(r.tasaAhorro, 0.25);
  assert.equal(r.tasaAhorroPb, 2500);
});

test('mes: sin entradas la tasa es «no concluyente» (§9.1)', () => {
  const r = o.resumenMes([{ importe: E(-50), grupo: 'ocio' }], GRUPOS);
  assert.equal(r.tasaAhorro, o.NO_CONCLUYENTE);
  assert.equal(r.tasaAhorroPb, o.NO_CONCLUYENTE);
  assert.equal(r.queda, E(-50));
});

test('mes: sin grupo y grupo borrado no se pierden, pero no suman a ninguna naturaleza (§9.2)', () => {
  const r = o.resumenMes(
    [
      { importe: E(-40), grupo: '—' },
      { importe: E(-5), grupo: 'grupo-borrado' },
      { importe: E(100), grupo: 'sueldo' },
    ],
    GRUPOS,
  );
  assert.equal(r.sinGrupo, E(-45));
  assert.equal(r.consumo, 0);
  assert.equal(r.queda, E(100));
});

test('mes: la naturaleza del movimiento manda sobre la del grupo', () => {
  const r = o.resumenMes([{ importe: E(-40), grupo: 'ocio', naturaleza: 'inversion' }], GRUPOS);
  assert.equal(r.consumo, 0);
  assert.equal(r.invertido, E(40));
});

test('presupuesto: el del mes sobrescribe al del grupo, también si es 0', () => {
  assert.equal(o.presupuestoEfectivo(E(150), E(200)), E(200));
  assert.equal(o.presupuestoEfectivo(E(150), undefined), E(150));
  assert.equal(o.presupuestoEfectivo(E(150), 0), 0);
  assert.equal(o.presupuestoEfectivo(undefined, undefined), null);
});

test('presupuesto: colores en los límites exactos', () => {
  // Presupuesto 200 €: 90 % = 180,00; 100 % = 200,00.
  assert.equal(o.colorPresupuesto(E(179.99), E(200)), 'verde');
  assert.equal(o.colorPresupuesto(E(180), E(200)), 'verde');
  assert.equal(o.colorPresupuesto(E(180.01), E(200)), 'ambar');
  assert.equal(o.colorPresupuesto(E(200), E(200)), 'ambar');
  assert.equal(o.colorPresupuesto(E(200.01), E(200)), 'rojo');
  assert.equal(o.colorPresupuesto(E(-20), E(200)), 'verde');
  assert.equal(o.colorPresupuesto(E(1), 0), 'rojo'); // cualquier gasto sobre presupuesto 0
  assert.equal(o.colorPresupuesto(0, 0), 'verde');
  assert.equal(o.colorPresupuesto(E(1), null), null);
});

test('media de 6 meses: solo cerrados, los últimos 6, anteriores al de referencia', () => {
  // Marzo…septiembre cerrados con 100…700. Se usan abril…septiembre: (200+…+700)/6 = 2.700/6 = 450.
  // Ropa solo en septiembre: 120/6 = 20. Total = (2.700 + 120)/6 = 470.
  const meses = [];
  for (let i = 0; i < 7; i++) {
    meses.push({ mes: `2026-0${i + 3}`, estado: 'cerrado', consumoPorGrupo: { ocio: E(100 * (i + 1)) } });
  }
  meses[6].consumoPorGrupo.ropa = E(120);
  meses.push({ mes: '2026-10', estado: 'abierto', consumoPorGrupo: { ocio: E(9999) } });
  meses.push({ mes: '2026-08', estado: 'reabierto', consumoPorGrupo: { ocio: E(9999) } });
  meses.push({ mes: '2026-12', estado: 'cerrado', consumoPorGrupo: { ocio: E(9999) } }); // posterior
  const r = o.mediaUltimos6Cerrados(meses, '2026-11');
  assert.deepEqual(r.mesesUsados, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.equal(r.porGrupo.ocio, E(450));
  assert.equal(r.porGrupo.ropa, E(20));
  assert.equal(r.total, E(470));
});

test('media de 6 meses: menos de 6, ninguno y redondeo mitad al par', () => {
  const dos = o.mediaUltimos6Cerrados(
    [
      { mes: '2026-01', estado: 'cerrado', consumoPorGrupo: { a: 100 } },
      { mes: '2026-02', estado: 'cerrado', consumoPorGrupo: { a: 300 } },
    ],
    '2026-03',
  );
  assert.equal(dos.total, 200); // (100 + 300) / 2
  assert.equal(o.mediaUltimos6Cerrados([], '2026-03').total, null);
  // 3 céntimos entre 6 = 0,5 → 0 (par). 9 entre 6 = 1,5 → 2 (par).
  const seis = (x) =>
    ['01', '02', '03', '04', '05', '06'].map((m, i) => ({ mes: `2026-${m}`, estado: 'cerrado', consumoPorGrupo: { a: i === 0 ? x : 0 } }));
  assert.equal(o.mediaUltimos6Cerrados(seis(3), '2026-07').total, 0);
  assert.equal(o.mediaUltimos6Cerrados(seis(9), '2026-07').total, 2);
});

// ───────────── Saldos y patrimonio ─────────────

test('saldos: dos patas con a:, y se conservan los céntimos', () => {
  // Corriente: 1.250 + 2.850 − 600 − 300 = 3.200. Remunerada: 3.000 + 300 = 3.300.
  const movs = [
    { importe: E(2850), cuenta: 'corriente' },
    { importe: E(-600), cuenta: 'corriente' },
    { importe: E(-300), cuenta: 'corriente', a: 'remunerada' },
  ];
  assert.equal(o.saldoCuenta('corriente', E(1250), movs), E(3200));
  assert.equal(o.saldoCuenta('remunerada', E(3000), movs), E(3300));
  // Otra cuenta, sin movimientos.
  assert.equal(o.saldoCuenta('otra', E(5), movs), E(5));
  // LECTURA: con importe positivo, la cuenta sube y «a» baja.
  const inverso = [{ importe: E(100), cuenta: 'x', a: 'y' }];
  assert.equal(o.saldoCuenta('x', 0, inverso) + o.saldoCuenta('y', 0, inverso), 0);
  assert.equal(o.saldoCuenta('x', 0, inverso), E(100));
});

test('saldos: el ajuste cuadra el saldo y es neutro en el mes, pero aparte', () => {
  // Saldo 3.200, real 3.150 → ajuste −50.
  const imp = o.importeAjusteSaldo(E(3200), E(3150));
  assert.equal(imp, E(-50));
  const movs = [{ importe: imp, cuenta: 'c', ajuste: true, grupo: 'devoluciones' }];
  assert.equal(o.saldoCuenta('c', E(3200), movs), E(3150));
  const r = o.resumenMes(movs, GRUPOS);
  assert.equal(r.ajustes, E(-50));
  assert.equal(r.traspasos, 0);
  assert.equal(r.consumo, 0);
  assert.equal(r.queda, 0);
});

test('patrimonio: la deuda resta y los activos sin valorar van por aportado', () => {
  // 3.200 + 3.300 − 500 = 6.000 en cuentas. Cartera: 10.000 + 300 (sin valorar). Total 16.300.
  const r = o.patrimonioNeto(
    [
      { id: 'corriente', tipo: 'corriente', saldo: E(3200) },
      { id: 'remunerada', tipo: 'ahorro', saldo: E(3300) },
      { id: 'tarjeta', tipo: 'deuda', saldo: E(500) },
    ],
    [
      { id: 'msci', valor: E(10000), aportadoNeto: E(8000) },
      { id: 'nuevo', valor: null, aportadoNeto: E(300) },
    ],
  );
  assert.equal(r.patrimonio, E(16300));
  assert.equal(r.enCuentas, E(6000));
  assert.equal(r.valorCartera, E(10300));
  assert.deepEqual(r.activosSinValorar, ['nuevo']);
});

test('patrimonio: LECTURA, una deuda escrita en negativo también resta', () => {
  const r = o.patrimonioNeto([{ id: 'hipoteca', tipo: 'deuda', saldo: E(-500) }]);
  assert.equal(r.patrimonio, E(-500));
});

test('colchón: saldo ÷ consumo medio, en meses', () => {
  // 6.000 / 1.500 = 4 meses; 1.000 / 400 = 2,5 meses.
  assert.equal(o.colchonMeses(E(6000), E(1500)).meses, 4);
  assert.equal(o.colchonMeses(E(1000), E(400)).meses, 2.5);
  assert.equal(o.colchonMeses(E(1000), 0).estado, o.NO_CONCLUYENTE);
  assert.equal(o.colchonMeses(E(1000), null).estado, o.NO_CONCLUYENTE);
});

// ───────────── Impuesto ─────────────

test('impuesto: exacto en cada límite de tramo', () => {
  // 6.000 × 19 % = 1.140.
  // 50.000: 1.140 + 44.000 × 21 % (9.240) = 10.380.
  // 200.000: 10.380 + 150.000 × 23 % (34.500) = 44.880.
  // 300.000: 44.880 + 100.000 × 27 % (27.000) = 71.880.
  // 400.000: 71.880 + 100.000 × 30 % (30.000) = 101.880.
  assert.equal(o.impuestoEstimado(E(6000)), E(1140));
  assert.equal(o.impuestoEstimado(E(50000)), E(10380));
  assert.equal(o.impuestoEstimado(E(200000)), E(44880));
  assert.equal(o.impuestoEstimado(E(300000)), E(71880));
  assert.equal(o.impuestoEstimado(E(400000)), E(101880));
});

test('impuesto: ± 1 céntimo en cada límite', () => {
  // 599.999 c × 19 % = 113.999,81 → 114.000. 600.001 c: 114.000 + 1 × 21 % = 114.000,21 → 114.000.
  assert.equal(o.impuestoEstimado(E(6000) - 1), 114000);
  assert.equal(o.impuestoEstimado(E(6000) + 1), 114000);
  // 4.999.999 c: 114.000 + 4.399.999 × 21 % = 114.000 + 923.999,79 = 1.037.999,79 → 1.038.000.
  // 5.000.001 c: 1.038.000 + 1 × 23 % = 1.038.000,23 → 1.038.000.
  assert.equal(o.impuestoEstimado(E(50000) - 1), 1038000);
  assert.equal(o.impuestoEstimado(E(50000) + 1), 1038000);
  // 19.999.999 c: 1.038.000 + 14.999.999 × 23 % = 1.038.000 + 3.449.999,77 = 4.487.999,77 → 4.488.000.
  // 20.000.001 c: 4.488.000 + 0,27 → 4.488.000.
  assert.equal(o.impuestoEstimado(E(200000) - 1), 4488000);
  assert.equal(o.impuestoEstimado(E(200000) + 1), 4488000);
  // 29.999.999 c: 4.488.000 + 9.999.999 × 27 % = 4.488.000 + 2.699.999,73 = 7.187.999,73 → 7.188.000.
  // 30.000.001 c: 7.188.000 + 0,30 → 7.188.000.
  assert.equal(o.impuestoEstimado(E(300000) - 1), 7188000);
  assert.equal(o.impuestoEstimado(E(300000) + 1), 7188000);
});

test('impuesto: ± 100 c en cada límite SÍ delatan un tramo desplazado (a ± 1 c el redondeo lo tapa)', () => {
  // Por encima: 100 c al tipo del tramo siguiente; en paréntesis, lo que daría un límite mal puesto.
  assert.equal(o.impuestoEstimado(E(6000) + 100), 114021); // 114.000 + 21 (no + 19)
  assert.equal(o.impuestoEstimado(E(50000) + 100), 1038023); // 1.038.000 + 23 (no + 21)
  assert.equal(o.impuestoEstimado(E(200000) + 100), 4488027); // 4.488.000 + 27 (no + 23)
  assert.equal(o.impuestoEstimado(E(300000) + 100), 7188030); // 7.188.000 + 30 (no + 27)
  // Por debajo: quitar 100 c resta al tipo del tramo que acaba.
  assert.equal(o.impuestoEstimado(E(6000) - 100), 113981); // 114.000 − 19 (no − 21)
  assert.equal(o.impuestoEstimado(E(50000) - 100), 1037979); // 1.038.000 − 21 (no − 23)
  assert.equal(o.impuestoEstimado(E(200000) - 100), 4487977); // 4.488.000 − 23 (no − 27)
  assert.equal(o.impuestoEstimado(E(300000) - 100), 7187973); // 7.188.000 − 27 (no − 30)
});

test('impuesto: mitad al par, plusvalía negativa y cero', () => {
  // 50 c × 19 % = 9,5 → 10 (par). 150 c × 19 % = 28,5 → 28 (par).
  assert.equal(o.impuestoEstimado(50), 10);
  assert.equal(o.impuestoEstimado(150), 28);
  assert.equal(o.impuestoEstimado(0), 0);
  assert.equal(o.impuestoEstimado(E(-5000)), 0);
});

// ───────────── Cartera ─────────────

const P = (n) => n * 1000000; // participaciones ×10⁶

test('cartera: aportado neto, plusvalía e impuesto sin participaciones (coste aproximado)', () => {
  // Aporta 3.000 y vende 1.000 → aportado 2.000. Valor 2.500 → plusvalía 500. Impuesto 19 % = 95.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-10', tipo: 'aportacion', activo: 'a', importe: E(3000) },
      { fecha: '2026-02-10', tipo: 'venta', activo: 'a', importe: E(1000) },
    ],
    fotos: [{ fecha: '2026-03-01', valores: { a: E(2500) } }],
  });
  assert.equal(r.porActivo.a.aportadoNeto, E(2000));
  assert.equal(r.porActivo.a.costeAproximado, true);
  assert.equal(r.valor, E(2500));
  assert.equal(r.plusvalia, E(500));
  assert.equal(r.impuesto, E(95));
});

test('cartera: FIFO con participaciones', () => {
  // Lotes: 100 p por 1.000 (10 €/p) y 100 p por 2.000 (20 €/p).
  // Vende 150 p: 100 × 10 + 50 × 20 = 2.000 de coste. Quedan 50 p por 1.000.
  // Aportado = 3.000 − 2.000 = 1.000. Valor 1.500 → plusvalía 500.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000), participaciones: P(100) },
      { fecha: '2026-02-01', tipo: 'aportacion', activo: 'a', importe: E(2000), participaciones: P(100) },
      { fecha: '2026-03-01', tipo: 'venta', activo: 'a', importe: E(4000), participaciones: P(150) },
    ],
    fotos: [{ fecha: '2026-04-01', valores: { a: E(1500) } }],
  });
  assert.equal(r.porActivo.a.costeAproximado, false);
  assert.equal(r.porActivo.a.aportadoNeto, E(1000));
  assert.equal(r.porActivo.a.plusvalia, E(500));
});

test('cartera: FIFO respeta la fecha aunque las operaciones vengan desordenadas', () => {
  // Igual que el caso anterior, en otro orden.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-03-01', tipo: 'venta', activo: 'a', importe: E(4000), participaciones: P(150) },
      { fecha: '2026-02-01', tipo: 'aportacion', activo: 'a', importe: E(2000), participaciones: P(100) },
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000), participaciones: P(100) },
    ],
  });
  assert.equal(r.porActivo.a.aportadoNeto, E(1000));
});

test('cartera: FIFO parcial no pierde céntimos', () => {
  // Lote: 3 p por 1.000,00 (100.000 c). Vende 1 p: 100.000/3 = 33.333,33 → 33.333; quedan 66.667.
  // Vende 1 p: 66.667/2 = 33.333,5 → 33.334 (par); quedan 33.333. Vende 1 p: 33.333. Suma 100.000.
  const r1 = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: 100000, participaciones: P(3) },
      { fecha: '2026-01-02', tipo: 'venta', activo: 'a', importe: 1, participaciones: P(1) },
    ],
  });
  assert.equal(r1.porActivo.a.aportadoNeto, 66667);
  const r2 = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: 100000, participaciones: P(3) },
      { fecha: '2026-01-02', tipo: 'venta', activo: 'a', importe: 1, participaciones: P(1) },
      { fecha: '2026-01-03', tipo: 'venta', activo: 'a', importe: 1, participaciones: P(1) },
    ],
  });
  assert.equal(r2.porActivo.a.aportadoNeto, 33333);
  const r3 = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: 100000, participaciones: P(3) },
      { fecha: '2026-01-02', tipo: 'venta', activo: 'a', importe: 1, participaciones: P(3) },
    ],
  });
  assert.equal(r3.porActivo.a.aportadoNeto, 0);
});

test('cartera: si falta participaciones en algo, no hay FIFO y se indica', () => {
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000), participaciones: P(10) },
      { fecha: '2026-02-01', tipo: 'aportacion', activo: 'a', importe: E(1000) },
    ],
  });
  assert.equal(r.porActivo.a.costeAproximado, true);
  assert.equal(r.porActivo.a.aportadoNeto, E(2000));
});

test('cartera: ventas mayores que lo aportado: aviso, sin crash ni aportado negativo (§9.6)', () => {
  // LECTURA: suelo en 0. Aporta 1.000, vende 1.500 → aportado 0. Sin foto: valor = aportado = 0.
  const sinP = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000) },
      { fecha: '2026-02-01', tipo: 'venta', activo: 'a', importe: E(1500) },
    ],
  });
  assert.equal(sinP.porActivo.a.aportadoNeto, 0);
  assert.ok(sinP.porActivo.a.avisos.includes('venta-mayor-que-lo-aportado'));
  // Con participaciones: 10 p por 1.000, vende 20 p → todo el coste, aportado 0, aviso.
  const conP = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000), participaciones: P(10) },
      { fecha: '2026-02-01', tipo: 'venta', activo: 'a', importe: E(3000), participaciones: P(20) },
    ],
  });
  assert.equal(conP.porActivo.a.aportadoNeto, 0);
  assert.ok(conP.porActivo.a.avisos.includes('venta-mayor-que-lo-aportado'));
});

test('cartera: traspaso no cambia el total y mantiene el coste', () => {
  // sp500 aporta 3.000 y traspasa 1.000 a msci: sp500 2.000, msci 1.000; total 3.000.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'sp500', importe: E(3000) },
      { fecha: '2026-02-01', tipo: 'traspaso', activo: 'sp500', destino: 'msci', importe: E(1000) },
    ],
  });
  assert.equal(r.aportadoNeto, E(3000));
  assert.equal(r.porActivo.sp500.aportadoNeto, E(2000));
  assert.equal(r.porActivo.msci.aportadoNeto, E(1000));
});

test('cartera: traspaso con FIFO mueve el coste de los lotes, no el importe', () => {
  // 10 p por 1.000 (100 €/p). Traspasa 5 p valoradas en 800: el coste que viaja es 500.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000), participaciones: P(10) },
      { fecha: '2026-02-01', tipo: 'traspaso', activo: 'a', destino: 'b', importe: E(800), participaciones: P(5) },
    ],
  });
  assert.equal(r.porActivo.a.aportadoNeto, E(500));
  assert.equal(r.porActivo.b.aportadoNeto, E(500));
  assert.equal(r.aportadoNeto, E(1000));
});

test('cartera: operación posterior a la última foto suma su flujo y avisa', () => {
  // Foto 1.000. Después aporta 200 y vende 50: valor = 1.150. Aportado = 800 + 200 − 50 = 950.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(800) },
      { fecha: '2026-02-15', tipo: 'aportacion', activo: 'a', importe: E(200) },
      { fecha: '2026-02-20', tipo: 'venta', activo: 'a', importe: E(50) },
    ],
    fotos: [{ fecha: '2026-02-01', valores: { a: E(1000) } }],
  });
  assert.equal(r.porActivo.a.valor, E(1150));
  assert.equal(r.porActivo.a.faltanValores, true);
  assert.equal(r.porActivo.a.aportadoNeto, E(950));
});

test('cartera: LECTURA, una operación del mismo día que la foto ya está dentro', () => {
  const r = o.resumenCartera({
    operaciones: [{ fecha: '2026-02-01', tipo: 'aportacion', activo: 'a', importe: E(200) }],
    fotos: [{ fecha: '2026-02-01', valores: { a: E(1000) } }],
  });
  assert.equal(r.porActivo.a.valor, E(1000));
  assert.equal(r.porActivo.a.faltanValores, false);
});

test('cartera: operación anterior a la primera foto: aviso, sin crash (§9.6)', () => {
  const r = o.resumenCartera({
    operaciones: [{ fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(800) }],
    fotos: [{ fecha: '2026-02-01', valores: { a: E(900) } }],
  });
  assert.ok(r.porActivo.a.avisos.includes('operacion-antes-de-la-primera-foto'));
  assert.equal(r.porActivo.a.plusvalia, E(100));
});

test('cartera: última foto por activo, activo sin valorar y foto a cero', () => {
  // a sale de la foto de marzo aunque la de abril no lo incluya. c vale 0 en foto: valorado, no «sin valorar».
  // b sin foto: vale lo aportado (500) y plusvalía 0. Total = 1.200 + 500 + 0.
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000) },
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'b', importe: E(500) },
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'c', importe: E(100) },
    ],
    fotos: [
      { fecha: '2026-03-01', valores: { a: E(1200) } },
      { fecha: '2026-04-01', valores: { c: 0 } },
    ],
  });
  assert.equal(r.porActivo.a.valor, E(1200));
  assert.equal(r.porActivo.b.sinValorar, true);
  assert.equal(r.porActivo.b.valor, E(500));
  assert.equal(r.porActivo.b.plusvalia, 0);
  assert.equal(r.porActivo.c.sinValorar, false);
  assert.equal(r.porActivo.c.valor, 0);
  assert.equal(r.porActivo.c.plusvalia, E(-100));
  assert.equal(r.valor, E(1700));
});

test('cartera: plusvalía negativa, impuesto 0', () => {
  const r = o.resumenCartera({
    operaciones: [{ fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000) }],
    fotos: [{ fecha: '2026-02-01', valores: { a: E(700) } }],
  });
  assert.equal(r.plusvalia, E(-300));
  assert.equal(r.impuesto, 0);
});

test('cartera: LECTURA, dividendo y comisión no tocan el aportado ni el valor', () => {
  const r = o.resumenCartera({
    operaciones: [
      { fecha: '2026-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000) },
      { fecha: '2026-03-01', tipo: 'dividendo', activo: 'a', importe: E(12.4) },
      { fecha: '2026-03-02', tipo: 'comision', activo: 'a', importe: E(-2) },
    ],
    fotos: [{ fecha: '2026-02-01', valores: { a: E(1100) } }],
  });
  assert.equal(r.porActivo.a.aportadoNeto, E(1000));
  assert.equal(r.porActivo.a.valor, E(1100));
  assert.equal(r.porActivo.a.faltanValores, false);
});

// ───────────── TWR ─────────────

test('TWR: sin flujos, 365 días: 1.000 → 1.100 = 10 %', () => {
  const r = o.twrDietz([
    { fecha: '2025-01-01', valor: E(1000) },
    { fecha: '2026-01-01', valor: E(1100) },
  ]);
  cerca(r.twr, 0.1);
  cerca(r.twrAnualizado, 0.1);
  assert.equal(r.aprox, true);
});

test('TWR: Dietz modificado con un flujo a mitad', () => {
  // T = 30, flujo +100 el día 15: w = 15/30 = 0,5.
  // R = (1.210 − 1.000 − 100) / (1.000 + 0,5 × 100) = 110 / 1.050.
  const r = o.twrDietz(
    [
      { fecha: '2026-01-01', valor: E(1000) },
      { fecha: '2026-01-31', valor: E(1210) },
    ],
    [{ fecha: '2026-01-16', importe: E(100) }],
  );
  cerca(r.twr, 110 / 1050);
});

test('TWR: flujo de salida, peso 2/3', () => {
  // T = 30, −300 el día 10: w = 20/30. R = (800 − 1.000 + 300) / (1.000 − 200) = 100/800 = 12,5 %.
  const r = o.twrDietz(
    [
      { fecha: '2026-04-01', valor: E(1000) },
      { fecha: '2026-05-01', valor: E(800) },
    ],
    [{ fecha: '2026-04-11', importe: E(-300) }],
  );
  cerca(r.twr, 0.125);
});

test('TWR: encadenado', () => {
  // 1.000 → 1.100: R1 = 0,1. 1.100 → 1.300 con +100 el último día (w = 0): R2 = 100/1.100.
  // (1,1 × (1 + 1/11)) − 1 = 1,1 × 12/11 − 1 = 0,2.
  const r = o.twrDietz(
    [
      { fecha: '2026-01-01', valor: E(1000) },
      { fecha: '2026-02-01', valor: E(1100) },
      { fecha: '2026-03-01', valor: E(1300) },
    ],
    [{ fecha: '2026-03-01', importe: E(100) }],
  );
  cerca(r.twr, 0.2);
  assert.equal(r.periodos.length, 2);
});

test('TWR: el flujo del día de la foto inicial no cuenta en ese periodo; el previo avisa', () => {
  // +500 el día de la primera foto y +7 antes: ambos fuera. R = 100/1.000.
  const r = o.twrDietz(
    [
      { fecha: '2026-01-10', valor: E(1000) },
      { fecha: '2026-02-10', valor: E(1100) },
    ],
    [
      { fecha: '2026-01-10', importe: E(500) },
      { fecha: '2026-01-01', importe: E(7) },
    ],
  );
  cerca(r.twr, 0.1);
  assert.deepEqual(r.avisos, ['flujo-antes-de-la-primera-foto']);
});

test('TWR: marca aprox. y no concluyente', () => {
  assert.equal(o.twrDietz([{ fecha: '2026-01-01', valor: 100 }]).estado, o.NO_CONCLUYENTE);
  assert.equal(o.twrDietz([{ fecha: '2026-01-01', valor: 100 }]).aprox, true);
  // 13 fotos mensuales: claramente no son «pocas».
  const muchas = [];
  for (let i = 1; i <= 12; i++) muchas.push({ fecha: `2025-${String(i).padStart(2, '0')}-01`, valor: 100 });
  muchas.push({ fecha: '2026-01-01', valor: 100 });
  assert.equal(o.twrDietz(muchas).aprox, false);
  // V0 = 0 y entra todo el último día: denominador 0.
  const r = o.twrDietz(
    [
      { fecha: '2026-01-01', valor: 0 },
      { fecha: '2026-02-01', valor: 100 },
    ],
    [{ fecha: '2026-02-01', importe: 100 }],
  );
  assert.equal(r.estado, o.NO_CONCLUYENTE);
});

test('TWR = TIR sin flujos intermedios, también con años ≠ 365 días y varias fotos', () => {
  // 2 años (730 días): 1.000 → 1.210 → ambos 10 % anual (1,21^(1/2) = 1,1).
  const a = o.twrDietz([
    { fecha: '2025-01-01', valor: E(1000) },
    { fecha: '2027-01-01', valor: E(1210) },
  ]);
  const b = o.xirr([
    { fecha: '2025-01-01', importe: E(-1000) },
    { fecha: '2027-01-01', importe: E(1210) },
  ]);
  cerca(a.twrAnualizado, 0.1);
  cerca(b.tasa, 0.1, 1e-7);
  // 45 días con foto intermedia: la cadena es V2/V0 = 1,05, anualizado 1,05^(365/45) − 1.
  const esperado = Math.pow(1.05, 365 / 45) - 1;
  const c = o.twrDietz([
    { fecha: '2026-01-01', valor: 100000 },
    { fecha: '2026-01-20', valor: 90000 },
    { fecha: '2026-02-15', valor: 105000 },
  ]);
  const d = o.xirr([
    { fecha: '2026-01-01', importe: -100000 },
    { fecha: '2026-02-15', importe: 105000 },
  ]);
  cerca(c.twrAnualizado, esperado);
  cerca(d.tasa, esperado, 1e-6);
});

// ───────────── XIRR ─────────────

test('XIRR: un año y dos años exactos', () => {
  // −1.000 y +1.100 a 365 días: 10 %.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: E(-1000) },
    { fecha: '2026-01-01', importe: E(1100) },
  ]);
  assert.equal(r.estado, 'ok');
  cerca(r.tasa, 0.1, 1e-7);
  // −1.000 en 2024-01-01, +1.100 en 2025-01-01: 366 días (bisiesto): 1,1^(365/366) − 1.
  const b = o.xirr([
    { fecha: '2024-01-01', importe: E(-1000) },
    { fecha: '2025-01-01', importe: E(1100) },
  ]);
  cerca(b.tasa, Math.pow(1.1, 365 / 366) - 1, 1e-7);
});

test('XIRR: dos aportaciones', () => {
  // 1.000 × 1,1² + 1.000 × 1,1 = 1.210 + 1.100 = 2.310: 10 %.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: E(-1000) },
    { fecha: '2026-01-01', importe: E(-1000) },
    { fecha: '2027-01-01', importe: E(2310) },
  ]);
  cerca(r.tasa, 0.1, 1e-7);
});

test('XIRR: rentabilidad cero y negativa', () => {
  cerca(
    o.xirr([
      { fecha: '2025-01-01', importe: -1000 },
      { fecha: '2026-01-01', importe: 1000 },
    ]).tasa,
    0,
    1e-7,
  );
  // −1.000 → +500 a un año: −50 %.
  cerca(
    o.xirr([
      { fecha: '2025-01-01', importe: -1000 },
      { fecha: '2026-01-01', importe: 500 },
    ]).tasa,
    -0.5,
    1e-7,
  );
});

test('XIRR: Newton se sale y la bisección de respaldo acierta, dentro de 1e-7', () => {
  // f(x) = −100 + 5/x, raíz x = 0,05 → r = −95 %.
  // Newton en x = 1,1: f = −95,45, f' = −4,13, salto a x ≈ −22: fuera de dominio → bisección.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: -100 },
    { fecha: '2026-01-01', importe: 5 },
  ]);
  assert.equal(r.metodo, 'biseccion');
  cerca(r.tasa, -0.95, 1e-7);
});

test('XIRR: Newton converge en un caso normal, dentro de 1e-7', () => {
  const r = o.xirr([
    { fecha: '2025-01-01', importe: -1000 },
    { fecha: '2026-01-01', importe: 1150 },
  ]);
  assert.equal(r.metodo, 'newton');
  cerca(r.tasa, 0.15, 1e-7);
});

test('XIRR: varias soluciones → no concluyente (§9.7)', () => {
  // −100x² + 230x − 132 = 0: x = (230 ± √(52.900 − 52.800)) / 200 = (230 ± 10)/200 = 1,1 y 1,2.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: -100 },
    { fecha: '2026-01-01', importe: 230 },
    { fecha: '2027-01-01', importe: -132 },
  ]);
  assert.equal(r.estado, o.NO_CONCLUYENTE);
  assert.equal(r.motivo, 'varias soluciones');
});

test('XIRR: signos mezclados sin solución → no concluyente', () => {
  // −100x² + 230x − 150: discriminante 52.900 − 60.000 < 0. Siempre negativo.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: -100 },
    { fecha: '2026-01-01', importe: 230 },
    { fecha: '2027-01-01', importe: -150 },
  ]);
  assert.equal(r.estado, o.NO_CONCLUYENTE);
  assert.equal(r.motivo, 'sin solución');
});

test('XIRR: mismo signo → no concluyente', () => {
  const neg = o.xirr([
    { fecha: '2025-01-01', importe: -100 },
    { fecha: '2026-01-01', importe: -100 },
  ]);
  const pos = o.xirr([
    { fecha: '2025-01-01', importe: 100 },
    { fecha: '2026-01-01', importe: 100 },
  ]);
  assert.equal(neg.estado, o.NO_CONCLUYENTE);
  assert.equal(pos.estado, o.NO_CONCLUYENTE);
});

test('XIRR: flujos el mismo día se agrupan', () => {
  // −500 y −500 el mismo día equivalen a −1.000: 10 %.
  const r = o.xirr([
    { fecha: '2025-01-01', importe: -500 },
    { fecha: '2025-01-01', importe: -500 },
    { fecha: '2026-01-01', importe: 1100 },
  ]);
  cerca(r.tasa, 0.1, 1e-7);
});

test('XIRR: un solo día, lista vacía y flujos que se anulan → no concluyente', () => {
  const dia = o.xirr([
    { fecha: '2025-01-01', importe: -1000 },
    { fecha: '2025-01-01', importe: 1100 },
  ]);
  assert.equal(dia.estado, o.NO_CONCLUYENTE);
  assert.equal(o.xirr([]).estado, o.NO_CONCLUYENTE);
  // El primer día se anula: queda un único flujo.
  const anulado = o.xirr([
    { fecha: '2025-01-01', importe: -1000 },
    { fecha: '2025-01-01', importe: 1000 },
    { fecha: '2026-01-01', importe: 100 },
  ]);
  assert.equal(anulado.estado, o.NO_CONCLUYENTE);
});

test('XIRR desde operaciones: venta y dividendo son positivos, el traspaso no cuenta', () => {
  // −1.000 el 2025-01-01; +100 de dividendo y +1.000 de valor final un año después: 1.100 → 10 %.
  const flujos = o.flujosParaXirr(
    [
      { fecha: '2025-01-01', tipo: 'aportacion', activo: 'a', importe: E(1000) },
      { fecha: '2026-01-01', tipo: 'dividendo', activo: 'a', importe: E(100) },
      { fecha: '2025-06-01', tipo: 'traspaso', activo: 'a', destino: 'b', importe: E(400) },
    ],
    '2026-01-01',
    E(1000),
  );
  cerca(o.xirr(flujos).tasa, 0.1, 1e-7);
});

// ───────────── Comparativa e índice propio ─────────────

const SERIE = { '2026-01': 100, '2026-02': 110, '2026-03': 121 };

test('comparativa: cada flujo compra al cierre de su mes', () => {
  // 100 € a 100 = 1 u; 110 € a 110 = 1 u; 2 u × 121 = 242 €.
  const r = o.comparativaMismasAportaciones(
    [
      { fecha: '2026-01-15', importe: E(100) },
      { fecha: '2026-02-03', importe: E(110) },
    ],
    SERIE,
  );
  cerca(r.unidades, 2 * 100, 1e-9); // unidades en céntimos/nivel: 10.000/100 + 11.000/110
  assert.equal(r.valorFinal, E(242));
});

test('comparativa: una venta resta unidades; el mes de la serie es natural', () => {
  // +100 € → 1 u; −55 € a 110 → −0,5 u; 0,5 × 121 = 60,50 €.
  const r = o.comparativaMismasAportaciones(
    [
      { fecha: '2026-01-31', importe: E(100) },
      { fecha: '2026-02-01', importe: E(-55) },
    ],
    SERIE,
  );
  assert.equal(r.valorFinal, E(60.5));
});

test('comparativa: mes sin datos → no concluyente, serie vacía igual', () => {
  const r = o.comparativaMismasAportaciones([{ fecha: '2025-12-01', importe: 100 }], SERIE);
  assert.equal(r.estado, o.NO_CONCLUYENTE);
  assert.deepEqual(r.faltan, ['2025-12']);
  assert.equal(o.comparativaMismasAportaciones([], {}).estado, o.NO_CONCLUYENTE);
});

test('índice propio: mezcla por objetivo y mapa clase → índice', () => {
  // 25 + 25 en el mismo índice X y 50 en Y. Mes 2: X +10 %, Y −10 %: r = 0,5×0,1 − 0,5×0,1 = 0 → 100.
  // Mes 3: X +20 %, Y +0 %: r = 0,10 → 110. LECTURA: rebalanceo mensual.
  const r = o.indicePropio({
    objetivo: { a1: 2500, a2: 2500, b: 5000 },
    activos: { a1: { clase: 'rvd' }, a2: { clase: 'rvd' }, b: { clase: 'rf' } },
    clases: { rvd: { indice: 'X' }, rf: { indice: 'Y' } },
    series: {
      X: { '2026-01': 100, '2026-02': 110, '2026-03': 132 },
      Y: { '2026-01': 100, '2026-02': 90, '2026-03': 90 },
    },
  });
  assert.deepEqual(r.pesos, { X: 5000, Y: 5000 });
  assert.deepEqual(r.meses, ['2026-01', '2026-02', '2026-03']);
  cerca(r.niveles[0], 100);
  cerca(r.niveles[1], 100);
  cerca(r.niveles[2], 110);
});

test('índice propio: objetivo que no suma 100 o clase sin índice → no concluyente', () => {
  const base = {
    activos: { a: { clase: 'x' } },
    clases: { x: { indice: 'X' } },
    series: { X: { '2026-01': 1 } },
  };
  assert.equal(o.indicePropio({ ...base, objetivo: { a: 9000 } }).estado, o.NO_CONCLUYENTE);
  assert.equal(o.indicePropio({ ...base, objetivo: { z: 10000 } }).estado, o.NO_CONCLUYENTE);
});

// ───────────── Reparto ─────────────

test('reparto: un activo con déficit se lo lleva todo', () => {
  // T = 7.000 + 3.000 + 1.000 = 11.000. a: 6.600 − 7.000 < 0 → 0. b: 4.400 − 3.000 = 1.400. A = 1.000.
  const r = o.repartoAportacion({
    aportacion: E(1000),
    activos: [
      { id: 'a', valor: E(7000), objetivoPb: 6000 },
      { id: 'b', valor: E(3000), objetivoPb: 4000 },
    ],
  });
  assert.deepEqual(r.reparto, { a: 0, b: E(1000) });
  assert.deepEqual(r.deficits, { a: 0, b: E(1400) });
});

test('reparto: proporcional a los déficits y redondeo a 10 €', () => {
  // T = 3.000. a: 1.500 − 1.000 = 500. b: 900 − 1.000 → 0. c: 600 − 0 = 600. Σ = 1.100.
  // a = 1.000 × 500/1.100 = 454,5… → 450. c = 545,4… → 550. Suma 1.000; resto 0.
  const r = o.repartoAportacion({
    aportacion: E(1000),
    activos: [
      { id: 'a', valor: E(1000), objetivoPb: 5000 },
      { id: 'b', valor: E(1000), objetivoPb: 3000 },
      { id: 'c', valor: 0, objetivoPb: 2000 },
    ],
  });
  assert.deepEqual(r.reparto, { a: E(450), b: 0, c: E(550) });
});

test('reparto: el resto positivo va al de mayor déficit', () => {
  // Cartera vacía, A = 100, objetivos 33,33 / 33,33 / 33,34: 33,33 → 30 cada uno; sobran 10 para c.
  const r = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 3333 },
      { id: 'b', valor: 0, objetivoPb: 3333 },
      { id: 'c', valor: 0, objetivoPb: 3334 },
    ],
  });
  assert.deepEqual(r.reparto, { a: E(30), b: E(30), c: E(40) });
});

test('reparto: mitad al par al redondear a 10 € (15 → 20, 25 → 20)', () => {
  // 25/25/50, A = 100: 25 → 2,5 u → 2 (par) = 20. Suma 90; el resto (10) a c: 60.
  const r1 = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 2500 },
      { id: 'b', valor: 0, objetivoPb: 2500 },
      { id: 'c', valor: 0, objetivoPb: 5000 },
    ],
  });
  assert.deepEqual(r1.reparto, { a: E(20), b: E(20), c: E(60) });
  // 15/15/70: 15 → 1,5 u → 2 (par) = 20. Suma 110; resto −10 sale de c: 60. LECTURA: resto negativo.
  const r2 = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 1500 },
      { id: 'b', valor: 0, objetivoPb: 1500 },
      { id: 'c', valor: 0, objetivoPb: 7000 },
    ],
  });
  assert.deepEqual(r2.reparto, { a: E(20), b: E(20), c: E(60) });
});

test('reparto: el resto negativo nunca deja a nadie por debajo de 0', () => {
  // Cinco iguales al 20 %, A = 75: 15 → 20 cada uno, suma 100; hay que quitar 25.
  // Empate: del primero (a: 20 → 0) y 5 del segundo (b: 15). Total 75 y nadie en negativo.
  const entrada = {
    aportacion: E(75),
    activos: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, valor: 0, objetivoPb: 2000 })),
  };
  const r = o.repartoAportacion(entrada);
  assert.deepEqual(r.reparto, { a: 0, b: E(15), c: E(20), d: E(20), e: E(20) });
  assert.deepEqual(o.comprobarReparto(r.reparto, entrada), []);
});

test('reparto: todo en objetivo reparte por pesos', () => {
  // 600/400 al 60/40, A = 100: T = 1.100; déficits 60 y 40, que son justo los pesos.
  const r = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: E(600), objetivoPb: 6000 },
      { id: 'b', valor: E(400), objetivoPb: 4000 },
    ],
  });
  assert.deepEqual(r.reparto, { a: E(60), b: E(40) });
});

test('reparto: aportación 0 reparte 0', () => {
  const r = o.repartoAportacion({
    aportacion: 0,
    activos: [
      { id: 'a', valor: E(600), objetivoPb: 6000 },
      { id: 'b', valor: E(400), objetivoPb: 4000 },
    ],
  });
  assert.deepEqual(r.reparto, { a: 0, b: 0 });
});

test('reparto: aportación menor que el redondeo: va entera al de mayor déficit', () => {
  // A = 5 €: 3 → 0, 2 → 0. Resto 5 → a (déficit 3 > 2). Σ = 5.
  const entrada = {
    aportacion: E(5),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 6000 },
      { id: 'b', valor: 0, objetivoPb: 4000 },
    ],
  };
  const r = o.repartoAportacion(entrada);
  assert.deepEqual(r.reparto, { a: E(5), b: 0 });
  assert.deepEqual(o.comprobarReparto(r.reparto, entrada), []);
});

test('reparto: redondeo configurable', () => {
  // Redondeo 1 €: 33,33 → 33 cada uno y resto 1 → c. Redondeo 50 €: 25 → 0,5 u → 0 (par); 50 → 1 u = 50; resto 50 → c = 100.
  const tres = {
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 3333 },
      { id: 'b', valor: 0, objetivoPb: 3333 },
      { id: 'c', valor: 0, objetivoPb: 3334 },
    ],
  };
  assert.deepEqual(o.repartoAportacion({ ...tres, redondeo: 100 }).reparto, { a: E(33), b: E(33), c: E(34) });
  const r = o.repartoAportacion({
    aportacion: E(100),
    redondeo: E(50),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 2500 },
      { id: 'b', valor: 0, objetivoPb: 2500 },
      { id: 'c', valor: 0, objetivoPb: 5000 },
    ],
  });
  assert.deepEqual(r.reparto, { a: 0, b: 0, c: E(100) });
});

test('reparto: mínimo por fondo. LECTURA: lo que no llega pasa a 0 y va al de mayor déficit', () => {
  // 90/10, A = 100: a = 90, b = 10 (< mínimo 50) → b = 0 y a = 100.
  const entrada = {
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 9000 },
      { id: 'b', valor: 0, objetivoPb: 1000, minimo: E(50) },
    ],
  };
  const r = o.repartoAportacion(entrada);
  assert.deepEqual(r.reparto, { a: E(100), b: 0 });
  assert.deepEqual(r.avisos, ['minimo:b']);
  assert.deepEqual(o.comprobarReparto(r.reparto, entrada), []);
  // Si llega al mínimo, no pasa nada: 50/50, A = 100, mínimo 50 → 50 y 50.
  const r2 = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 5000, minimo: E(50) },
      { id: 'b', valor: 0, objetivoPb: 5000, minimo: E(50) },
    ],
  });
  assert.deepEqual(r2.reparto, { a: E(50), b: E(50) });
});

test('reparto: objetivos que no suman 100 no calculan (FORMATOS)', () => {
  const r = o.repartoAportacion({
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 5000 },
      { id: 'b', valor: 0, objetivoPb: 4000 },
    ],
  });
  assert.equal(r.estado, 'no calcula');
  const r2 = o.repartoAportacion({
    aportacion: E(100),
    activos: [{ id: 'a', valor: 0, objetivoPb: 10001 }],
  });
  assert.equal(r2.estado, 'no calcula');
});

test('reparto: comprobarReparto detecta violaciones', () => {
  const entrada = {
    aportacion: E(100),
    activos: [
      { id: 'a', valor: 0, objetivoPb: 5000 },
      { id: 'b', valor: 0, objetivoPb: 5000, minimo: E(50) },
    ],
  };
  assert.deepEqual(o.comprobarReparto({ a: E(50), b: E(50) }, entrada), []);
  assert.equal(o.comprobarReparto({ a: E(50), b: E(40) }, entrada).length, 2); // suma y mínimo
  assert.ok(o.comprobarReparto({ a: E(110), b: E(-10) }, entrada).includes('negativo:b'));
});

// ───────────── Percentiles y PRNG ─────────────

test('percentil: interpolación lineal', () => {
  // [1..5]: posición = p/100 × 4. p50 = 3; p25 = 2; p5 = 1 + 0,2 = 1,2; p95 = 4 + 0,8 = 4,8.
  const l = [1, 2, 3, 4, 5];
  assert.equal(o.percentil(l, 50), 3);
  assert.equal(o.percentil(l, 25), 2);
  cerca(o.percentil(l, 5), 1.2);
  cerca(o.percentil(l, 95), 4.8);
  assert.equal(o.percentil([7], 90), 7);
  assert.equal(o.percentil([], 90), null);
});

test('mulberry32: determinista y en [0, 1)', () => {
  const a = o.mulberry32(42);
  const b = o.mulberry32(42);
  const c = o.mulberry32(43);
  let distintos = 0;
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
    if (x !== c()) distintos++;
  }
  assert.ok(distintos > 990);
});

// ───────────── Proyección y libertad ─────────────

const planos = (r, n = 24) => new Array(n).fill(r);
const ondulada = (n) => {
  // Serie sintética determinista: entre −4 % y +6 %.
  const s = [];
  for (let i = 0; i < n; i++) s.push(0.01 + 0.05 * Math.sin(i * 0.7) * Math.cos(i * 0.13));
  return s;
};

test('proyección: rentabilidad 0: exacta con cualquier semilla (valor + aportaciones)', () => {
  // 1.000 + 100 × 12 × año: 2.200, 3.400, 4.600.
  const r = o.proyeccion({ rentMensuales: planos(0), valorInicial: E(1000), aportacionMensual: E(100), anos: 3, real: false, caminos: 50 });
  assert.deepEqual(r.anos, [1, 2, 3]);
  assert.deepEqual(r.p50, [E(2200), E(3400), E(4600)]);
  assert.deepEqual(r.p10, r.p50);
  assert.deepEqual(r.p90, r.p50);
});

test('proyección: serie plana sin aportación: fórmula cerrada, sin depender del azar', () => {
  // 1.000 × 1,01^12 = 1.126,825… ; × 1,01^24 = 1.269,734…
  const r = o.proyeccion({ rentMensuales: planos(0.01), valorInicial: E(1000), anos: 2, real: false, caminos: 50 });
  assert.equal(r.p50[0], o.redondearMitadPar(100000 * Math.pow(1.01, 12)));
  assert.equal(r.p50[1], o.redondearMitadPar(100000 * Math.pow(1.01, 24)));
  assert.equal(r.p50[0], 112683);
  assert.equal(r.p50[1], 126973);
});

test('proyección: real descuenta el IPC; nominal no', () => {
  // Rentabilidad = IPC = 1 % al mes → real 0: siempre 1.000.
  const real = o.proyeccion({ rentMensuales: planos(0.01), ipcMensual: planos(0.01), valorInicial: E(1000), anos: 2, real: true, caminos: 20 });
  assert.deepEqual(real.p50, [E(1000), E(1000)]);
  const nominal = o.proyeccion({ rentMensuales: planos(0.01), ipcMensual: planos(0.01), valorInicial: E(1000), anos: 2, real: false, caminos: 20 });
  assert.ok(nominal.p50[1] > real.p50[1]);
  assert.equal(o.proyeccion({ rentMensuales: planos(0.01), valorInicial: E(1000), anos: 2, real: true }).estado, o.NO_CONCLUYENTE);
});

test('proyección: aportación 0 y valor 0 siempre dan 0', () => {
  const r = o.proyeccion({ rentMensuales: ondulada(60), valorInicial: 0, aportacionMensual: 0, anos: 5, real: false, caminos: 100 });
  assert.deepEqual(r.p10, [0, 0, 0, 0, 0]);
  assert.deepEqual(r.p90, [0, 0, 0, 0, 0]);
});

test('proyección: determinista con semilla, p10 ≤ p50 ≤ p90 y dispersión real', () => {
  const entrada = { rentMensuales: ondulada(120), valorInicial: E(10000), aportacionMensual: E(200), anos: 10, real: false, caminos: 500 };
  const a = o.proyeccion({ ...entrada, semilla: 7 });
  const b = o.proyeccion({ ...entrada, semilla: 7 });
  const c = o.proyeccion({ ...entrada, semilla: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.p50, c.p50);
  assert.deepEqual(o.comprobarProyeccion(a, { anos: 10 }), []);
  assert.ok(a.p10[9] < a.p90[9]);
});

test('proyección: comprobarProyeccion detecta percentiles cruzados y longitud mala', () => {
  const v = o.comprobarProyeccion({ p10: [5], p50: [4], p90: [6] }, { anos: 2 });
  assert.ok(v.includes('p10>p50:1'));
  assert.ok(v.includes('longitud:p50'));
});

test('proyección: menos de 12 meses de historia → no concluyente', () => {
  assert.equal(o.proyeccion({ rentMensuales: planos(0, 11), anos: 1, real: false }).estado, o.NO_CONCLUYENTE);
});

test('proyección manual: volatilidad 0 es exacta y el bloque de supuestos del plan se lee', () => {
  // 100 % en una clase con 12 % real y 0 de volatilidad: 1.000 × 1,12 = 1.120; × 1,12² = 1.254,40.
  // LECTURA: mensual equivalente (1,12^(1/12) − 1) y no 12 %/12.
  const r = o.proyeccion({
    modo: 'manual',
    pesos: { rv: 10000 },
    supuestos: { rv: { realPb: 1200, volPb: 0 } },
    valorInicial: E(1000),
    anos: 2,
    caminos: 20,
  });
  assert.deepEqual(r.p50, [E(1120), E(1254.4)]);
  assert.deepEqual(r.p10, r.p90);
  assert.deepEqual(o.parsearProyeccionManual('rv 5,5 · 14 | rf 1,5 · 4 | efectivo 0,5 · 0,5'), {
    rv: { realPb: 550, volPb: 1400 },
    rf: { realPb: 150, volPb: 400 },
    efectivo: { realPb: 50, volPb: 50 },
  });
});

test('proyección manual: con volatilidad hay abanico; determinista; sin supuestos, no concluyente', () => {
  const entrada = {
    modo: 'manual',
    pesos: { rv: 6000, rf: 4000 },
    supuestos: o.parsearProyeccionManual('rv 5,5 · 14 | rf 1,5 · 4'),
    valorInicial: E(10000),
    aportacionMensual: E(100),
    anos: 5,
    caminos: 300,
    semilla: 3,
  };
  const a = o.proyeccion(entrada);
  assert.deepEqual(a, o.proyeccion(entrada));
  assert.deepEqual(o.comprobarProyeccion(a, { anos: 5 }), []);
  assert.ok(a.p10[4] < a.p50[4] && a.p50[4] < a.p90[4]);
  assert.equal(o.proyeccion({ ...entrada, pesos: { oro: 10000 } }).estado, o.NO_CONCLUYENTE);
});

test('libertad: objetivo = consumo × multiplicador; supera estricto; «más de N años»', () => {
  // 12.000 × 25 = 300.000. p50: …, 300.000 (no supera), 300.000,01 (supera) → año 4.
  const r = o.libertadFinanciera({ consumo12m: E(12000), p50PorAno: [E(100000), E(299999.99), E(300000), E(300000) + 1] });
  assert.equal(r.objetivo, E(300000));
  assert.equal(r.ano, 4);
  const no = o.libertadFinanciera({ consumo12m: E(12000), p50PorAno: [E(1), E(2), E(3)] });
  assert.equal(no.ano, null);
  assert.equal(no.texto, 'más de 3 años');
  assert.equal(o.libertadFinanciera({ consumo12m: E(1000), multiplicador: 30, p50PorAno: [] }).objetivo, E(30000));
});

// ───────────── Escenarios ─────────────

test('escenarios: percentiles de las móviles a 12 meses', () => {
  // 14 niveles: L12 = 110, L13 = 120, el resto 100. Móviles: 110/100 − 1 = 0,10 y 120/100 − 1 = 0,20.
  // Posición = p/100 × 1: p5 = 0,105; p25 = 0,125; p75 = 0,175; p95 = 0,195. Mínimo 0,10.
  const niveles = new Array(12).fill(100).concat([110, 120]);
  const r = o.rangos12m(niveles);
  assert.equal(r.n, 2);
  cerca(r.pesimista[0], 0.105);
  cerca(r.pesimista[1], 0.125);
  cerca(r.base[0], 0.125);
  cerca(r.base[1], 0.175);
  cerca(r.optimista[0], 0.175);
  cerca(r.optimista[1], 0.195);
  cerca(r.peor, 0.1);
});

test('escenarios: mínimo histórico negativo, y menos de 13 meses → no concluyente', () => {
  const niveles = new Array(12).fill(100).concat([70]);
  cerca(o.rangos12m(niveles).peor, -0.3);
  assert.equal(o.rangos12m(new Array(12).fill(100)).estado, o.NO_CONCLUYENTE);
});

test('escenarios: mezcla de clases con pesos fijos', () => {
  // 50/50: mes 2: 0,5×0,10 + 0,5×0,02 = 0,06 → 106.
  const r = o.mezclarSeries({ rv: 5000, rf: 5000 }, { rv: { '2026-01': 100, '2026-02': 110 }, rf: { '2026-01': 100, '2026-02': 102 } });
  cerca(r.niveles[1], 106);
});

// ───────────── Crisis ─────────────

const SERIE_CRISIS = {
  rv: { '2008-01': 100, '2008-02': 80, '2008-03': 60, '2008-04': 75, '2008-05': 100, '2008-06': 110 },
  rf: { '2008-01': 100, '2008-02': 100, '2008-03': 100, '2008-04': 100, '2008-05': 100, '2008-06': 100 },
};

test('crisis: caída, valor en el mínimo y meses para recuperar con y sin aportar', () => {
  // Sin aportar, 1.000 × (1; 0,8; 0,6; 0,75; 1,00): caída −40 %, mínimo 600 en marzo, recupera en 4 meses (2 desde el mínimo).
  // Aportando 100 a final de mes: 900; 900 × 0,75 + 100 = 775; 775 × 1,25 + 100 = 1.068,75 ≥ 1.000 en el mes 3 (1 desde el mínimo).
  const r = o.pruebaCrisis({ pesos: { rv: 10000 }, series: SERIE_CRISIS, desde: '2008-01', hasta: '2008-03', valorInicial: E(1000), aportacionMensual: E(100) });
  cerca(r.caidaMaxima, -0.4);
  assert.equal(r.valorEnMinimo, E(600));
  assert.equal(r.mesMinimo, '2008-03');
  assert.deepEqual(r.recuperacionSinAportar, { desdeInicio: 4, desdeMinimo: 2 });
  assert.deepEqual(r.recuperacionAportando, { desdeInicio: 3, desdeMinimo: 1 });
  assert.deepEqual(r.aproximaciones, []);
});

test('crisis: pesos actuales repartidos', () => {
  // 50/50 con rf plano: mes 1: 0,5 × (−20 %) = −10 % → 900. Mes 2: rv −25 % → r = −12,5 % → 787,50.
  // Caída = 787,5/1.000 − 1 = −21,25 %.
  const r = o.pruebaCrisis({ pesos: { rv: 5000, rf: 5000 }, series: SERIE_CRISIS, desde: '2008-01', hasta: '2008-03', valorInicial: E(1000) });
  cerca(r.caidaMaxima, -0.2125);
  assert.equal(r.valorEnMinimo, E(787.5));
});

test('crisis: no recupera dentro de los datos → null', () => {
  const series = { rv: { '2008-01': 100, '2008-02': 80, '2008-03': 90 } };
  const r = o.pruebaCrisis({ pesos: { rv: 10000 }, series, desde: '2008-01', hasta: '2008-02', valorInicial: E(1000) });
  assert.deepEqual(r.recuperacionSinAportar, { desdeInicio: null, desdeMinimo: null });
});

test('crisis: sin caída, recuperar en 0 meses', () => {
  const series = { rv: { '2008-01': 100, '2008-02': 110, '2008-03': 120 } };
  const r = o.pruebaCrisis({ pesos: { rv: 10000 }, series, desde: '2008-01', hasta: '2008-03', valorInicial: E(1000) });
  assert.equal(r.caidaMaxima, 0);
  assert.equal(r.valorEnMinimo, E(1000));
  assert.deepEqual(r.recuperacionSinAportar, { desdeInicio: 0, desdeMinimo: 0 });
});

test('crisis: clase sin datos → aproximación con la parecida, indicada; sin parecida, no concluyente', () => {
  // emergentes sin datos en 2008: usa rv: −40 %.
  const r = o.pruebaCrisis({
    pesos: { emergentes: 10000 },
    series: SERIE_CRISIS,
    desde: '2008-01',
    hasta: '2008-03',
    valorInicial: E(1000),
    parecida: { emergentes: 'rv' },
  });
  cerca(r.caidaMaxima, -0.4);
  assert.deepEqual(r.aproximaciones, [{ clase: 'emergentes', con: 'rv' }]);
  const no = o.pruebaCrisis({ pesos: { emergentes: 10000 }, series: SERIE_CRISIS, desde: '2008-01', hasta: '2008-03', valorInicial: E(1000) });
  assert.equal(no.estado, o.NO_CONCLUYENTE);
  // Clase con el periodo a medias: también necesita aproximación. Ciclos de «parecida» no cuelgan.
  const ciclo = o.pruebaCrisis({
    pesos: { x: 10000 },
    series: { x: { '2008-01': 1 } },
    desde: '2008-01',
    hasta: '2008-03',
    valorInicial: 100,
    parecida: { x: 'y', y: 'x' },
  });
  assert.equal(ciclo.estado, o.NO_CONCLUYENTE);
});

// ───────────── Herramientas ─────────────

test('IPC personal: pesos de consumo, sin mapear excluidos y avisados', () => {
  // (1.000 × 200 + 3.000 × 400) / 4.000 = 350 pb. Frente a 300 pb de general: +50. «otros» fuera.
  const r = o.ipcPersonal({
    consumo12mPorGrupo: { ocio: E(1000), vivienda: E(3000), otros: E(500) },
    mapaIpc: { ocio: 'ocio-cultura', vivienda: 'vivienda' },
    tasasPb: { 'ocio-cultura': 200, vivienda: 400 },
    generalPb: 300,
  });
  assert.equal(r.personalPb, 350);
  assert.equal(r.diferenciaPb, 50);
  assert.deepEqual(r.sinMapear, ['otros']);
});

test('IPC personal: dos grupos en un componente; componente sin tasa; nada mapeado', () => {
  // (100 + 300) × 200 / 400 = 200 pb. c tiene componente pero no tasa: se excluye y avisa.
  const r = o.ipcPersonal({
    consumo12mPorGrupo: { a: 100, b: 300, c: 999 },
    mapaIpc: { a: 'x', b: 'x', c: 'z' },
    tasasPb: { x: 200 },
    generalPb: 200,
  });
  assert.equal(r.personalPb, 200);
  assert.deepEqual(r.sinMapear, ['c']);
  assert.equal(o.ipcPersonal({ consumo12mPorGrupo: { a: 1 }, mapaIpc: {}, tasasPb: {}, generalPb: 0 }).estado, o.NO_CONCLUYENTE);
});

test('oportunidad: gasto puntual y días de libertad', () => {
  // 1.000 × 1,1² = 1.210. Consumo anual 36.500 → 100 €/día → 12,1 días.
  const r = o.costeOportunidad({ importe: E(1000), rPb: 1000, anos: 2, consumoAnual: E(36500) });
  assert.equal(r.valorFuturo, E(1210));
  cerca(r.diasLibertad, 12.1);
});

test('oportunidad: gasto mensual', () => {
  // r = 0: 100 × 24 = 2.400. Con consumo anual 0, sin días.
  const r = o.costeOportunidad({ importe: E(100), periodicidad: 'mensual', rPb: 0, anos: 2, consumoAnual: 0 });
  assert.equal(r.valorFuturo, E(2400));
  assert.equal(r.diasLibertad, null);
  // LECTURA: tasa mensual equivalente y final de mes. i = 1,1^(1/12) − 1 = 0,00797414042; VF = 100 × 0,1 / i = 100 × 12,5405366 = 1.254,05.
  const s = o.costeOportunidad({ importe: E(100), periodicidad: 'mensual', rPb: 1000, anos: 1, consumoAnual: E(36500) });
  assert.equal(s.valorFuturo, 125405);
});

test('comparador de fondos: bruta − TER, diferencia final y curva', () => {
  // 7 % bruto: TER 0 → 10.000 × 1,07² = 11.449. TER 2 % → neta 5 % → 10.000 × 1,05² = 11.025. Diferencia 424.
  const r = o.comparadorFondos({ inicial: E(10000), anos: 2, brutaPb: 700, fondos: [{ id: 'barato', terPb: 0 }, { id: 'caro', terPb: 200 }] });
  assert.equal(r.finales.barato, E(11449));
  assert.equal(r.finales.caro, E(11025));
  assert.equal(r.diferenciaFinal, E(424));
  assert.equal(r.curvas.caro.length, 24);
  assert.equal(r.curvas.barato[11], E(10700)); // final del primer año
});

test('comparador de fondos: neta 0 con aportación mensual', () => {
  // Bruta = TER → neta 0: 1.000 + 100 × 12 = 2.200.
  const r = o.comparadorFondos({ inicial: E(1000), mensual: E(100), anos: 1, brutaPb: 150, fondos: [{ id: 'a', terPb: 150 }] });
  assert.equal(r.finales.a, E(2200));
  assert.equal(r.diferenciaFinal, 0);
});

test('vida: modificadores combinados. LECTURA: la aportación absorbe los cambios', () => {
  // Aportación = 600 + 200 − 100 = 700; ingresos 3.200; consumo 2.100.
  // Tasa a 12 meses con 3 de pausa: 700 × 9 / (3.200 × 12) = 6.300 / 38.400 = 0,1640625.
  // Libertad: 2.100 × 12 × 25 = 630.000. Meta: (3.000 + 1.000) / 700 = 5,71 → 6 + 3 de pausa = 9.
  const base = { ingresosMensuales: E(3000), consumoMensual: E(2000), aportacionMensual: E(600), meta: { faltan: E(3000) } };
  const mods = [
    { tipo: 'pausa', meses: 3 },
    { tipo: 'ingresos', delta: E(200) },
    { tipo: 'gasto', delta: E(100) },
    { tipo: 'puntual', importe: E(1000) },
  ];
  const r = o.escenarioVida(base, mods);
  assert.equal(r.aportacion, E(700));
  cerca(r.tasaAhorro, 0.1640625);
  assert.equal(r.libertadObjetivo, E(630000));
  assert.equal(r.metaMeses, 9);
  assert.deepEqual(o.escenarioVida(base, [...mods].reverse()), r); // el orden no importa
});

test('vida: sin modificadores, y aportación que se queda a cero', () => {
  const base = { ingresosMensuales: E(1000), consumoMensual: E(800), aportacionMensual: E(200), meta: { faltan: E(400) } };
  const r = o.escenarioVida(base);
  cerca(r.tasaAhorro, 0.2);
  assert.equal(r.metaMeses, 2);
  const s = o.escenarioVida(base, [{ tipo: 'gasto', delta: E(300) }]);
  assert.equal(s.aportacion, 0);
  assert.equal(s.metaMeses, null);
});

test('calculadora interés compuesto', () => {
  // 1.000 al 10 % 2 años = 1.210; intereses 210.
  const r = o.interesCompuesto({ inicial: E(1000), rPb: 1000, anos: 2 });
  assert.equal(r.valorFinal, E(1210));
  assert.equal(r.aportado, E(1000));
  assert.equal(r.intereses, E(210));
  // r = 0: 1.000 + 100 × 12 = 2.200.
  assert.equal(o.interesCompuesto({ inicial: E(1000), mensual: E(100), rPb: 0, anos: 1 }).valorFinal, E(2200));
});

test('calculadora ahorro para una meta', () => {
  // r = 0: 4.000 en 10 meses = 400; con 1.000 ya ahorrados, 300. 100 c / 8 = 12,5 → 12 (par).
  assert.equal(o.cuotaMeta({ objetivo: E(4000), meses: 10 }), E(400));
  assert.equal(o.cuotaMeta({ objetivo: E(4000), actual: E(1000), meses: 10 }), E(300));
  assert.equal(o.cuotaMeta({ objetivo: 100, meses: 8 }), 12);
  assert.equal(o.cuotaMeta({ objetivo: E(100), actual: E(200), meses: 10 }), 0);
  assert.equal(o.cuotaMeta({ objetivo: E(100), meses: 0 }), null);
  // LECTURA: inversa del VF de 100 €/mes al 10 %: 1.254,05 en 12 meses → unos 100 €.
  cerca(o.cuotaMeta({ objetivo: 125405, rPb: 1000, meses: 12 }), E(100), 1);
});

test('calculadora alquilar o comprar con r = 0', () => {
  // Sin hipoteca: precio 100.000, impuestos 10 % = 10.000. Alquiler 500 €/mes, 10 años = 60.000.
  // Comprar: vivienda 100.000 + invierte los 60.000 que no paga de alquiler = 160.000.
  // Alquilar: invierte 100.000 + 10.000 = 110.000. Diferencia 50.000. LECTURA del método.
  const r = o.alquilarOComprar({ precio: E(100000), entrada: E(100000), impuestosPb: 1000, anos: 10, alquilerMensual: E(500) });
  assert.equal(r.comprar, E(160000));
  assert.equal(r.alquilar, E(110000));
  assert.equal(r.diferencia, E(50000));
  // Hipoteca a tipo 0: 80.000 / 120 = 666,67 €/mes. El inquilino invierte 20.000 + 166,67 × 120 = 40.000. Comprar: 100.000.
  const s = o.alquilarOComprar({ precio: E(100000), entrada: E(20000), anos: 10, alquilerMensual: E(500) });
  assert.equal(s.cuotaMensual, 66667);
  assert.equal(s.comprar, E(100000));
  assert.equal(s.alquilar, E(40000));
});

test('calculadora alquilar o comprar: revalorización, gastos y cuota francesa', () => {
  // Vivienda 100.000 al 10 %, 2 años = 121.000; gastos 1.200/año y sin alquiler: el inquilino invierte 100.000 + 2.400.
  const r = o.alquilarOComprar({ precio: E(100000), entrada: E(100000), ibiAnual: E(1200), revalorizacionPb: 1000, anos: 2, alquilerMensual: 0 });
  assert.equal(r.comprar, E(121000));
  assert.equal(r.alquilar, E(102400));
  // Cuota francesa: 100.000 al 12 %/12 = 1 % mensual, 120 meses: 100.000 × 0,01 / (1 − 1,01^−120) ≈ 1.434,71.
  const s = o.alquilarOComprar({ precio: E(100000), entrada: 0, tipoPb: 1200, anos: 10, alquilerMensual: 0 });
  assert.equal(s.cuotaMensual, 143471);
});

test('radar de suscripciones: anualizado, marcadas y coste de oportunidad', () => {
  // Spotify 10,99 × 12 = 131,88. Idiomas 59,99 × 1. Revista 30 × 4 = 120. Bimestral 5 × 6 = 30 (pausada).
  // Total sin pausadas = 131,88 + 59,99 + 120 = 311,87. Ahorro: solo idiomas (uso no) = 59,99.
  // Oportunidad a r = 0, 10 años: 59,99 × 10 = 599,90.
  const r = o.radarSuscripciones(
    [
      { id: 'spotify', importe: E(-10.99), cada: 'mes', etiquetas: ['suscripción'], uso: 'sí' },
      { id: 'idiomas', importe: E(-59.99), cada: 'año', etiquetas: ['suscripción'], uso: 'no' },
      { id: 'revista', importe: E(-30), cada: 'trimestre', etiquetas: ['suscripción'], uso: 'sí' },
      { id: 'pausada', importe: E(-5), cada: 'bimestre', etiquetas: ['suscripción'], uso: 'no', pausado: true },
      { id: 'seguro', importe: E(-320), cada: 'año', etiquetas: [] },
    ],
    { rPb: 0, anos: 10 },
  );
  assert.deepEqual(r.lista.map((x) => x.id), ['spotify', 'idiomas', 'revista', 'pausada']);
  assert.equal(r.lista[0].costeAnual, 13188);
  assert.equal(r.costeAnualTotal, 31187);
  assert.equal(r.ahorroAnual, 5999);
  assert.equal(r.costeOportunidadAhorro, 59990);
});

test('radar de suscripciones: semestre y nada marcado', () => {
  const r = o.radarSuscripciones([{ id: 'x', importe: E(-50), cada: 'semestre', etiquetas: ['suscripción'], uso: 'sí' }]);
  assert.equal(r.costeAnualTotal, E(100));
  assert.equal(r.ahorroAnual, 0);
  assert.equal(r.costeOportunidadAhorro, 0);
});

// ───────────── Metas ─────────────

test('metas: por cuenta, por grupo y manual', () => {
  const datos = { saldos: { hucha: E(1000) }, sumasGrupo: { viaje: E(3000) } };
  assert.equal(o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'cuenta', id: 'hucha' } }, datos).progreso, 0.25);
  assert.equal(o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'grupo', id: 'viaje' } }, datos).progreso, 0.75);
  assert.equal(o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'manual', importe: E(2000) } }).progreso, 0.5);
  // Cuenta sin datos: 0.
  assert.equal(o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'cuenta', id: 'otra' } }, datos).actual, 0);
  // Grupo de ahorro: movimientos negativos (salen de la cuenta): −200 − 300 → 500.
  assert.equal(o.sumaGrupoMeta([{ grupo: 'v', importe: E(-200) }, { grupo: 'v', importe: E(-300) }, { grupo: 'w', importe: E(-1) }], 'v'), E(500));
});

test('metas: encuadre en 49, 50 y 51 %', () => {
  // Objetivo 4.000: 49 % = 1.960 → llevas 1.960. 51 % = 2.040 → te faltan 1.960.
  const meta = (x) => o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'manual', importe: E(x) } });
  assert.equal(meta(1960).encuadre, 'llevas');
  assert.equal(meta(1960).importeEncuadre, E(1960));
  assert.equal(meta(1960).progresoPb, 4900);
  assert.equal(meta(2040).encuadre, 'te faltan');
  assert.equal(meta(2040).importeEncuadre, E(1960));
  // LECTURA: justo el 50 % no está «por debajo»: te faltan 2.000.
  assert.equal(meta(2000).encuadre, 'te faltan');
  assert.equal(meta(2000).importeEncuadre, E(2000));
  // Un céntimo por debajo del 50 %: llevas.
  assert.equal(o.progresoMeta({ objetivo: E(4000), origen: { tipo: 'manual', importe: E(2000) - 1 } }).encuadre, 'llevas');
});

test('metas: superada: faltan 0, progreso mayor que 1', () => {
  const r = o.progresoMeta({ objetivo: E(100), origen: { tipo: 'manual', importe: E(150) } });
  assert.equal(r.faltan, 0);
  assert.equal(r.progreso, 1.5);
});

test('metas: fecha estimada con aportación fija', () => {
  // Falta 3.000 a 200/mes = 15 meses. Desde 2026-11-03: 2028-02-03.
  assert.deepEqual(o.fechaEstimadaMeta({ faltan: E(3000), aportacion: E(200), hoy: '2026-11-03' }), { estado: 'ok', meses: 15, fecha: '2028-02-03' });
  // LECTURA: 3.100/200 = 15,5 → 16 meses (techo).
  assert.equal(o.fechaEstimadaMeta({ faltan: E(3100), aportacion: E(200), hoy: '2026-11-03' }).meses, 16);
  // Día de llegada inexistente: 31-01 + 1 mes = 28-02.
  assert.equal(o.fechaEstimadaMeta({ faltan: E(100), aportacion: E(100), hoy: '2026-01-31' }).fecha, '2026-02-28');
  assert.equal(o.fechaEstimadaMeta({ faltan: 0, aportacion: 0, hoy: '2026-01-31' }).meses, 0);
  assert.equal(o.fechaEstimadaMeta({ faltan: E(100), aportacion: 0, hoy: '2026-01-31' }).estado, o.NO_CONCLUYENTE);
});

test('metas: media de 3 meses', () => {
  // (100 + 200 + 300)/3 = 200, sin contar el más antiguo. Con menos de 3: 300/3 = 100 (LECTURA).
  assert.equal(o.aportacionMedia3m([E(9999), E(100), E(200), E(300)]), E(200));
  assert.equal(o.aportacionMedia3m([E(300)]), E(100));
  // 1 + 1 + 2 = 4/3 = 1,33 → 1. Falta 400 a 200 → 2 meses.
  assert.equal(o.aportacionMedia3m([1, 1, 2]), 1);
  assert.equal(o.fechaEstimadaMeta({ faltan: E(400), aportacion: o.aportacionMedia3m([E(100), E(200), E(300)]), hoy: '2026-11-03' }).meses, 2);
});

// ───────────── Conocimiento ─────────────

const palabras = (desde, hasta) => {
  const lista = [];
  for (let i = desde; i < hasta; i++) lista.push(`w${i}`);
  return lista.join(' ');
};

test('dedup: misma URL, también lejos en fechas (LECTURA)', () => {
  const a = { url: 'https://x.es/1', titulo: 'uno', fecha: '2026-01-01' };
  const b = { url: 'https://x.es/1', titulo: 'otra cosa', fecha: '2026-06-01' };
  assert.equal(o.esDuplicado(a, b), true);
  assert.equal(o.esDuplicado(a, { ...b, url: 'https://x.es/2' }), false);
});

test('dedup: Jaccard 0,59 / 0,60 / 0,61 con títulos de 100 palabras en la unión', () => {
  // A = w0…w79 (80), B = w(80−k)…w99: intersección k; unión = 100 (80 + (100−(80−k)) − k).
  const a = { titulo: palabras(0, 80), fecha: '2026-11-03' };
  const con = (k) => ({ titulo: palabras(80 - k, 100), fecha: '2026-11-03' });
  assert.deepEqual(o.jaccardTitulos(a.titulo, con(59).titulo), { interseccion: 59, union: 100 });
  assert.equal(o.esDuplicado(a, con(59)), false);
  assert.equal(o.esDuplicado(a, con(60)), true);
  assert.equal(o.esDuplicado(a, con(61)), true);
});

test('dedup: 3/5 exacto; títulos normalizados', () => {
  // {a,b,c,d} y {a,b,c,e}: intersección 3, unión 5 → 0,6 → duplicado.
  assert.equal(o.esDuplicado({ titulo: 'a b c d', fecha: '2026-01-01' }, { titulo: 'a b c e', fecha: '2026-01-01' }), true);
  // Mayúsculas, tildes y puntuación no cuentan.
  assert.equal(o.esDuplicado({ titulo: 'El BCE baja los tipos en Japón', fecha: '2026-01-01' }, { titulo: 'el bce, baja: los TIPOS en japon!', fecha: '2026-01-01' }), true);
  // Títulos vacíos no son duplicado.
  assert.equal(o.esDuplicado({ titulo: '¿?', fecha: '2026-01-01' }, { titulo: '!!', fecha: '2026-01-01' }), false);
});

test('dedup: ventana de ±1 día', () => {
  const t = 'a b c d e';
  const f = (fecha) => ({ titulo: t, fecha });
  assert.equal(o.esDuplicado(f('2026-11-03'), f('2026-11-04')), true);
  assert.equal(o.esDuplicado(f('2026-11-04'), f('2026-11-03')), true);
  assert.equal(o.esDuplicado(f('2026-11-03'), f('2026-11-05')), false);
  assert.equal(o.esDuplicado(f('2026-10-31'), f('2026-11-01')), true); // cruza mes
  assert.equal(o.esDuplicado(f('2026-12-31'), f('2027-01-01')), true); // cruza año
  assert.equal(o.esDuplicado(f('2028-02-28'), f('2028-03-01')), false); // el 29 está entre medias
});

test('postura: media ponderada con vida media de 90 días', () => {
  const hoy = '2026-11-03';
  // Sola: alcista = 1, por vieja que sea.
  cerca(o.posturaFuente([{ fecha: '2020-01-01', postura: 'alcista' }], hoy), 1);
  // Alcista hoy (peso 1) y bajista hace 90 días (peso 0,5): (1 − 0,5) / 1,5 = 1/3.
  const hace90 = o.sumarDias(hoy, -90);
  cerca(o.posturaFuente([{ fecha: hoy, postura: 'alcista' }, { fecha: hace90, postura: 'bajista' }], hoy), 1 / 3);
  // Alcista hace 180 días (peso 0,25) y neutral hoy (peso 1): 0,25 / 1,25 = 0,2.
  cerca(o.posturaFuente([{ fecha: o.sumarDias(hoy, -180), postura: 'alcista' }, { fecha: hoy, postura: 'neutral' }], hoy), 0.2);
  // Notas sin postura no cuentan; sin ninguna, null.
  cerca(o.posturaFuente([{ fecha: hoy, postura: 'bajista' }, { fecha: hoy }], hoy), -1);
  assert.equal(o.posturaFuente([{ fecha: hoy }], hoy), null);
  assert.equal(o.posturaFuente([], hoy), null);
});

test('acierto: «—» con menos de 5 resueltas; «no medible» no cuenta', () => {
  const lista = (ok, mal, otros = []) => [
    ...new Array(ok).fill({ estado: 'acertada' }),
    ...new Array(mal).fill({ estado: 'fallida' }),
    ...otros,
  ];
  assert.equal(o.aciertoFuente(lista(4, 0)).texto, '—');
  assert.equal(o.aciertoFuente(lista(2, 2, [{ estado: 'no-medible' }, { estado: 'pendiente' }])).texto, '—');
  // 5 resueltas: 3/5 = 60 %.
  const r = o.aciertoFuente(lista(3, 2));
  assert.equal(r.resueltas, 5);
  cerca(r.pct, 60);
  assert.equal(r.texto, null);
  assert.equal(o.aciertoFuente([]).texto, '—');
});

test('selectores: los tres del plan y sus límites', () => {
  const f = { id: 'x', familia: 'yt', postura: -0.3, acierto: 65 };
  assert.equal(o.cumpleSelector('@postura<=-0,3', f), true);
  assert.equal(o.cumpleSelector('@postura<=-0,3', { ...f, postura: -0.29 }), false);
  assert.equal(o.cumpleSelector('@postura<=-0,3', { ...f, postura: -0.31 }), true);
  assert.equal(o.cumpleSelector('@postura<=−0,3', f), true); // menos tipográfico U+2212
  assert.equal(o.cumpleSelector('@familia=yt', f), true);
  assert.equal(o.cumpleSelector('@familia=web', f), false);
  assert.equal(o.cumpleSelector('@familia!=web', f), true);
  assert.equal(o.cumpleSelector('@acierto>=65', f), true);
  assert.equal(o.cumpleSelector('@acierto>=65', { ...f, acierto: 64.9 }), false);
  assert.equal(o.cumpleSelector('@acierto>65', f), false);
  assert.equal(o.cumpleSelector('@acierto<65', f), false);
  assert.equal(o.cumpleSelector('@acierto=65', f), true);
  assert.equal(o.cumpleSelector('@acierto!=65', f), false);
});

test('selectores: sin dato nunca cumplen; desconocidos son inválidos', () => {
  const sinDatos = { id: 'y', familia: 'yt', postura: null, acierto: null };
  assert.equal(o.cumpleSelector('@acierto>=65', sinDatos), false);
  assert.equal(o.cumpleSelector('@acierto<65', sinDatos), false);
  assert.equal(o.cumpleSelector('@postura<=-0,3', sinDatos), false);
  assert.equal(o.parsearSelector('@humor>3').valido, false); // ejemplo inválido de FORMATOS
  assert.equal(o.parsearSelector('@acierto>=mucho').valido, false);
  assert.equal(o.parsearSelector('@familia>yt').valido, false);
  assert.equal(o.parsearSelector('familia=yt').valido, false);
});

test('mezcla: une ids y selectores sin repetir; avisa de borradas e inválidos', () => {
  const fuentes = [
    { id: 'base', familia: 'base', postura: null, acierto: null },
    { id: 'pizarra', familia: 'yt', postura: -0.5, acierto: 70 },
    { id: 'indexado', familia: 'yt', postura: 0.2, acierto: 50 },
  ];
  const r = o.resolverMezcla(['base', '@postura<=-0,3', '@familia=yt', 'borrada', '@humor>3'], fuentes);
  assert.deepEqual(r.ids, ['base', 'pizarra', 'indexado']);
  assert.deepEqual(r.avisos, ['fuente-borrada:borrada', 'selector:@humor>3']);
});

// ───────────── Descubrimientos ─────────────

test('mapa de efectos: ▲ si ≥ 2, ▼ si ≤ −2, • en medio', () => {
  assert.equal(o.celdaMapaEfectos(['▲', '▲']), '▲'); // +2
  assert.equal(o.celdaMapaEfectos(['▲', '▲', '▲', '▼']), '▲'); // +2
  assert.equal(o.celdaMapaEfectos(['▲']), '•'); // +1
  assert.equal(o.celdaMapaEfectos(['▲', '▲', '▲', '▼', '▼']), '•'); // +1
  assert.equal(o.celdaMapaEfectos(['▲', '▼']), '•'); // 0
  assert.equal(o.celdaMapaEfectos(['•', '•', '•']), '•'); // 0
  assert.equal(o.celdaMapaEfectos([]), '•');
  assert.equal(o.celdaMapaEfectos(['▼']), '•'); // −1
  assert.equal(o.celdaMapaEfectos(['▼', '▼']), '▼'); // −2
  assert.equal(o.celdaMapaEfectos(['▲', '▼', '▼', '▼']), '▼'); // −2
  assert.equal(o.celdaMapaEfectos(['▲', '•', '▲', '•']), '▲'); // las neutras no cuentan
});

const CARTERA = [
  { id: 'a', valor: E(6000), clase: 'rv', terPb: 20, rent12m: 0.1, exposicion: { region: { USA: 70, EU: 30 } } },
  { id: 'b', valor: E(4000), clase: 'rf', terPb: 10, rent12m: 0.02, exposicion: { region: { EU: 100 } } },
];
const DESC = { clase: 'infra', terPb: 50, rent12m: 0.3, exposicion: { region: { USA: 100 } } };

test('simulador: de todo, en proporción', () => {
  // a = 0,6 × 0,9 = 0,54; b = 0,36; d = 0,10.
  // TER = 0,54×20 + 0,36×10 + 0,10×50 = 10,8 + 3,6 + 5 = 19,4 pb.
  // Último año = 0,54×10 % + 0,36×2 % + 0,10×30 % = 5,4 + 0,72 + 3 = 9,12 %.
  // USA = 0,54×70 + 0,10×100 = 47,8; EU = 0,54×30 + 0,36×100 = 52,2.
  const r = o.simularDescubrimiento({ activos: CARTERA, xPb: 1000, modo: 'todo', descubrimiento: DESC });
  cerca(r.pesos.a, 0.54);
  cerca(r.pesos.b, 0.36);
  cerca(r.pesoDescubrimiento, 0.1);
  cerca(r.pesosClase.rv, 0.54);
  cerca(r.pesosClase.infra, 0.1);
  cerca(r.terMedioPb, 19.4);
  cerca(r.siLoHubieras, 0.0912);
  cerca(r.exposicion.region.USA, 47.8);
  cerca(r.exposicion.region.EU, 52.2);
});

test('simulador: de un activo concreto', () => {
  // Sale de a: 0,6 − 0,1 = 0,5; b sigue en 0,4.
  const r = o.simularDescubrimiento({ activos: CARTERA, xPb: 1000, modo: 'activo', activoOrigen: 'a', descubrimiento: DESC });
  cerca(r.pesos.a, 0.5);
  cerca(r.pesos.b, 0.4);
  cerca(r.pesoDescubrimiento, 0.1);
  // X mayor que el peso del activo: LECTURA, se limita. b pesa 0,4; X = 50 % → d = 0,4; b = 0.
  const s = o.simularDescubrimiento({ activos: CARTERA, xPb: 5000, modo: 'activo', activoOrigen: 'b', descubrimiento: DESC });
  cerca(s.pesos.b, 0);
  cerca(s.pesoDescubrimiento, 0.4);
  assert.deepEqual(s.avisos, ['limitado-al-peso-del-activo']);
});

test('simulador: solo de nuevas aportaciones. LECTURA: X % de la aportación', () => {
  // V = 10.000, A = 1.000, X = 20 %: d = 200. Resto 800 según pesos: a +480 = 6.480, b +320 = 4.320. T = 11.000.
  const r = o.simularDescubrimiento({ activos: CARTERA, xPb: 2000, modo: 'aportaciones', aportacion: E(1000), descubrimiento: DESC });
  cerca(r.pesoDescubrimiento, 200 / 11000);
  cerca(r.pesos.a, 6480 / 11000);
  cerca(r.pesos.b, 4320 / 11000);
  // Sin aportación, los pesos no cambian.
  const s = o.simularDescubrimiento({ activos: CARTERA, xPb: 2000, modo: 'aportaciones', descubrimiento: DESC });
  cerca(s.pesoDescubrimiento, 0);
  cerca(s.pesos.a, 0.6);
});

test('simulador: límites 0 y 50 %, fuera de rango y sin cartera', () => {
  const cero = o.simularDescubrimiento({ activos: CARTERA, xPb: 0, modo: 'todo', descubrimiento: DESC });
  cerca(cero.pesos.a, 0.6);
  cerca(cero.pesoDescubrimiento, 0);
  // X = 50 %: a = 0,3; b = 0,2; d = 0,5.
  const medio = o.simularDescubrimiento({ activos: CARTERA, xPb: 5000, modo: 'todo', descubrimiento: DESC });
  cerca(medio.pesos.a, 0.3);
  cerca(medio.pesoDescubrimiento, 0.5);
  assert.equal(o.simularDescubrimiento({ activos: CARTERA, xPb: 5001, modo: 'todo', descubrimiento: DESC }).estado, 'fuera de rango');
  assert.equal(o.simularDescubrimiento({ activos: CARTERA, xPb: -1, modo: 'todo', descubrimiento: DESC }).estado, 'fuera de rango');
  assert.equal(o.simularDescubrimiento({ activos: [], xPb: 0, modo: 'todo', descubrimiento: DESC }).estado, o.NO_CONCLUYENTE);
});

test('simulador: los pesos siempre suman 1 y la entrada no cambia', () => {
  const copia = JSON.stringify(CARTERA);
  for (const entrada of [
    { modo: 'todo' },
    { modo: 'activo', activoOrigen: 'a' },
    { modo: 'aportaciones', aportacion: E(500) },
  ]) {
    const r = o.simularDescubrimiento({ activos: CARTERA, xPb: 1500, descubrimiento: DESC, ...entrada });
    cerca(r.pesos.a + r.pesos.b + r.pesoDescubrimiento, 1);
  }
  assert.equal(JSON.stringify(CARTERA), copia);
});

test('simulador: caída en cada crisis con los pesos nuevos', () => {
  // De todo al 10 %: rv 0,54 cae 50 %, rf 0,36 plano, infra 0,10 cae 20 %.
  // Caída = 0,54×(−0,5) + 0,10×(−0,2) = −0,27 − 0,02 = −0,29. Sin datos de infra en la otra crisis: no concluyente.
  const crisis = [
    {
      nombre: 'una',
      desde: '2008-01',
      hasta: '2008-02',
      series: {
        rv: { '2008-01': 100, '2008-02': 50 },
        rf: { '2008-01': 100, '2008-02': 100 },
        infra: { '2008-01': 100, '2008-02': 80 },
      },
    },
    {
      nombre: 'otra',
      desde: '2008-01',
      hasta: '2008-02',
      series: { rv: { '2008-01': 100, '2008-02': 50 }, rf: { '2008-01': 100, '2008-02': 100 } },
    },
  ];
  const r = o.simularDescubrimiento({ activos: CARTERA, xPb: 1000, modo: 'todo', descubrimiento: DESC, crisis });
  cerca(r.caidas.una, -0.29);
  assert.equal(r.caidas.otra, o.NO_CONCLUYENTE);
});
