// Dinero exacto: importes en céntimos enteros, porcentajes en puntos básicos (pb), cantidades en
// millonésimas. Nada de floats para lo que se guarda. Redondeo bancario (mitad al par).

export const MAX_CENTIMOS = 1e13; // 100.000 millones de euros
const ESPACIOS = /[\s   ]/g;
const MENOS = /[−–]/g; // «−» (signo menos) y «–» (raya corta) → «-»

const ok = (valor) => ({ ok: true, valor });
const mal = (error) => ({ ok: false, error });

/**
 * Separa signo, parte entera y decimales de un número escrito en es-ES o en-US.
 * Reglas (docs/FORMATOS.md §1.1): con coma, la coma es decimal y los puntos son miles en grupos de 3;
 * sin coma, un punto seguido de 1–2 dígitos finales es decimal; puntos con grupos de 3 son miles.
 */
function descomponer(texto, maxDecimales) {
  if (texto === null || texto === undefined) return mal('vacío');
  let s = String(texto).replace(MENOS, '-').replace(ESPACIOS, '');
  if (s === '') return mal('vacío');
  let negativo = false;
  if (s[0] === '-' || s[0] === '+') {
    negativo = s[0] === '-';
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return mal(`«${texto}» no es un número`);
  let entera;
  let decimales = '';
  const comas = s.split(',').length - 1;
  if (comas > 1) return mal(`«${texto}» tiene varias comas`);
  if (comas === 1) {
    [entera, decimales] = s.split(',');
    if (!/^\d+$/.test(decimales)) return mal(`«${texto}»: decimales no válidos`);
    if (entera === '') entera = '0';
    if (entera.includes('.')) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(entera)) return mal(`«${texto}»: los puntos de miles deben separar grupos de 3`);
      entera = entera.replaceAll('.', '');
    }
  } else if (s.includes('.')) {
    if (/^\d+\.\d{1,2}$/.test(s)) [entera, decimales] = s.split('.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) entera = s.replaceAll('.', '');
    else return mal(`«${texto}»: número ambiguo; usa coma para los decimales`);
  } else {
    entera = s;
  }
  if (decimales.length > maxDecimales) return mal(`«${texto}» tiene más de ${maxDecimales} decimales`);
  entera = entera.replace(/^0+(?=\d)/, '');
  if (entera.length > 16) return mal(`«${texto}» es demasiado grande`);
  return ok({ negativo, entera, decimales });
}

/** Convierte las partes a entero escalado (10^escala) sin pasar por floats. */
function aEscalado({ negativo, entera, decimales }, escala) {
  const n = BigInt(entera) * 10n ** BigInt(escala) + BigInt((decimales + '0'.repeat(escala)).slice(0, escala) || '0');
  const v = negativo ? -n : n;
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(v) || 0; // evita -0
}

/** "1.234,56" · "-12,5" · "−12,5" · "12.5" · "+24" → céntimos enteros. */
export function parseImporte(texto) {
  const d = descomponer(texto, 2);
  if (!d.ok) return d;
  const c = aEscalado(d.valor, 2);
  if (c === null || Math.abs(c) > MAX_CENTIMOS) return mal(`«${texto}» está fuera de rango`);
  return ok(c);
}

/** "19" → 1900 pb · "0,12" → 12 pb · "2,5 %" → 250 pb. */
export function parsePorcentaje(texto) {
  const s = String(texto ?? '').replace(/%\s*$/, '').trim();
  const d = descomponer(s, 2);
  if (!d.ok) return d;
  const v = aEscalado(d.valor, 2);
  return v === null ? mal(`«${texto}» está fuera de rango`) : ok(v);
}

/** Cantidad con hasta `escala` decimales (participaciones, niveles de series) → entero ×10^escala. */
export function parseDecimal(texto, escala = 6) {
  const d = descomponer(texto, escala);
  if (!d.ok) return d;
  const v = aEscalado(d.valor, escala);
  return v === null ? mal(`«${texto}» está fuera de rango`) : ok(v);
}

function agruparMiles(digitos) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatea un entero escalado con `decimales` fijos (o mínimos si `minimos`). */
function formatearEscalado(n, escala, { decimales = escala, minimos = false, menos = '-', miles = true } = {}) {
  if (!Number.isSafeInteger(n)) throw new TypeError(`no es un entero seguro: ${n}`);
  let v = BigInt(n);
  const negativo = v < 0n;
  if (negativo) v = -v;
  if (decimales < escala) v = dividirBigRedondeo(v, 10n ** BigInt(escala - decimales));
  const nd = Math.min(decimales, escala);
  const div = 10n ** BigInt(nd);
  const entera = (v / div).toString();
  let dec = nd ? (v % div).toString().padStart(nd, '0') : '';
  if (minimos) dec = dec.replace(/0+$/, '');
  const cuerpo = (miles ? agruparMiles(entera) : entera) + (dec ? ',' + dec : '');
  return (negativo && /[1-9]/.test(cuerpo) ? menos : '') + cuerpo;
}

