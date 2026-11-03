// Cálculos del mes (§4.1). Todo en céntimos y puntos básicos; sin floats en lo que se guarda.
import { proporcionPb, sumar } from './dinero.js';

export const COLOR_PRESUPUESTO = { verde: 'verde', ambar: 'ambar', rojo: 'rojo' };

/** Naturaleza efectiva: la del movimiento si la indica; si no, la de su grupo; si no hay grupo, null. */
export function naturalezaDe(mov, gruposPorId) {
  if (mov.naturaleza) return mov.naturaleza;
  const g = mov.grupo ? gruposPorId.get(mov.grupo) : null;
  return g?.naturaleza ?? null;
}

export const indexar = (lista, campo = 'id') => new Map(lista.map((x) => [x[campo], x]));

/**
 * Totales del mes (§4.1):
 *   entradas = Σ ingresos · consumo = Σ consumo − compensaciones · invertido, ahorrado ·
 *   traspasos sin «compensa» = neutros · queda = entradas − consumo − invertido − ahorrado ·
 *   tasa = (invertido + ahorrado) / entradas (null si no hay entradas: «no concluyente»).
 * Los movimientos sin grupo (o con un grupo que ya no existe) se apartan con aviso (§9.2).
 */
export function totales(movimientos, grupos) {
  const porId = indexar(grupos);
  const porGrupo = new Map();
  const g = (id) => {
    if (!porGrupo.has(id)) porGrupo.set(id, { entradas: 0, consumo: 0, invertido: 0, ahorrado: 0, compensado: 0, movimientos: 0 });
    return porGrupo.get(id);
  };
  const sinGrupo = [];
  const ajustes = [];
  let entradas = 0;
  let consumo = 0;
  let invertido = 0;
  let ahorrado = 0;
  let traspasos = 0;
  for (const m of movimientos) {
    const nat = naturalezaDe(m, porId);
    if (m.ajuste) ajustes.push(m);
    if (!nat || (m.grupo && !porId.has(m.grupo) && !m.naturaleza)) {
      sinGrupo.push(m);
      continue;
    }
    const acc = m.grupo ? g(m.grupo) : null;
    if (acc) acc.movimientos++;
    switch (nat) {
      case 'ingreso':
        entradas += m.importe;
        if (acc) acc.entradas += m.importe;
        break;
      case 'consumo':
        consumo -= m.importe;
        if (acc) acc.consumo -= m.importe;
        break;
      case 'inversion':
        invertido -= m.importe;
        if (acc) acc.invertido -= m.importe;
        break;
      case 'ahorro':
        ahorrado -= m.importe;
        if (acc) acc.ahorrado -= m.importe;
        break;
      case 'traspaso':
        if (m.compensa) {
          // una devolución (p. ej. un Bizum por una cena) resta del consumo de ese grupo; no es un ingreso
          consumo -= m.importe;
          g(m.compensa).consumo -= m.importe;
          g(m.compensa).compensado += m.importe;
        } else traspasos += m.importe;
        break;
    }
  }
  const queda = sumar(entradas, -consumo, -invertido, -ahorrado);
  return { entradas, consumo, invertido, ahorrado, traspasos, queda, tasaPb: entradas > 0 ? proporcionPb(invertido + ahorrado, entradas) : null, porGrupo, sinGrupo, ajustes };
}

/**
 * Presupuestos efectivos: el del grupo, sobrescrito por el del mes (Presupuestos).
 * Semáforo: verde ≤ 90 %, ámbar ≤ 100 %, rojo > 100 %.
 */
export function presupuestos(tot, grupos, delMes = {}) {
  return grupos
    .filter((g) => g.naturaleza === 'consumo' && !g.archivado && (delMes[g.id] !== undefined || g.presupuesto !== undefined))
    .map((g) => {
      const presupuesto = delMes[g.id] ?? g.presupuesto;
      const gastado = tot.porGrupo.get(g.id)?.consumo ?? 0;
      const pct = presupuesto > 0 ? proporcionPb(gastado, presupuesto) : null;
      const color = pct === null ? (gastado > 0 ? 'rojo' : 'verde') : pct <= 9000 ? 'verde' : pct <= 10000 ? 'ambar' : 'rojo';
      return { grupo: g.id, nombre: g.nombre, gastado, presupuesto, pct, color, delMes: delMes[g.id] !== undefined };
    });
}

