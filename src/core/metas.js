// Metas (§4.4): progreso, aportación y fecha estimada; consumo de 12 meses para la libertad financiera.
// Importes en céntimos; porcentajes en puntos básicos. Isomórfico.
import { saldos } from './patrimonio.js';
import { totales } from './mes.js';
import { proporcionPb } from './dinero.js';
import { mesDe, sumarMesesMes, mesesEntre, sumarMeses, mesFinanciero, periodoMes } from './fechas.js';

/** Todos los movimientos de la carpeta (de todos los meses). */
export const todosLosMovimientos = (modelo) => modelo.meses.flatMap((m) => modelo.mes(m).movimientos);

/** Cuánto entra en la meta cada mes (para «media3m»): neto de la cuenta, o lo apartado en el grupo. */
function flujoMensual(origen, movimientos, mes, diaInicio) {
  const { desde, hasta } = periodoMes(mes, diaInicio);
  let neto = 0;
  for (const m of movimientos) {
    if (m.fecha < desde || m.fecha > hasta) continue;
    if (origen.tipo === 'cuenta') {
      if (m.cuenta === origen.valor) neto += m.importe;
      if (m.a === origen.valor) neto -= m.importe;
    } else if (origen.tipo === 'grupo' && m.grupo === origen.valor) neto -= m.importe;
  }
  return neto;
}

/**
 * Progreso de una meta a fecha `hoy`.
 * meta: bloque de metas.md · ctx: {cuentas, movimientos, hoy, diaInicio}
 * → {id, titulo, estado, objetivo, llevas, pb, falta, aportacion, aportacionOrigen, meses, fechaEstimada,
 *    fechaDeseada, necesaria, aTiempo, encuadre, avisos}
 */
export function progresoMeta(meta, { cuentas, movimientos, hoy, diaInicio = 1 }) {
  const c = meta.campos;
  const avisos = [];
  const objetivo = c.objetivo ?? 0;
  const origen = c.se_alimenta_de ?? null;
  const estado = c.estado?.estado ?? 'activa';
  let llevas = 0;
  if (!origen) avisos.push('no dice de dónde se alimenta: progreso 0');
  else if (origen.tipo === 'manual') llevas = origen.valor;
  else if (origen.tipo === 'cuenta') {
    const s = saldos(cuentas, movimientos, hoy).porCuenta;
    if (origen.valor in s) llevas = s[origen.valor];
    else avisos.push(`la cuenta «${origen.valor}» no existe`);
  } else {
    llevas = -movimientos.filter((m) => m.grupo === origen.valor && m.fecha <= hoy).reduce((a, m) => a + m.importe, 0);
  }
  if (estado === 'cumplida' && llevas < objetivo) llevas = objetivo; // cumplida a mano: cuenta como llena
  const falta = Math.max(0, objetivo - llevas);
  const pb = objetivo > 0 ? Math.max(0, proporcionPb(llevas, objetivo)) : 0;

  // aportación: la fija, o la media de los 3 meses completos anteriores
  let aportacion = null;
  let aportacionOrigen = null;
  if (c.aportacion?.mensual !== undefined) {
    aportacion = c.aportacion.mensual;
    aportacionOrigen = 'fija';
  } else if (c.aportacion?.media3m && origen && origen.tipo !== 'manual') {
    const actual = mesFinanciero(hoy, diaInicio);
    const meses = [1, 2, 3].map((k) => sumarMesesMes(actual, -k));
    aportacion = Math.round(meses.reduce((a, m) => a + flujoMensual(origen, movimientos, m, diaInicio), 0) / 3);
    aportacionOrigen = 'media3m';
  } else if (c.aportacion?.media3m) avisos.push('«media3m» necesita una cuenta o un grupo');

  let meses = null;
  let fechaEstimada = null;
  if (!falta) meses = 0;
  else if (aportacion > 0) {
    meses = Math.ceil(falta / aportacion);
    fechaEstimada = sumarMeses(hoy, meses);
  }
  const fechaDeseada = c.fecha_deseada ?? null;
  let necesaria = null;
  let aTiempo = null;
  if (fechaDeseada && falta) {
    const quedan = mesesEntre(mesDe(hoy), mesDe(fechaDeseada));
    necesaria = quedan > 0 ? Math.ceil(falta / quedan) : falta;
    aTiempo = fechaEstimada !== null && fechaEstimada <= fechaDeseada;
  } else if (fechaDeseada) aTiempo = true;
  return {
    id: meta.id,
    titulo: meta.titulo,
    estado,
    fechaCumplida: c.estado?.fecha ?? null,
    origen,
    objetivo,
    llevas,
    pb,
    falta,
    aportacion,
    aportacionOrigen,
    meses,
    fechaEstimada,
    fechaDeseada,
    necesaria,
    aTiempo,
    encuadre: pb < 5000 ? 'llevas' : 'te faltan',
    lista: estado === 'activa' && objetivo > 0 && llevas >= objetivo,
    avisos,
  };
}

/** Progreso de todas las metas (las archivadas al final). */
export function progresoMetas(modelo, hoy) {
  const ctx = { cuentas: modelo.cuentas, movimientos: todosLosMovimientos(modelo), hoy, diaInicio: modelo.ajustes.mes_inicio_dia };
  const orden = { activa: 0, pausada: 1, cumplida: 2, archivada: 3 };
  return modelo.metas.map((m) => progresoMeta(m, ctx)).sort((a, b) => orden[a.estado] - orden[b.estado]);
}

/**
 * Consumo de los últimos 12 meses financieros completos (sin el actual). Con menos de 12 meses con
 * datos se anualiza la media y se marca «estimado». → {consumo, meses, estimado} · consumo null sin datos.
 */
export function consumo12(modelo, hoy) {
  const actual = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const meses = Array.from({ length: 12 }, (_, i) => sumarMesesMes(actual, -(i + 1))).filter((m) => modelo.mes(m)?.movimientos.length);
  if (!meses.length) return { consumo: null, meses: 0, estimado: true };
  const suma = meses.reduce((a, m) => a + totales(modelo.mes(m).movimientos, modelo.grupos).consumo, 0);
  return { consumo: meses.length === 12 ? suma : Math.round((suma * 12) / meses.length), meses: meses.length, estimado: meses.length < 12 };
}
