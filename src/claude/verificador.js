// Verificador de salidas (§8.4): cifras (cada número del texto tiene que venir de <cifras>, de <datos> o
// ser una probabilidad del propio JSON), citas (los ids deben existir en <datos>), probabilidades (enteras,
// entre 5 y 90 y que sumen 100) y lenguaje de recomendación (se resalta y se registra).

const RE_NUM = /(?<![\w.,-])[-−+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\w])|(?<![\w.,-])[-−+]?\d{1,3}(?:[.\s ]\d{3})+(?:,\d+)?(?![\w])|(?<![\w.,-])[-−+]?\d+(?:[.,]\d+)?(?![\w])/g;
const RE_ID = /\b[A-Z]{1,4}-\d{2,6}(?:-\d{2})?\b/g;
export const RE_RECOMENDACION = /\b(compra|vende|comprar ya|vender ya|precio objetivo|te recomiendo (?:comprar|vender))\b/gi;

/** Valores posibles de un número escrito (es-ES «1.234,5» y en-US «1,234.5»). */
export function interpretar(s) {
  return lecturas(s).map((l) => l.v);
}

/** Lecturas posibles de un número escrito, con sus decimales: [{v, decimales}] */
function lecturas(s) {
  const t = String(s).replace(/[−]/g, '-').replace(/[\s ]/g, '');
  const out = new Map();
  const anadir = (x) => {
    const n = Number(x);
    if (Number.isFinite(n) && !out.has(n)) out.set(n, x.split('.')[1]?.length ?? 0);
  };
  anadir(t.replace(/\./g, '').replace(',', '.')); // es-ES
  anadir(t.replace(/,/g, '')); // en-US
  anadir(t.replace(',', '.'));
  return [...out].map(([v, decimales]) => ({ v, decimales }));
}

/** Todos los números de un texto, con su forma escrita y si llevan unidad (%, €…). */
export function numeros(texto) {
  // los números de una URL no son cifras; los de un id ([B-1001]) tampoco (el «-» de delante no es un signo)
  const limpio = String(texto ?? '').replace(/https?:\/\/\S+/g, ' ');
  return [...limpio.matchAll(RE_NUM)].map((m) => ({ texto: m[0], lecturas: lecturas(m[0]), valores: interpretar(m[0]), conUnidad: /^\s*(%|€|eur\b|euros?\b|puntos?\b|pb\b)/i.test(limpio.slice(m.index + m[0].length)) }));
}

/** Tolerancia de redondeo: media unidad del último decimal escrito, o un 0,5 % de la cifra si es mayor. */
const parecido = (l, p) => Math.abs(Math.abs(l.v) - Math.abs(p)) <= Math.max(0.5 * 10 ** -l.decimales, Math.abs(p) * 0.005) + 1e-9;

/**
 * Comprueba los números de `texto` contra los permitidos (cifras, números de los datos y probabilidades).
 * Sin unidad se aceptan los enteros pequeños de enumeraciones (0–12) y los años (1900–2100).
 * → [{texto}] no verificadas
 */
export function cifrasNoVerificadas(texto, permitidos) {
  const lista = [...permitidos];
  const libre = (n) => !n.conUnidad && n.lecturas.some((l) => l.decimales === 0 && Number.isInteger(l.v) && ((l.v >= 0 && l.v <= 12) || (l.v >= 1900 && l.v <= 2100)));
  return numeros(texto).filter((n) => !libre(n) && !n.lecturas.some((l) => lista.some((p) => parecido(l, p))));
}

/** Números permitidos: los de <cifras>, los que aparecen en el texto de <datos> y las probabilidades del JSON. */
export function permitidos({ cifras = [], datos = '', probabilidades = [] }) {
  const s = new Set(probabilidades);
  for (const c of cifras) for (const n of numeros(c.valor)) n.valores.forEach((v) => s.add(v));
  for (const n of numeros(datos)) n.valores.forEach((v) => s.add(v));
  return s;
}

/**
 * Citas: devuelve las válidas y las inventadas (que se quitan). Una URL no se confunde con un id aunque lleve
 * algo parecido dentro; solo vale en los trabajos con internet (`urls`): en uno privado, una URL con datos en
 * la query sería una forma de sacarlos.
 */
export function revisarCitas(citas, idsValidos, { urls = true } = {}) {
  const ok = new Set(idsValidos);
  const validas = [];
  const inventadas = [];
  for (const c of citas ?? []) {
    if (/^(web:)?https?:\/\//i.test(String(c).trim())) {
      (urls ? validas : inventadas).push(c);
      continue;
    }
    const ids = String(c).match(RE_ID);
    if (!ids) {
      validas.push(c); // una referencia que no es un id de nota
      continue;
    }
    (ids.every((id) => ok.has(id)) ? validas : inventadas).push(c);
  }
  return { validas, inventadas };
}

/** Ids citados en un texto ([B-1001]) que no existen (lo que hay dentro de una URL no es un id). */
export const idsInventados = (texto, idsValidos) => {
  const ok = new Set(idsValidos);
  return [...new Set((String(texto ?? '').replace(/https?:\/\/\S+/g, ' ').match(RE_ID) ?? []).filter((id) => !ok.has(id)))];
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
