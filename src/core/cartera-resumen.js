// Todo lo que enseña la pestaña Cartera, calculado por código (§4.3, §5 Cartera). Isomórfico.
import { estadoCartera, flujosExternos, impuestoVenta, exposicion, clasesVsObjetivo, terMedio } from './cartera.js';
import { twr, xirr, comparativa, serieCompleta, indicePropio } from './rentabilidad.js';
import { repartirAportacion } from './reparto.js';
import { sumarDias, sumarMesesMes, mesDe, ultimoDia, mesesEntre } from './fechas.js';

/** Puntos de valoración: cada fecha con foto (valor total ese día) y, si hoy es posterior, hoy (estimado). */
export function puntosValor({ activos, operaciones, fotos, hoy }) {
  const fechas = [...new Set(fotos.map((f) => f.fecha))].filter((f) => f <= hoy).sort();
  const puntos = fechas.map((fecha) => ({ fecha, valor: estadoCartera({ activos, operaciones, fotos, hasta: fecha }).valor }));
  if (fechas.length && fechas.at(-1) < hoy) puntos.push({ fecha: hoy, valor: estadoCartera({ activos, operaciones, fotos, hasta: hoy }).valor, estimado: true });
  return puntos;
}

/** Rellena huecos al final (meses aún sin dato) con el último valor conocido, para dibujar. */
function arrastrar(valores) {
  let ultimo = null;
  return valores.map((v) => (v === null ? ultimo : (ultimo = v)));
}

/** Aportación mensual a la cartera según tus recurrentes: Σ de los mensuales de grupos de inversión. */
export function aportacionMensualInversion(modelo) {
  return modelo.recurrentes.filter((r) => !r.pausado && modelo.grupos.find((g) => g.id === r.grupo)?.naturaleza === 'inversion' && r.cada === 'mes').reduce((s, r) => s + Math.abs(r.importe), 0);
}

/** Índice (serie) asociado a un activo: el suyo, el de su clase, o el de la clase «parecida». */
export function indiceDeActivo(activo, clases) {
  if (activo?.campos.indice) return activo.campos.indice;
  const c = clases.find((x) => x.id === activo?.campos.clase);
  if (c?.indice) return c.indice;
  const parecida = clases.find((x) => x.id === c?.parecida);
  return parecida?.indice ?? null;
}

/**
 * Resumen completo de la cartera a fecha `hoy`.
 * modelo: el de core/modelo.js · opciones: {indices: [ids de series a comparar], aportacion: céntimos}
 */
