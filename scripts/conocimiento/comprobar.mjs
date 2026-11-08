// Comprobaciones puras de la pasada 3 que necesitan comparar con las fuentes: copia y cifras.
// También la caché (lectura de los textos extraídos por traer.mjs) y las reglas de la app que se copian aquí
// porque src/core/conocimiento.js no carga sin módulos que el zip no trae (cartera, rentabilidad…).
// Nunca devuelve más de 12 palabras de una fuente.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizar } from '../../src/core/ids.js';
import { diasEntre } from '../../src/core/fechas.js';
import { COPIA_PALABRAS } from './config.mjs';

const RAIZ = resolve(import.meta.dirname, '..', '..');
export const PAGINAS = join(RAIZ, '.cache', 'conocimiento', 'paginas');

// ---------- reglas copiadas de la app (src/core/conocimiento.js y src/core/ops/ia.js) ----------
/** Copia literal de `palabrasDe` / `jaccard` de src/core/conocimiento.js. */
const palabrasDe = (t) => new Set(normalizar(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function jaccard(a, b) {
  const A = palabrasDe(a);
  const B = palabrasDe(b);
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const w of A) if (B.has(w)) comun++;
  return comun / (A.size + B.size - comun);
}
/** Copia literal de `urlDe` de src/core/conocimiento.js: la primera URL de `origen`. */
export const urlDe = (origen) => /https?:\/\/\S+/.exec(origen ?? '')?.[0]?.replace(/[)/.,]+$/, '') ?? null;
/** Copia literal de `duplicadoDe`: misma URL, o títulos con Jaccard ≥ 0,6 a ±1 día. */
export function duplicadoDe(nueva, existentes) {
  const u = urlDe(nueva.origen);
  return existentes.find((n) => (u && urlDe(n.origen) === u) || (n.fecha && nueva.fecha && Math.abs(diasEntre(n.fecha, nueva.fecha)) <= 1 && jaccard(n.titulo, nueva.titulo) >= 0.6)) ?? null;
}
/** Copia literal de `cortoUrl` de src/core/ops/ia.js: el `hash` de Mundo. */
export const cortoUrl = (u) => {
  let h = 0;
  for (const c of String(u)) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h.toString(36).padStart(6, '0').slice(-6);
};

// ---------- caché ----------
export function textoCache(sha, dir = PAGINAS) {
  if (!/^[0-9a-f]{64}$/.test(String(sha ?? ''))) return null;
  const f = join(dir, `${sha}.txt.gz`);
  if (!existsSync(f)) return null;
  return gunzipSync(readFileSync(f)).toString('utf8');
}
export const enCache = (sha, dir = PAGINAS) => /^[0-9a-f]{64}$/.test(String(sha ?? '')) && existsSync(join(dir, `${sha}.gz`));

// ---------- copia ----------
const RE_PALABRA = /[\p{L}\p{N}]+(?:[.,'’][\p{L}\p{N}]+)*/gu;
const esCifra = (w) => /\p{N}/u.test(w);
const esNombre = (w) => /^\p{Lu}/u.test(w);
/** Palabras comparables: sin cifras ni nombres (mayúscula inicial), en minúsculas y sin tildes. */
export function palabrasComparables(texto) {
  return (String(texto).match(RE_PALABRA) ?? []).filter((w) => !esCifra(w) && !esNombre(w)).map((w) => normalizar(w));
}
/** ¿Copia la nota ≥ n palabras seguidas de la fuente? → fragmento de la nota (≤ 12 palabras) o null. */
export function copiaEn(textoNota, textoFuente, n = COPIA_PALABRAS) {
  const a = palabrasComparables(textoNota);
  const b = palabrasComparables(textoFuente);
  if (a.length < n || b.length < n) return null;
  const vistos = new Set();
  for (let i = 0; i + n <= b.length; i++) vistos.add(b.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= a.length; i++) {
    const g = a.slice(i, i + n).join(' ');
    if (vistos.has(g)) return a.slice(i, i + Math.min(n, 12)).join(' ');
  }
  return null;
}

// ---------- cifras ----------
const RE_NUMERO = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?![\p{L}\p{N}])/gu;
/** Valores posibles de un número escrito: «1.249» puede ser 1249 (es) o 1,249 (en). → [{v, dec}] */
export function lecturas(tok) {
  const res = [];
  const add = (s) => {
    if (!/^\d+(\.\d+)?$/.test(s)) return;
    res.push({ v: Number(s), dec: s.includes('.') ? s.split('.')[1].length : 0 });
  };
  if (/^\d+$/.test(tok)) add(tok);
  // español: puntos de miles, coma decimal
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(tok) || /^\d+,\d+$/.test(tok)) add(tok.replace(/\./g, '').replace(',', '.'));
  // inglés: comas de miles, punto decimal
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(tok) || /^\d+\.\d+$/.test(tok)) add(tok.replace(/,/g, ''));
  return res;
}
export const numerosDe = (texto) => [...String(texto).matchAll(RE_NUMERO)].map((m) => m[0]);

/**
 * Números de la nota que no aparecen en ninguna fuente. Se acepta el redondeo solo si la nota da decimales
 * (rentabilidades «redondeadas a un decimal»): 7,49 en la fuente vale para 7,5 en la nota.
 */
export function cifrasAusentes(textoNota, textosFuentes) {
  const valores = [];
  for (const t of textosFuentes) for (const tok of numerosDe(t)) valores.push(...lecturas(tok));
  const exactos = new Set(valores.map((x) => x.v));
  const faltan = [];
  for (const tok of numerosDe(textoNota)) {
    const ls = lecturas(tok);
    if (!ls.length) continue;
    const esta = ls.some((l) => exactos.has(l.v) || (l.dec >= 1 && valores.some((s) => s.dec > l.dec && Math.abs(Math.round(s.v * 10 ** l.dec) / 10 ** l.dec - l.v) < 1e-9)));
    if (!esta && !faltan.includes(tok)) faltan.push(tok);
  }
  return faltan;
}
