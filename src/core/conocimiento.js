// Conocimiento sin IA (§4.7, §6): índice de notas, caducidad, buscador, postura y acierto de cada fuente,
// mezclas con selectores dinámicos, resolución automática de predicciones, calibración y deduplicación
// de Mundo. Todo por código. Isomórfico.
import { bloques, cabeceras } from './formato/motor.js';
import { RE_MEDIR, FUENTES_FIJAS } from './formato/conocimiento.js';
import { normalizar } from './ids.js';
import { diasEntre, sumarDias, mesDe, sumarMesesMes, ultimoDia, esFecha } from './fechas.js';
import { parseDecimal, proporcionPb } from './dinero.js';
import { puntosValor } from './cartera-resumen.js';
import { flujosExternos } from './cartera.js';
import { twr } from './rentabilidad.js';

const POSTURA = { alcista: 1, neutral: 0, bajista: -1 };
export const VIDA_MEDIA_POSTURA = 90;

/** R1 (§0.1): Mis notas son siempre privadas, diga lo que diga _fuentes.md; las demás, según su ficha. */
export const esFuentePrivada = (f) => f.id === 'mias' || f.familia === 'mias' || !!f.privada;
/** Ids de las fuentes privadas: siempre incluye «mias», aunque _fuentes.md no la tenga. */
export const fuentesPrivadas = (modelo) => new Set(['mias', ...modelo.fuentes.filter(esFuentePrivada).map((f) => f.id)]);

/** Fuente a la que pertenece una ruta de conocimiento/ (por su carpeta). */
export function fuenteDeRuta(ruta) {
  const m = /^conocimiento\/([^/_][^/]*)\//.exec(ruta);
  return m ? m[1] : null;
}

/**
 * Todas las notas de la carpeta (base, datos, mundo, mias y cada fuente).
 * → [{id, titulo, ruta, fuente, tipo, fecha, temas, activos, postura, caduca, cuerpo, origen, verificar, editada, campos}]
 */
export function indiceNotas(modelo) {
  const lista = [];
  for (const [ruta, doc] of modelo.docs) {
    if (doc.tipo !== 'notas' || !ruta.startsWith('conocimiento/')) continue;
    const cab = cabeceras(doc);
    // R1 (§0.3.7): la fuente de una nota es SU CARPETA. Los campos «fuente:» del fichero no mandan: si no, una
    // nota de conocimiento/mias/ con «fuente: mundo» pasaría por pública y llegaría a los trabajos con internet.
    const deCarpeta = fuenteDeRuta(ruta);
    const porDefecto = deCarpeta ?? cab.fuente;
    for (const b of bloques(doc)) {
      const c = b.campos;
      lista.push({ id: b.id, titulo: b.titulo, ruta, fuente: deCarpeta ?? c.fuente ?? porDefecto, tipo: c.tipo, fecha: c.fecha ?? cab.fecha ?? null, temas: c.temas ?? [], activos: c.activos ?? [], postura: c.postura ?? null, caduca: c.caduca ?? null, cuerpo: b.cuerpo, origen: c.origen ?? cab.origen ?? null, verificar: c.verificar ?? null, editada: !!c.editada, campos: c });
    }
  }
  return lista.sort((a, b) => ((b.fecha ?? '') < (a.fecha ?? '') ? -1 : (b.fecha ?? '') > (a.fecha ?? '') ? 1 : a.id < b.id ? -1 : 1));
}

/**
 * Caducidad de una nota (§4.7): su «caduca:», o su fecha + la caducidad de su fuente o de la familia.
 * → fecha de caducidad o null (no caduca).
 */
export function fechaCaducidad(nota, fuentes, familias) {
  if (nota.caduca) return nota.caduca;
  if (!nota.fecha) return null;
  const f = fuentes.find((x) => x.id === nota.fuente);
  const dur = f?.caducidad ?? familias.find((x) => x.id === f?.familia)?.caducidad ?? null;
  return dur ? sumarDias(nota.fecha, dur.dias) : null;
}

export const caducada = (nota, hoy, fuentes, familias) => {
  const c = fechaCaducidad(nota, fuentes, familias);
  return !!c && c < hoy;
};

/**
 * Buscador (§5 Conocimiento): texto (id, título, cuerpo, temas, activos; sin tildes), tipo, fuente, tema,
 * activo, fechas y caducadas (por defecto, sí se buscan).
 */
