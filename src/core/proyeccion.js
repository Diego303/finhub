// Proyección de la cartera y libertad financiera (§4.4). Determinista: semilla fija → mismo resultado en
// Node y en el navegador. Valores de salida en céntimos; las rentabilidades son floats internos.
import { crearPrng } from './prng.js';
import { serieCompleta, rentabilidadesMensuales } from './rentabilidad.js';
import { parsePorcentaje } from './dinero.js';

export const SEMILLA = 'finhub-proyeccion-v1';
export const CAMINOS = 2000;
export const MAX_ANIOS = 40;
export const SERIE_IPC = 'ipc-espana';
export const SERIE_EFECTIVO = 'bce-deposito';
const INFLACION_POR_DEFECTO = 0.02;

/** Índice de una clase: el suyo o el de su clase «parecida». */
export function indiceDeClase(claseId, clases) {
  const c = clases.find((x) => x.id === claseId);
  if (c?.indice) return c.indice;
  return clases.find((x) => x.id === c?.parecida)?.indice ?? null;
}

/**
 * Componentes de un perfil: [{nombre, peso (pb), clase}] → [{nombre, peso, indice, grupo}].
 * El grupo (rv, rf, efectivo, mixto) sirve para el modo manual y para el efectivo sin índice.
 */
export function componentesDe(filas, clases) {
  return filas.map((f) => ({ nombre: f.nombre, peso: f.peso, indice: indiceDeClase(f.clase, clases), grupo: clases.find((c) => c.id === f.clase)?.grupo ?? null }));
}

/**
 * Rentabilidades mensuales históricas de la mezcla (reequilibrada cada mes).
 * series: (id) => [{mes, valor}] | null (de modelo.serie). Efectivo sin índice: el tipo del BCE / 12 si
 * hay serie; si no, 0. Otros sin índice: 0 y aviso.
 * → {meses: [AAAA-MM], r: Float64Array, ipc: Float64Array | null, avisos}
 */
export function historicoMezcla(componentes, series) {
  const avisos = [];
  const rents = new Map();
  const deSerie = (id) => {
    if (!rents.has(id)) {
      const filas = series(id);
      rents.set(id, filas ? rentabilidadesMensuales(serieCompleta(filas)) : null);
    }
    return rents.get(id);
  };
  const efectivo = series(SERIE_EFECTIVO);
  const tipoEfectivo = efectivo ? new Map(efectivo.map((f) => [f.mes, f.valor / 100 / 12])) : null;
  const partes = componentes.map((c) => {
    if (c.indice) {
      const r = deSerie(c.indice);
      if (r) return { peso: c.peso / 10000, r };
      avisos.push(`no hay serie «${c.indice}» en Datos: «${c.nombre}» cuenta con rentabilidad 0`);
      return { peso: c.peso / 10000, r: null };
    }
    if (c.grupo === 'efectivo' && tipoEfectivo) return { peso: c.peso / 10000, r: tipoEfectivo };
    if (c.grupo !== 'efectivo') avisos.push(`«${c.nombre}» no tiene índice: cuenta con rentabilidad 0`);
    return { peso: c.peso / 10000, r: null };
  });
  const conSerie = partes.filter((p) => p.r);
  if (!conSerie.length) return { meses: [], r: new Float64Array(0), ipc: null, avisos: [...avisos, 'ningún componente tiene serie: no hay histórico para simular'] };
  const meses = [...conSerie[0].r.keys()].filter((m) => conSerie.every((p) => p.r.has(m))).sort();
  const r = Float64Array.from(meses, (m) => partes.reduce((a, p) => a + p.peso * (p.r ? p.r.get(m) : 0), 0));
  const ipcR = deSerie(SERIE_IPC);
  let ipc = null;
  if (ipcR && meses.every((m) => ipcR.has(m))) ipc = Float64Array.from(meses, (m) => ipcR.get(m));
  else avisos.push(`sin serie «${SERIE_IPC}» para esos meses: «en € de hoy» no se puede descontar`);
  return { meses, r, ipc, avisos };
}

