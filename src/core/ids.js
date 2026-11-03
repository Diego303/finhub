// Identificadores estables (§2.5, docs/FORMATOS.md §1.2).

const RE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Quita tildes y pasa a minúsculas: clave para comparar ids sin depender de mayúsculas (D: no las distingue). */
export const normalizar = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC').toLowerCase().trim();

/** "Hucha Japón" → "hucha-japon" (≤ 40, cortado en un guion si hace falta). */
export function slug(texto) {
  let s = normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/-[^-]*$/, '') || s.slice(0, 40);
  return s || 'x';
}

export const esSlug = (s) => RE_SLUG.test(s) && s.length <= 40;

/** Slug que no choca con `existentes` (Set o array): añade -2, -3… */
export function slugUnico(texto, existentes) {
  const usados = new Set([...existentes].map(normalizar));
  const base = slug(texto);
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base.slice(0, 40 - String(n).length - 1)}-${n}`;
    if (!usados.has(cand)) return cand;
  }
}

/** Siguiente correlativo: ("OP", ["OP-0041","OP-0042"], 4) → "OP-0043". */
export function siguienteCorrelativo(prefijo, existentes, ancho = 4) {
  const re = new RegExp(`^${prefijo}-(\\d+)$`, 'i');
  let max = 0;
  for (const id of existentes) {
    const m = re.exec(id);
    if (m) max = Math.max(max, +m[1]);
  }
  return `${prefijo}-${String(max + 1).padStart(ancho, '0')}`;
}

/** Id corto de movimiento (4 caracteres base36) único dentro de `existentes`. `prng.siguiente()` da el azar. */
export function idCorto(existentes, prng) {
  const usados = new Set(existentes);
  for (let intento = 0; intento < 10000; intento++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += BASE36[Math.floor(prng.siguiente() * 36)];
    if (!usados.has(s)) return s;
  }
  throw new Error('no quedan ids cortos libres');
}

/** Id de nota de Mundo con año: ("2026-11-03", existentes) → "M-261103-01". */
export function idNotaMundo(fecha, existentes) {
  return siguienteCorrelativo(`M-${fecha.slice(2, 4)}${fecha.slice(5, 7)}${fecha.slice(8, 10)}`, existentes, 2);
}

/** ISIN: 2 letras de país, 9 alfanuméricos y dígito de control (Luhn sobre la conversión A=10…Z=35). */
export function validarIsin(isin) {
  const s = String(isin).toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
  const digitos = [...s.slice(0, 11)].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
  let suma = 0;
  let doblar = true; // empezando por la derecha (sin el dígito de control), se dobla el primero
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = +digitos[i];
    if (doblar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doblar = !doblar;
  }
  return (10 - (suma % 10)) % 10 === +s[11];
}

/** Prefijo de correlativo de las notas de una fuente (B, DT, M, N, P, IND…). */
export const RE_ID_NOTA = /^[A-Z]{1,4}-\d{2,6}(-\d{2})?$/;