export function buscarNotas(notas, { texto = '', tipo = '', fuente = '', tema = '', activo = '', desde = '', hasta = '', caducadas = true } = {}, { hoy, fuentes = [], familias = [] } = {}) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  return notas.filter((n) => {
    if (tipo && n.tipo !== tipo) return false;
    if (fuente && n.fuente !== fuente) return false;
    if (tema && !n.temas.includes(tema)) return false;
    if (activo && !n.activos.includes(activo)) return false;
    if (desde && (n.fecha ?? '') < desde) return false;
    if (hasta && (n.fecha ?? '9999') > hasta) return false;
    if (!caducadas && hoy && caducada(n, hoy, fuentes, familias)) return false;
    if (!palabras.length) return true;
    const pajar = normalizar([n.id, n.titulo, n.cuerpo, ...n.temas, ...n.activos].join(' '));
    return palabras.every((p) => pajar.includes(p));
  });
}

/**
 * Postura de una fuente (§4.7): media de la postura de sus notas (−1, 0, 1) ponderada por recencia con una
 * vida media de 90 días, a fecha `hoy`. → número en [−1, 1] o null si ninguna nota tiene postura.
 */
export function posturaFuente(notas, hoy) {
  let s = 0;
  let w = 0;
  for (const n of notas) {
    if (!n.postura || !n.fecha || n.fecha > hoy) continue;
    const peso = 0.5 ** (diasEntre(n.fecha, hoy) / VIDA_MEDIA_POSTURA);
    s += peso * POSTURA[n.postura];
    w += peso;
  }
  return w ? s / w : null;
}

/** Postura de la fuente a fin de cada uno de los últimos n meses (para la ficha). */
export function posturaEnElTiempo(notas, hoy, n = 12) {
  const fin = mesDe(hoy);
  return Array.from({ length: n }, (_, i) => {
    const mes = sumarMesesMes(fin, i - (n - 1));
    const f = i === n - 1 ? hoy : ultimoDia(mes);
    return { mes, postura: posturaFuente(notas, f) };
  });
}

/** Acierto por fuente (§4.7): acertadas ÷ resueltas (sin «no medible»); con menos de `minimo`, null. */
export function aciertoPorFuente(predicciones, { minimo = 5 } = {}) {
  const por = new Map();
  for (const p of predicciones) {
    if (!['acertada', 'fallida'].includes(p.estado)) continue;
    const x = por.get(p.fuente) ?? { fuente: p.fuente, resueltas: 0, acertadas: 0 };
    x.resueltas++;
    if (p.estado === 'acertada') x.acertadas++;
    por.set(p.fuente, x);
  }
  return new Map([...por].map(([k, x]) => [k, { ...x, aciertoPb: x.resueltas >= minimo ? proporcionPb(x.acertadas, x.resueltas) : null }]));
}

/**
 * Resumen de cada fuente para la tabla y la ficha.
 * → [{id, nombre, familia, notas, postura, acierto: {aciertoPb, resueltas}, ultima, temas: [[tema, n]], privada, activa, fija}]
 */
export function resumenFuentes(modelo, hoy, notas = indiceNotas(modelo)) {
  const porFuente = new Map();
  for (const n of notas) (porFuente.get(n.fuente) ?? porFuente.set(n.fuente, []).get(n.fuente)).push(n);
  const aciertos = aciertoPorFuente(modelo.predicciones);
  return modelo.fuentes.map((f) => {
    const ns = porFuente.get(f.id) ?? [];
    const temas = new Map();
    for (const n of ns) for (const t of n.temas) temas.set(t, (temas.get(t) ?? 0) + 1);
    return {
      id: f.id,
      nombre: f.nombre,
      familia: f.familia,
      prefijo: f.prefijo ?? null,
      caducidad: f.caducidad ?? null,
      notas: ns.length,
      postura: posturaFuente(ns, hoy),
      acierto: aciertos.get(f.id) ?? { aciertoPb: null, resueltas: 0, acertadas: 0 },
      ultima: ns.reduce((u, n) => (n.fecha && (!u || n.fecha > u) ? n.fecha : u), null),
      temas: [...temas].sort((a, b) => b[1] - a[1]).slice(0, 8),
      privada: esFuentePrivada(f),
      activa: !!f.activa_por_defecto,
      fija: FUENTES_FIJAS.includes(f.id),
    };
  });
}

