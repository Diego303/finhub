// Herramientas (§4.5 y §4.6): prueba de crisis, rangos a 12 meses, IPC personal, coste de oportunidad,
// comparador de fondos, escenarios de vida, calculadoras y radar de suscripciones. Todo por código, sin IA.
// Importes en céntimos; tasas como tanto por uno (float) en los cálculos y pb al mostrarlas. Isomórfico.
import { serieCompleta, rentabilidadesMensuales } from './rentabilidad.js';
import { componentesDe, historicoMezcla, percentil, SERIE_EFECTIVO, SERIE_IPC, indiceDeClase } from './proyeccion.js';
import { consumo12, progresoMetas } from './metas.js';
import { resumenMetas } from './metas-resumen.js';
import { totalesPorMes, tasaAgregada } from './panel.js';
import { mesFinanciero, sumarMesesMes, esMes, sumarMeses } from './fechas.js';
import { proporcionPb, sumar } from './dinero.js';

const mensual = (anual) => (1 + anual) ** (1 / 12) - 1;

// ---------- prueba de crisis (§4.5) ----------
export const CRISIS_DEFECTO = '2000-03..2003-03 Puntocom | 2007-10..2009-02 Crisis financiera | 2020-01..2020-03 Covid | 2021-12..2022-09 Inflación y tipos';

