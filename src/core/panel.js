// Panel (§4.8, §5 Panel): resumen al abrir, KPI, línea de tiempo del patrimonio con hitos y flujo del mes.
// Todo por código, sin IA. Importes en céntimos; tasas en pb. Isomórfico.
import { totales, naturalezaDe, indexar } from './mes.js';
import { saldos, patrimonio, colchon } from './patrimonio.js';
import { valorCarteraEn } from './cartera.js';
import { resumenCartera } from './cartera-resumen.js';
import { progresoMetas, todosLosMovimientos } from './metas.js';
import { pendientes } from './resumen.js';
import { proporcionPb, sumar } from './dinero.js';
import { mesFinanciero, periodoMes, sumarMesesMes, sumarDias } from './fechas.js';

export function saludo(hora) {
  const h = Number(String(hora).slice(0, 2));
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/** Patrimonio neto a una fecha: cuentas (las de deuda restan) + cartera. */
export function patrimonioEn(modelo, fecha, movimientos = todosLosMovimientos(modelo)) {
  const { porCuenta } = saldos(modelo.cuentas, movimientos, fecha);
  const cartera = valorCarteraEn({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: fecha });
  return { cuentas: porCuenta, cartera, patrimonio: patrimonio(porCuenta, modelo.cuentas, cartera) };
}

/** Totales de cada mes (financiero) que tiene fichero. → Map mes → {estado, totales} */
export function totalesPorMes(modelo) {
  return new Map(modelo.meses.map((m) => [m, { estado: modelo.mes(m).estado.estado, totales: totales(modelo.mes(m).movimientos, modelo.grupos) }]));
}

/** Tasa de ahorro agregada de una lista de meses: Σ(invertido + ahorrado) ÷ Σ entradas (pb o null). */
export function tasaAgregada(lista) {
  const e = sumar(...lista.map((t) => t.entradas));
  return e > 0 ? proporcionPb(sumar(...lista.map((t) => t.invertido + t.ahorrado)), e) : null;
}

/**
 * Resumen al abrir (§4.8): saludo, pendientes, gasto de ayer, tasa del mes y meta más cercana.
 * → {saludo, nombre, pendientes: [títulos], ayer: {consumo, conceptos}, tasaPb, meta: {titulo, falta} | null}
 */
export function resumenAlAbrir(modelo, { fecha: hoy, hora }, { contexto = [] } = {}) {
  const p = pendientes(modelo, { fecha: hoy, hora }, { contexto });
  const porId = indexar(modelo.grupos);
  const ayer = sumarDias(hoy, -1);
  const deAyer = todosLosMovimientos(modelo).filter((m) => m.fecha === ayer && naturalezaDe(m, porId) === 'consumo');
  const mes = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const t = totales(modelo.mes(mes)?.movimientos ?? [], modelo.grupos);
  const metas = progresoMetas(modelo, hoy).filter((x) => x.estado === 'activa' && x.falta > 0).sort((a, b) => a.falta - b.falta);
  return {
    saludo: saludo(hora),
    nombre: modelo.ajustes.nombre ?? null,
    pendientes: p.elementos.filter((e) => e.principal && !e.hecho).map((e) => e.titulo),
    ayer: { consumo: 0 - sumar(0, ...deAyer.map((m) => m.importe)) || 0, conceptos: [...deAyer].sort((a, b) => a.importe - b.importe).map((m) => m.concepto) },
    tasaPb: t.tasaPb,
    meta: metas[0] ? { titulo: metas[0].titulo, falta: metas[0].falta } : null,
  };
}

/**
 * Los 4 KPI del Panel. → {patrimonio: {valor, variacionPb, anterior}, colchon: {total, meses, metaMeses, metaPb},
 *   tasa: {mesPb, media12Pb, meses}, cartera: {twr, aprox, propio}}
 */
export function kpisPanel(modelo, hoy) {
  const inicio = modelo.ajustes.mes_inicio_dia;
  const mes = mesFinanciero(hoy, inicio);
  const movs = todosLosMovimientos(modelo);
  const ahora = patrimonioEn(modelo, hoy, movs);
  const finAnterior = periodoMes(sumarMesesMes(mes, -1), inicio).hasta;
  const antes = patrimonioEn(modelo, finAnterior, movs).patrimonio;
  const porMes = totalesPorMes(modelo);
  const cerrados = [...porMes].filter(([m, x]) => m < mes && x.estado === 'cerrado').sort(([a], [b]) => (a < b ? 1 : -1));
  const consumoMedio = cerrados.length ? Math.round(sumar(...cerrados.slice(0, 6).map(([, x]) => x.totales.consumo)) / Math.min(6, cerrados.length)) : null;
  const col = colchon(ahora.cuentas, modelo.cuentas, consumoMedio);
  const cuentasColchon = new Set(modelo.cuentas.filter((c) => c.colchon).map((c) => c.id));
  const metaColchon = progresoMetas(modelo, hoy).find((x) => x.origen?.tipo === 'cuenta' && cuentasColchon.has(x.origen.valor) && x.estado !== 'archivada');
  const ultimos12 = cerrados.slice(0, 12).map(([, x]) => x.totales);
  const rc = modelo.fotos.length ? resumenCartera(modelo, hoy) : null;
  return {
    patrimonio: { valor: ahora.patrimonio, anterior: antes, variacionPb: antes > 0 ? proporcionPb(ahora.patrimonio - antes, antes) : null, cartera: ahora.cartera },
    colchon: { total: col.total, meses: col.meses, metaMeses: metaColchon && consumoMedio ? metaColchon.objetivo / consumoMedio : null, metaPb: metaColchon?.pb ?? null, meta: metaColchon?.titulo ?? null },
    tasa: { mesPb: porMes.get(mes)?.totales.tasaPb ?? null, media12Pb: tasaAgregada(ultimos12), meses: ultimos12.length },
    cartera: rc ? { twr: rc.twr12.tasa, aprox: rc.twr12.aprox, propio: rc.comparativa.propio?.tasaVentana ?? null, desde: rc.ventana.desde } : null,
  };
}

/**
 * Línea de tiempo de 12 meses (§5 Panel): patrimonio a fin de cada mes (o hoy en el actual), lo que has
 * puesto tú (entradas − consumo, acumulado desde el primer punto) y los hitos de la ventana.
 * → {meses, patrimonio: [c], puesto: [c], hitos: [{id, fecha, texto, tipo, nota, indice}], puestoTotal, mercado}
 */
export function lineaDeTiempo(modelo, hoy, n = 12) {
  const inicio = modelo.ajustes.mes_inicio_dia;
  const mesHoy = mesFinanciero(hoy, inicio);
  const meses = Array.from({ length: n }, (_, i) => sumarMesesMes(mesHoy, i - (n - 1)));
  const movs = todosLosMovimientos(modelo);
  const fechas = meses.map((m) => {
    const h = periodoMes(m, inicio).hasta;
    return h > hoy ? hoy : h;
  });
  const pat = fechas.map((f) => patrimonioEn(modelo, f, movs).patrimonio);
  const porMes = totalesPorMes(modelo);
  const puesto = [pat[0]];
  for (let i = 1; i < n; i++) {
    const t = porMes.get(meses[i])?.totales;
    puesto.push(puesto[i - 1] + (t ? t.entradas - t.consumo : 0));
  }
  const desde = periodoMes(meses[0], inicio).desde;
  const hitos = modelo.hitos.filter((h) => h.fecha >= desde && h.fecha <= hoy).map((h) => ({ ...h, indice: meses.indexOf(mesFinanciero(h.fecha, inicio)) }));
  const puestoTotal = puesto.at(-1) - puesto[0];
  return { meses, fechas, patrimonio: pat, puesto, hitos, puestoTotal, mercado: pat.at(-1) - pat[0] - puestoTotal };
}

/** Flujo del mes: entradas y a dónde van (consumo, inversión, ahorro, lo que queda). */
export function flujoDelMes(modelo, hoy) {
  const mes = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const t = totales(modelo.mes(mes)?.movimientos ?? [], modelo.grupos);
  const partes = [['Consumo', t.consumo, '#888780'], ['Inversión', t.invertido, '#7F77DD'], ['Ahorro y metas', t.ahorrado, '#378ADD'], ['Queda en la cuenta', t.queda, '#D3D1C7']].map(([nombre, valor, color]) => ({ nombre, valor, color, pb: t.entradas > 0 ? proporcionPb(valor, t.entradas) : null }));
  return { mes, entradas: t.entradas, partes };
}

/** Último pulso: el día más reciente de conocimiento/mundo con notas. */
export function ultimoPulso(modelo) {
  const d = [...modelo.mundo].reverse().find((x) => x.notas.length);
  return d ? { fecha: d.fecha, pulsos: d.pulsos, notas: d.notas } : null;
}
