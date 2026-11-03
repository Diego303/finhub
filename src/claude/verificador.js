// Verificador de salidas (§8.4): cifras (cada número del texto tiene que venir de <cifras>, de <datos> o
// ser una probabilidad del propio JSON), citas (los ids deben existir en <datos>), probabilidades (enteras,
// entre 5 y 90 y que sumen 100) y lenguaje de recomendación (se resalta y se registra).

const RE_NUM = /(?<![\w.,])[-−+]?\d{1,3}(?:[.\s ]\d{3})+(?:,\d+)?(?![\w])|(?<![\w.,])[-−+]?\d+(?:[.,]\d+)?(?![\w])/g;
const RE_ID = /\b[A-Z]{1,4}-\d{2,6}(?:-\d{2})?\b/g;
export const RE_RECOMENDACION = /\b(compra|vende|comprar ya|vender ya|precio objetivo|te recomiendo (?:comprar|vender))\b/gi;

/** Valores posibles de un número escrito (es-ES «1.234,5» y en-US «1,234.5»). */
export function interpretar(s) {
  const t = String(s).replace(/[−]/g, '-').replace(/[\s ]/g, '');
  const out = new Set();
  const es = t.replace(/\./g, '').replace(',', '.');
  const en = t.replace(/,/g, '');
  for (const x of [es, en, t.replace(',', '.')]) {
    const n = Number(x);
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}

/** Todos los números de un texto, con su forma escrita. */
export function numeros(texto) {
  return [...String(texto ?? '').matchAll(RE_NUM)].map((m) => ({ texto: m[0], valores: interpretar(m[0]) }));
}

const parecido = (a, b) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.005);

/**
 * Comprueba los números de `texto` contra los permitidos (cifras, números de los datos y probabilidades).
 * Los años (1900–2100) que aparecen en los datos y los enteros pequeños de enumeraciones (1–12) se aceptan.
 * → [{texto}] no verificadas
 */
export function cifrasNoVerificadas(texto, permitidos) {
  const lista = [...permitidos];
  return numeros(texto).filter((n) => !n.valores.some((v) => (Number.isInteger(v) && v >= 0 && v <= 12) || lista.some((p) => parecido(Math.abs(v), Math.abs(p)))));
}

/** Números permitidos: los de <cifras>, los que aparecen en el texto de <datos> y las probabilidades del JSON. */
export function permitidos({ cifras = [], datos = '', probabilidades = [] }) {
  const s = new Set(probabilidades);
  for (const c of cifras) for (const n of numeros(c.valor)) n.valores.forEach((v) => s.add(v));
  for (const n of numeros(datos)) n.valores.forEach((v) => s.add(v));
  return s;
}

/** Citas: devuelve las válidas y las inventadas (que se quitan). */
export function revisarCitas(citas, idsValidos) {
  const ok = new Set(idsValidos);
  const validas = [];
  const inventadas = [];
  for (const c of citas ?? []) {
    const ids = String(c).match(RE_ID);
    if (!ids) {
      validas.push(c); // una URL o una referencia que no es un id de nota
      continue;
    }
    (ids.every((id) => ok.has(id)) ? validas : inventadas).push(c);
  }
  return { validas, inventadas };
}

/** Ids citados en un texto ([B-1001]) que no existen. */
export const idsInventados = (texto, idsValidos) => {
  const ok = new Set(idsValidos);
  return [...new Set((String(texto ?? '').match(RE_ID) ?? []).filter((id) => !ok.has(id)))];
};

/** Probabilidades de escenarios (§8.4): enteras, entre 5 y 90, suma 100. → errores */
export function revisarProbabilidades(probs) {
  const e = [];
  if (!probs.length) return e;
  if (probs.some((p) => !Number.isInteger(p))) e.push('las probabilidades deben ser enteras');
  if (probs.some((p) => p < 5 || p > 90)) e.push('cada probabilidad debe estar entre 5 y 90');
  const suma = probs.reduce((a, b) => a + b, 0);
  if (suma !== 100) e.push(`las probabilidades suman ${suma}, no 100`);
  return e;
}

/** Frases de recomendación de compra o venta (se resaltan y se registran). */
export const recomendaciones = (texto) => [...new Set((String(texto ?? '').match(RE_RECOMENDACION) ?? []).map((x) => x.toLowerCase()))];
