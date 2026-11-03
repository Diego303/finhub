// Rentabilidad (§4.3): TWR por Dietz modificado encadenado, TIR (XIRR), comparativa con tus mismas
// aportaciones e índice propio. Las tasas son floats (no se guardan): se muestran en pb redondeados.
import { aDias, diasEntre, mesDe, sumarMesesMes, esMes } from './fechas.js';

/**
 * Rentabilidad de un periodo por Dietz modificado:
 *   R = (V1 − V0 − ΣF) / (V0 + Σ wᵢ·Fᵢ),  wᵢ = (t1 − tᵢ)/(t1 − t0)
 * flujos: [{fecha, importe}] con fecha en (t0, t1] (importe > 0 = entra dinero en la cartera).
 * → número o null si el denominador no es positivo.
 */
export function dietz(V0, V1, flujos, t0, t1) {
  const T = diasEntre(t0, t1);
  if (T <= 0) return null;
  let suma = 0;
  let ponderada = 0;
  for (const f of flujos) {
    const w = diasEntre(f.fecha, t1) / T;
    suma += f.importe;
    ponderada += w * f.importe;
  }
  const den = V0 + ponderada;
  if (den <= 0) return null;
  return (V1 - V0 - suma) / den;
}

/**
 * TWR encadenado entre puntos de valoración consecutivos (§4.3).
 * puntos: [{fecha, valor}] ordenados · flujos: [{fecha, importe}].
 * → {tasa, anualizada, periodos, aprox, desde, hasta} · tasa null si hay menos de 2 puntos.
 * «aprox» si hay pocos puntos (< 4) o huecos de más de 62 días entre fotos.
 */
export function twr(puntos, flujos, { desde = null, hasta = null } = {}) {
  const ps = puntos.filter((p) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));
  if (ps.length < 2) return { tasa: null, anualizada: null, periodos: 0, aprox: true, desde: ps[0]?.fecha ?? null, hasta: ps.at(-1)?.fecha ?? null };
  let acumulado = 1;
  let periodos = 0;
  let aprox = ps.length < 4;
  for (let i = 1; i < ps.length; i++) {
    const t0 = ps[i - 1].fecha;
    const t1 = ps[i].fecha;
    if (diasEntre(t0, t1) > 62) aprox = true;
    const f = flujos.filter((x) => x.fecha > t0 && x.fecha <= t1);
    const r = dietz(ps[i - 1].valor, ps[i].valor, f, t0, t1);
    if (r === null) {
      aprox = true;
      continue;
    }
    acumulado *= 1 + r;
    periodos++;
  }
  const dias = diasEntre(ps[0].fecha, ps.at(-1).fecha);
  const tasa = acumulado - 1;
  return { tasa, anualizada: dias >= 365 ? acumulado ** (365 / dias) - 1 : null, periodos, aprox, desde: ps[0].fecha, hasta: ps.at(-1).fecha };
}

/**
 * TIR (XIRR) por Newton-Raphson con bisección de respaldo, tolerancia 1e-7 (§4.3).
 * flujos: [{fecha, importe}] desde el punto de vista del INVERSOR (aportar = negativo, valor final = positivo).
 * → {tasa} o {tasa: null, motivo} si no hay solución o hay varias (§9.7: «no concluyente»).
 */
export function xirr(flujos, { tol = 1e-7 } = {}) {
  const fs = flujos.filter((f) => f.importe !== 0);
  if (fs.length < 2 || !fs.some((f) => f.importe > 0) || !fs.some((f) => f.importe < 0)) return { tasa: null, motivo: 'hacen falta flujos de los dos signos' };
  const t0 = aDias(fs.reduce((m, f) => (f.fecha < m ? f.fecha : m), fs[0].fecha));
  const t = fs.map((f) => (aDias(f.fecha) - t0) / 365);
  const vna = (r) => fs.reduce((a, f, i) => a + f.importe / (1 + r) ** t[i], 0);
  const dvna = (r) => fs.reduce((a, f, i) => a - (t[i] * f.importe) / (1 + r) ** (t[i] + 1), 0);
  // ¿cuántas raíces? cambios de signo del VNA en una rejilla amplia
  // rejilla en dos tramos (fina entre −99 % y +100 %, gruesa hasta +1.000 %), desplazada un poco para
  // no caer justo en una raíz (si cayera, el VNA sería 0 y no se vería el cambio de signo)
  const rejilla = [...Array.from({ length: 400 }, (_, k) => -0.99 + k * 0.004975 + 1.37e-4), ...Array.from({ length: 90 }, (_, k) => 1 + k * 0.1 + 1.37e-4)];
  const signos = rejilla.map((r) => Math.sign(vna(r))).filter((s) => s !== 0);
  let cambios = 0;
  for (let i = 1; i < signos.length; i++) if (signos[i] !== signos[i - 1]) cambios++;
  if (cambios === 0) return { tasa: null, motivo: 'sin solución' };
  if (cambios > 1) return { tasa: null, motivo: 'varias soluciones posibles' };
  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const v = vna(r);
    const d = dvna(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const n = r - v / d;
    if (!Number.isFinite(n) || n <= -0.9999) break;
    if (Math.abs(n - r) < tol) return { tasa: n };
    r = n;
  }
  // bisección en el tramo donde cambia el signo
  let lo = -0.9999;
  let hi = 10;
  let vlo = vna(lo);
  for (let i = 0; i < 300 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2;
    const vm = vna(mid);
    if (Math.sign(vm) === Math.sign(vlo)) {
      lo = mid;
      vlo = vm;
    } else hi = mid;
  }
  return { tasa: (lo + hi) / 2 };
}

