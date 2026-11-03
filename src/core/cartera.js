// Cartera (§4.3): posiciones, coste fiscal, valor, plusvalía, impuesto, exposición y clases frente a objetivo.
// Importes en céntimos; participaciones en millonésimas; pesos en puntos básicos.
import { sumar, aplicarPb, proporcionPb, dividirRedondeo } from './dinero.js';

/**
 * Flujos externos de la cartera (dinero que entra o sale de ella), desde el punto de vista de la cartera:
 *   aportación → +importe · venta → −importe · dividendo cobrado → −importe ·
 *   comisión pagada aparte → +|importe| (dinero tuyo que no compra valor) · traspaso y ajuste → no son flujos.
 */
export function flujosExternos(operaciones, { hasta = null } = {}) {
  const res = [];
  for (const o of operaciones) {
    if (hasta && o.fecha > hasta) continue;
    const imp = Math.abs(o.importe);
    if (o.tipo === 'aportacion') res.push({ fecha: o.fecha, importe: imp, activo: o.activo.activo });
    else if (o.tipo === 'venta') res.push({ fecha: o.fecha, importe: -imp, activo: o.activo.activo });
    else if (o.tipo === 'dividendo') res.push({ fecha: o.fecha, importe: -imp, activo: o.activo.activo });
    else if (o.tipo === 'comision') res.push({ fecha: o.fecha, importe: imp, activo: o.activo.activo });
  }
  return res.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

const nuevaPos = (id) => ({ id, lotes: [], coste: 0, unidades: 0, unidadesConocidas: true, aproximado: false, aportado: 0, retirado: 0 });

/**
 * Coste fiscal por activo hasta una fecha, en orden de operaciones (§4.3, §2.5):
 * - con participaciones en todas sus operaciones: FIFO por lotes;
 * - sin ellas: el aportado neto hace de coste (marcado «aproximado»).
 * Los traspasos mueven el coste del origen al destino (no tributan).
 * → {porActivo: Map, avisos: []}
 */
export function costes(operaciones, { hasta = null, valorEstimado = () => null } = {}) {
  const pos = new Map();
  const p = (id) => {
    if (!pos.has(id)) pos.set(id, nuevaPos(id));
    return pos.get(id);
  };
  const avisos = [];
  const ordenadas = [...operaciones].filter((o) => !hasta || o.fecha <= hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  /** Saca `unidades` (o una fracción del coste) de una posición → coste que sale. */
  const sacar = (x, { unidades, fraccion }, que) => {
    if (unidades !== null && unidades !== undefined && x.unidadesConocidas && x.lotes.length) {
      let quedan = unidades;
      let coste = 0;
      while (quedan > 0 && x.lotes.length) {
        const l = x.lotes[0];
        if (l.unidades <= quedan) {
          coste += l.coste;
          quedan -= l.unidades;
          x.lotes.shift();
        } else {
          const parte = dividirRedondeo(l.coste * quedan, l.unidades);
          coste += parte;
          l.coste -= parte;
          l.unidades -= quedan;
          quedan = 0;
        }
      }
      if (quedan > 0) avisos.push(`${que}: se sacan más participaciones de las que había (§9.6)`);
      x.unidades = Math.max(0, x.unidades - unidades);
      x.coste -= coste;
      return coste;
    }
    // sin participaciones: sale la parte proporcional del coste y, desde aquí, el coste es aproximado
    x.aproximado = true;
    x.unidadesConocidas = false;
    x.lotes = [];
    const coste = Math.min(x.coste, Math.round(x.coste * Math.min(1, Math.max(0, fraccion))));
    x.coste -= coste;
    return coste;
  };
  for (const o of ordenadas) {
    const imp = Math.abs(o.importe);
    const u = o.participaciones ?? null;
    if (o.tipo === 'aportacion') {
      const x = p(o.activo.activo);
      x.coste += imp;
      x.aportado += imp;
      if (u === null) x.unidadesConocidas = false;
      else x.unidades += u;
      x.lotes.push({ unidades: u, coste: imp, fecha: o.fecha });
    } else if (o.tipo === 'venta') {
      const x = p(o.activo.activo);
      x.retirado += imp;
      const est = valorEstimado(x.id, o.fecha);
      if (!x.coste) avisos.push(`${o.id}: venta de «${x.id}» sin nada aportado antes (§9.6)`);
      const fraccion = est ? imp / est : x.coste ? Math.min(1, imp / x.coste) : 0;
      if (est && imp > est * 1.05) avisos.push(`${o.id}: la venta supera el valor estimado de «${x.id}» (§9.6)`);
      sacar(x, { unidades: x.unidadesConocidas ? u : null, fraccion }, o.id);
    } else if (o.tipo === 'traspaso') {
      const de = p(o.activo.origen);
      const a = p(o.activo.destino);
      const est = valorEstimado(de.id, o.fecha);
      const fraccion = est ? Math.min(1, imp / est) : 1;
      if (!est && !u) avisos.push(`${o.id}: no hay valor de «${de.id}» antes del traspaso: se traspasa todo su coste`);
      const coste = sacar(de, { unidades: de.unidadesConocidas ? u : null, fraccion }, o.id);
      a.coste += coste;
      a.unidadesConocidas = false; // las participaciones del destino no se conocen
      a.lotes.push({ unidades: null, coste, fecha: o.fecha, traspaso: true });
    } else if (o.tipo === 'comision') {
      p(o.activo.activo).coste += imp; // gasto inherente: suma al coste fiscal
    } else if (o.tipo === 'ajuste') {
      p(o.activo.activo).coste += o.importe; // corrección manual del coste
    }
  }
  for (const x of pos.values()) {
    if (!x.unidadesConocidas) x.aproximado = true;
    x.coste = Math.max(0, x.coste);
  }
  return { porActivo: pos, avisos };
}

/**
 * Valor de un activo en una fecha (§4.3): la última foto ≤ fecha más los flujos posteriores del activo
 * (aportaciones +, ventas −, traspasos ±). Si nunca se valoró: null (la posición usa el coste, §9.5).
 */
export function valorActivoEn(id, fecha, fotos, operaciones) {
  let foto = null;
  for (const f of fotos) {
    if (f.fecha > fecha) break;
    const fila = f.filas.find((x) => x.activo === id);
    if (fila) foto = { fecha: f.fecha, valor: fila.valor };
  }
  if (!foto) return null;
  let valor = foto.valor;
  let posteriores = 0;
  for (const o of operaciones) {
    if (o.fecha <= foto.fecha || o.fecha > fecha) continue;
    const imp = Math.abs(o.importe);
    if (o.tipo === 'aportacion' && o.activo.activo === id) (valor += imp), posteriores++;
    else if (o.tipo === 'venta' && o.activo.activo === id) (valor -= imp), posteriores++;
    else if (o.tipo === 'traspaso' && o.activo.origen === id) (valor -= imp), posteriores++;
    else if (o.tipo === 'traspaso' && o.activo.destino === id) (valor += imp), posteriores++;
  }
  return { valor: Math.max(0, valor), fechaFoto: foto.fecha, posteriores };
}

const ordenarFotos = (fotos) => [...fotos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

/**
 * Estado de la cartera en una fecha: valor, coste, plusvalía por activo y total, con avisos.
 * activos: [{id, titulo, campos}] (bloques de activos.md) · operaciones · fotos [{fecha, filas}].
 */
export function estadoCartera({ activos, operaciones, fotos, hasta }) {
  const fs = ordenarFotos(fotos);
  const est = (id, f) => valorActivoEn(id, f, fs, operaciones)?.valor ?? null;
  const { porActivo: cs, avisos } = costes(operaciones, { hasta, valorEstimado: est });
  const ids = new Set([...activos.map((a) => a.id), ...cs.keys(), ...fs.flatMap((f) => f.filas.map((x) => x.activo))]);
  const porActivo = new Map();
  let faltanValores = false;
  for (const id of ids) {
    const a = activos.find((x) => x.id === id);
    const c = cs.get(id) ?? nuevaPos(id);
    // posición cerrada: tuvo dinero, ya no le queda coste y salió algo después de su última foto
    // (vendida o traspasada del todo): vale 0, sin residuos de valoración
    const v0 = valorActivoEn(id, hasta, fs, operaciones);
    const cerrada = c.aportado > 0 && c.coste === 0 && (v0?.posteriores ?? 0) > 0;
    if (a?.campos.archivado && (cerrada || !c.coste)) continue;
    const v = cerrada ? { valor: 0, fechaFoto: v0.fechaFoto, posteriores: 0 } : v0;
    const valorado = v !== null;
    if (v?.posteriores) faltanValores = true;
    const valor = valorado ? v.valor : c.coste;
    if (!a && (valor || c.coste)) avisos.push(`«${id}» tiene operaciones o valores pero no está en activos.md`);
    if (!valor && !c.coste && (!a || cerrada)) continue;
    const divisa = a?.campos.divisa ?? 'EUR';
    porActivo.set(id, {
      id,
      nombre: a?.titulo ?? id,
      clase: a?.campos.clase ?? null,
      isin: a?.campos.isin ?? null,
      ter: a?.campos.ter ?? null,
      divisa,
      archivado: !!a?.campos.archivado,
      valor,
      valorado,
      fechaValor: v?.fechaFoto ?? null,
      flujosTrasFoto: v?.posteriores ?? 0,
      coste: c.coste,
      aportado: c.aportado,
      retirado: c.retirado,
      unidades: c.unidadesConocidas ? c.unidades : null,
      costeAproximado: c.aproximado,
      plusvalia: valor - c.coste,
    });
  }
  const lista = [...porActivo.values()];
  const otraDivisa = lista.filter((x) => x.divisa !== 'EUR' && x.valor);
  if (otraDivisa.length) avisos.push(`activos en otra divisa sin tipo de cambio: ${otraDivisa.map((x) => x.id).join(', ')} (totales no concluyentes, §9.20)`);
  for (const x of lista) if (!x.valorado && x.coste) avisos.push(`«${x.nombre}» sin valorar: se cuenta por lo aportado (§9.5)`);
  const valor = sumar(...lista.map((x) => x.valor));
  const coste = sumar(...lista.map((x) => x.coste));
  return {
    porActivo,
    valor,
    coste,
    plusvalia: valor - coste,
    plusvaliaPb: coste > 0 ? proporcionPb(valor - coste, coste) : null,
    noConcluyente: otraDivisa.length > 0,
    faltanValores,
    costeAproximado: lista.some((x) => x.costeAproximado && x.coste),
    ultimaFoto: fs.filter((f) => f.fecha <= hasta).at(-1)?.fecha ?? null,
    avisos,
  };
}

/** Valor total de la cartera en una fecha (para la foto de cierre y el patrimonio). */
export function valorCarteraEn({ activos = [], operaciones = [], fotos, hasta }) {
  return estadoCartera({ activos, operaciones, fotos, hasta }).valor;
}

/**
 * Impuesto si vendieras hoy (§4.3): tramos progresivos de la base del ahorro sobre la plusvalía positiva.
 * tramos: [{desde, hasta|null, pb}] en céntimos. Es una estimación (verificar cada año, §9.19).
 */
export function impuestoVenta(plusvalia, tramos) {
  if (plusvalia <= 0) return 0;
  let total = 0;
  for (const t of tramos) {
    const tope = t.hasta === null ? plusvalia : Math.min(plusvalia, t.hasta);
    if (tope <= t.desde) break;
    total += aplicarPb(tope - t.desde, t.pb);
  }
  return total;
}

/**
 * Exposición estimada (§4.3): Σ valor × exposición declarada del activo, por región, sector o divisa.
 * Los activos sin desglose van a «Sin desglose». → {filas: [{nombre, valor, pb}], fechas: {id: AAAA-MM}}
 */
export function exposicion(porActivo, activos, dimension) {
  const acc = new Map();
  const fechas = {};
  let total = 0;
  for (const x of porActivo.values()) {
    if (!x.valor) continue;
    total += x.valor;
    const e = activos.find((a) => a.id === x.id)?.campos.exposicion;
    const filas = e?.dimensiones?.[dimension];
    if (!filas?.length) {
      acc.set('Sin desglose', (acc.get('Sin desglose') ?? 0) + x.valor);
      continue;
    }
    fechas[x.id] = e.fecha;
    const suma = filas.reduce((a, f) => a + f.pb, 0) || 1;
    for (const f of filas) acc.set(f.nombre, (acc.get(f.nombre) ?? 0) + dividirRedondeo(x.valor * f.pb, suma));
  }
  const filas = [...acc].map(([nombre, valor]) => ({ nombre, valor, pb: total ? proporcionPb(valor, total) : 0 })).sort((a, b) => b.valor - a.valor);
  return { filas, total, fechas };
}

/**
 * Clases actual frente a objetivo (§4.3). objetivo: [{activo, peso}] (pb) · clases: [{id, nombre}].
 * → [{clase, nombre, actualPb, objetivoPb, desviacionPb, aviso}]
 */
export function clasesVsObjetivo(porActivo, objetivo, clases, { umbralPb = 100, activos = [] } = {}) {
  const total = sumar(...[...porActivo.values()].map((x) => x.valor));
  const claseDe = (id) => porActivo.get(id)?.clase ?? activos.find((a) => a.id === id)?.campos.clase ?? 'sin-clase';
  const actual = new Map();
  for (const x of porActivo.values()) actual.set(x.clase ?? 'sin-clase', (actual.get(x.clase ?? 'sin-clase') ?? 0) + x.valor);
  const obj = new Map();
  for (const o of objetivo) obj.set(claseDe(o.activo), (obj.get(claseDe(o.activo)) ?? 0) + o.peso);
  const ids = [...new Set([...obj.keys(), ...actual.keys()])].filter((id) => (actual.get(id) ?? 0) > 0 || (obj.get(id) ?? 0) > 0);
  return ids.map((id) => {
    const actualPb = total ? proporcionPb(actual.get(id) ?? 0, total) : 0;
    const objetivoPb = obj.get(id) ?? 0;
    return { clase: id, nombre: clases.find((c) => c.id === id)?.nombre ?? (id === 'sin-clase' ? 'Sin clase' : id), actualPb, objetivoPb, desviacionPb: actualPb - objetivoPb, aviso: Math.abs(actualPb - objetivoPb) >= umbralPb };
  }).sort((a, b) => b.objetivoPb - a.objetivoPb || b.actualPb - a.actualPb);
}

/** TER medio ponderado por valor, en pb (con decimales: centésimas de pb). */
export function terMedio(porActivo) {
  const con = [...porActivo.values()].filter((x) => x.valor > 0);
  const total = con.reduce((a, x) => a + x.valor, 0);
  if (!total) return null;
  return con.reduce((a, x) => a + (x.ter ?? 0) * x.valor, 0) / total;
}