/** "rv 5,5 · 14 | rf 1,5 · 4 | efectivo 0,5 · 0,5" → {rv: {mu, sigma}, …} (reales, anuales, en tanto por uno). */
export function parseSupuestos(texto) {
  const res = {};
  for (const parte of String(texto ?? '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(rv|rf|efectivo|mixto)\s+([\d.,-]+)\s*·\s*([\d.,]+)$/.exec(parte);
    if (!m) return { error: `«${parte}» debe ser «grupo rentabilidad · volatilidad»` };
    const mu = parsePorcentaje(m[2]);
    const sg = parsePorcentaje(m[3]);
    if (!mu.ok || !sg.ok) return { error: `«${parte}»: números no válidos` };
    res[m[1]] = { mu: mu.valor / 10000, sigma: sg.valor / 10000 };
  }
  return res;
}

/** Percentil q (0–1) con interpolación lineal de un array ORDENADO. */
export function percentil(ordenado, q) {
  if (!ordenado.length) return null;
  const pos = (ordenado.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < ordenado.length ? ordenado[i] * (1 - f) + ordenado[i + 1] * f : ordenado[i];
}

/**
 * Simulación genérica: `bloque(prng)` devuelve 12 rentabilidades mensuales (ya reales o nominales).
 * La aportación se suma al final de cada mes. → {anios, p10, p50, p90, puesto} (céntimos, índice = año).
 */
function simular({ inicial, aportacion, anios, caminos, semilla, bloque, pausa = 0 }) {
  const prng = crearPrng(semilla);
  const porAnio = Array.from({ length: anios + 1 }, () => new Float64Array(caminos));
  for (let c = 0; c < caminos; c++) {
    let v = inicial;
    porAnio[0][c] = v;
    for (let a = 1; a <= anios; a++) {
      const rs = bloque(prng);
      for (let k = 0; k < 12; k++) v = v * (1 + rs[k]) + ((a - 1) * 12 + k < pausa ? 0 : aportacion);
      porAnio[a][c] = v;
    }
  }
  const p10 = [];
  const p50 = [];
  const p90 = [];
  for (const vals of porAnio) {
    vals.sort();
    p10.push(Math.round(percentil(vals, 0.1)));
    p50.push(Math.round(percentil(vals, 0.5)));
    p90.push(Math.round(percentil(vals, 0.9)));
  }
  return { anios: Array.from({ length: anios + 1 }, (_, i) => i), p10, p50, p90, puesto: Array.from({ length: anios + 1 }, (_, i) => inicial + aportacion * Math.max(0, 12 * i - pausa)) };
}

const limitarAnios = (n) => Math.min(MAX_ANIOS, Math.max(1, Math.round(Number(n) || 1)));

/**
 * Bootstrap por bloques de 12 meses consecutivos del histórico de la mezcla (§4.4).
 * historico: de historicoMezcla · real: descuenta el IPC del mismo mes del bloque.
 */
export function proyectarHistorico({ inicial, aportacion, anios, historico, real = true, caminos = CAMINOS, semilla = SEMILLA, pausa = 0 }) {
  const n = historico.r.length;
  if (n < 12) return { error: 'hace falta al menos un año de histórico en las series del grupo «Datos»' };
  const descontar = real && historico.ipc;
  const buf = new Float64Array(12);
  const bloque = (prng) => {
    const ini = prng.entero(0, n - 12);
    for (let k = 0; k < 12; k++) buf[k] = descontar ? (1 + historico.r[ini + k]) / (1 + historico.ipc[ini + k]) - 1 : historico.r[ini + k];
    return buf;
  };
  return { ...simular({ inicial, aportacion, anios: limitarAnios(anios), caminos, semilla, bloque, pausa }), modo: 'datos', real: !!descontar, desde: historico.meses[0], hasta: historico.meses.at(-1) };
}

/**
 * Modo manual (`proyeccion: manual`): normal mensual con los supuestos de Ajustes (reales).
 * Mezcla: media y volatilidad ponderadas por peso (como si estuvieran perfectamente correlacionadas:
 * prudente). Mixto = mitad rv, mitad rf. Nominal = real + inflación media de la serie de IPC (o 2 %).
 */
export function proyectarManual({ inicial, aportacion, anios, componentes, supuestos, real = true, inflacion = INFLACION_POR_DEFECTO, caminos = CAMINOS, semilla = SEMILLA, pausa = 0 }) {
  const avisos = [];
  const de = (g) => supuestos[g] ?? (g === 'mixto' && supuestos.rv && supuestos.rf ? { mu: (supuestos.rv.mu + supuestos.rf.mu) / 2, sigma: (supuestos.rv.sigma + supuestos.rf.sigma) / 2 } : null);
  let mu = 0;
  let sigma = 0;
  for (const c of componentes) {
    const s = de(c.grupo ?? 'rv');
    if (!s) {
      avisos.push(`sin supuesto para «${c.grupo}»: «${c.nombre}» cuenta con rentabilidad 0`);
      continue;
    }
    mu += (c.peso / 10000) * s.mu;
    sigma += (c.peso / 10000) * s.sigma;
  }
  if (!real) mu = (1 + mu) * (1 + inflacion) - 1;
  const muM = (1 + mu) ** (1 / 12) - 1;
  const sgM = sigma / Math.sqrt(12);
  const buf = new Float64Array(12);
  const bloque = (prng) => {
    for (let k = 0; k < 12; k++) buf[k] = Math.max(-0.95, prng.normal(muM, sgM));
    return buf;
  };
  return { ...simular({ inicial, aportacion, anios: limitarAnios(anios), caminos, semilla, bloque, pausa }), modo: 'manual', real, mu, sigma, avisos };
}

/** Inflación anual media de una serie de IPC ([{mes, valor}]) o null. */
export function inflacionMedia(filas) {
  if (!filas || filas.length < 13) return null;
  const ord = [...filas].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const anios = (ord.length - 1) / 12;
  return (ord.at(-1).valor / ord[0].valor) ** (1 / anios) - 1;
}

/**
 * Libertad financiera (§4.4): objetivo = consumo de 12 meses × multiplicador; año = el primero en que la
 * mediana lo supera. → {objetivo, anio (índice) | null, masDe (años simulados si no llega)}
 */
export function libertadFinanciera(proyeccion, consumoAnual, multiplicador = 25) {
  if (!consumoAnual || consumoAnual <= 0) return { objetivo: null, anio: null, masDe: null };
  const objetivo = consumoAnual * multiplicador;
  const i = proyeccion.p50.findIndex((v) => v >= objetivo);
  return { objetivo, anio: i < 0 ? null : i, masDe: i < 0 ? proyeccion.anios.at(-1) : null };
}
