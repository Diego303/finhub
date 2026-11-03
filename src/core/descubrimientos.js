// Descubrimientos (§4.9): mapa de efectos del pulso, rendimiento desde el descubrimiento y simulador
// (sin IA, no toca tu cartera). Isomórfico.
import { semanaIso, limitesSemana, sumarDias, mesDe } from './fechas.js';
import { estadoCartera, exposicion, terMedio } from './cartera.js';
import { aportacionMensualInversion } from './cartera-resumen.js';
import { pruebaCrisis, parseCrisis, CRISIS_DEFECTO, historicoMezcla, componentesDe } from './herramientas.js';
import { proporcionPb, sumar, parsePorcentaje } from './dinero.js';
import { validarIsin } from './ids.js';

export const VS_DEFECTO = 'msci-world-nr-eur';

/** Lista de descubrimientos con su última versión. */
export function listaDescubrimientos(modelo) {
  return modelo.descubrimientos
    .map((d) => {
      const ultima = d.versiones[0] ?? null;
      return { ...d, version: ultima ? ultima.id : 'v0', fechaVersion: ultima?.titulo ?? null, ultima: ultima?.campos ?? {}, numVersiones: d.versiones.length };
    })
    .sort((a, b) => ((b.descubierto ?? '') < (a.descubierto ?? '') ? -1 : 1));
}

/**
 * Mapa de efectos (§4.9): sectores (ajustes.sectores_efectos) × las últimas n semanas ISO. Cada celda suma la
 * postura que el pulso dio a cada nota para ese sector: ▲ si (alcistas − bajistas) ≥ 2, ▼ si ≤ −2, • si hay
 * notas y no llega, '' si no hay ninguna. → {semanas: [{id, desde, hasta}], filas: [{sector, celdas: [{signo, neto, notas}], lectura}]}
 */
export function mapaEfectos(modelo, hoy, n = 4) {
  const semanas = Array.from({ length: n }, (_, i) => {
    const f = sumarDias(hoy, -7 * (n - 1 - i));
    return { id: semanaIso(f).id, ...limitesSemana(f) };
  });
  const sectores = modelo.ajustes.sectores_efectos ?? [];
  const notas = modelo.mundo.flatMap((d) => d.notas.map((b) => ({ id: b.id, titulo: b.titulo, fecha: b.campos.fecha ?? d.fecha, efectos: b.campos.efectos ?? {} })));
  const filas = sectores.map((sector) => {
    const celdas = semanas.map((s) => {
      const ns = notas.filter((x) => x.fecha >= s.desde && x.fecha <= s.hasta && x.efectos[sector]);
      const neto = ns.reduce((a, x) => a + (x.efectos[sector] === '▲' ? 1 : x.efectos[sector] === '▼' ? -1 : 0), 0);
      return { signo: !ns.length ? '' : neto >= 2 ? '▲' : neto <= -2 ? '▼' : '•', neto, notas: ns.map((x) => ({ id: x.id, titulo: x.titulo, efecto: x.efectos[sector] })) };
    });
    const sube = celdas.filter((c) => c.signo === '▲').length;
    const baja = celdas.filter((c) => c.signo === '▼').length;
    return { sector, celdas, lectura: sube >= Math.ceil(n * 0.75) ? 'tendencia favorable en las noticias' : baja >= 2 ? 'noticias recientes en contra' : celdas.every((c) => !c.signo) ? 'sin noticias' : 'sin dirección clara' };
  });
  return { semanas, filas };
}

/** Serie para «desde el descubrimiento»: un id de Datos o un ISIN (sus precios, guardados como serie). */
export const serieDeReferencia = (ref) => (!ref ? null : /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(ref) ? ref.toLowerCase() : ref);

/**
 * Rendimiento desde el descubrimiento (§4.9): variación de la referencia desde el cierre del mes anterior a
 * «descubierto» hasta su último dato, frente a «vs» en los mismos meses. → {ref, vs, desde, hasta} (tanto por uno) o null («—»).
 */
