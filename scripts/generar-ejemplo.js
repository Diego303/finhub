#!/usr/bin/env node
// Genera ejemplo/: una carpeta FINANZAS completa con datos INVENTADOS, determinista (semilla fija).
// Las series de índices son SINTÉTICAS (§7.3): no son datos reales ni tienen licencia.
// Uso: node scripts/generar-ejemplo.js [--comprobar]   (--comprobar: falla si ejemplo/ no está al día)
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { crearPrng } from '../src/core/prng.js';
import * as F from '../src/core/fechas.js';
import { idCorto } from '../src/core/ids.js';
import { FORMATOS, leer } from '../src/core/formato/index.js';
import { serializar, anadirItem, fijarCabecera, anadirBloque, fijarKv, fijarTexto } from '../src/core/formato/motor.js';

export const HOY = '2026-11-03';
const SEMILLA = 'finhub-ejemplo-v1';
const MESES_MOV = Array.from({ length: 12 }, (_, i) => F.sumarMesesMes('2025-12', i)); // 2025-12 … 2026-11
const euros = (x) => Math.round(x * 100);

// ---------------------------------------------------------------- series sintéticas
const SERIES = [
  { id: 'msci-world-nr-eur', objetivo: 4.0, nombre: 'MSCI World NR EUR (sintética)', mu: 0.0062, beta: 1, idio: 0.012, base: 100 },
  { id: 'sp500-eur', objetivo: 5.0, nombre: 'S&P 500 EUR (sintética)', mu: 0.007, beta: 1.05, idio: 0.014, base: 100 },
  { id: 'nasdaq-100-eur', objetivo: 7.5, nombre: 'Nasdaq 100 EUR (sintética)', mu: 0.0092, beta: 1.35, idio: 0.025, base: 100 },
  { id: 'msci-em-nr-eur', objetivo: 2.6, nombre: 'MSCI Emerging Markets NR EUR (sintética)', mu: 0.0052, beta: 1.1, idio: 0.03, base: 100 },
  { id: 'msci-world-small-eur', objetivo: 3.6, nombre: 'MSCI World Small Cap EUR (sintética)', mu: 0.0058, beta: 1.15, idio: 0.02, base: 100 },
  { id: 'rf-euro-agregada', objetivo: 1.75, nombre: 'Renta fija euro agregada (sintética)', mu: 0.0021, beta: 0.05, idio: 0.009, base: 100 },
];
// Episodios de crisis: caída total repartida entre esos meses (por factor de mercado y de renta fija).
const CRISIS = [
  { desde: '2000-09', hasta: '2003-02', rv: -0.48, rf: 0.12, tec: -0.75 },
  { desde: '2008-06', hasta: '2009-02', rv: -0.45, rf: 0.04 },
  { desde: '2020-02', hasta: '2020-03', rv: -0.26, rf: -0.02 },
  { desde: '2022-01', hasta: '2022-09', rv: -0.2, rf: -0.16, tec: -0.32 },
];
const PRIMER_MES_SERIE = '2000-01';
const ULTIMO_MES_SERIE = '2026-10';

function generarSeries(prng) {
  const meses = [];
  for (let m = PRIMER_MES_SERIE; m <= ULTIMO_MES_SERIE; m = F.sumarMesesMes(m, 1)) meses.push(m);
  // rendimientos mensuales: factor común + propio; en las crisis, la caída fijada del episodio
  const rend = Object.fromEntries(SERIES.map((s) => [s.id, [0]]));
  const enCrisis = [false];
  for (let i = 1; i < meses.length; i++) {
    const m = meses[i];
    const comun = prng.normal(0, 0.038);
    const ep = CRISIS.find((c) => m >= c.desde && m <= c.hasta);
    enCrisis.push(!!ep);
    const nEp = ep ? F.mesesEntre(ep.desde, ep.hasta) + 1 : 1;
    for (const s of SERIES) {
      let r = s.mu + s.beta * comun + prng.normal(0, s.idio);
      if (ep) {
        const total = s.id === 'rf-euro-agregada' ? ep.rf : s.id === 'nasdaq-100-eur' && ep.tec !== undefined ? ep.tec : ep.rv * (s.beta > 1 ? Math.min(s.beta, 1.2) : s.beta);
        r = (1 + total) ** (1 / nEp) - 1 + prng.normal(0, s.idio / 2) + (s.beta > 0.5 ? comun * 0.3 : 0);
      }
      rend[s.id].push(Math.max(-0.6, r));
    }
  }
  // calibración: el múltiplo total 2000→2026 se fija ajustando la deriva solo fuera de las crisis
  const niveles = {};
  for (const s of SERIES) {
    const lr = rend[s.id].map((r) => Math.log(1 + r));
    const fuera = lr.reduce((a, x, i) => (i && !enCrisis[i] ? a + x : a), 0);
    const dentro = lr.reduce((a, x, i) => (i && enCrisis[i] ? a + x : a), 0);
    const nFuera = enCrisis.filter((x, i) => i && !x).length;
    const delta = (Math.log(s.objetivo) - dentro - fuera) / nFuera;
    const n = [s.base];
    for (let i = 1; i < meses.length; i++) n.push(n[i - 1] * Math.exp(lr[i] + (enCrisis[i] ? 0 : delta)));
    niveles[s.id] = n;
  }
  // IPC España y componentes (índices), tipo de depósito del BCE (%) y EUR/USD
  const extra = [
    { id: 'ipc-espana', nombre: 'IPC España general (sintética)', mu: 0.0019, sd: 0.0025 },
    { id: 'ipc-vivienda', nombre: 'IPC vivienda (sintética)', mu: 0.0026, sd: 0.004 },
    { id: 'ipc-alimentos', nombre: 'IPC alimentos (sintética)', mu: 0.0022, sd: 0.003 },
    { id: 'ipc-ocio-cultura', nombre: 'IPC ocio y cultura (sintética)', mu: 0.0013, sd: 0.003 },
    { id: 'ipc-transporte', nombre: 'IPC transporte (sintética)', mu: 0.0016, sd: 0.009 },
    { id: 'ipc-salud', nombre: 'IPC salud (sintética)', mu: 0.0011, sd: 0.0015 },
    { id: 'ipc-ensenanza', nombre: 'IPC enseñanza (sintética)', mu: 0.0017, sd: 0.002 },
  ];
  for (const s of extra) {
    const n = [100];
    for (let i = 1; i < meses.length; i++) {
      const m = meses[i];
      const pico = m >= '2021-09' && m <= '2023-03' ? 0.004 : 0;
      n.push(n[i - 1] * (1 + s.mu + pico + prng.normal(0, s.sd)));
    }
    niveles[s.id] = n;
    SERIES.push({ id: s.id, nombre: s.nombre, unidad: 'indice' });
  }
  const tipos = [];
  let t = 3.75;
  for (const m of meses) {
    const objetivo = m < '2008-10' ? 3.5 : m < '2014-06' ? 0.5 : m < '2022-07' ? -0.4 : m < '2024-06' ? 3.75 : 2.0;
    t += (objetivo - t) * 0.25;
    tipos.push(Math.round(t * 4) / 4);
  }
  niveles['bce-deposito'] = tipos;
  SERIES.push({ id: 'bce-deposito', nombre: 'Tipo de la facilidad de depósito del BCE (sintética)', unidad: 'porcentaje' });
  const fx = [1.0];
  for (let i = 1; i < meses.length; i++) fx.push(Math.min(1.6, Math.max(0.85, fx[i - 1] * (1 + prng.normal(0, 0.02)))));
  niveles.eurusd = fx;
  SERIES.push({ id: 'eurusd', nombre: 'EUR/USD (sintética)', unidad: 'tipo-cambio' });
  return { meses, niveles };
}

// ---------------------------------------------------------------- ayudas
const archivos = new Map();
function guardar(ruta, texto) {
  if (archivos.has(ruta)) throw new Error(`ruta duplicada en el generador: ${ruta}`);
  archivos.set(ruta, texto);
}
const doc = (tipo, ctx = {}) => FORMATOS[tipo].nuevo(ctx);
const guardarDoc = (ruta, d) => guardar(ruta, serializar(d));
function cabeceras(d, obj) {
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) fijarCabecera(d, k, v);
  return d;
}