/** "2007-10..2009-02 Crisis financiera | …" → [{id, nombre, desde, hasta}] o {error} */
export function parseCrisis(texto) {
  const lista = [];
  for (const parte of String(texto ?? '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d{4}-\d{2})\.\.(\d{4}-\d{2})\s+(.+)$/.exec(parte);
    if (!m || !esMes(m[1]) || !esMes(m[2]) || m[2] <= m[1]) return { error: `«${parte}» debe ser «AAAA-MM..AAAA-MM nombre»` };
    lista.push({ id: m[1].slice(0, 4), nombre: m[3].trim(), desde: m[1], hasta: m[2] });
  }
  return lista;
}

/**
 * Aplica la trayectoria mensual de un periodo a tus pesos actuales (rebalanceo mensual).
 * filas: [{nombre, peso, clase}] (pesos en pb) · series: (id) => [{mes, valor}] | null.
 * El periodo marca la caída (desde = el máximo de partida); la trayectoria sigue con la historia posterior
 * hasta recuperarse (como mucho `max` meses o hasta donde haya datos).
 * → {meses, sin: [base 100], con: [valor ÷ lo puesto × 100], caidaPb, valorMinimo, mesMinimo, recuperaSin, recuperaCon,
 *    aproximaciones: [{nombre, con}], avisos}
 */
export function pruebaCrisis({ filas, clases, series, periodo, valor, aportacion = 0, max = 120 }) {
  const avisos = [];
  const aproximaciones = [];
  const rents = new Map();
  const rDe = (id) => {
    if (!id) return null;
    if (!rents.has(id)) {
      const f = series(id);
      rents.set(id, f ? rentabilidadesMensuales(serieCompleta(f)) : null);
    }
    return rents.get(id);
  };
  const bce = series(SERIE_EFECTIVO);
  const tipoBce = bce ? new Map(bce.map((f) => [f.mes, f.valor / 100 / 12])) : null;
  const necesarios = [];
  for (let m = sumarMesesMes(periodo.desde, 1); m <= periodo.hasta; m = sumarMesesMes(m, 1)) necesarios.push(m);
  const cubre = (r) => r && necesarios.every((m) => r.has(m));
  const partes = componentesDe(filas, clases).map((c, i) => {
    const peso = c.peso / 10000;
    const propia = rDe(c.indice);
    if (cubre(propia)) return { peso, r: propia };
    if (c.grupo === 'efectivo' && !c.indice) return { peso, r: tipoBce };
    // sin datos en el periodo: la clase «parecida» (§4.5), indicada
    const clase = clases.find((x) => x.id === filas[i].clase);
    const parecida = clase?.parecida ? indiceDeClase(clase.parecida, clases) : null;
    const alt = rDe(parecida);
    if (cubre(alt)) {
      aproximaciones.push({ nombre: c.nombre, con: clases.find((x) => x.id === clase.parecida)?.nombre ?? clase.parecida });
      return { peso, r: alt };
    }
    avisos.push(`«${c.nombre}» no tiene datos en ese periodo: cuenta como si no se moviera`);
    return { peso, r: null };
  });
  const conDatos = partes.filter((p) => p.r);
  if (!conDatos.length || !necesarios.length) return { error: 'no hay series con datos en ese periodo' };
  const meses = [periodo.desde];
  const r = [];
  for (let m = sumarMesesMes(periodo.desde, 1); meses.length <= max; m = sumarMesesMes(m, 1)) {
    if (!conDatos.every((p) => p.r.has(m))) break;
    meses.push(m);
    r.push(partes.reduce((a, p) => a + p.peso * (p.r ? p.r.get(m) ?? 0 : 0), 0));
  }
  const sin = [100];
  const con = [100];
  let v = valor;
  let puesto = valor;
  for (const x of r) {
    sin.push(sin.at(-1) * (1 + x));
    v = v * (1 + x) + aportacion;
    puesto += aportacion;
    con.push(puesto > 0 ? (v / puesto) * 100 : 100);
  }
  // el mínimo se busca dentro del periodo de la caída
  const finPeriodo = meses.indexOf(periodo.hasta);
  let iMin = 0;
  for (let i = 1; i <= finPeriodo; i++) if (sin[i] < sin[iMin]) iMin = i;
  const recupera = (serie) => {
    let abajo = false;
    for (let i = 1; i < serie.length; i++) {
      if (serie[i] < 100 - 1e-9) abajo = true;
      else if (abajo && i > iMin) return i;
    }
    return abajo ? null : 0;
  };
  const recuperaSin = recupera(sin);
  const recuperaCon = recupera(con);
  // se enseña hasta 6 meses después de recuperarse las dos (o todo, si alguna no se recupera)
  const corte = recuperaSin === null || recuperaCon === null ? meses.length : Math.min(meses.length, Math.max(recuperaSin, recuperaCon, finPeriodo) + 7);
  return {
    meses: meses.slice(0, corte),
    sin: sin.slice(0, corte),
    con: con.slice(0, corte),
    caidaPb: Math.round((sin[iMin] / 100 - 1) * 10000),
    valorMinimo: Math.round(valor * (sin[iMin] / 100)),
    mesMinimo: meses[iMin],
    recuperaSin,
    recuperaCon,
    hastaDatos: meses.at(-1),
    mesesConDatos: meses.length,
    aproximaciones,
    avisos,
  };
}

/**
 * Rangos a 12 meses (§4.5) con las rentabilidades móviles a 12 meses de tu mezcla:
 * pesimista p5–p25, base p25–p75, optimista p75–p95, peor caso = mínimo. → pb, o {error}
 */
export function rangos12m(historico) {
  const r = historico.r;
  if (r.length < 24) return { error: 'hacen falta al menos dos años de histórico' };
  const moviles = [];
  for (let i = 0; i + 12 <= r.length; i++) {
    let a = 1;
    for (let k = 0; k < 12; k++) a *= 1 + r[i + k];
    moviles.push(a - 1);
  }
  moviles.sort((a, b) => a - b);
  const pb = (q) => Math.round(percentil(moviles, q) * 10000);
  return { pesimista: [pb(0.05), pb(0.25)], base: [pb(0.25), pb(0.75)], optimista: [pb(0.75), pb(0.95)], peor: Math.round(moviles[0] * 10000), ventanas: moviles.length, desde: historico.meses[0], hasta: historico.meses.at(-1) };
}

// ---------- IPC personal (§4.6) ----------
/** Variación interanual de una serie en su último mes (o en `mes`). → {tasa, mes} | null */
export function interanual(filas, mes = null) {
  if (!filas?.length) return null;
  const m = new Map(filas.map((f) => [f.mes, f.valor]));
  const ultimo = mes ?? [...m.keys()].sort().at(-1);
  const antes = m.get(sumarMesesMes(ultimo, -12));
  return m.has(ultimo) && antes ? { tasa: m.get(ultimo) / antes - 1, mes: ultimo } : null;
}

/**
 * Pesos = tu consumo de 12 meses por grupo (con `ipc:`); tasas = interanual de cada componente.
 * → {personal, general, mes, filas: [{grupo, nombre, consumo, pesoPb, componente, tasa}], sinMapear: [{nombre, consumo}], excluidoPb}
 */
export function ipcPersonal(modelo, hoy) {
  const actual = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const meses = Array.from({ length: 12 }, (_, i) => sumarMesesMes(actual, -(i + 1)));
  const porMes = totalesPorMes(modelo);
  const porGrupo = new Map();
  for (const m of meses) for (const [id, g] of porMes.get(m)?.totales.porGrupo ?? []) if (g.consumo > 0) porGrupo.set(id, (porGrupo.get(id) ?? 0) + g.consumo);
  const general = interanual(modelo.serie(SERIE_IPC));
  const mes = general?.mes ?? null;
  const filas = [];
  const sinMapear = [];
  for (const [id, consumo] of porGrupo) {
    const g = modelo.grupos.find((x) => x.id === id);
    const t = g?.ipc ? interanual(modelo.serie(g.ipc), mes) : null;
    if (t) filas.push({ grupo: id, nombre: g.nombre, consumo, componente: g.ipc, tasa: t.tasa });
    else sinMapear.push({ nombre: g?.nombre ?? id, consumo, motivo: g?.ipc ? `sin datos de «${g.ipc}»` : 'sin componente del IPC' });
  }
  const mapeado = sumar(...filas.map((f) => f.consumo));
  const total = mapeado + sumar(...sinMapear.map((f) => f.consumo));
  for (const f of filas) f.pesoPb = proporcionPb(f.consumo, mapeado);
  filas.sort((a, b) => b.consumo - a.consumo);
  return {
    personal: mapeado ? filas.reduce((a, f) => a + (f.consumo / mapeado) * f.tasa, 0) : null,
    general: general?.tasa ?? null,
    mes,
    filas,
    sinMapear,
    excluidoPb: total ? proporcionPb(total - mapeado, total) : 0,
  };
}

// ---------- coste de oportunidad y calculadoras (§4.6) ----------
/** Valor futuro de un capital y de una aportación mensual (al final de cada mes), interés compuesto mensual. */
export function valorFuturo({ capital = 0, mensual: m = 0, anios, tasa }) {
  const i = mensual(tasa);
  const n = Math.round(anios * 12);
  const f = (1 + i) ** n;
  return Math.round(capital * f + (i ? (m * (f - 1)) / i : m * n));
}

/** Coste de oportunidad: lo que valdría un gasto puntual o mensual invertido; en días de libertad. */
export function costeOportunidad({ importe = 0, mensual: m = 0, anios, tasa, consumoAnual = null }) {
  const puntual = valorFuturo({ capital: importe, anios, tasa });
  const mes = valorFuturo({ mensual: m, anios, tasa });
  const dia = consumoAnual > 0 ? consumoAnual / 365 : null;
  return { puntual, mensual: mes, diasPuntual: dia ? Math.round(puntual / dia) : null, diasMensual: dia ? Math.round(mes / dia) : null };
}

/** Interés compuesto: lo que pones, los intereses y el total. */
export function interesCompuesto({ capital = 0, mensual: m = 0, anios, tasa }) {
  const total = valorFuturo({ capital, mensual: m, anios, tasa });
  const pones = capital + m * Math.round(anios * 12);
  return { pones, intereses: total - pones, total, interesPb: total > 0 ? proporcionPb(total - pones, total) : 0 };
}

/** Cuota mensual para llegar a `objetivo` en `meses` partiendo de `inicial`, a una tasa anual. */
export function cuotaMeta({ objetivo, inicial = 0, meses, tasa = 0 }) {
  if (!(meses > 0)) return null;
  const i = mensual(tasa);
  const f = (1 + i) ** meses;
  const falta = objetivo - inicial * f;
  if (falta <= 0) return 0;
  return Math.ceil(i ? (falta * i) / (f - 1) : falta / meses);
}

/**
 * Comparador de fondos: misma rentabilidad bruta, distinto TER. Simulación mensual con (bruta − TER).
 * → {a: [c por año], b: [c por año], finalA, finalB, diferencia}
 */
export function comparadorFondos({ inicial, mensual: m, anios, bruta, terA, terB }) {
  const curva = (ter) => {
    const i = mensual(bruta - ter);
    const out = [inicial];
    let v = inicial;
    for (let a = 1; a <= anios; a++) {
      for (let k = 0; k < 12; k++) v = v * (1 + i) + m;
      out.push(Math.round(v));
    }
    return out;
  };
  const a = curva(terA);
  const b = curva(terB);
  return { a, b, finalA: a.at(-1), finalB: b.at(-1), diferencia: Math.abs(a.at(-1) - b.at(-1)) };
}

/** Cuota de un préstamo francés. */
export function cuotaPrestamo(capital, tasaAnual, meses) {
  const i = tasaAnual / 12;
  return i ? (capital * i) / (1 - (1 + i) ** -meses) : capital / meses;
}

/**
 * Alquilar o comprar: los dos gastan lo mismo cada mes; quien paga menos invierte la diferencia (y el que
 * alquila invierte desde el principio la entrada y los impuestos de compra). Sin costes de venta.
 * Importes en céntimos; tasas anuales (tanto por uno).
 * → {comprar, alquilar, diferencia, cuota, vivienda, deuda}
 */
export function alquilarComprar({ precio, alquiler, entrada = 0.2, impuestos = 0.1, ibi = 0, comunidad = 0, mantenimiento = 0.01, revalorizacion = 0.02, tipo = 0.03, plazo = 25, horizonte = 10, rentabilidad = 0.05, subidaAlquiler = 0.02 }) {
  const deuda0 = precio * (1 - entrada);
  const cuota = cuotaPrestamo(deuda0, tipo, plazo * 12);
  const r = mensual(rentabilidad);
  let deuda = deuda0;
  let invComprador = 0;
  let invInquilino = precio * entrada + precio * impuestos;
  let renta = alquiler;
  for (let mes = 0; mes < horizonte * 12; mes++) {
    if (mes > 0 && mes % 12 === 0) renta *= 1 + subidaAlquiler;
    const pagoHipoteca = deuda > 0 ? Math.min(cuota, deuda * (1 + tipo / 12)) : 0;
    deuda = Math.max(0, deuda * (1 + tipo / 12) - pagoHipoteca);
    const gastoComprar = pagoHipoteca + ibi / 12 + comunidad + (precio * mantenimiento) / 12;
    invComprador *= 1 + r;
    invInquilino *= 1 + r;
    const dif = gastoComprar - renta;
    if (dif > 0) invInquilino += dif;
    else invComprador -= dif;
  }
  const vivienda = precio * (1 + revalorizacion) ** horizonte;
  const comprar = Math.round(vivienda - deuda + invComprador);
  const alquilar = Math.round(invInquilino);
  return { comprar, alquilar, diferencia: comprar - alquilar, cuota: Math.round(cuota), vivienda: Math.round(vivienda), deuda: Math.round(deuda) };
}

// ---------- escenarios de vida (§4.6) ----------
/**
 * Modificadores sobre tu situación: pausa de aportación de N meses, ± ingresos/mes, ± gasto/mes, gasto puntual.
 * El cambio neto mensual va a (o sale de) tu aportación a la cartera; la pausa detiene metas y cartera;
 * el gasto puntual sale de la cartera; el gasto mensual sube el objetivo de libertad financiera.
 * → {metas: [{titulo, antes, despues}], tasa: {antesPb, despuesPb}, libertad: {antes, despues, objetivoAntes, objetivoDespues},
 *    aportacion: {antes, despues}, neto}
 */
export function escenariosVida(modelo, hoy, { pausaMeses = 0, ingresosMes = 0, gastoMes = 0, gastoPuntual = 0 } = {}, opciones = {}) {
  const neto = ingresosMes - gastoMes;
  const metas = progresoMetas(modelo, hoy)
    .filter((x) => x.estado === 'activa' && x.falta > 0)
    .map((x) => ({ id: x.id, titulo: x.titulo, antes: x.fechaEstimada, despues: x.fechaEstimada && pausaMeses ? sumarMeses(x.fechaEstimada, pausaMeses) : x.fechaEstimada }));
  const mes = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const ultimos = [...totalesPorMes(modelo)].filter(([m, x]) => m < mes && x.estado === 'cerrado').sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 12).map(([, x]) => x.totales);
  const antesPb = tasaAgregada(ultimos);
  const n = ultimos.length || 1;
  const E = sumar(...ultimos.map((t) => t.entradas)) / n;
  const S = sumar(...ultimos.map((t) => t.invertido + t.ahorrado)) / n;
  const despuesPb = E + ingresosMes > 0 ? Math.round(((S + neto) / (E + ingresosMes)) * 10000) : null;
  const anios = opciones.anios ?? 40;
  const base = resumenMetas(modelo, hoy, { ...opciones, anios });
  const aporta = Math.max(0, base.aportacion + neto);
  const tras = resumenMetas(modelo, hoy, { ...opciones, anios, aportacion: aporta, pausa: pausaMeses, inicial: Math.max(0, base.inicial - gastoPuntual), consumoExtra: gastoMes * 12 });
  const anio0 = +hoy.slice(0, 4);
  const lib = (r) => (r.libertad?.objetivo ? (r.libertad.anio !== null ? anio0 + r.libertad.anio : null) : undefined);
  return {
    metas,
    tasa: { antesPb, despuesPb },
    libertad: { antes: lib(base), despues: lib(tras), objetivoAntes: base.libertad?.objetivo ?? null, objetivoDespues: tras.libertad?.objetivo ?? null, horizonte: anios },
    aportacion: { antes: base.aportacion, despues: aporta },
    neto,
    consumo: consumo12(modelo, hoy),
  };
}