/**
 * Serie mensual de un índice con huecos (§9.8): los meses que faltan entre dos conocidos se interpolan
 * (y se marcan); fuera del rango conocido no hay valor. filas: [{mes, valor}] → Map mes → {valor, interpolado}
 */
export function serieCompleta(filas) {
  const ord = [...filas].filter((f) => esMes(f.mes)).sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const m = new Map();
  for (let i = 0; i < ord.length; i++) {
    m.set(ord[i].mes, { valor: ord[i].valor, interpolado: false });
    if (i + 1 < ord.length) {
      let mes = sumarMesesMes(ord[i].mes, 1);
      const pasos = [];
      while (mes < ord[i + 1].mes) {
        pasos.push(mes);
        mes = sumarMesesMes(mes, 1);
      }
      pasos.forEach((p, k) => m.set(p, { valor: ord[i].valor + ((ord[i + 1].valor - ord[i].valor) * (k + 1)) / (pasos.length + 1), interpolado: true }));
    }
  }
  return m;
}

/**
 * «Con tus mismas aportaciones en las mismas fechas, hoy tendrías…» (§4.3): cada flujo compra (o vende)
 * unidades del índice al cierre de su mes; el valor final = unidades × último cierre.
 * serie: Map de serieCompleta · inicial: {fecha, valor} opcional (valor de partida al inicio de la ventana).
 * → {valor, unidades, interpolados, fuera: [meses sin dato]} · valor null si falta el último cierre.
 */
export function comparativa(serie, flujos, { inicial = null, hasta }) {
  let unidades = 0;
  let interpolados = 0;
  const fuera = [];
  const comprar = (fecha, importe) => {
    const p = serie.get(mesDe(fecha));
    if (!p) {
      fuera.push(mesDe(fecha));
      return;
    }
    if (p.interpolado) interpolados++;
    unidades += importe / p.valor;
  };
  if (inicial) comprar(inicial.fecha, inicial.valor);
  for (const f of flujos) if ((!inicial || f.fecha > inicial.fecha) && f.fecha <= hasta) comprar(f.fecha, f.importe);
  let ultimo = mesDe(hasta);
  let p = serie.get(ultimo);
  for (let i = 0; !p && i < 3; i++) {
    ultimo = sumarMesesMes(ultimo, -1);
    p = serie.get(ultimo);
  }
  return { valor: p ? Math.round(unidades * p.valor) : null, unidades, interpolados, fuera, mesFinal: p ? ultimo : null };
}

/** Rentabilidades mensuales de una serie: Map mes → r (respecto al mes anterior). */
export function rentabilidadesMensuales(serie) {
  const res = new Map();
  const meses = [...serie.keys()].sort();
  for (let i = 1; i < meses.length; i++) res.set(meses[i], serie.get(meses[i]).valor / serie.get(meses[i - 1]).valor - 1);
  return res;
}

/**
 * Índice propio (§4.3): mezcla de índices con los pesos objetivo, reequilibrada cada mes.
 * componentes: [{peso (pb), serie: Map | null (null = efectivo, rentabilidad 0)}] → Map mes → nivel (base 100).
 */
export function indicePropio(componentes, meses) {
  const rs = componentes.map((c) => ({ peso: c.peso / 10000, r: c.serie ? rentabilidadesMensuales(c.serie) : null }));
  const nivel = new Map();
  let v = 100;
  meses.forEach((mes, i) => {
    if (i > 0) {
      let r = 0;
      for (const c of rs) r += c.peso * (c.r ? c.r.get(mes) ?? 0 : 0);
      v *= 1 + r;
    }
    nivel.set(mes, v);
  });
  return nivel;
}

/** Rebase de una serie a 100 en el primer mes pedido. */
export function rebase(serie, meses) {
  const base = serie.get(meses[0])?.valor ?? serie.get(meses[0]);
  return meses.map((m) => {
    const v = serie.get(m);
    const x = typeof v === 'number' ? v : v?.valor;
    return x === undefined || base === undefined ? null : (x / base) * 100;
  });
}
