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
 * En el IPC, el límite es del 12 %: su mayor mes real desde 2002 es del 9,7 %, y un cambio de base del INE
 * (−15,9 % en 2026) no pasaría el del 40 %.
 */
export function revisarFilas(existentes, nuevas, { id = '', unidad = 'indice', mesActual }) {
  const esIpc = id.startsWith('ipc-');
  const saltoMax = esIpc ? 0.12 : 0.4;
  const avisos = [];
  const primero = existentes[0]?.mes ?? null;
  const ultimo = existentes.at(-1)?.mes ?? null;
  const vistas = new Set();
  const validas = [];
  for (const f of [...nuevas].sort((a, b) => (a.mes < b.mes ? -1 : 1))) {
    if (!esMes(f.mes)) {
      avisos.push(`mes «${f.mes}» no válido`);
      continue;
    }
    if (vistas.has(f.mes)) {
      avisos.push(`${f.mes} repetido: se queda el primero`);
      continue;
    }
    vistas.add(f.mes);
    // ya lo tienes: no se pisa. Antes de tu primer mes solo entra historia marcada como aproximación (§7.3)
    if (ultimo && f.mes <= ultimo && !(f.aproximacion === true && f.mes < primero)) continue;
    if (mesActual && f.mes >= mesActual) {
      avisos.push(`${f.mes} aún no ha terminado: se descarta`);
      continue;
    }
    if (!(typeof f.valor === 'number' && Number.isFinite(f.valor)) || (unidad === 'indice' && f.valor <= 0)) {
      avisos.push(`${f.mes}: valor no válido`);
      continue;
    }
    validas.push(f);
  }
  // saltos: hacia delante desde tu último mes y hacia atrás desde el primero; tras un salto, lo que sigue con esa escala tampoco vale
  const recorrer = (lista, previo, mesPrevio, hacia) => {
    const out = [];
    let roto = false;
    for (const f of lista) {
      const separados = mesPrevio ? Math.abs(mesesEntre(mesPrevio, f.mes)) : 0;
      if (unidad === 'indice' && previo > 0 && mesPrevio && (roto || separados <= 2) && Math.abs(f.valor / previo - 1) > saltoMax) {
        avisos.push(`${f.mes}: salto de más del ${saltoMax * 100} % respecto al mes ${hacia}: se descarta (revísalo a mano${esIpc ? '; puede ser un cambio de base del INE' : ''})`);
        roto = true;
        continue;
      }
      roto = false;
      out.push({ mes: f.mes, valor: f.valor, ...(f.aproximacion === true ? { aproximacion: true } : {}) });
      previo = f.valor;
      mesPrevio = f.mes;
    }
    return out;
  };
  const antes = primero ? recorrer(validas.filter((f) => f.mes < primero).reverse(), existentes[0].valor, primero, 'siguiente').reverse() : [];
  const despues = recorrer(validas.filter((f) => !primero || f.mes > ultimo), existentes.at(-1)?.valor ?? null, ultimo, 'anterior');
  for (const parte of [antes, despues]) for (let i = 1; i < parte.length; i++) if (mesesEntre(parte[i - 1].mes, parte[i].mes) > 1) avisos.push(`hueco entre ${parte[i - 1].mes} y ${parte[i].mes}`);
  return { filas: [...antes, ...despues], avisos };
}