/** Céntimos → canónico de fichero: "-1.234,56". */
export const formatearImporte = (c) => formatearEscalado(c, 2);

/** Puntos básicos → canónico de fichero: "0,12", "19", "2,5". */
export const formatearPorcentaje = (pb) => formatearEscalado(pb, 2, { minimos: true });

/** Entero ×10^escala → canónico con los decimales mínimos: "15,231". */
export const formatearDecimal = (n, escala = 6) => formatearEscalado(n, escala, { minimos: true });

/** Para la interfaz: "−1.234 €" (signo menos tipográfico, como la maqueta). */
export function formatearEuros(c, decimales = 0) {
  return formatearEscalado(c, 2, { decimales, menos: '−' }) + ' €';
}

/** Para la interfaz: pb → "+12,4 %" con `decimales` y signo. */
export function formatearPct(pb, decimales = 1) {
  const s = formatearEscalado(pb, 2, { decimales, menos: '−' });
  return (pb > 0 && /[1-9]/.test(s) ? '+' : '') + s + ' %';
}

// ---------- aritmética exacta ----------

function dividirBigRedondeo(a, b) {
  // a ≥ 0, b > 0 · mitad al par
  const q = a / b;
  const r = a % b;
  const doble = 2n * r;
  if (doble > b || (doble === b && q % 2n === 1n)) return q + 1n;
  return q;
}

/** a / b redondeado a entero con redondeo bancario. Exacto con BigInt. */
export function dividirRedondeo(a, b) {
  if (b === 0) throw new RangeError('división por cero');
  let A = BigInt(a);
  let B = BigInt(b);
  if (B < 0n) {
    A = -A;
    B = -B;
  }
  const negativo = A < 0n;
  const q = dividirBigRedondeo(negativo ? -A : A, B);
  return Number(negativo ? -q : q) || 0;
}

/** Suma de céntimos comprobando que no se sale de los enteros seguros. */
export function sumar(...importes) {
  let t = 0n;
  for (const c of importes.flat()) {
    if (!Number.isSafeInteger(c)) throw new TypeError(`importe no entero: ${c}`);
    t += BigInt(c);
  }
  if (t > BigInt(Number.MAX_SAFE_INTEGER) || t < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('suma fuera de rango');
  return Number(t);
}

/** c × pb / 10.000 con redondeo bancario (p. ej. impuesto del 19 % = 1900 pb). */
export const aplicarPb = (c, pb) => dividirRedondeo(BigInt(c) * BigInt(pb), 10000n);

/** Proporción a/b en pb (p. ej. tasa de ahorro). `null` si b es 0: «no concluyente». */
export const proporcionPb = (a, b) => (b === 0 ? null : dividirRedondeo(BigInt(a) * 10000n, BigInt(b)));

/** Redondea c al múltiplo de `paso` más cercano (mitad al par). */
export const redondearA = (c, paso) => dividirRedondeo(c, paso) * paso;

/**
 * Reparte `total` (entero) en proporción a `pesos` (enteros ≥ 0) con resto mayor:
 * la suma del resultado es exactamente `total`. Empates: el de menor índice primero.
 */
export function repartir(total, pesos) {
  if (!pesos.length) return [];
  const sumaPesos = pesos.reduce((a, p) => {
    if (!Number.isSafeInteger(p) || p < 0) throw new RangeError(`peso no válido: ${p}`);
    return a + BigInt(p);
  }, 0n);
  const T = BigInt(total);
  if (sumaPesos === 0n) return repartir(total, pesos.map(() => 1));
  const signo = T < 0n ? -1n : 1n;
  const absT = T * signo;
  const partes = pesos.map((p) => (absT * BigInt(p)) / sumaPesos);
  const restos = pesos.map((p, i) => ({ i, r: (absT * BigInt(p)) % sumaPesos }));
  let falta = absT - partes.reduce((a, b) => a + b, 0n);
  restos.sort((x, y) => (y.r > x.r ? 1 : y.r < x.r ? -1 : x.i - y.i));
  for (let k = 0; falta > 0n; k++, falta--) partes[restos[k % restos.length].i] += 1n;
  return partes.map((p) => Number(p * signo) || 0);
}