export function rendimientoDesde(d, modelo) {
  const id = serieDeReferencia(d.referencia);
  if (!id || !d.descubierto) return null;
  const filas = modelo.serie(id);
  const vsFilas = modelo.serie(d.vs ?? VS_DEFECTO);
  if (!filas?.length) return null;
  const m = new Map(filas.map((f) => [f.mes, f.valor]));
  // el nivel de partida es el cierre del mes ANTERIOR al descubrimiento (las series son de fin de mes)
  const inicio = [...m.keys()].sort().filter((x) => x < mesDe(d.descubierto)).at(-1) ?? [...m.keys()].sort()[0];
  const fin = [...m.keys()].sort().at(-1);
  if (!inicio || inicio === fin) return null;
  const v = vsFilas ? new Map(vsFilas.map((f) => [f.mes, f.valor])) : null;
  const finVs = v ? [...v.keys()].sort().filter((x) => x <= fin).at(-1) : null;
  return { ref: m.get(fin) / m.get(inicio) - 1, vs: v && v.get(inicio) && finVs ? v.get(finVs) / v.get(inicio) - 1 : null, desde: inicio, hasta: fin };
}

/** TER del primer vehículo con TER en el texto de la versión («… TER 0,4 % …»), en pb, o null. */
export function terVehiculo(texto) {
  const m = /TER\s*([\d.,]+)\s*%/i.exec(String(texto ?? ''));
  if (!m) return null;
  const r = parsePorcentaje(m[1]);
  return r.ok ? r.valor : null;
}

/** ISIN válidos que aparecen en el texto de los vehículos. */
export const isinsDe = (texto) => [...new Set([...String(texto ?? '').matchAll(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/g)].map((m) => m[0]).filter(validarIsin))];

/**
 * Simulador (§4.9, sin IA, no toca tu cartera): dedicar `pct` (0–50 %) a un descubrimiento, sacándolo de
 * todo en proporción, de un activo concreto o solo de nuevas aportaciones (en ese caso, lo que se alcanza en
 * 12 meses). Recalcula pesos por clase, exposición, TER medio, caída en cada crisis y «el último año».
 * → {pesoPb, clases: [{nombre, antesPb, despuesPb}], exposicion: {antes, despues} (región), ter: {antes, despues},
 *    crisis: [{nombre, antesPb, despuesPb}], ultimoAnio: {antes, despues}, avisos}
 */
