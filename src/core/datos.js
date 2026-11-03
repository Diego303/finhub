// Datos de mercado (§7.3): el manifiesto de series (semilla/datos-manifiesto.md) y la revisión de las filas
// que propone el trabajo «datos» antes de que tú las confirmes. Isomórfico.
import { esMes, mesesEntre } from './fechas.js';

/** Tabla del manifiesto → [{id, que, unidad, proxy, metodo}] (una entrada por id). */
export function parseManifiesto(texto) {
  const out = [];
  for (const l of String(texto ?? '').split('\n')) {
    if (!/^\|\s*`/.test(l)) continue;
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length < 5) continue;
    const ids = [...c[0].matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
    for (const id of ids) out.push({ id, que: ids.length > 1 ? `${c[1]} (${id})` : c[1], unidad: c[2], proxy: c[3].replace(/`/g, ''), metodo: c[4] });
  }
  return out;
}

/**
 * Revisa las filas propuestas para una serie: meses válidos, posteriores a lo que ya tienes y anteriores al
 * mes en curso, sin repetidos, valores positivos (índices) y sin saltos de más del 40 % respecto al mes
 * anterior (§7.3). → {filas: aceptadas ordenadas, avisos}
 */
export function revisarFilas(existentes, nuevas, { unidad = 'indice', mesActual }) {
  const avisos = [];
  const ultimo = existentes.at(-1)?.mes ?? null;
  const vistas = new Set();
  const candidatas = [...nuevas].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const filas = [];
  let previo = existentes.at(-1)?.valor ?? null;
  let mesPrevio = ultimo;
  for (const f of candidatas) {
    if (!esMes(f.mes)) {
      avisos.push(`mes «${f.mes}» no válido`);
      continue;
    }
    if (vistas.has(f.mes)) {
      avisos.push(`${f.mes} repetido: se queda el primero`);
      continue;
    }
    vistas.add(f.mes);
    if (ultimo && f.mes <= ultimo) continue; // ya lo tienes: no se pisa
    if (mesActual && f.mes >= mesActual) {
      avisos.push(`${f.mes} aún no ha terminado: se descarta`);
      continue;
    }
    if (!(typeof f.valor === 'number' && Number.isFinite(f.valor)) || (unidad === 'indice' && f.valor <= 0)) {
      avisos.push(`${f.mes}: valor no válido`);
      continue;
    }
    if (unidad === 'indice' && previo > 0 && mesPrevio && mesesEntre(mesPrevio, f.mes) <= 2 && Math.abs(f.valor / previo - 1) > 0.4) {
      avisos.push(`${f.mes}: salto de más del 40 % respecto al mes anterior: se descarta (revísalo a mano)`);
      continue;
    }
    filas.push({ mes: f.mes, valor: f.valor });
    previo = f.valor;
    mesPrevio = f.mes;
  }
  if (filas.length > 1) for (let i = 1; i < filas.length; i++) if (mesesEntre(filas[i - 1].mes, filas[i].mes) > 1) avisos.push(`hueco entre ${filas[i - 1].mes} y ${filas[i].mes}`);
  return { filas, avisos };
}