// ---------- mezclas (§6) ----------
const comparar = (a, op, b) => ({ '=': a === b, '!=': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b })[op];

/**
 * Resuelve los miembros de una mezcla (ids y selectores dinámicos) contra las fuentes actuales.
 * resumen: de resumenFuentes. → {fuentes: [ids], borradas: [ids que ya no existen]}
 * `@postura<=-0,3` usa la postura media; `@acierto>=65` el acierto en % (sin acierto, no entra); `@familia=yt`.
 */
export function resolverMezcla(miembros, resumen) {
  const porId = new Map(resumen.map((r) => [r.id, r]));
  const out = new Set();
  const borradas = [];
  for (const m of miembros) {
    if (typeof m === 'string') {
      if (porId.has(m)) out.add(m);
      else borradas.push(m);
      continue;
    }
    for (const r of resumen) {
      const v = m.campo === 'familia' ? r.familia : m.campo === 'postura' ? r.postura : r.acierto.aciertoPb === null ? null : r.acierto.aciertoPb / 100;
      if (v === null || v === undefined) continue;
      if (comparar(v, m.op, m.valor)) out.add(r.id);
    }
  }
  return { fuentes: resumen.map((r) => r.id).filter((id) => out.has(id)), borradas };
}

/** Nombre de la mezcla activa (la de «activa_por_defecto») si coincide con una guardada; si no, «personalizada». */
export function nombreMezclaActiva(activas, mezclas, resumen) {
  const clave = [...activas].sort().join(',');
  const m = mezclas.find((x) => resolverMezcla(x.miembros, resumen).fuentes.sort().join(',') === clave);
  return m ? m.nombre : 'personalizada';
}

// ---------- predicciones (§4.7) ----------
/** "msci-world-nr-eur variacion 2026-01-01→2026-12-31 > 0" → {serie, metrica, desde, hasta, op, valor | rango} | null */
export function parseMedir(texto) {
  const m = RE_MEDIR.exec(String(texto ?? '').trim());
  if (!m || !esFecha(m[3]) || !esFecha(m[4])) return null;
  const r = { serie: m[1], metrica: m[2], desde: m[3], hasta: m[4], op: m[5] ?? null };
  const num = (s) => {
    const x = parseDecimal(String(s).trim().replace(/^\+/, ''), 4);
    return x.ok ? x.valor / 10000 : null;
  };
  if (r.op === 'en') {
    const p = /^(-?[\d.,]+)\s*(?:…|\.\.\.|\.\.)\s*(-?[\d.,]+)$/.exec(String(m[6]).trim());
    if (!p) return null;
    r.rango = [num(p[1]), num(p[2])];
    if (r.rango.some((x) => x === null)) return null;
  } else if (r.op) {
    r.valor = num(m[6]);
    if (r.valor === null) return null;
  }
  return r;
}

/**
 * Valor medido de una predicción con las series de Datos (filas mensuales) o la cartera (twr, fotos).
 * Los cálculos en % (variación, caída y subida máximas, twr) dan el número en puntos (10 = 10 %).
 * → {valor, completo} · completo = el periodo ya terminó (o la condición ya se cumplió en una máxima).
 */
export function medir(p, { serie, cartera = null, hoy }) {
  const mesIni = mesDe(p.desde);
  const mesFin = mesDe(p.hasta);
  const terminado = p.hasta <= hoy;
  if (p.serie === 'cartera') {
    if (p.metrica !== 'twr' || !cartera) return null;
    const puntos = puntosValor({ ...cartera, hoy: terminado ? p.hasta : hoy });
    const r = twr(puntos, flujosExternos(cartera.operaciones, { hasta: p.hasta }), { desde: [...puntos].reverse().find((x) => x.fecha <= p.desde)?.fecha ?? p.desde, hasta: p.hasta });
    return r.tasa === null ? null : { valor: r.tasa * 100, completo: terminado };
  }
  if (!serie?.length) return null;
  const m = new Map(serie.map((f) => [f.mes, f.valor]));
  const meses = [...m.keys()].filter((x) => x >= mesIni && x <= mesFin).sort();
  if (!meses.length) return null;
  const ultimo = meses.at(-1);
  const completo = terminado && ultimo === mesFin;
  // la referencia de partida es el cierre del mes anterior a «desde» si existe (el valor de ese día)
  const ref = m.get(sumarMesesMes(mesIni, -1)) ?? m.get(mesIni);
  if (p.metrica === 'nivel') return { valor: m.get(ultimo), completo };
  if (p.metrica === 'variacion') return { valor: (m.get(ultimo) / ref - 1) * 100, completo };
  let pico = ref;
  let valle = ref;
  let caida = 0;
  let subida = 0;
  for (const mes of meses) {
    const v = m.get(mes);
    pico = Math.max(pico, v);
    valle = Math.min(valle, v);
    caida = Math.max(caida, (1 - v / pico) * 100);
    subida = Math.max(subida, (v / valle - 1) * 100);
  }
  return { valor: p.metrica === 'caída-max' ? caida : subida, completo };
}