/**
 * Media de los últimos `n` meses CERRADOS anteriores a `mes` (§4.1), por grupo y del total de consumo.
 * meses: [{mes, estado, totales}] → {meses: [ids], consumo, porGrupo: Map} o null si no hay ninguno.
 */
export function mediaCerrados(meses, mes, n = 6) {
  const cerrados = meses.filter((x) => x.mes < mes && x.estado === 'cerrado').sort((a, b) => (a.mes < b.mes ? 1 : -1)).slice(0, n);
  if (!cerrados.length) return null;
  const media = (vals) => Math.round(vals.reduce((a, b) => a + b, 0) / cerrados.length);
  const ids = new Set(cerrados.flatMap((c) => [...c.totales.porGrupo.keys()]));
  const porGrupo = new Map([...ids].map((id) => [id, media(cerrados.map((c) => c.totales.porGrupo.get(id)?.consumo ?? 0))]));
  return { meses: cerrados.map((c) => c.mes), consumo: media(cerrados.map((c) => c.totales.consumo)), entradas: media(cerrados.map((c) => c.totales.entradas)), porGrupo };
}

/** Variación en pb de `actual` frente a `media` (null si la media es 0). */
export const variacionPb = (actual, media) => (media ? proporcionPb(actual - media, media) : null);

/**
 * Datos del mapa del dinero (Sankey): entradas por grupo de ingreso → consumo por grupo, inversión,
 * ahorro y metas; «Queda» lo añade la geometría. Los importes negativos (devoluciones mayores que el gasto) no se dibujan.
 */
export function datosSankey(tot, grupos, { colores = { consumo: '#888780', inversion: '#7F77DD', ahorro: '#378ADD' } } = {}) {
  const porId = indexar(grupos);
  const nombre = (id) => porId.get(id)?.nombre ?? id;
  const entradas = [];
  const salidas = [];
  for (const [id, v] of tot.porGrupo) {
    if (v.entradas > 0) entradas.push({ nombre: nombre(id), valor: v.entradas });
  }
  const orden = (a, b) => b.valor - a.valor;
  for (const [id, v] of tot.porGrupo) if (v.consumo > 0) salidas.push({ nombre: nombre(id), valor: v.consumo, color: colores.consumo, tipo: 'consumo' });
  const inv = [...tot.porGrupo].filter(([, v]) => v.invertido > 0).map(([id, v]) => ({ nombre: nombre(id), valor: v.invertido, color: colores.inversion, tipo: 'inversion' }));
  const aho = [...tot.porGrupo].filter(([, v]) => v.ahorrado > 0).map(([id, v]) => ({ nombre: nombre(id), valor: v.ahorrado, color: colores.ahorro, tipo: 'ahorro' }));
  return { entradas: entradas.sort(orden), salidas: [...salidas.sort(orden), ...inv.sort(orden), ...aho.sort(orden)] };
}

/** Suma de totales de varios meses (para el Sankey del año). */
export function sumarTotales(lista) {
  const porGrupo = new Map();
  const acc = { entradas: 0, consumo: 0, invertido: 0, ahorrado: 0, traspasos: 0, queda: 0, sinGrupo: [], ajustes: [] };
  for (const t of lista) {
    for (const k of ['entradas', 'consumo', 'invertido', 'ahorrado', 'traspasos', 'queda']) acc[k] += t[k];
    acc.sinGrupo.push(...t.sinGrupo);
    acc.ajustes.push(...t.ajustes);
    for (const [id, v] of t.porGrupo) {
      const d = porGrupo.get(id) ?? { entradas: 0, consumo: 0, invertido: 0, ahorrado: 0, compensado: 0, movimientos: 0 };
      for (const k of Object.keys(d)) d[k] += v[k];
      porGrupo.set(id, d);
    }
  }
  return { ...acc, porGrupo, tasaPb: acc.entradas > 0 ? proporcionPb(acc.invertido + acc.ahorrado, acc.entradas) : null };
}
