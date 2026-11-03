// Reparto de la aportación hacia el objetivo (§4.3), sin vender: la suma es exactamente la aportación.
import { repartir } from './dinero.js';

/**
 * activos: [{id, valor, pesoPb, minimo?}] · aportacion y redondeo en céntimos.
 * 1. T = valor total + A · 2. déficit = max(0, peso × T − valor) · 3. A en proporción a los déficits
 * 4. redondeo a múltiplos de `redondeo` por el método del resto mayor (nunca da negativos); lo que quede
 *    por debajo de un múltiplo va al de mayor déficit · 5. quien no llega a su mínimo
 * recibe 0 y lo suyo se reparte entre el resto · 6. si todo está en objetivo, por pesos.
 * → [{id, importe, deficit}] en el orden de entrada.
 */
export function repartirAportacion({ activos, aportacion, redondeo = 1000 }) {
  if (aportacion <= 0 || !activos.length) return activos.map((a) => ({ id: a.id, importe: 0, deficit: 0 }));
  const valor = activos.reduce((s, a) => s + a.valor, 0);
  const T = valor + aportacion;
  const deficit = activos.map((a) => Math.max(0, Math.round((a.pesoPb * T) / 10000) - a.valor));
  const base = deficit.some((d) => d > 0) ? deficit : activos.map((a) => a.pesoPb);
  const elegibles = activos.map((a, i) => base[i] > 0);
  let importes;
  for (let vuelta = 0; vuelta <= activos.length; vuelta++) {
    const pesos = base.map((b, i) => (elegibles[i] ? b : 0));
    if (!pesos.some((p) => p > 0)) {
      // nadie llega a su mínimo: todo al de mayor déficit (o mayor peso)
      const i = base.indexOf(Math.max(...base));
      importes = activos.map((_, k) => (k === i ? aportacion : 0));
      break;
    }
    const brutos = repartir(aportacion, pesos);
    const paso = Math.max(1, redondeo);
    importes = brutos.map((b) => Math.floor(b / paso) * paso);
    let sobran = Math.floor((aportacion - importes.reduce((s, x) => s + x, 0)) / paso);
    const porResto = brutos.map((b, i) => ({ i, r: b - importes[i] })).filter((x) => pesos[x.i] > 0).sort((a, b) => b.r - a.r || a.i - b.i);
    for (let k = 0; sobran > 0 && porResto.length; k++, sobran--) importes[porResto[k % porResto.length].i] += paso;
    const mayor = pesos.indexOf(Math.max(...pesos));
    importes[mayor] += aportacion - importes.reduce((s, x) => s + x, 0);
    const bajoMinimo = activos.findIndex((a, i) => importes[i] > 0 && a.minimo && importes[i] < a.minimo);
    if (bajoMinimo < 0) break;
    elegibles[bajoMinimo] = false;
  }
  return activos.map((a, i) => ({ id: a.id, importe: importes[i], deficit: deficit[i] }));
}