/**
 * Resolución automática (§4.7): si la serie existe y el periodo terminó (o una caída/subida máxima ya pasó
 * el umbral), → {estado: acertada|fallida, valor, resuelta}; si no se puede todavía, null.
 */
export function resolverPrediccion(pred, { series, cartera, hoy }) {
  const p = parseMedir(pred.medir);
  if (!p || !p.op) return null;
  const r = medir(p, { serie: p.serie === 'cartera' ? null : series(p.serie), cartera, hoy });
  if (!r) return null;
  const cumple = p.op === 'en' ? r.valor >= p.rango[0] && r.valor <= p.rango[1] : comparar(r.valor, p.op, p.valor);
  const anticipada = ['caída-max', 'subida-max'].includes(p.metrica) && ['>', '>='].includes(p.op) && cumple && p.hasta > hoy;
  if (!r.completo && !anticipada) return null;
  return { estado: cumple ? 'acertada' : 'fallida', valor: Math.round(r.valor * 1e4) / 1e4, resuelta: anticipada ? hoy : p.hasta };
}

/** Calibración de finhub (§4.7): % de los rangos registrados (cartera twr … en a…b) que contuvieron el real. */
export function calibracion(predicciones) {
  const rangos = predicciones.filter((p) => p.fuente?.startsWith('finhub') && / en /.test(p.medir ?? '') && ['acertada', 'fallida'].includes(p.estado));
  return { resueltos: rangos.length, aciertos: rangos.filter((p) => p.estado === 'acertada').length, pb: rangos.length ? proporcionPb(rangos.filter((p) => p.estado === 'acertada').length, rangos.length) : null };
}

// ---------- deduplicación de Mundo (§4.7) ----------
const palabrasDe = (t) => new Set(normalizar(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));

/** Similitud de Jaccard entre dos títulos normalizados. */
export function jaccard(a, b) {
  const A = palabrasDe(a);
  const B = palabrasDe(b);
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const w of A) if (B.has(w)) comun++;
  return comun / (A.size + B.size - comun);
}

const urlDe = (origen) => /https?:\/\/\S+/.exec(origen ?? '')?.[0]?.replace(/[)/.,]+$/, '') ?? null;

/** ¿Es `nueva` un duplicado de alguna de `existentes`? Misma URL, o títulos con Jaccard ≥ 0,6 a ±1 día. */
export function duplicadoDe(nueva, existentes) {
  const u = urlDe(nueva.origen);
  return existentes.find((n) => (u && urlDe(n.origen) === u) || (n.fecha && nueva.fecha && Math.abs(diasEntre(n.fecha, nueva.fecha)) <= 1 && jaccard(n.titulo, nueva.titulo) >= 0.6)) ?? null;
}

/** KPI de la pestaña. */
export function kpisConocimiento(modelo, hoy, notas, resumen) {
  const semana = sumarDias(hoy, -7);
  const mejor = [...resumen].filter((r) => r.acierto.aciertoPb !== null).sort((a, b) => b.acierto.aciertoPb - a.acierto.aciertoPb)[0] ?? null;
  return {
    fuentes: resumen.length,
    familias: modelo.familias.length,
    notas: notas.length,
    nuevas: notas.filter((n) => n.fecha && n.fecha > semana && n.fecha <= hoy).length,
    activas: resumen.filter((r) => r.activa).length,
    mejor,
  };
}