export function simular(modelo, hoy, d, { pct = 5, de = 'todo' } = {}) {
  const avisos = [];
  const e = estadoCartera({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: hoy });
  const total = e.valor;
  if (total <= 0) return { error: 'tu cartera está vacía: no hay nada que simular' };
  let pesoPb = Math.round(Math.min(50, Math.max(0, pct)) * 100);
  if (de === 'aportaciones') {
    const mensual = aportacionMensualInversion(modelo);
    const tope = mensual > 0 ? proporcionPb(mensual * 12, total + mensual * 12) : 0;
    const k0 = pesoPb / 10000;
    if (pesoPb > tope) {
      avisos.push(mensual > 0 ? `solo con nuevas aportaciones, en 12 meses llegarías a un ${(tope / 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : 'no tienes aportaciones periódicas a la cartera: no se puede llegar solo con ellas');
      pesoPb = tope;
    } else if (pesoPb > 0) avisos.push(`lo alcanzarías en ${Math.ceil((k0 * total) / (1 - k0) / mensual)} meses de aportaciones`);
  }
  const k = pesoPb / 10000;
  const nuevo = (x) => ({ ...x, valor: Math.round(x.valor * (1 - k)) });
  const antes = [...e.porActivo.values()].filter((p) => p.valor > 0);
  let despues;
  if (de.startsWith('activo:')) {
    const id = de.slice(7);
    const sacar = Math.round(total * k);
    const a = antes.find((p) => p.id === id);
    if (!a) return { error: 'ese activo no está en tu cartera' };
    if (a.valor < sacar) avisos.push(`«${a.nombre}» no llega: se saca todo lo que tiene`);
    despues = antes.map((p) => (p.id === id ? { ...p, valor: Math.max(0, p.valor - sacar) } : p));
    pesoPb = proporcionPb(Math.min(sacar, a.valor), total);
  } else despues = antes.map(nuevo);
  const valorNuevo = total - sumar(...despues.map((p) => p.valor));
  const ultima = d.versiones?.[0]?.campos ?? {};
  const ref = serieDeReferencia(d.referencia);
  const refSerie = ref ? modelo.serie(ref) : null;
  if (!refSerie) avisos.push('sin serie de referencia: en las crisis y el último año cuenta como si no se moviera');
  // pesos por clase
  const porClase = (lista, extra = 0) => {
    const m = new Map();
    for (const p of lista) m.set(p.clase ?? 'sin-clase', (m.get(p.clase ?? 'sin-clase') ?? 0) + p.valor);
    if (extra) m.set('__nuevo', extra);
    return m;
  };
  const ca = porClase(antes);
  const cd = porClase(despues, valorNuevo);
  const nombreClase = (id) => (id === '__nuevo' ? `Nuevo: ${d.titulo}` : modelo.clases.find((c) => c.id === id)?.nombre ?? 'Sin clase');
  const clases = [...new Set([...ca.keys(), ...cd.keys()])].map((id) => ({ nombre: nombreClase(id), antesPb: total ? proporcionPb(ca.get(id) ?? 0, total) : 0, despuesPb: total ? proporcionPb(cd.get(id) ?? 0, total) : 0 }));
  // exposición por región (el nuevo, sin desglose salvo que su vehículo esté entre tus activos)
  const mapa = (lista) => new Map(lista.map((p) => [p.id, p]));
  const expAntes = exposicion(mapa(antes), modelo.activos, 'region');
  const expDesp = exposicion(new Map([...mapa(despues), ['__nuevo', { id: '__nuevo', valor: valorNuevo }]]), modelo.activos, 'region');
  // TER medio (los activos sin TER cuentan 0, como en Cartera)
  const terN = terVehiculo(ultima.vehiculos);
  const ter = { antes: terMedio(mapa(antes)), despues: terMedio(new Map([...mapa(despues), ['__nuevo', { valor: valorNuevo, ter: terN ?? 0 }]])) };
  if (terN === null) avisos.push('no se conoce el TER del vehículo: en el TER medio cuenta 0');
  // crisis y último año: tus pesos actuales (antes) y los simulados con el nuevo y su referencia (después)
  const filasDe = (lista) => lista.map((p) => ({ nombre: p.nombre, peso: total ? proporcionPb(p.valor, total) : 0, clase: p.clase }));
  const filasAntes = filasDe(antes);
  const filasDesp = [...filasDe(despues), { nombre: d.titulo, peso: total ? proporcionPb(valorNuevo, total) : 0, clase: refSerie ? '__ref' : null }];
  const clasesConRef = refSerie ? [...modelo.clases, { id: '__ref', nombre: d.titulo, indice: ref, grupo: 'rv' }] : modelo.clases;
  const periodos = (() => {
    const p = parseCrisis(modelo.ajustes.crisis_periodos);
    return p.error ? parseCrisis(CRISIS_DEFECTO) : p;
  })();
  const series = (id) => modelo.serie(id);
  const crisis = periodos.map((per) => {
    const a = pruebaCrisis({ filas: filasAntes, clases: modelo.clases, series, periodo: per, valor: 100 });
    const b = pruebaCrisis({ filas: filasDesp, clases: clasesConRef, series, periodo: per, valor: 100 });
    return { nombre: per.nombre, antesPb: a.error ? null : a.caidaPb, despuesPb: b.error ? null : b.caidaPb };
  });
  // «si lo hubieras tenido el último año»: rentabilidad de la mezcla en los últimos 12 meses con datos
  const anio = (filas, cl) => {
    const h = historicoMezcla(componentesDe(filas, cl), series);
    if (h.r.length < 12) return null;
    return h.r.slice(-12).reduce((a, r) => a * (1 + r), 1) - 1;
  };
  return { pesoPb, valorNuevo, clases, exposicion: { antes: expAntes.filas, despues: expDesp.filas }, ter, crisis, ultimoAnio: { antes: anio(filasAntes, modelo.clases), despues: anio(filasDesp, clasesConRef) }, avisos };
}

/** Vehículos con ISIN de los descubrimientos que SIGUES (para el trabajo «precios», §4.9). */
export function isinsSeguidos(modelo) {
  const out = new Map();
  for (const d of modelo.descubrimientos.filter((x) => x.estado === 'siguiendo')) {
    if (d.referencia && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(d.referencia)) out.set(d.referencia, d.titulo);
  }
  return [...out].map(([isin, nombre]) => ({ isin, nombre }));
}

/** Último mes con precio de una referencia ISIN (o null). */
export function ultimoPrecio(modelo, isin) {
  return modelo.serie(isin.toLowerCase())?.at(-1)?.mes ?? null;
}