// ---------- radar de suscripciones (§4.6) ----------
const VECES = { mes: 12, bimestre: 6, trimestre: 4, semestre: 2, año: 1 };

/**
 * Recurrentes con #suscripción: coste anual, «¿la usas?» (campo uso:) y ahorro si cancelas las marcadas
 * (por defecto, las que no usas), con su coste de oportunidad. → {filas, total, ahorro, futuro, anios, tasa}
 */
export function radarSuscripciones(modelo, { marcadas = null, anios = 20, tasa = 0.04, hoy = null } = {}) {
  const mes = hoy ? hoy.slice(0, 7) : null;
  const filas = modelo.recurrentes
    .filter((r) => r.etiquetas?.includes('suscripción') && (!mes || !r.hasta || r.hasta >= mes))
    .map((r) => ({ id: r.id, concepto: r.concepto, anual: Math.abs(r.importe) * (VECES[r.cada] ?? 12), cada: r.cada, uso: r.uso ?? null, pausado: !!r.pausado }))
    .sort((a, b) => b.anual - a.anual);
  const sel = marcadas ?? new Set(filas.filter((f) => f.uso?.estado === 'no').map((f) => f.id));
  for (const f of filas) f.marcada = sel.has(f.id);
  const activas = filas.filter((f) => !f.pausado);
  const ahorro = sumar(...activas.filter((f) => f.marcada).map((f) => f.anual));
  return { filas, total: sumar(...activas.map((f) => f.anual)), ahorro, futuro: valorFuturo({ mensual: Math.round(ahorro / 12), anios, tasa }), anios, tasa };
}

/** Componentes de tu cartera para la crisis: el objetivo (o, si no hay, los pesos actuales por valor). */
export function filasCartera(modelo, porActivo = null) {
  if (modelo.objetivo.length) {
    return modelo.objetivo.map((o) => {
      const a = modelo.activos.find((x) => x.id === o.activo);
      return { nombre: a?.titulo ?? o.activo, peso: o.peso, clase: a?.campos.clase ?? null };
    });
  }
  const lista = [...(porActivo?.values() ?? [])].filter((p) => p.valor > 0);
  const total = sumar(...lista.map((p) => p.valor));
  return lista.map((p) => ({ nombre: p.nombre, peso: proporcionPb(p.valor, total), clase: p.clase }));
}

export { historicoMezcla, componentesDe };