export function resumenCartera(modelo, hoy, { indices = [], aportacion = null } = {}) {
  const { activos, operaciones, fotos, clases, objetivo } = modelo;
  const docObjetivo = modelo.doc('cartera/objetivo.md');
  const cabObjetivo = docObjetivo ? Object.fromEntries(docObjetivo.secciones[0].nodos.filter((n) => n.k === 'cab' && n.valor !== undefined).map((n) => [n.clave, n.valor])) : {};
  const e = estadoCartera({ activos, operaciones, fotos, hasta: hoy });
  const flujos = flujosExternos(operaciones, { hasta: hoy });
  const puntos = puntosValor({ activos, operaciones, fotos, hoy });

  // ventana de 12 meses: desde la foto más cercana a hoy − 1 año
  const haceUnAnio = sumarDias(hoy, -365);
  const inicio12 = [...puntos].reverse().find((p) => p.fecha <= haceUnAnio) ?? puntos[0] ?? null;
  const twr12 = inicio12 ? twr(puntos, flujos, { desde: inicio12.fecha }) : { tasa: null };
  const twrTotal = twr(puntos, flujos);
  const inversor = (fs) => fs.map((f) => ({ fecha: f.fecha, importe: -f.importe }));
  const tir12 = inicio12 ? xirr([{ fecha: inicio12.fecha, importe: -inicio12.valor }, ...inversor(flujos.filter((f) => f.fecha > inicio12.fecha)), { fecha: hoy, importe: e.valor }]) : { tasa: null };
  const tirTotal = xirr([...inversor(flujos), { fecha: hoy, importe: e.valor }]);

  // comparativa a 12 meses: tu cartera (TWR encadenado por meses) frente a los índices, base 100
  const mesFin = mesDe(hoy);
  const meses = Array.from({ length: 12 }, (_, i) => sumarMesesMes(mesFin, i - 11));
  const valorFinDeMes = (mes) => [...puntos].reverse().find((p) => p.fecha <= ultimoDia(mes) && mesDe(p.fecha) === mes) ?? null;
  const carteraBase = [100];
  for (let i = 1; i < meses.length; i++) {
    const a = valorFinDeMes(meses[i - 1]);
    const b = valorFinDeMes(meses[i]) ?? (i === meses.length - 1 ? puntos.at(-1) : null);
    const r = a && b ? twr([a, b], flujos).tasa : null;
    carteraBase.push(r === null ? carteraBase[i - 1] : carteraBase[i - 1] * (1 + r));
  }
  const serieDe = (id) => {
    const filas = modelo.serie(id);
    return filas ? serieCompleta(filas) : null;
  };
  const inicial = inicio12 ? { fecha: inicio12.fecha, valor: inicio12.valor } : null;
  const comparar = (serie) => (serie ? comparativa(serie, flujos.filter((f) => !inicial || f.fecha > inicial.fecha), { inicial, hasta: hoy }) : null);
  const lineas = [];
  for (const id of indices) {
    const serie = serieDe(id);
    if (!serie) continue;
    const base = serie.get(meses[0])?.valor ?? null;
    const ultimoConDato = [...meses].reverse().find((m) => serie.get(m));
    lineas.push({ id, nombre: modelo.series.find((s) => s.id === id)?.id ?? id, valores: arrastrar(meses.map((m) => (base && serie.get(m) ? (serie.get(m).valor / base) * 100 : null))), tendrias: comparar(serie), hasta: ultimoConDato });
  }
  // índice propio: objetivo → clase → índice; efectivo y sin índice: rentabilidad 0
  const componentes = objetivo.map((o) => {
    const a = activos.find((x) => x.id === o.activo);
    const id = indiceDeActivo(a, clases);
    return { peso: o.peso, serie: id ? serieDe(id) : null, indice: id, activo: o.activo };
  });
  // se calcula desde el inicio de la ventana (para «tendrías») y se rebasa a 100 en el primer mes del gráfico
  const desdeIp = inicial ? mesDe(inicial.fecha) : meses[0];
  const mesesIp = Array.from({ length: mesesEntre(desdeIp, mesFin) + 1 }, (_, i) => sumarMesesMes(desdeIp, i)).filter((m) => componentes.every((c) => !c.serie || c.serie.get(m)));
  const ip = componentes.length && mesesIp.length ? indicePropio(componentes, mesesIp) : null;
  const baseIp = ip?.get(meses[0]) ?? null;
  const propio = ip ? { valores: arrastrar(meses.map((m) => (baseIp && ip.get(m) ? (ip.get(m) / baseIp) * 100 : null))), tendrias: comparar(new Map(mesesIp.map((m) => [m, { valor: ip.get(m), interpolado: false }]))), sinIndice: componentes.filter((c) => !c.serie).map((c) => c.activo) } : null;

  // reparto de la aportación: por defecto, la aportación mensual de los recurrentes de inversión
  const aporta = aportacion ?? (aportacionMensualInversion(modelo) || 60000);
  const sumaObjetivo = objetivo.reduce((s, o) => s + o.peso, 0);
  const reparto = sumaObjetivo === 10000 ? repartirAportacion({ activos: objetivo.map((o) => ({ id: o.activo, valor: e.porActivo.get(o.activo)?.valor ?? 0, pesoPb: o.peso, minimo: o.minimo })), aportacion: aporta, redondeo: cabObjetivo.redondeo ?? 1000 }) : null;

  const umbral = cabObjetivo.umbral_desviacion ?? modelo.ajustes.umbral_desviacion ?? 100;
  return {
    hoy,
    estado: e,
    impuesto: impuestoVenta(e.plusvalia, modelo.ajustes.impuestos_ahorro),
    impuestosVerificado: modelo.ajustes.impuestos_verificado ?? null,
    twr12,
    twrTotal,
    tir12,
    tirTotal,
    ventana: { desde: inicio12?.fecha ?? null, meses: inicio12 ? mesesEntre(mesDe(inicio12.fecha), mesFin) : 0 },
    puntos,
    comparativa: { meses, cartera: carteraBase, indices: lineas, propio, inicial },
    reparto: reparto ? { aportacion: aporta, filas: reparto } : { aportacion: aporta, filas: null, motivo: `los pesos objetivo suman ${sumaObjetivo / 100} %, no 100` },
    exposicion: (dim) => exposicion(e.porActivo, activos, dim),
    clases: clasesVsObjetivo(e.porActivo, objetivo, clases, { umbralPb: umbral, activos }),
    terMedio: terMedio(e.porActivo),
    umbral,
  };
}