// ---------------------------------------------------------------- configuración y catálogos
function generarConfig() {
  const a = doc('ajustes');
  const valores = {
    nombre: 'Alex',
    moneda: 'EUR',
    mes_inicio_dia: 1,
    tema: 'auto',
    puerto: 4747,
    impuestos_ahorro: [
      { desde: 0, hasta: 600000, pb: 1900 },
      { desde: 600000, hasta: 5000000, pb: 2100 },
      { desde: 5000000, hasta: 20000000, pb: 2300 },
      { desde: 20000000, hasta: 30000000, pb: 2700 },
      { desde: 30000000, hasta: null, pb: 3000 },
    ],
    impuestos_verificado: 2026,
    proyeccion: 'datos',
    libertad_multiplicador: 25,
    claude_modelo: { pulso: 'sonnet', precios: 'haiku', datos: 'haiku', privado: 'opus', descubrir: 'opus', encaje: 'opus' },
    sectores_efectos: ['bancos', 'utilities-e-infraestructura', 'tecnologia', 'inmobiliario', 'consumo-basico', 'energia', 'renta-fija-euro'],
  };
  for (const [k, v] of Object.entries(valores)) fijarKv(a, null, k, v);
  guardarDoc('ajustes.md', a);

  const c = doc('cuentas');
  for (const v of [
    { id: 'corriente', nombre: 'Cuenta corriente', tipo: 'corriente', saldo_inicial: { importe: euros(1250), fecha: '2025-12-01' } },
    { id: 'remunerada', nombre: 'Cuenta remunerada', tipo: 'ahorro', colchon: true, saldo_inicial: { importe: euros(3940), fecha: '2025-12-01' } },
    { id: 'hucha-japon', nombre: 'Hucha Japón', tipo: 'ahorro', meta: 'japon', saldo_inicial: { importe: 0, fecha: '2025-12-01' } },
    { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', saldo_inicial: { importe: euros(80), fecha: '2025-12-01' } },
    { id: 'tarjeta-credito', nombre: 'Tarjeta de crédito', tipo: 'deuda', saldo_inicial: { importe: 0, fecha: '2025-12-01' }, archivada: true },
  ]) anadirItem(c, null, v);
  guardarDoc('cuentas.md', c);

  const g = doc('grupos');
  for (const v of GRUPOS) anadirItem(g, null, v);
  guardarDoc('grupos.md', g);

  const e = doc('etiquetas');
  for (const [id, descripcion] of [['fijo', 'Gastos e ingresos fijos de cada mes'], ['social', 'Planes con amigos y familia'], ['suscripción', 'Pagos recurrentes de servicios'], ['meta', 'Aportaciones a metas'], ['puntual', 'Algo que no se repite'], ['carrera', 'Formación para el trabajo']]) anadirItem(e, null, { id, descripcion });
  guardarDoc('etiquetas.md', e);

  const r = doc('recurrentes');
  for (const v of RECURRENTES) anadirItem(r, null, v);
  guardarDoc('recurrentes.md', r);

  const h = doc('hitos');
  for (const v of [
    { id: 'H-0001', fecha: '2026-02-10', texto: 'Meta Japón creada', tipo: 'mío' },
    { id: 'H-0002', fecha: '2026-06-05', texto: 'El BCE baja tipos', tipo: 'mundo', nota: 'M-260605-01' },
    { id: 'H-0003', fecha: '2026-09-12', texto: 'Corrección −8 %', tipo: 'mundo', nota: 'M-260912-01' },
    { id: 'H-0004', fecha: '2026-10-01', texto: 'Sueldo ↑', tipo: 'mío' },
  ]) anadirItem(h, null, v);
  guardarDoc('hitos.md', h);
}

const GRUPOS = [
  { id: 'sueldo', nombre: 'Sueldo', naturaleza: 'ingreso' },
  { id: 'extra', nombre: 'Extra', naturaleza: 'ingreso' },
  { id: 'vivienda', nombre: 'Vivienda', naturaleza: 'consumo', presupuesto: euros(900), ipc: 'ipc-vivienda' },
  { id: 'comida', nombre: 'Comida', naturaleza: 'consumo', presupuesto: euros(350), ipc: 'ipc-alimentos' },
  { id: 'ocio', nombre: 'Ocio', naturaleza: 'consumo', presupuesto: euros(150), ipc: 'ipc-ocio-cultura' },
  { id: 'transporte', nombre: 'Transporte', naturaleza: 'consumo', presupuesto: euros(120), ipc: 'ipc-transporte' },
  { id: 'salud', nombre: 'Salud', naturaleza: 'consumo', presupuesto: euros(60), ipc: 'ipc-salud' },
  { id: 'formacion', nombre: 'Formación', naturaleza: 'consumo', presupuesto: euros(50), ipc: 'ipc-ensenanza' },
  { id: 'regalos', nombre: 'Regalos', naturaleza: 'consumo' },
  { id: 'cartera', nombre: 'Cartera', naturaleza: 'inversion' },
  { id: 'colchon', nombre: 'Colchón', naturaleza: 'ahorro', cuenta: 'remunerada' },
  { id: 'meta-japon', nombre: 'Meta: Japón', naturaleza: 'ahorro', cuenta: 'hucha-japon' },
  { id: 'devoluciones', nombre: 'Devoluciones', naturaleza: 'traspaso' },
  { id: 'traspasos', nombre: 'Entre mis cuentas', naturaleza: 'traspaso' },
];

const RECURRENTES = [
  { id: 'nomina', concepto: 'Nómina', importe: euros(2850), grupo: 'sueldo', cuenta: 'corriente', cada: 'mes', dia: { dia: 1, mes: null }, etiquetas: ['fijo'] },
  { id: 'alquiler', concepto: 'Alquiler', importe: euros(-750), grupo: 'vivienda', cuenta: 'corriente', cada: 'mes', dia: { dia: 1, mes: null }, etiquetas: ['fijo'] },
  { id: 'aportacion', concepto: 'Aportación MyInvestor', importe: euros(-600), grupo: 'cartera', cuenta: 'corriente', cada: 'mes', dia: { dia: 2, mes: null }, etiquetas: ['fijo'] },
  { id: 'a-remunerada', concepto: 'A cuenta remunerada', importe: euros(-200), grupo: 'colchon', cuenta: 'corriente', cada: 'mes', dia: { dia: 2, mes: null }, etiquetas: ['fijo'] },
  { id: 'hucha-japon', concepto: 'Hucha viaje Japón', importe: euros(-200), grupo: 'meta-japon', cuenta: 'corriente', cada: 'mes', dia: { dia: 2, mes: null }, desde: '2026-03', etiquetas: ['meta'] },
  { id: 'luz-internet', concepto: 'Luz + internet', importe: euros(-92.3), grupo: 'vivienda', cuenta: 'corriente', cada: 'mes', dia: { dia: 10, mes: null }, etiquetas: ['fijo'] },
  { id: 'agua', concepto: 'Agua', importe: euros(-41.6), grupo: 'vivienda', cuenta: 'corriente', cada: 'bimestre', dia: { dia: 12, mes: null }, desde: '2026-01' },
  { id: 'gimnasio', concepto: 'Gimnasio', importe: euros(-39.9), grupo: 'salud', cuenta: 'corriente', cada: 'mes', dia: { dia: 4, mes: null }, etiquetas: ['suscripción'], uso: { estado: 'sí', fecha: null } },
  { id: 'spotify-netflix', concepto: 'Spotify + Netflix', importe: euros(-26.98), grupo: 'ocio', cuenta: 'corriente', cada: 'mes', dia: { dia: 5, mes: null }, etiquetas: ['suscripción'], uso: { estado: 'sí', fecha: null } },
  { id: 'nube', concepto: 'Almacenamiento en la nube', importe: euros(-2.99), grupo: 'ocio', cuenta: 'corriente', cada: 'mes', dia: { dia: 8, mes: null }, etiquetas: ['suscripción'], uso: { estado: 'sí', fecha: null } },
  { id: 'revista', concepto: 'Revista digital', importe: euros(-4.99), grupo: 'ocio', cuenta: 'corriente', cada: 'mes', dia: { dia: 20, mes: null }, etiquetas: ['suscripción'], uso: { estado: 'no', fecha: '2026-06' } },
  { id: 'idiomas', concepto: 'App de idiomas', importe: euros(-59.99), grupo: 'formacion', cuenta: 'corriente', cada: 'año', dia: { dia: 3, mes: 8 }, etiquetas: ['suscripción'], uso: { estado: 'no', fecha: '2026-08' }, pausado: false },
  { id: 'seguro-coche', concepto: 'Seguro coche', importe: euros(-320), grupo: 'transporte', cuenta: 'corriente', cada: 'año', dia: { dia: 14, mes: 11 } },
  { id: 'prime', concepto: 'Tienda online (cuota anual)', importe: euros(-49.9), grupo: 'ocio', cuenta: 'corriente', cada: 'año', dia: { dia: 21, mes: 3 }, etiquetas: ['suscripción'], uso: { estado: 'sí', fecha: null } },
];

// ---------------------------------------------------------------- cartera
const ACTIVOS = [
  { id: 'msci-world', nombre: 'Fondo MSCI World', isin: 'IE00BYX5NX33', tipo: 'fondo', clase: 'rv-desarrollados', ter: 12, indice: 'msci-world-nr-eur', nav: 0.11, aporta: 300, traspasable: true,
    exposicion: { fecha: '2026-09', dimensiones: { region: [['EE. UU.', 7100], ['Europa', 1500], ['Japón', 600], ['Otros', 800]], sector: [['Tecnología', 2700], ['Financiero', 1500], ['Salud', 1100], ['Industria', 1100], ['Consumo', 1600], ['Otros', 2000]], divisa: [['USD', 7100], ['EUR', 1100], ['JPY', 600], ['Otras', 1200]] } } },
  { id: 'emergentes', nombre: 'Fondo Emergentes', isin: 'IE0031786696', tipo: 'fondo', clase: 'rv-emergentes', ter: 23, indice: 'msci-em-nr-eur', nav: 0.18, aporta: 100, traspasable: true,
    exposicion: { fecha: '2026-09', dimensiones: { region: [['Emergentes', 10000]], sector: [['Tecnología', 2400], ['Financiero', 2200], ['Consumo', 1800], ['Otros', 3600]], divisa: [['Otras', 10000]] } } },
  { id: 'small-caps', nombre: 'Fondo Small Caps global', isin: 'IE00B42W4L06', tipo: 'fondo', clase: 'rv-small', ter: 29, indice: 'msci-world-small-eur', nav: 0.2, aporta: 80, traspasable: true,
    exposicion: { fecha: '2026-09', dimensiones: { region: [['EE. UU.', 6000], ['Europa', 2000], ['Japón', 1000], ['Otros', 1000]], divisa: [['USD', 6000], ['EUR', 1400], ['JPY', 1000], ['Otras', 1600]] } } },
  { id: 'etf-ndx', nombre: 'ETF Nasdaq 100', isin: 'IE00B53SZB19', tipo: 'etf', clase: 'rv-tecnologia', ter: 30, indice: 'nasdaq-100-eur', nav: 2.5, aporta: 40, traspasable: false,
    exposicion: { fecha: '2026-09', dimensiones: { region: [['EE. UU.', 9700], ['Otros', 300]], sector: [['Tecnología', 6000], ['Consumo', 2000], ['Salud', 700], ['Otros', 1300]], divisa: [['USD', 10000]] } } },
  { id: 'rf-euro-corto', nombre: 'Fondo RF euro corto plazo', isin: 'LU0389811885', tipo: 'fondo', clase: 'renta-fija', ter: 10, indice: 'rf-euro-agregada', nav: 0.12, aporta: 80, traspasable: true,
    exposicion: { fecha: '2026-09', dimensiones: { region: [['RF euro', 10000]], divisa: [['EUR', 10000]] } } },
  { id: 'plan-empleo', nombre: 'Plan de pensiones de empleo', isin: null, tipo: 'plan', clase: 'mixto', ter: 40, indice: 'mixto', nav: 0.1, aporta: 0, traspasable: true },
  { id: 'fondo-sp500', nombre: 'Fondo S&P 500 (traspasado)', isin: 'IE00BYML9W36', tipo: 'fondo', clase: 'rv-desarrollados', ter: 10, indice: 'sp500-eur', nav: 0.12, aporta: 0, traspasable: true, archivado: true },
];

function generarCartera({ meses, niveles }) {
  const idx = (serie, mes) => {
    if (serie === 'mixto') return (idx('msci-world-nr-eur', mes) + idx('rf-euro-agregada', mes)) / 2;
    const i = meses.indexOf(mes > ULTIMO_MES_SERIE ? ULTIMO_MES_SERIE : mes);
    return niveles[serie][i];
  };
  const nav = (a, mes) => (idx(a.indice, mes) * a.nav);

  const ac = doc('activos');
  for (const a of ACTIVOS) {
    anadirBloque(ac, {
      id: a.id,
      titulo: a.nombre,
      campos: {
        isin: a.isin,
        tipo: a.tipo,
        clase: a.clase,
        divisa: 'EUR',
        ter: a.ter,
        indice: a.indice === 'mixto' ? null : a.indice,
        exposicion: a.exposicion ? { fecha: a.exposicion.fecha, dimensiones: Object.fromEntries(Object.entries(a.exposicion.dimensiones).map(([k, f]) => [k, f.map(([nombre, pb]) => ({ nombre, pb }))])) } : null,
        traspasable: a.traspasable,
        archivado: a.archivado ? true : null,
      },
    });
  }
  guardarDoc('cartera/activos.md', ac);

  const cl = doc('clases');
  for (const v of [
    { id: 'rv-desarrollados', nombre: 'RV desarrollados', indice: 'msci-world-nr-eur', grupo: 'rv' },
    { id: 'rv-emergentes', nombre: 'RV emergentes', indice: 'msci-em-nr-eur', grupo: 'rv' },
    { id: 'rv-small', nombre: 'RV small caps', indice: 'msci-world-small-eur', grupo: 'rv' },
    { id: 'rv-tecnologia', nombre: 'RV EE. UU. tecnología', indice: 'nasdaq-100-eur', grupo: 'rv', parecida: 'rv-desarrollados' },
    { id: 'renta-fija', nombre: 'Renta fija', indice: 'rf-euro-agregada', grupo: 'rf' },
    { id: 'mixto', nombre: 'Mixto', grupo: 'mixto', parecida: 'renta-fija' },
    { id: 'efectivo', nombre: 'Efectivo', grupo: 'efectivo' },
  ]) anadirItem(cl, null, v);
  guardarDoc('cartera/clases.md', cl);

  const ob = doc('objetivo');
  cabeceras(ob, { redondeo: euros(10), umbral_desviacion: 100 });
  for (const [activo, peso, minimo] of [['msci-world', 5500], ['emergentes', 1000], ['small-caps', 800], ['etf-ndx', 500], ['rf-euro-corto', 1200, euros(30)], ['plan-empleo', 1000]]) anadirItem(ob, null, { activo, peso, minimo: minimo ?? null });
  guardarDoc('cartera/objetivo.md', ob);

  // operaciones y unidades
  const ops = [];
  const unidades = Object.fromEntries(ACTIVOS.map((a) => [a.id, 0]));
  let n = 0;
  const op = (fecha, tipo, activo, importe, extra = {}) => {
    n++;
    const o = { id: `OP-${String(n).padStart(4, '0')}`, fecha, tipo, activo, importe, ...extra };
    ops.push(o);
    return o;
  };
  const movAportacion = new Map(); // mes → op de referencia
  for (let mes = '2023-01'; mes <= '2026-11'; mes = F.sumarMesesMes(mes, 1)) {
    const fecha = `${mes}-02`;
    const lista = mes < '2025-10' ? [['fondo-sp500', 300], ...ACTIVOS.filter((a) => a.aporta && a.id !== 'msci-world').map((a) => [a.id, a.aporta])] : ACTIVOS.filter((a) => a.aporta).map((a) => [a.id, a.aporta]);
    for (const [id, eur] of lista) {
      if (mes < '2024-06' && id === 'etf-ndx') continue;
      const a = ACTIVOS.find((x) => x.id === id);
      const u = Math.round((eur / nav(a, mes)) * 10000) / 10000;
      unidades[id] += u;
      const o = op(fecha, 'aportacion', { activo: id }, euros(eur), id === 'msci-world' || id === 'fondo-sp500' ? { participaciones: Math.round(u * 1e6) } : {});
      if (!movAportacion.has(mes) && (id === 'msci-world' || id === 'fondo-sp500')) movAportacion.set(mes, o);
    }
    op(`${mes}-28`, 'aportacion', { activo: 'plan-empleo' }, euros(100), { nota: 'aportación de la empresa' });
    unidades['plan-empleo'] += 100 / nav(ACTIVOS[5], mes);
    if (mes === '2025-10') {
      const a = ACTIVOS.find((x) => x.id === 'fondo-sp500');
      const valor = Math.round(unidades['fondo-sp500'] * nav(a, mes) * 100);
      op('2025-10-15', 'traspaso', { origen: 'fondo-sp500', destino: 'msci-world' }, valor, { nota: 'traspaso entre fondos: no tributa' });
      unidades['msci-world'] += (valor / 100) / nav(ACTIVOS[0], mes);
      unidades['fondo-sp500'] = 0;
    }
    if (mes === '2026-09') {
      const a = ACTIVOS.find((x) => x.id === 'etf-ndx');
      const u = Math.round((500 / nav(a, mes)) * 10000) / 10000;
      op('2026-09-01', 'venta', { activo: 'etf-ndx' }, euros(500), { participaciones: Math.round(u * 1e6) });
      unidades['etf-ndx'] -= u;
    }
    if (mes === '2026-06') op('2026-06-30', 'comision', { activo: 'etf-ndx' }, euros(-2), { nota: 'custodia del bróker' });
  }
  const docOps = doc('operaciones');
  for (const o of ops) anadirItem(docOps, null, o);

  // fotos de valor a fin de mes (hasta octubre 2026): unidades × valor liquidativo del mes
  const valoresMes = {};
  const uAcum = Object.fromEntries(ACTIVOS.map((a) => [a.id, 0]));
  let k = 0;
  for (let mes = '2023-01'; mes <= '2026-10'; mes = F.sumarMesesMes(mes, 1)) {
    while (k < ops.length && ops[k].fecha <= F.ultimoDia(mes)) {
      const o = ops[k++];
      const a = ACTIVOS.find((x) => x.id === (o.activo.activo ?? o.activo.origen));
      const navM = nav(a, F.mesDe(o.fecha));
      if (o.tipo === 'aportacion') uAcum[a.id] += o.importe / 100 / navM;
      if (o.tipo === 'venta') uAcum[a.id] -= o.importe / 100 / navM;
      if (o.tipo === 'traspaso') {
        const dest = ACTIVOS.find((x) => x.id === o.activo.destino);
        uAcum[dest.id] += o.importe / 100 / nav(dest, F.mesDe(o.fecha));
        uAcum[a.id] = 0;
      }
    }
    const fecha = F.ultimoDia(mes);
    const d = doc('valores', { fecha });
    let total = 0;
    for (const a of ACTIVOS) {
      if (uAcum[a.id] <= 1e-9) continue;
      const v = Math.round(uAcum[a.id] * nav(a, mes) * 100);
      total += v;
      anadirItem(d, null, { activo: a.id, valor: v, origen: mes === '2026-10' && a.id === 'emergentes' ? 'precio 2026-10-30 (claude, confirmado)' : 'manual' });
    }
    valoresMes[mes] = total;
    guardarDoc(`cartera/valores/${fecha}.md`, d);
  }

  // plantillas (las de semilla llegan en F5; aquí, para probar formatos) y un borrador
  const PLANTILLAS = {
    conservadora: ['Conservadora · 40/60', [['msci-world', 'Fondo MSCI World', 3000, 'rv-desarrollados'], ['emergentes', 'Fondo Emergentes', 500, 'rv-emergentes'], ['rf-euro-corto', 'Fondo RF euro corto plazo', 3500, 'renta-fija'], ['rf-global', 'Fondo RF global agregada', 2000, 'renta-fija'], ['monetario', 'Fondo monetario', 1000, 'efectivo']]],
    equilibrada: ['Equilibrada · 70/30', [['msci-world', 'Fondo MSCI World', 5500, 'rv-desarrollados'], ['emergentes', 'Fondo Emergentes', 1000, 'rv-emergentes'], ['small-caps', 'Fondo Small Caps global', 500, 'rv-small'], ['rf-global', 'Fondo RF global agregada', 2000, 'renta-fija'], ['monetario', 'Fondo monetario', 1000, 'efectivo']]],
    crecimiento: ['Crecimiento · 90/10', [['msci-world', 'Fondo MSCI World', 6500, 'rv-desarrollados'], ['emergentes', 'Fondo Emergentes', 1200, 'rv-emergentes'], ['small-caps', 'Fondo Small Caps global', 800, 'rv-small'], ['etf-ndx', 'ETF Nasdaq 100', 500, 'rv-tecnologia'], ['rf-euro-corto', 'Fondo RF euro corto plazo', 1000, 'renta-fija']]],
    total: ['100 % acciones', [['msci-world', 'Fondo MSCI World', 8000, 'rv-desarrollados'], ['emergentes', 'Fondo Emergentes', 1200, 'rv-emergentes'], ['small-caps', 'Fondo Small Caps global', 800, 'rv-small']]],
  };
  for (const [perfil, [titulo, filas]] of Object.entries(PLANTILLAS)) {
    const d = doc('plantilla');
    d.titulo = `Plantilla · ${titulo}`;
    cabeceras(d, { perfil, descripcion: 'Punto de partida con fondos indexados típicos; retócala a mano.' });
    for (const [id, nombre, peso, clase] of filas) anadirItem(d, null, { id, nombre, peso, clase });
    guardarDoc(`cartera/plantillas/${perfil}.md`, d);
  }
  const bd = doc('borrador');
  bd.titulo = 'Borrador · Equilibrada 70/30';
  cabeceras(bd, { fecha: '2026-10-20', perfil: 'equilibrada', origen: 'plantilla equilibrada', estado: 'borrador', revisado_claude: 'no' });
  for (const [id, nombre, peso, clase] of PLANTILLAS.equilibrada[1]) anadirItem(bd, null, { id, nombre, peso, clase });
  guardarDoc('cartera/borradores/2026-10-20-equilibrada.md', bd);

  return { ops, movAportacion, valoresMes, docOps };
}

// ---------------------------------------------------------------- meses de movimientos
const VARIABLES = [
  ['Mercadona', 'comida', [62, 96], 4],
  ['Fruta y mercado', 'comida', [14, 30], 2],
  ['Cena fuera', 'ocio', [28, 60], 1.5],
  ['Cine', 'ocio', [9, 18], 0.6],
  ['Gasolina', 'transporte', [45, 62], 1],
  ['Abono transporte', 'transporte', [20, 20], 0.5],
  ['Farmacia', 'salud', [6, 24], 0.7],
  ['Libro', 'formacion', [12, 36], 0.4],
];

function generarMeses(prng, { movAportacion, valoresMes, docOps }) {
  const saldos = { corriente: euros(1250), remunerada: euros(3940), 'hucha-japon': 0, efectivo: euros(80) };
  const resumen = {};
  for (const mes of MESES_MOV) {
    const periodo = F.periodoMes(mes, 1);
    const cerrado = mes < '2026-11';
    const d = doc('mes', { mes });
    cabeceras(d, { periodo, estado: cerrado ? { estado: 'cerrado', fecha: periodo.hasta } : { estado: 'abierto', fecha: null } });
    const movs = [];
    const ids = [];
    const m = (dia, concepto, importe, grupo, extra = {}) => {
      const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
      if (mes === '2026-11' && fecha > '2026-11-16') return;
      const id = idCorto(ids, prng);
      ids.push(id);
      movs.push({ fecha, concepto, importe, grupo, cuenta: extra.cuenta ?? 'corriente', ...extra, id, etiquetas: extra.etiquetas ?? [] });
    };
    const confirmados = [];
    const mm = +mes.slice(5);
    for (const r of RECURRENTES) {
      const toca = r.cada === 'mes' ? true : r.cada === 'año' ? r.dia.mes === mm : r.cada === 'bimestre' ? mes >= r.desde && F.mesesEntre(r.desde, mes) % 2 === 0 : false;
      if (!toca || (r.desde && mes < r.desde)) continue;
      if (mes === '2026-11' && ['agua', 'seguro-coche', 'revista', 'nube'].includes(r.id)) continue; // aún sin confirmar
      let importe = r.importe;
      if (r.id === 'nomina' && mes >= '2026-10') importe = euros(2970);
      if (r.id === 'luz-internet') importe = euros(-(78 + prng.entero(0, 300) / 10));
      const extra = { etiquetas: r.etiquetas ?? [], rec: r.id };
      if (r.id === 'a-remunerada') extra.a = 'remunerada';
      if (r.id === 'hucha-japon') extra.a = 'hucha-japon';
      if (r.id === 'aportacion' && movAportacion.get(mes)) extra.op = movAportacion.get(mes).id;
      m(r.dia.dia, r.concepto, importe, r.grupo, extra);
      confirmados.push(r.id);
    }
    if (mm === 6 || mm === 12) m(20, 'Paga extra', euros(2850), 'sueldo', { etiquetas: ['fijo'] });
    if (mes === '2026-11') {
      m(3, 'Mercadona', euros(-86.4), 'comida');
      m(7, 'Cena cumpleaños Ana', euros(-48), 'ocio', { etiquetas: ['social'] });
      m(9, 'Venta monitor usado', euros(100), 'extra', { etiquetas: ['puntual'] });
      m(11, 'Mercadona', euros(-74.2), 'comida');
      m(12, 'Libro AWS MLA-C01', euros(-34.9), 'formacion', { etiquetas: ['carrera'] });
      m(14, 'Bizum de Pablo (cena)', euros(24), 'devoluciones', { compensa: 'ocio', etiquetas: ['social'] });
      m(15, 'Gasolina', euros(-55), 'transporte');
      m(16, 'Concierto', euros(-65), 'ocio', { etiquetas: ['social'] });
    } else {
      for (const [concepto, grupo, [min, max], veces] of VARIABLES) {
        const n = Math.floor(veces) + (prng.siguiente() < veces % 1 ? 1 : 0);
        for (let i = 0; i < n; i++) m(prng.entero(3, 28), concepto, -prng.entero(min * 100, max * 100), grupo, concepto === 'Cena fuera' && prng.siguiente() < 0.5 ? { etiquetas: ['social'] } : {});
      }
      if (prng.siguiente() < 0.35) m(prng.entero(5, 25), 'Bizum de amigos (cena)', prng.entero(1500, 3000), 'devoluciones', { compensa: 'ocio', etiquetas: ['social'] });
      if (mm === 12) m(22, 'Regalos de Navidad', euros(-180), 'regalos', { etiquetas: ['puntual'] });
      if (mes === '2026-05') m(18, 'Portátil (meta cumplida)', euros(-1150), 'formacion', { etiquetas: ['puntual', 'carrera'] });
      if (mes === '2026-04') m(9, 'Retirada de efectivo', euros(-60), 'traspasos', { a: 'efectivo' });
      if (mes === '2026-08') m(19, 'Venta bici vieja', euros(140), 'extra', { etiquetas: ['puntual'] });
    }
    movs.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    for (const v of movs) {
      anadirItem(d, 'Movimientos', v);
      saldos[v.cuenta] = (saldos[v.cuenta] ?? 0) + v.importe;
      if (v.a) saldos[v.a] = (saldos[v.a] ?? 0) - v.importe;
    }
    // la referencia inversa: la operación apunta a su movimiento
    const mAp = movs.find((x) => x.op);
    if (mAp) {
      const nodo = docOps.secciones[0].nodos.find((x) => x.valor.id === mAp.op);
      nodo.valor.mov = `${mes}/${mAp.id}`;
    }
    if (mes === '2026-11') fijarKv(d, 'Presupuestos', 'ocio', euros(200));
    for (const id of confirmados) fijarKv(d, 'Recurrentes', id, 'confirmado');
    if (mes === '2026-11') fijarKv(d, 'Recurrentes', 'nube', 'saltado');
    if (cerrado) {
      const cartera = valoresMes[mes];
      const cuentasMes = { corriente: saldos.corriente, remunerada: saldos.remunerada, 'hucha-japon': saldos['hucha-japon'], efectivo: saldos.efectivo };
      const patrimonio = Object.values(cuentasMes).reduce((a, b) => a + b, 0) + cartera;
      const lecciones = { '2026-01': 'enero con la cuesta: mejor no planear cenas la primera semana', '2026-07': 'la paga extra entera a la cartera y al colchón', '2026-09': 'no vendí nada en la corrección', '2026-10': 'las cenas sociales se me van de presupuesto' };
      fijarKv(d, 'Cierre', 'fecha', periodo.hasta);
      fijarKv(d, 'Cierre', 'saldos', cuentasMes);
      fijarKv(d, 'Cierre', 'cartera', cartera);
      fijarKv(d, 'Cierre', 'patrimonio', patrimonio);
      fijarKv(d, 'Cierre', 'leccion', lecciones[mes] ?? '');
      fijarKv(d, 'Cierre', 'editado_tras_cierre', mes === '2026-08');
    }
    resumen[mes] = { ...saldos };
    guardarDoc(`mes/${mes}.md`, d);
  }
  guardarDoc('cartera/operaciones.md', docOps);
  return resumen;
}

// ---------------------------------------------------------------- metas y decisiones
function generarMetas() {
  const d = doc('metas');
  anadirBloque(d, { id: 'colchon', titulo: 'Colchón 6 meses', campos: { objetivo: euros(9000), se_alimenta_de: { tipo: 'cuenta', valor: 'remunerada' }, aportacion: { mensual: euros(200) }, estado: { estado: 'activa', fecha: null } } });
  anadirBloque(d, { id: 'japon', titulo: 'Viaje a Japón', campos: { objetivo: euros(4000), fecha_deseada: '2027-09-01', se_alimenta_de: { tipo: 'cuenta', valor: 'hucha-japon' }, aportacion: { mensual: euros(200) }, estado: { estado: 'activa', fecha: null } } });
  anadirBloque(d, { id: 'piso', titulo: 'Entrada piso', campos: { objetivo: euros(40000), se_alimenta_de: { tipo: 'manual', valor: euros(12000) }, estado: { estado: 'activa', fecha: null } } });
  anadirBloque(d, { id: 'portatil', titulo: 'Fondo para el portátil', campos: { objetivo: euros(1150), se_alimenta_de: { tipo: 'manual', valor: euros(1150) }, estado: { estado: 'cumplida', fecha: '2026-05-18' } } });
  guardarDoc('metas.md', d);

  const decisiones = [
    ['2026-10-12-subo-aportacion', 'Subo la aportación de 500 a 600 €', { fecha: '2026-10-12', estado: 'decidida', revisar: '2027-04-12' }, { 'Qué': 'Subo la aportación mensual de 500 a 600 €.', 'Por qué': 'Me han subido el sueldo; mantengo el objetivo 90/10.', 'Alternativas': 'Dejarlo en 500 € y subir el colchón más rápido.' }],
    ['2026-09-03-anado-nasdaq', 'Añado ETF Nasdaq 100 (5 %)', { fecha: '2026-09-03', estado: 'decidida', revisar: '2027-03-03' }, { 'Qué': 'Añado un 5 % de ETF Nasdaq 100.', 'Por qué': 'Quiero algo más de tecnología; acepto más volatilidad.' }],
    ['2026-11-01-empresa-ia', 'Comprar acciones de una empresa de IA que sale en todos los vídeos', { fecha: '2026-11-01', estado: 'pausa-48h', vuelve: { fecha: '2026-11-04', hora: '09:00' } }, { 'Qué': 'Comprar acciones sueltas de una empresa de IA.', 'Por qué': 'Sale en todos los vídeos y ha subido mucho.' }],
    ['2026-10-30-nasdaq-10', 'Subir el ETF Nasdaq 100 al 10 %', { fecha: '2026-10-30', estado: 'lista', vuelve: { fecha: '2026-11-01', hora: '18:30' } }, { 'Qué': 'Subir el ETF Nasdaq 100 del 5 % al 10 %.', 'Preguntas de Rex': '1. ¿Qué tendría que pasar para que fuera un error?\n2. Pasarías del 6 % al 10 % en tecnología de EE. UU.: ¿encaja con tu objetivo 90/10?\n3. En la caída de 2022 el Nasdaq 100 cayó más que el MSCI World. ¿Lo aguantarías?' }],
  ];
  for (const [slug, titulo, cab, secciones] of decisiones) {
    const x = doc('decision');
    x.titulo = titulo;
    cabeceras(x, cab);
    for (const [s, t] of Object.entries(secciones)) fijarTexto(x, s, t);
    guardarDoc(`decisiones/${slug}.md`, x);
  }
}

// ---------------------------------------------------------------- conocimiento
const FAMILIAS = [['fija', 'Base y datos'], ['yt', 'Youtubers de inversión', '180d'], ['macro', 'Macro y economía', '120d'], ['pod', 'Podcasts', '180d'], ['prensa', 'Prensa e informes', '90d'], ['mias', 'Mis notas']];
// [id, nombre, familia, prefijo, postura media (−1…1)] · nombres inventados (los de la maqueta)
const FUENTES = [
  ['base', 'Base', 'fija', 'B'], ['datos', 'Datos', 'fija', 'DT'], ['mundo', 'Mundo · pulsos', 'prensa', 'M'],
  ['pizarra', 'La pizarra de Andrés', 'yt', 'P', -0.55], ['indexado', 'Indexado Tranquilo', 'yt', 'IND', 0.2], ['sinprisa', 'Bolsa sin Prisa', 'yt', 'BSP', 0.1],
  ['dividendo', 'Dividendo a Dividendo', 'yt', 'DAD', 0.35], ['lento', 'El Inversor Lento', 'yt', 'IL', 0], ['value', 'Value en Español', 'yt', 'VAL', -0.4],
  ['ingenieros', 'Finanzas para Ingenieros', 'yt', 'FPI', 0.15], ['permanente', 'Cartera Permanente', 'yt', 'CP', -0.15], ['etflab', 'ETF Lab', 'yt', 'ETF', 0.25],
  ['cabeza', 'Ahorro con Cabeza', 'yt', 'AC', 0.05], ['aldia', 'Mercados al Día', 'yt', 'MAD', 0.5], ['compuesto', 'Crecimiento Compuesto', 'yt', 'CC', 0.3],
  ['m10', 'Macro en 10 minutos', 'macro', 'MDZ', -0.2], ['bce', 'El Banco Central Explicado', 'macro', 'BCE', 0], ['ciclos', 'Ciclos y Deuda', 'macro', 'CYD', -0.6],
  ['bolsillo', 'Economía de Bolsillo', 'macro', 'EDB', 0.05], ['tipos', 'Datos y Tipos', 'macro', 'DYT', -0.1], ['geo', 'Geopolítica y Mercados', 'macro', 'GEO', -0.35],
  ['infl', 'Inflación Hoy', 'macro', 'IH', -0.25], ['europa', 'Europa Económica', 'macro', 'EE', 0.1],
  ['charlas', 'Charlas de Inversión', 'pod', 'CI', 0.2], ['patrimonio', 'Podcast Patrimonio', 'pod', 'PP', 0.1], ['cafe', 'El Café Financiero', 'pod', 'CF', 0.4],
  ['riesgo', 'Riesgo y Retorno', 'pod', 'RYR', -0.3], ['largo', 'Largo Plazo FM', 'pod', 'LP', 0.15], ['racional', 'Inversión Racional', 'pod', 'IR', 0],
  ['prensa', 'Resúmenes de prensa económica', 'prensa', 'PRE', 0], ['bancos', 'Notas de bancos centrales', 'prensa', 'NBC', 0], ['gestoras', 'Informes de gestoras', 'prensa', 'IG', 0.25],
  ['news', 'Newsletter Mercados', 'prensa', 'NM', 0.15], ['semanal', 'Resumen semanal de bolsa', 'prensa', 'RSB', 0.05],
  ['mias', 'Mis notas', 'mias', 'N'],
];

function nota(d, id, titulo, campos, cuerpo) {
  anadirBloque(d, { id, titulo, campos: { editada: false, ...campos }, cuerpo });
}

function generarConocimiento(prng) {
  const fam = doc('familias');
  for (const [id, nombre, caducidad] of FAMILIAS) anadirItem(fam, null, { id, nombre, caducidad: caducidad ? { n: +caducidad.slice(0, -1), unidad: 'd', dias: +caducidad.slice(0, -1) } : null, plegada: id !== 'yt' && id !== 'fija' });
  guardarDoc('conocimiento/_familias.md', fam);

  const fu = doc('fuentes');
  for (const [id, nombre, familia, prefijo] of FUENTES) {
    anadirItem(fu, null, { id, nombre, familia, prefijo, privada: familia === 'mias', activa_por_defecto: ['base', 'datos', 'mundo', 'mias', 'indexado'].includes(id) });
  }
  guardarDoc('conocimiento/_fuentes.md', fu);

  const mz = doc('mezclas');
  const todas = FUENTES.map((f) => f[0]);
  for (const v of [
    { id: 'solo-base', nombre: 'Solo base', miembros: ['base', 'datos'] },
    { id: 'base-indexados', nombre: 'Base + indexados', miembros: ['base', 'datos', 'indexado', 'sinprisa', 'permanente', 'etflab', 'ingenieros', 'mias'] },
    { id: 'todo', nombre: 'Todo', miembros: todas },
    { id: 'bajistas', nombre: 'Los bajistas', miembros: ['base', 'datos', { campo: 'postura', op: '<=', valor: -0.3 }] },
    { id: 'solo-andres', nombre: 'Solo Andrés', miembros: ['pizarra'] },
    { id: 'los-que-aciertan', nombre: 'Los que aciertan', miembros: ['base', 'datos', { campo: 'acierto', op: '>=', valor: 65 }] },
  ]) anadirItem(mz, null, v);
  guardarDoc('conocimiento/_mezclas.md', mz);

  // Base: unas pocas notas de ejemplo con texto propio (la Base de verdad se escribe en F8)
  const base = [
    ['B-0007', 'Las caídas pesan más que las subidas', 'Si una cartera cae a la mitad, necesita doblarse para volver al punto de partida: una caída del 50 % exige una subida del 100 %. Por eso controlar las caídas importa tanto como buscar rentabilidad.', ['riesgo', 'conceptos']],
    ['B-0012', 'TWR y TIR miden cosas distintas', 'El TWR mide cómo lo hicieron tus inversiones sin tener en cuenta cuándo aportaste: sirve para compararte con un índice. La TIR (o XIRR) tiene en cuenta las fechas y los importes de cada aportación: es tu rentabilidad vivida.', ['rentabilidad', 'conceptos']],
    ['B-0021', 'Qué es el TER', 'El TER es el porcentaje anual que cuesta mantener un fondo y que se descuenta de su valor. Una diferencia pequeña de TER, mantenida durante décadas, acaba siendo mucho dinero por el interés compuesto.', ['costes', 'fondos']],
    ['B-0031', 'Rebalancear con las aportaciones', 'Dirigir las aportaciones nuevas hacia lo que está por debajo de su peso objetivo acerca la cartera al objetivo sin vender, y por tanto sin comisiones de venta ni impuestos.', ['rebalanceo', 'cartera']],
    ['B-0052', 'Diversificar entre regiones', 'Un fondo global reparte el riesgo entre muchos países y sectores, aunque pese mucho EE. UU.; los emergentes añaden otra fuente de riesgo y de rentabilidad distinta.', ['diversificacion', 'emergentes']],
    ['B-0144', 'Tipos de interés y renta fija', 'Cuando bajan los tipos de interés, el precio de los bonos que ya existen sube, y al revés. Cuanto más largo es el plazo de un bono, más sensible es a esos cambios.', ['tipos', 'renta-fija']],
    ['B-0088', 'El oro no genera flujos', 'El oro no paga cupones ni dividendos: su rentabilidad depende solo de lo que otro pague por él. Históricamente se ha comportado de forma distinta a las bolsas en algunas crisis.', ['oro', 'materias-primas']],
    ['B-0160', 'Traspasos entre fondos en España', 'En España, pasar dinero de un fondo de inversión a otro mediante traspaso no tributa en ese momento: se difiere hasta el reembolso final. Con los ETF no ocurre lo mismo. Comprueba la normativa vigente.', ['fiscalidad', 'fondos'], 2026],
  ];
  const db = doc('notas', { fuente: 'base' });
  db.titulo = 'Base · ejemplos';
  cabeceras(db, { fuente: 'base' });
  for (const [id, titulo, cuerpo, temas, verificar] of base) nota(db, id, titulo, { tipo: 'consenso', fecha: '2026-10-01', fuente: 'base', origen: 'texto propio de ejemplo · https://example.org/finhub/base', temas, verificar: verificar ?? null }, cuerpo);
  guardarDoc('conocimiento/base/ejemplos.md', db);

  const dd = doc('notas', { fuente: 'datos' });
  dd.titulo = 'Datos · notas';
  cabeceras(dd, { fuente: 'datos' });
  nota(dd, 'DT-0004', 'Rentabilidad del índice mundial a 12 meses', { tipo: 'dato', fecha: '2026-10-31', fuente: 'datos', origen: 'serie sintética msci-world-nr-eur', temas: ['indices'], activos: ['msci-world'] }, 'Variación a 12 meses de la serie sintética del índice mundial en euros. Es un dato de ejemplo generado por código, no un dato real.');
  nota(dd, 'DT-0020', 'Caída del índice tecnológico en 2022', { tipo: 'dato', fecha: '2026-10-31', fuente: 'datos', origen: 'serie sintética nasdaq-100-eur', temas: ['crisis', 'tecnologia'], activos: ['etf-ndx'] }, 'En el episodio de 2022 de la serie sintética, el índice tecnológico cae bastante más que el índice mundial.');
  guardarDoc('conocimiento/datos/notas.md', dd);

  // Mundo: 14 días de pulsos (los huecos son días sin pulso), noticias INVENTADAS
  const N_POR_DIA = [3, 0, 5, 4, 6, 0, 2, 4, 0, 5, 3, 6, 2, 4];
  const TITULARES = [
    ['El banco central mantiene los tipos', 'hecho', ['bancos-centrales', 'tipos'], ['rf-euro-corto'], 'neutral', { bancos: '•', 'renta-fija-euro': '▲' }],
    ['Las tecnológicas, con dudas por valoraciones', 'opinión', ['bolsa', 'tecnologia'], ['etf-ndx', 'msci-world'], 'bajista', { tecnologia: '▼' }],
    ['Planes públicos de inversión en redes eléctricas', 'hecho', ['energia', 'infraestructura'], [], 'alcista', { 'utilities-e-infraestructura': '▲', energia: '▲' }],
    ['El IPC de octubre se modera', 'dato', ['inflacion', 'espana'], [], 'neutral', { 'consumo-basico': '•', 'renta-fija-euro': '▲' }],
    ['Consenso: beneficios empresariales al alza en 2027', 'consenso', ['bolsa', 'beneficios'], ['msci-world'], 'alcista', { tecnologia: '▲', bancos: '▲' }],
    ['El petróleo baja por más oferta', 'hecho', ['energia', 'materias-primas'], [], 'neutral', { energia: '▼' }],
    ['Repunte del precio de la vivienda en grandes ciudades', 'dato', ['vivienda'], [], 'alcista', { inmobiliario: '▲' }],
    ['Los emergentes atraen flujos por el dólar más débil', 'especulación', ['emergentes', 'divisas'], ['emergentes'], 'alcista', {}],
  ];
  const sem = { noticias: 0, pulsos: 0 };
  for (let i = 0; i < 14; i++) {
    const fecha = F.sumarDias('2026-10-21', i);
    const n = N_POR_DIA[i];
    if (!n) continue;
    const d = doc('notas', { fuente: 'mundo', fecha });
    d.titulo = `Mundo ${fecha}`;
    const pulsos = fecha === HOY ? ['01:31', '08:02'] : ['08:15'];
    cabeceras(d, { fuente: 'mundo', fecha, pulsos });
    const ids = [];
    for (let k = 0; k < n; k++) {
      const [titulo, tipo, temas, activos, postura, efectos] = TITULARES[(i * 3 + k) % TITULARES.length];
      const id = `M-${fecha.slice(2, 4)}${fecha.slice(5, 7)}${fecha.slice(8, 10)}-${String(k + 1).padStart(2, '0')}`;
      ids.push(id);
      nota(d, id, titulo, { tipo, fecha, fuente: 'mundo', origen: `Medio de ejemplo · https://example.com/noticias/${id.toLowerCase()}`, temas, activos: activos.length ? activos : null, postura, efectos: Object.keys(efectos).length ? efectos : null, caduca: F.sumarDias(fecha, 90), pulso: pulsos[k % pulsos.length], hash: `ej${(prng.entero(0, 0xffffff)).toString(16).padStart(6, '0')}` }, 'Noticia INVENTADA para la carpeta de ejemplo, resumida en dos líneas con palabras propias. No describe hechos reales.');
    }
    if (fecha >= '2026-10-26' && fecha <= '2026-11-01') { sem.noticias += n; sem.pulsos++; }
    guardarDoc(`conocimiento/mundo/${fecha}.md`, d);
  }
  const sw = doc('semana', { semana: '2026-W44' });
  cabeceras(sw, { periodo: { desde: '2026-10-26', hasta: '2026-11-01' }, pulsos: sem.pulsos, noticias: sem.noticias, mezcla: ['base', 'datos', 'mundo'] });
  fijarTexto(sw, 'Bancos centrales', 'El banco central mantiene los tipos y no da pistas sobre diciembre. [M-261027-01]');
  fijarTexto(sw, 'Bolsa', 'Semana algo positiva para el índice mundial; las tecnológicas, con dudas por valoraciones. [M-261029-02]');
  fijarTexto(sw, 'Tus canales', 'Tres de las fuentes activas hablaron de valoraciones; ninguna cambió de postura. [P-0019]');
  guardarDoc('conocimiento/mundo/semana-2026-W44.md', sw);

  // documentos de fuentes externas (resúmenes inventados) y Mis notas
  const docsFuente = [
    ['pizarra', '2026-10-28-valoraciones', 'P', [['0019', 'El S&P 500 está caro y puede corregir', 'opinión', 'bajista', 'Según el autor, las valoraciones actuales están muy por encima de la media histórica y espera una corrección superior al 10 % antes de marzo de 2027.'], ['0020', 'Prefiere liquidez a corto plazo', 'opinión', 'bajista', 'Recomienda a su audiencia tener más liquidez de la habitual mientras duren las dudas.']]],
    ['indexado', '2026-11-02-aportar-siempre', 'IND', [['0031', 'Aportar todos los meses sin mirar el mercado', 'opinión', 'neutral', 'Defiende aportar una cantidad fija cada mes a fondos indexados globales y no intentar adivinar el mercado.']]],
    ['bce', '2026-10-30-tipos', 'BCE', [['0007', 'Por qué el banco central pausa las bajadas', 'consenso', 'neutral', 'Explica que, con la inflación cerca del objetivo, el banco central prefiere esperar antes de mover los tipos.']]],
    ['cafe', '2026-11-02-optimismo', 'CF', [['0012', 'Optimismo con los beneficios de 2027', 'opinión', 'alcista', 'Los invitados creen que los beneficios empresariales seguirán creciendo y justifican las valoraciones.']]],
  ];
  for (const [fuente, slug, prefijo, ns] of docsFuente) {
    const d = doc('notas', { fuente });
    d.titulo = `${FUENTES.find((f) => f[0] === fuente)[1]} · ${slug.slice(11).replaceAll('-', ' ')}`;
    cabeceras(d, { fuente, fecha: slug.slice(0, 10), origen: `vídeo o episodio de ejemplo del ${slug.slice(0, 10)}` });
    for (const [num, titulo, tipo, postura, cuerpo] of ns) nota(d, `${prefijo}-${num}`, titulo, { tipo, fecha: slug.slice(0, 10), fuente, origen: 'resumen de ejemplo · minuto 04:10', temas: ['bolsa', 'valoraciones'], postura, caduca: F.sumarDias(slug.slice(0, 10), 180) }, cuerpo);
    guardarDoc(`conocimiento/${fuente}/${slug}.md`, d);
  }
  const mias = doc('notas', { fuente: 'mias' });
  mias.titulo = 'Mis notas';
  cabeceras(mias, { fuente: 'mias' });
  nota(mias, 'N-0001', 'No vender en las caídas', { tipo: 'opinión', fecha: '2026-03-02', fuente: 'mias', temas: ['reglas'] }, 'Mi regla: en una caída fuerte sigo aportando y no vendo. Si me pongo nervioso, escribo la decisión y espero 48 horas.');
  nota(mias, 'N-0002', 'El colchón no se invierte', { tipo: 'opinión', fecha: '2026-03-02', fuente: 'mias', temas: ['reglas', 'colchon'] }, 'Seis meses de gastos en la cuenta remunerada, siempre disponibles.');
  guardarDoc('conocimiento/mias/reglas.md', mias);

  // predicciones
  const pr = doc('predicciones');
  for (const v of [
    { id: 'PR-0007', fuente: 'bce', nota: 'BCE-0007', texto: 'el banco central no baja tipos en octubre de 2026', medir: 'bce-deposito nivel 2026-09-30→2026-10-31 >= 2', estado: 'acertada', resuelta: '2026-10-31' },
    { id: 'PR-0012', fuente: 'cafe', nota: 'CF-0012', texto: 'el índice mundial sube más de un 15 % en el tercer trimestre de 2026', medir: 'msci-world-nr-eur variacion 2026-06-30→2026-09-30 >= 15', estado: 'fallida', resuelta: '2026-09-30' },
    { id: 'PR-0019', fuente: 'pizarra', nota: 'P-0019', texto: 'S&P 500 cae >10 % antes de 2027-03-01', medir: 'sp500-eur caída-max 2026-10-28→2027-03-01 >= 10', estado: 'pendiente' },
    { id: 'PR-0031', fuente: 'indexado', nota: 'IND-0031', texto: 'el índice mundial acaba 2026 en positivo', medir: 'msci-world-nr-eur variacion 2026-01-01→2026-12-31 > 0', estado: 'pendiente' },
    { id: 'PR-0101', fuente: 'finhub', 'análisis': '2026-11-03-escenarios-12m', texto: 'cartera 12 m en [-1, +9] % (base)', medir: 'cartera twr 2026-11-03→2027-11-03 en -1…9', estado: 'pendiente' },
    { id: 'PR-0130', fuente: 'finhub-descubrir', descubrimiento: 'D-007', texto: 'utilities mundiales mejor que el índice mundial a 12 meses', estado: 'pendiente' },
    { id: 'PR-0090', fuente: 'pizarra', texto: 'recesión en EE. UU. en 2025', estado: 'fallida', resuelta: '2025-12-31' },
    { id: 'PR-0091', fuente: 'pizarra', texto: 'el S&P 500 acaba 2025 por encima de su máximo anterior', estado: 'acertada', resuelta: '2025-12-31' },
  ]) anadirItem(pr, null, v);
  guardarDoc('conocimiento/predicciones.md', pr);

  // descubrimientos (públicos: sin cifras de la cartera)
  const DESC = [
    ['D-007', 'Infraestructura eléctrica y redes', { tipo: 'tema', estado: 'siguiendo', postura: 'alcista', confianza: 'media', origen: 'pulso 2026-10-04 → 2026-11-03', descubierto: '2026-10-04', revisar: '2026-12-04', referencia: 'IE00FHINFRA9', vs: 'msci-world-nr-eur' },
      [['v3', '2026-11-03', { cambios: '2 noticias nuevas a favor; confianza sin cambios', tesis: 'La demanda eléctrica de centros de datos y la electrificación aceleran la inversión en redes; varias notas del pulso apuntan a planes públicos.', saldria_bien_si: 'Que los planes de inversión anunciados se ejecuten y los tipos no suban más.', la_invalidaria: 'Recortes de inversión pública o una subida fuerte de tipos.', riesgos: 'Tipos altos encarecen la deuda del sector · regulación · ya ha subido mucho', vehiculos: 'ETF de infraestructura global ficticio (IE00FHINFRA9, TER 0,4 %, acumulación) · fondo indexado de utilities mundial', citas: ['M-261023-03', 'M-261029-03', 'web:https://example.com/redes'], predicciones: ['PR-0130'], afirmaciones: '[hecho] hay planes públicos de inversión en redes · [consenso] la demanda eléctrica crece · [especulación] el sector seguirá batiendo al índice' }],
       ['v2', '2026-10-20', { cambios: 'primera revisión: una noticia nueva a favor', tesis: 'La electrificación y los centros de datos empujan la inversión en redes.', citas: ['M-261023-03'] }],
       ['v1', '2026-10-04', { tesis: 'Posible tema de inversión ligado a la electrificación.', citas: ['web:https://example.com/redes'] }]]],
    ['D-011', 'Renta fija euro a corto tras la pausa del banco central', { tipo: 'clase de activo', estado: 'nuevo', postura: 'neutral', confianza: 'alta', origen: 'pulso 2026-10-27 → 2026-11-03', descubierto: '2026-11-03', revisar: '2026-12-03' },
      [['v1', '2026-11-03', { tesis: 'Con los tipos en pausa, la renta fija a corto ofrece rentabilidades parecidas a la cuenta remunerada con algo más de duración.', riesgos: 'Si bajan los tipos, baja la rentabilidad futura · riesgo de duración pequeño', vehiculos: 'Fondos monetarios en euros · fondos de renta fija euro corto plazo', citas: ['M-261103-01', 'B-0144'], afirmaciones: '[hecho] los tipos siguen en pausa · [consenso] la renta fija corta tiene poco riesgo de duración' }]]],
    ['D-012', 'Small caps europeas', { tipo: 'región', estado: 'nuevo', postura: 'alcista', confianza: 'baja', origen: 'nuevas ideas: small caps', descubierto: '2026-11-02', revisar: '2027-02-02' },
      [['v1', '2026-11-02', { tesis: 'Cotizan con descuento histórico frente a las grandes; si bajan los tipos, suelen recuperar antes.', riesgos: 'Más volatilidad · liquidez · el descuento puede durar años', vehiculos: 'ETF small caps Europa (acumulación)', citas: ['M-261102-03', 'IND-0031'], afirmaciones: '[opinión] el descuento es una oportunidad · [especulación] se cerrará en 18 meses' }]]],
    ['D-004', 'Semiconductores: riesgo de corrección', { tipo: 'sector', estado: 'siguiendo', postura: 'bajista', confianza: 'media', origen: 'pulso 2026-08-02 → 2026-09-02', descubierto: '2026-09-02', revisar: '2026-12-02', referencia: 'nasdaq-100-eur', vs: 'msci-world-nr-eur' },
      [['v2', '2026-11-03', { cambios: 'sin cambios relevantes', tesis: 'Valoraciones exigentes y dudas sobre el gasto en IA; la exposición indirecta vía índices tecnológicos ya es alta.', riesgos: 'Que el gasto en IA siga acelerando y la corrección no llegue', vehiculos: '(informativo) ETF de semiconductores', citas: ['M-261029-02', 'P-0019'] }],
       ['v1', '2026-09-02', { tesis: 'Valoraciones exigentes en semiconductores.', citas: ['P-0019'] }]]],
    ['D-002', 'Oro como diversificador', { tipo: 'materia prima', estado: 'descartado', postura: 'neutral', confianza: 'media', origen: 'pregunta: ¿tiene sentido el oro en una cartera indexada?', descubierto: '2026-08-12' },
      [['v1', '2026-08-12', { tesis: 'Históricamente se ha comportado distinto a la bolsa en algunas crisis; no genera flujos.', riesgos: 'Sin rentabilidad esperada propia · fiscalidad de los ETC', vehiculos: 'ETC de oro físico', citas: ['B-0088'] }]]],
  ];
  for (const [id, titulo, cab, versiones] of DESC) {
    const d = doc('descubrimiento', { id });
    d.titulo = `${id} · ${titulo}`;
    for (const [k, v] of Object.entries(cab)) fijarKv(d, null, k, v);
    for (const [v, fecha, campos] of versiones) anadirBloque(d, { id: v, titulo: fecha, campos });
    guardarDoc(`conocimiento/descubrimientos/${id}.md`, d);
  }
}

// ---------------------------------------------------------------- series
/** Precios del vehículo que sigues en D-007 (ISIN ficticio): derivados del índice mundial, sin tocar el PRNG. */
function serieSeguimiento({ meses, niveles }) {
  const w = niveles['msci-world-nr-eur'];
  SERIES.push({ id: 'ie00fhinfra9', nombre: 'ETF infraestructura global ficticio IE00FHINFRA9 (sintética)' });
  niveles['ie00fhinfra9'] = meses.map((m, i) => 20 * (w[i] / w[0]) * Math.exp(0.0009 * i + 0.04 * Math.sin(i / 9)));
}

function guardarSeries({ meses, niveles }) {
  for (const s of SERIES) {
    const d = doc('serie');
    d.titulo = `Serie · ${s.nombre}`;
    const unidad = s.unidad ?? 'indice';
    cabeceras(d, { id: s.id, unidad, frecuencia: 'mensual', divisa: unidad === 'indice' && !s.id.startsWith('ipc') ? 'EUR' : null, fuente: `SINTÉTICA · generador de ejemplo (semilla ${SEMILLA}); no son datos reales`, metodo: 'paseo aleatorio con episodios de crisis 2000–03, 2008–09, 2020 y 2022', actualizado: '2026-11-01', sintetica: true });
    meses.forEach((m, i) => {
      const v = niveles[s.id][i];
      anadirItem(d, 'Filas', { mes: m, valor: Math.round(v * (unidad === 'porcentaje' ? 100 : 1e4)) * (unidad === 'porcentaje' ? 1e4 : 100) });
    });
    guardarDoc(`conocimiento/datos/series/${s.id}.md`, d);
  }
}

// ---------------------------------------------------------------- textos: roles, tareas, análisis, chats, quiz, tu año, CONTEXTO
function generarTextos() {
  guardar('roles/gestor.md', `# Rol · Gestor de carteras indexadas
esquema: 1
trabajo: privado
descripcion: Piensa en horizonte largo, costes y diversificación.
## Rol
Gestor de carteras indexadas para un inversor particular.
## Reglas
- Usa solo cifras que vengan de la app o del grupo Datos.
- Marca cada afirmación: hecho · consenso · opinión del modelo · especulación.
- Nunca: «compra», «vende» ni precio objetivo.
- Si no hay evidencia: «no concluyente».
`);
  guardar('tareas/escenarios-12m.md', `# Tarea · Escenarios a 12 meses para mi cartera
esquema: 1
trabajo: privado
## Trabajo
Con las cifras de <cifras> y las notas de <datos>, propone tres escenarios a 12 meses (base, optimista y pesimista) con una probabilidad subjetiva entera para cada uno que sume 100, y por qué.
## Formato de salida
\`\`\`json
{"escenarios":[{"nombre":"base","prob":60,"porque":"…","citas":["M-…"]}],"ideas":[],"no_concluyente":false}
\`\`\`
`);
  guardar('analisis/2026-11-03-escenarios-12m.md', `# Análisis · Escenarios a 12 meses
esquema: 1
fecha: 2026-11-03
tarea: escenarios-12m
rol: gestor
mezcla: base, datos, indexado, sinprisa, permanente, etflab, ingenieros, mias
ejecucion: ejemplo-0001
modelo: opus
## Cifras (código)
- pesimista: -17 … -2 % · base: -1 … +9 % · optimista: +10 … +19 %
## Resultado
Escenario base con un 60 % de probabilidad subjetiva: beneficios en línea con el consenso [M-261029-05].
## Avisos
Ninguno.
`);
  guardar('analisis/encajes/D-007-2026-11-03.md', `# Encaje · Infraestructura eléctrica y redes
esquema: 1
fecha: 2026-11-03
descubrimiento: D-007
version: v3
mezcla: base, datos
ejecucion: ejemplo-0002
modelo: opus
## Cifras (código)
- ya tienes ≈ 2,4 % vía el fondo global (look-through)
## Resultado
Ya estás expuesto a este tema a través de tu fondo global. Encaja como idea para seguir, no como cambio necesario.
`);
  guardar('chat/privado/2026-11-03-voy-bien-msci.md', `# Conversación · ¿Voy bien contra el MSCI World?
esquema: 1
modo: privado
trabajo: privado
sesion: ejemplo-sin-sesion
mezcla: base, datos, mias
creada: 2026-11-03
## Tú · 2026-11-03 01:29
¿Voy bien contra el MSCI World?
## Rex · 2026-11-03 01:29
A 12 meses tu cartera va algo por detrás del índice mundial; la diferencia viene de tu parte en renta fija y plan. Contra tu índice propio vas casi igual. [cartera]
\\## Esto no es un turno: la línea empieza por «## » y va escapada.
`);
  guardar('chat/web/2026-11-02-rf-colchon.md', `# Conversación · Fondos de renta fija para el colchón
esquema: 1
modo: web
trabajo: rex-web
mezcla: base, datos
creada: 2026-11-02
## Tú · 2026-11-02 20:14
¿Qué tipos de fondos de renta fija a corto hay?
## Rex · 2026-11-02 20:14
Hay fondos monetarios y de renta fija a corto plazo; se diferencian en duración y riesgo de crédito. [B-0144]
`);
  guardar('quiz/progreso.md', `# Quiz
esquema: 1
- 2026-10-27 | B-0021 | acierto
- 2026-10-27 | B-0007 | fallo
- 2026-11-02 | B-0012 | acierto
`);
  guardar('tu-ano/2026.md', `# Tu 2026 en finanzas
esquema: 1
periodo: enero – noviembre
nota: las cifras las calcula el código al abrir Tu año; este fichero guarda solo el texto de Rex
## Rex dice
(sin generar: se pide con tu luz verde)
`);
  guardar('CONTEXTO/pizarra-andres-nov.txt', 'Transcripción INVENTADA de ejemplo. El presentador opina que las bolsas están caras y que espera una corrección en los próximos meses. Habla de valoraciones y de tener liquidez.\n');
  guardar('CONTEXTO/entrevista-gestora.md', '# Entrevista de ejemplo (inventada)\nUna gestora explica por qué prefiere fondos indexados globales con costes bajos.\n');
  guardar('LEEME.md', `# Carpeta de ejemplo de finhub
esquema: 1
Todos los datos de esta carpeta son INVENTADOS. Las series de conocimiento/datos/series/ son SINTÉTICAS.
Se genera con «node scripts/generar-ejemplo.js». No edites aquí: cambia el generador.
`);
}

// ---------------------------------------------------------------- principal
export function generar() {
  archivos.clear();
  SERIES.splice(6);
  const prng = crearPrng(SEMILLA);
  const series = generarSeries(prng);
  serieSeguimiento(series);
  generarConfig();
  const cartera = generarCartera(series);
  generarMeses(prng, cartera);
  generarMetas();
  generarConocimiento(prng);
  guardarSeries(series);
  generarTextos();
  return new Map(archivos);
}

/** Comprueba que cada fichero de datos se lee sin errores y ya está en canónico. */
export function comprobar(mapa) {
  const problemas = [];
  for (const [ruta, texto] of mapa) {
    if (ruta === 'LEEME.md' || ruta.startsWith('CONTEXTO/')) continue;
    const d = leer(ruta, texto);
    if (!d) { problemas.push(`${ruta}: formato desconocido`); continue; }
    for (const a of d.avisos) if (a.nivel === 'error' || !/se asume|se conserva/.test(a.mensaje)) problemas.push(`${ruta}:${a.linea} ${a.nivel}: ${a.mensaje}`);
    if (serializar(d) !== texto) problemas.push(`${ruta}: no está en forma canónica`);
  }
  return problemas;
}

function listar(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(dir, e.name)) : [join(dir, e.name)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raiz = join(import.meta.dirname, '..', 'ejemplo');
  const mapa = generar();
  const problemas = comprobar(mapa);
  if (problemas.length) {
    console.error('✗ el ejemplo generado no es válido:\n  ' + problemas.slice(0, 40).join('\n  '));
    process.exit(1);
  }
  if (process.argv.includes('--comprobar')) {
    const difieren = [...mapa].filter(([r, t]) => !existsSync(join(raiz, r)) || readFileSync(join(raiz, r), 'utf8') !== t).map(([r]) => r);
    const sobran = listar(raiz).map((f) => relative(raiz, f).replaceAll('\\', '/')).filter((r) => !mapa.has(r) && r !== '.gitkeep');
    if (difieren.length || sobran.length) {
      console.error(`✗ ejemplo/ no está al día (${difieren.length} distintos, ${sobran.length} sobran). Ejecuta: node scripts/generar-ejemplo.js`);
      process.exit(1);
    }
    console.log(`✓ ejemplo/ al día (${mapa.size} ficheros)`);
  } else {
    // solo se borran ficheros de ejemplo/ que el generador ya no produce (carpeta del repo, datos inventados)
    for (const f of listar(raiz)) {
      const r = relative(raiz, f).replaceAll('\\', '/');
      if (!mapa.has(r)) rmSync(f);
    }
    for (const [r, t] of mapa) {
      mkdirSync(dirname(join(raiz, r)), { recursive: true });
      writeFileSync(join(raiz, r), t);
    }
    console.log(`✓ ejemplo/ generado: ${mapa.size} ficheros`);
  }
}
