// Pestaña Cartera (§5, maqueta: cartera()) y sus modales: operación, activo, valores, Generar cartera base,
// borradores y el editor «Activos y objetivo». Cálculos: /core/cartera*.js, /core/rentabilidad.js, /core/reparto.js.
import { html } from '../esc.js';
import { accion, cambio, formulario, entrada } from '../acciones.js';
import { op, obtener } from '../api.js';
import { abrir, cerrar, confirmar, repintarModal } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { graficoLineas } from '../graficos/linea.js';
import { graficoTreemap } from '../graficos/treemap.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml } from '../componentes/claude.js';
import { resumenCartera } from '/core/cartera-resumen.js';
import { formatearEuros, formatearPct, formatearImporte, formatearPorcentaje, parseImporte, parsePorcentaje, parseDecimal, formatearDecimal } from '/core/dinero.js';
import { textoCorto, MESES_CORTOS, esFecha } from '/core/fechas.js';
import { slugUnico, validarIsin } from '/core/ids.js';
import { leer } from '/core/formato/index.js';
import { items, cabeceras, textoSeccion } from '/core/formato/motor.js';
import { TIPOS_ACTIVO, TIPOS_OPERACION, GRUPOS_CLASE, activos as fActivos } from '/core/formato/cartera.js';

const eur = (c, d = 0) => formatearEuros(c, d);
const pctTasa = (t, d = 1) => (t === null || t === undefined ? '—' : formatearPct(Math.round(t * 10000), d));
const COLORES = ['#378ADD', '#7F77DD', '#D85A30', '#1D9E75', '#888780', '#B4B2A9', '#BA7517', '#E24B4A'];
const COLOR_IDX = { 'msci-world-nr-eur': '#1D9E75', 'sp500-eur': '#378ADD', 'nasdaq-100-eur': '#7F77DD', 'msci-em-nr-eur': '#BA7517', 'msci-world-small-eur': '#E24B4A', 'rf-euro-agregada': '#888780' };
const TIPO_OP = { aportacion: 'aportación', venta: 'venta', traspaso: 'traspaso', dividendo: 'dividendo', comision: 'comisión', ajuste: 'ajuste' };

const ui = { indices: null, aportacion: null, dimension: 'region', filtroOps: '', verOps: 12 };
let contexto = null;
export const iniciarCartera = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();

const seriesIndice = (m) => m.series.filter((s) => (s.unidad ?? 'indice') === 'indice' && !s.id.startsWith('ipc'));
const nombreSerie = (id) => ({ 'msci-world-nr-eur': 'MSCI World', 'sp500-eur': 'S&P 500', 'nasdaq-100-eur': 'Nasdaq 100', 'msci-em-nr-eur': 'Emergentes', 'msci-world-small-eur': 'Small caps', 'rf-euro-agregada': 'RF euro' })[id] ?? id;

export function datosCartera(estado) {
  const m = estado.modelo;
  if (ui.indices === null) ui.indices = seriesIndice(m).some((s) => s.id === 'msci-world-nr-eur') ? ['msci-world-nr-eur'] : seriesIndice(m).slice(0, 1).map((s) => s.id);
  return resumenCartera(m, estado.ahora.fecha, { indices: ui.indices, aportacion: ui.aportacion });
}

// ---------- vista ----------
export function vistaCartera(estado) {
  const m = estado.modelo;
  const r = datosCartera(estado);
  const e = r.estado;
  const posiciones = [...e.porActivo.values()].sort((a, b) => b.valor - a.valor);
  const borradores = [...m.docs.keys()].filter((x) => x.startsWith('cartera/borradores/')).map((ruta) => ({ ruta, doc: m.doc(ruta) })).filter((b) => b.doc.secciones[0].nodos.find((n) => n.clave === 'estado')?.valor === 'borrador');
  return html`<div class="entre" style="margin-bottom:8px"><span class="mut" style="font-size:11px">Tu cartera la mantienes tú: posiciones, aportaciones y valores.${e.ultimaFoto ? ` Valores del ${textoCorto(e.ultimaFoto)}.` : ' Aún sin valores.'}</span>
      <span class="fila"><button type="button" data-accion="cartera-generar">Generar cartera base</button><button type="button" data-accion="activo-form" data-id="">+ activo</button><button type="button" data-accion="operacion-form" data-id="">+ operación</button><button type="button" class="${e.faltanValores ? 'pri' : ''}" data-accion="valores-form">actualizar valores</button></span></div>
    ${e.faltanValores ? html`<div class="banda aviso">Hay operaciones posteriores a la última foto de valor: se suman a su valor, pero faltan valores actualizados.</div>` : ''}
    ${e.avisos.length ? html`<div class="banda aviso" style="display:block">${e.avisos.map((a) => html`<div>⚠ ${a}</div>`)}</div>` : ''}
    <div class="kpis cinco">
      <div class="box"><div class="lab">Valor</div><div class="k" style="font-size:18px">${e.noConcluyente ? 'no concluyente' : eur(e.valor)}</div></div>
      <div class="box"><div class="lab">Aportado</div><div class="k" style="font-size:18px">${eur(e.coste)}</div>${e.costeAproximado ? html`<div class="mut" style="font-size:10px">coste aproximado (sin participaciones)</div>` : ''}</div>
      <div class="box"><div class="lab">Plusvalía</div><div class="k" style="font-size:18px;color:${e.plusvalia >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}">${eur(e.plusvalia)}</div><div class="mut" style="font-size:10.5px">${e.plusvaliaPb === null ? '' : formatearPct(e.plusvaliaPb)}</div></div>
      <div class="box"><div class="lab" title="Desde la foto de valor más cercana a hace un año">Rentab. ${r.ventana.desde ? `desde ${MESES_CORTOS[+r.ventana.desde.slice(5, 7) - 1]} ${r.ventana.desde.slice(2, 4)}` : ''}</div><div style="font-size:12px;line-height:1.6">TWR <b style="font-weight:500">${pctTasa(r.twr12.tasa)}</b>${r.twr12.aprox ? html` <span class="mut" style="font-size:10px">aprox.</span>` : ''}<br>TIR <b style="font-weight:500">${r.tir12.tasa === null ? 'no concluyente' : pctTasa(r.tir12.tasa)}</b></div></div>
      <div class="box"><div class="lab">Si vendieras hoy</div><div style="font-size:12px;line-height:1.6">impuesto ≈ <b style="font-weight:500">${eur(r.impuesto)}</b></div><div class="mut" style="font-size:10px">base del ahorro · estimación${r.impuestosVerificado ? ` · tramos de ${r.impuestosVerificado}, verificar cada año` : ' · verificar los tramos'}</div>${r.impuestosAviso ? html`<div style="font-size:10px;color:var(--text-warning)" data-aviso-impuestos>⚠ ${r.impuestosAviso}</div>` : ''}</div></div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">${cajaComparativa(estado, r)}${cajaReparto(r, e)}</div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">${cajaExposicion(r)}${cajaClases(r)}</div>
    <div class="box" style="margin-top:8px"><div class="lab">Posiciones · clic en una para editarla</div><div class="desplazable"><table class="tb"><thead><tr><th>activo</th><th>ISIN</th><th>clase</th><th class="n">valor</th><th class="n">aportado</th><th class="n">plusvalía</th><th class="n">objetivo</th></tr></thead><tbody>
      ${posiciones.length ? posiciones.map((p) => {
        const obj = m.objetivo.find((o) => o.activo === p.id);
        const pct = p.coste ? Math.round(((p.valor - p.coste) / p.coste) * 10000) : null;
        return html`<tr class="ck" data-accion="activo-form" data-id="${p.id}"><td>${p.nombre}${p.valorado ? '' : html` <span class="chip">sin valorar</span>`}${p.flujosTrasFoto ? html` <span class="dim" style="font-size:10px">+${p.flujosTrasFoto} op. tras la foto</span>` : ''}</td><td class="mut">${p.isin ?? '—'}</td><td class="mut">${m.clases.find((c) => c.id === p.clase)?.nombre ?? p.clase ?? '—'}</td><td class="n">${eur(p.valor)}</td><td class="n mut">${eur(p.coste)}${p.costeAproximado ? '*' : ''}</td><td class="n" style="color:${p.valor >= p.coste ? 'var(--text-success)' : 'var(--text-danger)'}">${pct === null ? '—' : formatearPct(pct)}</td><td class="n">${obj ? `${formatearPorcentaje(obj.peso)} %` : '—'}</td></tr>`;
      }) : html`<tr><td colspan="7" class="mut">Aún no hay posiciones: añade un activo y una operación, o genera una cartera base.</td></tr>`}</tbody></table></div>
      ${posiciones.some((p) => p.costeAproximado) ? html`<div class="mut" style="font-size:10px">* coste aproximado: faltan participaciones o recibió un traspaso.</div>` : ''}</div>
    ${cajaOperaciones(m)}
    ${borradores.length ? html`<div class="box" style="margin-top:8px"><div class="lab">Cartera → Borradores</div>${borradores.map((b) => html`<div class="pd" style="grid-template-columns:1fr auto;align-items:center"><span>${b.doc.titulo} <span class="mut">· ${b.ruta}</span></span><span class="fila"><button type="button" class="go" data-accion="borrador-ver" data-ruta="${b.ruta}">ver</button><button type="button" class="go pri" data-accion="borrador-aceptar" data-ruta="${b.ruta}">aceptar</button><button type="button" class="go" data-accion="borrador-descartar" data-ruta="${b.ruta}">descartar</button></span></div>`)}</div>` : ''}`;
}

function cajaComparativa(estado, r) {
  const m = estado.modelo;
  const c = r.comparativa;
  const lineas = [{ nombre: 'Tu cartera', color: '#D85A30', valores: c.cartera, grosor: 2.4 }];
  if (c.propio) lineas.push({ nombre: 'Índice propio', color: '#888780', valores: c.propio.valores, grosor: 1.4, discontinua: true });
  for (const l of c.indices) lineas.push({ nombre: nombreSerie(l.id), color: COLOR_IDX[l.id] ?? '#B4B2A9', valores: l.valores, grosor: 1.4 });
  const dibujables = lineas.filter((l) => l.valores.every((v) => v !== null));
  const disponibles = seriesIndice(m).filter((s) => !ui.indices.includes(s.id));
  const tendrias = [...(c.propio?.tendrias?.valor ? [['Índice propio', '#888780', c.propio.tendrias]] : []), ...c.indices.filter((l) => l.tendrias?.valor).map((l) => [nombreSerie(l.id), COLOR_IDX[l.id] ?? '#B4B2A9', l.tendrias])];
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Comparativa · 12 meses · en € y con dividendos</span>
      <span><span class="chip" style="border-color:#D85A30;color:var(--t-naranja)">Tu cartera</span>${c.propio ? html`<span class="chip" style="border-color:#888780">Índice propio</span>` : ''}${c.indices.map((l) => html`<button type="button" class="chip ck" data-accion="indice-quitar" data-id="${l.id}" style="border-color:${COLOR_IDX[l.id] ?? '#B4B2A9'}" title="Quitar">${nombreSerie(l.id)} ×</button>`)}${disponibles.length ? html`<label class="sr-only" for="anadir-indice">Añadir índice</label><select class="inp" id="anadir-indice" data-cambio="indice-anadir" style="font-size:10.5px;padding:1px 4px"><option value="">+ índice</option>${disponibles.map((s) => html`<option value="${s.id}">${nombreSerie(s.id)}</option>`)}</select>` : ''}</span></div>
    ${r.puntos.length >= 2 ? graficoLineas({ series: dibujables, ancho: 420, alto: 140, etiquetaY: (v) => v.toFixed(0), etiquetasX: c.meses.map((mm, i) => (i % 2 ? '' : MESES_CORTOS[+mm.slice(5) - 1])), titulo: 'tu cartera frente a los índices, base 100' }) : html`<div class="mut" style="padding:20px;text-align:center;font-size:11px">Hacen falta al menos dos fotos de valor para comparar.</div>`}
    ${tendrias.length ? html`<div style="font-size:11px;margin-top:4px" class="mut">Con tus mismas aportaciones en las mismas fechas, hoy tendrías:</div><div style="font-size:11.5px"><span style="color:var(--t-naranja)">■</span> Tu cartera <b style="font-weight:500">${eur(r.estado.valor)}</b>${tendrias.map(([n, col, t]) => html` · <span style="color:${col}">■</span> ${n} <b style="font-weight:500">${eur(t.valor)}</b>${t.interpolados ? '*' : ''}`)}</div>` : ''}
    <div class="mut" style="font-size:10.5px;margin-top:4px">Series del grupo «Datos»${m.series.some((s) => s.sintetica) ? ' (las del ejemplo son SINTÉTICAS)' : ''}. El índice propio mezcla índices con tus pesos objetivo${c.propio?.sinIndice.length ? ` (sin índice, rentabilidad 0: ${c.propio.sinIndice.join(', ')})` : ''}.</div></div>`;
}

function cajaReparto(r, e) {
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Reparte tu aportación</span><span><label class="sr-only" for="aportacion">Aportación</label><input class="inp" id="aportacion" value="${formatearImporte(r.reparto.aportacion).replace(/,00$/, '')}" style="width:70px;text-align:right" data-cambio="aportacion"> €</span></div>
    ${r.reparto.filas ? html`<table class="tb" style="margin-top:6px"><thead><tr><th>activo</th><th class="n">peso / obj.</th><th class="n">aporta</th></tr></thead><tbody>${r.reparto.filas.map((f) => {
      const p = e.porActivo.get(f.id);
      const peso = e.valor ? Math.round(((p?.valor ?? 0) / e.valor) * 100) : 0;
      const obj = est().modelo.objetivo.find((o) => o.activo === f.id).peso / 100;
      return html`<tr><td>${p?.nombre ?? f.id}</td><td class="n" style="${Math.abs(peso - obj) >= r.umbral / 100 ? 'color:var(--text-warning)' : ''}">${peso} / ${formatearPorcentaje(Math.round(obj * 100))} %</td><td class="n">${f.importe ? html`<b style="font-weight:500">${eur(f.importe)}</b>` : html`<span class="dim">—</span>`}</td></tr>`;
    })}</tbody></table>` : html`<div class="banda aviso" style="margin-top:6px">No se calcula: ${r.reparto.motivo}. Corrígelo en Gestión → Activos y objetivo.</div>`}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Te acerca al objetivo sin vender (sin comisiones ni impuestos). Calculado por código.</div></div>`;
}

function cajaExposicion(r) {
  const ex = r.exposicion(ui.dimension);
  const fechas = [...new Set(Object.values(ex.fechas))].sort();
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Dónde está tu dinero de verdad · estimado</span><span>${[['region', 'región'], ['sector', 'sector'], ['divisa', 'divisa']].map(([k, t]) => html`<button type="button" class="chip ${ui.dimension === k ? 'on' : ''}" data-accion="exposicion-dim" data-valor="${k}" aria-pressed="${ui.dimension === k ? 'true' : 'false'}">${t}</button>`)}</span></div>
    <div style="margin-top:6px">${ex.filas.length ? graficoTreemap({ datos: ex.filas.map((f, i) => ({ nombre: f.nombre, valor: Math.round(f.pb / 100), color: f.nombre === 'Sin desglose' ? '#B4B2A9' : COLORES[i % COLORES.length] })), titulo: `exposición por ${ui.dimension}` }) : html`<div class="mut" style="font-size:11px">Sin valor en cartera.</div>`}</div>
    <div class="mut" style="font-size:10.5px;margin-top:4px">Look-through de tus fondos según su ficha${fechas.length ? ` (base ${fechas.join(', ')})` : ''}. Es una estimación con fecha, no un dato exacto. «Sin desglose»: activos sin exposición declarada.</div></div>`;
}

function cajaClases(r) {
  const max = Math.max(7000, ...r.clases.map((c) => Math.max(c.actualPb, c.objetivoPb))) / 100;
  return html`<div class="box"><div class="lab">Clases · actual vs objetivo</div>${r.clases.map((c) => html`<div style="display:grid;grid-template-columns:110px 1fr 70px;gap:6px;align-items:center;font-size:11px;padding:3px 0"><span>${c.nombre}</span><div class="bar" style="height:7px" role="img" aria-label="${c.nombre}: ${Math.round(c.actualPb / 100)} % de ${Math.round(c.objetivoPb / 100)} % objetivo"><i style="width:${c.actualPb / 100 / max * 100}%;background:#7F77DD"></i><span style="position:absolute;top:-2px;bottom:-2px;left:${c.objetivoPb / 100 / max * 100}%;width:2px;background:var(--text-primary)"></span></div><span style="${c.aviso ? 'color:var(--text-warning)' : ''}">${Math.round(c.actualPb / 100)}/${Math.round(c.objetivoPb / 100)} %</span></div>`)}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Aviso si se desvía ${formatearPorcentaje(r.umbral)} punto(s) o más. Clases y objetivo en Gestión → Activos y objetivo.${r.terMedio !== null ? ` TER medio ${formatearPorcentaje(Math.round(r.terMedio))} %.` : ''}</div></div>`;
}

function cajaOperaciones(m) {
  const q = ui.filtroOps.toLowerCase();
  const lista = [...m.operaciones].reverse().filter((o) => !q || [o.id, o.tipo, o.activo.activo, o.activo.origen, o.activo.destino, o.nota].some((x) => x && String(x).toLowerCase().includes(q)));
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Operaciones · ${m.operaciones.length}</span><span class="fila"><label class="sr-only" for="filtro-ops">Filtrar operaciones</label><input class="inp" id="filtro-ops" placeholder="filtrar…" value="${ui.filtroOps}" data-cambio="filtro-ops" style="width:140px"><button type="button" class="go" data-accion="operacion-form" data-id="">+ operación</button></span></div>
    <div class="desplazable"><table class="tb" style="margin-top:6px"><thead><tr><th>id</th><th>fecha</th><th>tipo</th><th>activo</th><th class="n">importe</th><th class="n">part.</th><th></th></tr></thead><tbody>
    ${lista.slice(0, ui.verOps).map((o) => html`<tr><td class="mut">${o.id}</td><td class="mut">${o.fecha}</td><td>${TIPO_OP[o.tipo]}</td><td>${o.activo.activo ?? `${o.activo.origen} → ${o.activo.destino}`}${o.mov ? html` <span class="dim" style="font-size:10px">↔ ${o.mov}</span>` : ''}</td><td class="n">${eur(o.importe, 2)}</td><td class="n mut">${o.participaciones ? formatearDecimal(o.participaciones) : ''}</td><td class="n acciones" style="white-space:nowrap"><button type="button" class="go" data-accion="operacion-form" data-id="${o.id}" aria-label="Editar ${o.id}">✎</button> <button type="button" class="go" data-accion="operacion-borrar" data-id="${o.id}" aria-label="Borrar ${o.id}">🗑</button></td></tr>`)}
    </tbody></table></div>${lista.length > ui.verOps ? html`<button type="button" class="go" data-accion="ops-mas">ver ${Math.min(50, lista.length - ui.verOps)} más</button>` : ''}
    <div class="mut" style="font-size:10.5px;margin-top:4px">Editar o borrar una operación recalcula el TWR, la TIR, el coste, la plusvalía y las comparativas.</div></div>`;
}

// ---------- modales ----------
export function abrirOperacion(estado, { id = null, prefijo = {}, mov = null } = {}) {
  const m = estado.modelo;
  const o = id ? m.operaciones.find((x) => x.id === id) : null;
  const v = o ?? { fecha: estado.ahora.fecha, tipo: 'aportacion', activo: {}, importe: null, ...prefijo };
  const activos = m.activos.filter((a) => !a.campos.archivado || a.id === v.activo.activo || a.id === v.activo.origen);
  const opciones = (sel) => activos.map((a) => html`<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${a.titulo}</option>`);
  abrir({
    titulo: o ? `Editar ${o.id}` : mov ? 'Registrar la operación en la cartera' : 'Nueva operación',
    cuerpo: html`<form data-form="operacion" style="font-size:11.5px;line-height:2.2;margin-top:6px"><input type="hidden" name="id" value="${o?.id ?? ''}"><input type="hidden" name="mov" value="${mov ? `${mov.mes}/${mov.id}` : ''}">
      ${mov ? html`<div class="mut" style="line-height:1.5">Desde el movimiento «${mov.concepto}» de ${mov.mes}: quedarán enlazados (op ↔ mov).</div>` : ''}
      <label>fecha <input class="inp" name="fecha" value="${v.fecha}" style="width:96px" autofocus></label>
      <label>tipo <select class="inp" name="tipo" id="op-tipo">${TIPOS_OPERACION.map((t) => html`<option value="${t}" ${t === v.tipo ? 'selected' : ''}>${TIPO_OP[t]}</option>`)}</select></label><br>
      <label>activo <select class="inp" name="activo"><option value="">—</option>${opciones(v.activo.activo ?? v.activo.origen)}</select></label>
      <label>destino (solo traspasos) <select class="inp" name="destino"><option value="">—</option>${opciones(v.activo.destino)}</select></label><br>
      <label>importe <input class="inp" name="importe" value="${v.importe !== null && v.importe !== undefined ? formatearImporte(v.importe) : ''}" style="width:90px;text-align:right"> €</label>
      <label>participaciones <input class="inp" name="participaciones" value="${v.participaciones ? formatearDecimal(v.participaciones) : ''}" style="width:90px;text-align:right" placeholder="opcional"></label><br>
      <label>nota <input class="inp" name="nota" value="${v.nota ?? ''}" style="width:300px"></label>
      <div class="mut" style="font-size:10.5px;line-height:1.5">Con participaciones, el coste fiscal se calcula por FIFO; sin ellas, el aportado neto hace de coste aproximado. Un traspaso entre fondos no tributa y conserva el coste.</div>
      <div style="text-align:right"><button type="submit" class="pri">${o ? 'Guardar' : 'Añadir'}</button></div></form>`,
  });
}

export function abrirActivo(estado, id = null) {
  const m = estado.modelo;
  const a = id ? m.activos.find((x) => x.id === id) : null;
  const c = a?.campos ?? { tipo: 'fondo', divisa: 'EUR' };
  const expo = a?.campos.exposicion ? fActivos.spec.bloques.campos.fmtValor('exposicion', a.campos.exposicion) : '';
  abrir({
    titulo: a ? a.titulo : 'Nuevo activo',
    ancho: true,
    cuerpo: html`<form data-form="activo" style="font-size:11.5px;line-height:2.2;margin-top:6px"><input type="hidden" name="id" value="${a?.id ?? ''}">
      <label>nombre <input class="inp" name="nombre" value="${a?.titulo ?? ''}" style="width:240px" autofocus></label>
      <label>ISIN <input class="inp" name="isin" value="${c.isin ?? ''}" style="width:120px" placeholder="IE00…"></label>
      <label>tipo <select class="inp" name="tipo">${TIPOS_ACTIVO.map((t) => html`<option ${t === c.tipo ? 'selected' : ''}>${t}</option>`)}</select></label><br>
      <label>clase <select class="inp" name="clase"><option value="">—</option>${m.clases.map((x) => html`<option value="${x.id}" ${x.id === c.clase ? 'selected' : ''}>${x.nombre}</option>`)}</select></label>
      <label>divisa <input class="inp" name="divisa" value="${c.divisa ?? 'EUR'}" style="width:44px"></label>
      <label>TER <input class="inp" name="ter" value="${c.ter !== undefined ? formatearPorcentaje(c.ter) : ''}" style="width:50px;text-align:right"> %</label>
      <label>índice <select class="inp" name="indice"><option value="">—</option>${m.series.map((s) => html`<option value="${s.id}" ${s.id === c.indice ? 'selected' : ''}>${nombreSerie(s.id)}</option>`)}</select></label>
      <label><input type="checkbox" name="traspasable" ${c.traspasable ? 'checked' : ''}> traspasable</label><br>
      <label>exposición <input class="inp" name="exposicion" value="${expo}" style="width:100%" placeholder="region EE. UU. 70 · Europa 30 | divisa USD 70 · EUR 30 @2026-09"></label>
      <div class="mut" style="font-size:10.5px;line-height:1.5">La exposición la copias de la ficha de la gestora (cada dimensión debe sumar 100). Sirve para «Dónde está tu dinero de verdad».</div>
      <div class="entre">${a ? html`<button type="button" class="go" data-accion="activo-archivar" data-id="${a.id}">${c.archivado ? 'reactivar' : 'archivar (vendido o traspasado)'}</button>` : html`<span></span>`}<button type="submit" class="pri">${a ? 'Guardar' : 'Crear'}</button></div></form>`,
  });
}

// valores: lo escrito se conserva al repintar; los precios de Claude se proponen y tú guardas
const vp = { escritos: {}, propuestos: {}, prog: nuevoProgreso(), fecha: null };
function cuerpoValores() {
  const e = est();
  const r = datosCartera(e);
  const filas = [...r.estado.porActivo.values()].filter((p) => !p.archivado);
  vp.fecha ??= e.ahora.fecha;
  const conIsin = filas.filter((p) => p.isin);
  return html`<div class="mut" style="font-size:11px;margin:6px 0 10px">Escribe el valor que ves en tu banco o bróker, o pide a Claude el último precio público (trabajo aislado: solo recibe los ISIN y nombres, devuelve precios y tú los confirmas).</div>
    <form data-form="valores"><label style="font-size:11.5px">fecha <input class="inp" name="fecha" value="${vp.fecha}" data-entrada-texto="valores-fecha" style="width:96px"></label>
    <table class="tb" style="margin-top:6px"><thead><tr><th>activo</th><th class="n">antes</th><th class="n">valor hoy</th></tr></thead><tbody>${filas.map((p) => {
      const pr = vp.propuestos[p.id];
      return html`<tr><td>${p.nombre}${pr ? html`<div class="mut" style="font-size:10px" data-precio="${p.id}">precio ${formatearDecimal(Math.round(pr.precio * 1e6))} ${pr.divisa} del ${textoCorto(pr.fecha)} · <a href="${pr.url}" target="_blank" rel="noopener noreferrer">fuente</a>${pr.valor === null ? ` · ${pr.motivo}` : ''}</div>` : ''}</td><td class="n mut">${eur(p.valor)}${p.valorado ? '' : ' (aportado)'}</td><td class="n"><label class="sr-only" for="val-${p.id}">Valor de ${p.nombre}</label><input class="inp" id="val-${p.id}" name="v:${p.id}" value="${vp.escritos[p.id] ?? ''}" data-entrada-texto="valor-activo" data-id="${p.id}" placeholder="${formatearImporte(p.valor)}" style="width:96px;text-align:right"> €</td></tr>`;
    })}</tbody></table>
    ${progresoHtml(vp.prog, { que: 'Claude está buscando precios…' })}${vp.prog.fase === 'hecho' ? errorHtml(vp.prog.resultado) : ''}
    <div class="entre" style="margin-top:12px"><button type="button" data-accion="precios-buscar" ${conIsin.length && vp.prog.fase !== 'trabajando' ? '' : 'disabled'} title="${conIsin.length ? `Solo envía ${conIsin.length} ISIN y sus nombres` : 'Ningún activo tiene ISIN'}">Buscar precios con Claude</button><button type="submit" class="pri">Guardar valores</button></div></form>`;
}

export function abrirValores() {
  vp.escritos = {};
  vp.propuestos = {};
  vp.fecha = null;
  if (vp.prog.fase !== 'trabajando') vp.prog = nuevoProgreso();
  abrir({ titulo: 'Actualizar el valor de tu cartera', cuerpo: cuerpoValores });
}

async function plantillas(m) {
  const enCarpeta = [...m.docs.keys()].filter((r) => r.startsWith('cartera/plantillas/'));
  if (enCarpeta.length) return enCarpeta.map((r) => ({ ruta: r, doc: m.doc(r) }));
  const s = await obtener('/api/semilla?tipo=plantillas-cartera');
  return Object.entries(s.ficheros).map(([n, t]) => ({ ruta: `cartera/plantillas/${n}`, doc: leer(`cartera/plantillas/${n}`, t) }));
}

let perfilElegido = null;
let revisarBase = false;
const revisionBase = { prog: nuevoProgreso() };
export async function abrirGenerar(estado) {
  let lista;
  try {
    lista = await plantillas(estado.modelo);
  } catch (e) {
    return toast(e.message, { tipo: 'error' });
  }
  if (!lista.length) return toast('No hay plantillas de cartera', { tipo: 'error' });
  const perfil = (d) => d.secciones[0].nodos.find((n) => n.clave === 'perfil')?.valor ?? d.titulo;
  perfilElegido = perfilElegido && lista.some((p) => perfil(p.doc) === perfilElegido) ? perfilElegido : perfil(lista.find((p) => perfil(p.doc) === 'crecimiento')?.doc ?? lista[0].doc);
  const cuerpo = () => {
    const sel = lista.find((p) => perfil(p.doc) === perfilElegido);
    const filas = items(sel.doc);
    return html`<div class="mut" style="font-size:11px;margin:6px 0 10px">Un punto de partida con fondos indexados típicos que luego retocas a mano. Sin IA: plantillas de cartera/plantillas/.</div>
      <div>${lista.map((p) => html`<button type="button" class="chip ${perfil(p.doc) === perfilElegido ? 'on' : ''}" data-accion="generar-perfil" data-perfil="${perfil(p.doc)}">${p.doc.titulo.replace(/^Plantilla · /, '')}</button>`)}</div>
      <div style="margin-top:10px">${filas.map((f) => html`<div style="display:grid;grid-template-columns:1fr 120px 40px;gap:8px;align-items:center;font-size:11.5px;padding:3px 0"><span>${f.nombre}</span><div class="bar" style="height:7px"><i style="width:${f.peso / 100}%;background:#7F77DD"></i></div><span class="mut">${formatearPorcentaje(f.peso)} %</span></div>`)}</div>
      <label class="tg" style="border:0;margin-top:8px"><input type="checkbox" data-cambio="generar-revisar" ${revisarBase ? 'checked' : ''}><span style="font-size:11px">Pedir a Claude que la revise con tu conocimiento activo <span class="mut">(opcional · trabajo privado, sin internet; no cambia los pesos)</span></span></label>
      <div class="mut" style="font-size:10.5px;margin-top:10px">Se crea como borrador en cartera/borradores/ · tu cartera actual no se toca hasta que la aceptes.</div>
      <div style="text-align:right;margin-top:10px"><button type="button" class="pri" data-accion="generar-crear">Crear borrador</button></div>`;
  };
  abrir({ titulo: 'Generar cartera base', cuerpo });
  contexto.plantillas = { lista, perfil };
}

function revisionDe(estado, d) {
  const enlace = /^sí · (analisis\/[^\s]+\.md)$/.exec(cabeceras(d).revisado_claude ?? '')?.[1];
  const a = enlace ? estado.modelo.doc(enlace) : null;
  if (!a) return '';
  return html`<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--surface-1)" data-revision-base><div class="lab">Revisión de Rex · ${enlace}</div><div style="font-size:11.5px;line-height:1.7;white-space:pre-wrap">${textoSeccion(a, 'Resultado')}</div></div>`;
}

function abrirBorrador(estado, ruta) {
  const d = estado.modelo.doc(ruta);
  abrir({
    titulo: d.titulo,
    cuerpo: html`<table class="tb" style="margin-top:6px"><thead><tr><th>activo</th><th>clase</th><th class="n">peso</th></tr></thead><tbody>${items(d).map((f) => html`<tr><td>${f.nombre} <span class="mut">· ${f.id}</span></td><td class="mut">${f.clase ?? '—'}</td><td class="n">${formatearPorcentaje(f.peso)} %</td></tr>`)}</tbody></table>
      ${revisionDe(estado, d)}
      <div class="mut" style="font-size:10.5px;margin-top:6px">Aceptar crea los activos que no tengas y fija tu objetivo con estos pesos. Tus operaciones y valores no cambian. Puedes editar el borrador a mano en ${ruta}.</div>
      <div class="fila" style="justify-content:flex-end;margin-top:10px"><button type="button" data-accion="borrador-descartar" data-ruta="${ruta}">Descartar</button><button type="button" class="pri" data-accion="borrador-aceptar" data-ruta="${ruta}">Aceptar</button></div>`,
  });
}

// ---------- editor de Gestión: Activos y objetivo ----------
const edObj = { pesos: null };
function cuerpoActivosObjetivo() {
  const m = est().modelo;
  const docObj = m.doc('cartera/objetivo.md');
  const cab = Object.fromEntries((docObj?.secciones[0].nodos ?? []).filter((n) => n.k === 'cab' && n.valor !== undefined).map((n) => [n.clave, n.valor]));
  const pesos = edObj.pesos ?? Object.fromEntries(m.objetivo.map((o) => [o.activo, formatearPorcentaje(o.peso)]));
  const suma = Object.values(pesos).reduce((s, t) => s + (parsePorcentaje(t || '0').ok ? parsePorcentaje(t || '0').valor : 0), 0);
  return html`<div class="lab" style="margin-top:8px">Activos</div>
    <table class="tb"><thead><tr><th>activo</th><th>clase</th><th>ISIN</th><th class="n">objetivo %</th><th></th></tr></thead><tbody>
    ${m.activos.map((a) => html`<tr style="${a.campos.archivado ? 'opacity:.75' : ''}"><td>${a.titulo}${a.campos.archivado ? ' · archivado' : ''}</td><td class="mut">${m.clases.find((c) => c.id === a.campos.clase)?.nombre ?? '—'}</td><td class="mut">${a.campos.isin ?? '—'}${a.campos.isin && !validarIsin(a.campos.isin) ? ' ⚠' : ''}</td>
      <td class="n"><label class="sr-only" for="obj-${a.id}">Objetivo de ${a.titulo}</label><input class="inp" id="obj-${a.id}" value="${pesos[a.id] ?? ''}" data-cambio="objetivo-peso" data-id="${a.id}" style="width:56px;text-align:right" ${a.campos.archivado ? 'disabled' : ''}></td>
      <td><button type="button" class="go" data-accion="activo-form" data-id="${a.id}" aria-label="Editar ${a.titulo}">✎</button></td></tr>`)}</tbody></table>
    <div class="entre" style="margin-top:6px;font-size:11.5px"><span style="${suma === 10000 ? '' : 'color:var(--text-warning)'}">Suma: ${formatearPorcentaje(suma)} %${suma === 10000 ? ' ✓' : ' (debe ser 100)'}</span><span class="fila"><button type="button" class="go" data-accion="activo-form" data-id="">+ activo</button><button type="button" class="pri" data-accion="objetivo-guardar" ${suma === 10000 ? '' : 'disabled'}>Guardar objetivo</button></span></div>
    <form class="fila" data-form="objetivo-ajustes" style="margin-top:8px;font-size:11.5px"><label>Redondeo del reparto <input class="inp" name="redondeo" value="${formatearImporte(cab.redondeo ?? 1000)}" style="width:60px;text-align:right"> €</label><label>Aviso si una clase se desvía <input class="inp" name="umbral" value="${formatearPorcentaje(cab.umbral_desviacion ?? 100)}" style="width:40px;text-align:right"> puntos</label><button type="submit" class="go">guardar</button></form>
    <div class="lab" style="margin-top:12px">Clases de activo</div>
    <table class="tb"><thead><tr><th>clase</th><th>grupo</th><th>índice</th><th>parecida (crisis)</th></tr></thead><tbody>
    ${m.clases.map((c) => html`<tr><td><label class="sr-only" for="cl-n-${c.id}">Nombre</label><input class="inp" id="cl-n-${c.id}" value="${c.nombre}" data-cambio="clase-campo" data-id="${c.id}" data-campo="nombre" style="width:150px"></td>
      <td><select class="inp" data-cambio="clase-campo" data-id="${c.id}" data-campo="grupo" aria-label="Grupo">${GRUPOS_CLASE.map((g) => html`<option ${g === c.grupo ? 'selected' : ''}>${g}</option>`)}</select></td>
      <td><select class="inp" data-cambio="clase-campo" data-id="${c.id}" data-campo="indice" aria-label="Índice"><option value="">—</option>${m.series.map((s) => html`<option value="${s.id}" ${s.id === c.indice ? 'selected' : ''}>${nombreSerie(s.id)}</option>`)}</select></td>
      <td><select class="inp" data-cambio="clase-campo" data-id="${c.id}" data-campo="parecida" aria-label="Clase parecida"><option value="">—</option>${m.clases.filter((x) => x.id !== c.id).map((x) => html`<option value="${x.id}" ${x.id === c.parecida ? 'selected' : ''}>${x.nombre}</option>`)}</select></td></tr>`)}</tbody></table>
    <form class="fila" data-form="clase-nueva" style="margin-top:6px"><label class="sr-only" for="clase-nueva">Nueva clase</label><input class="inp" id="clase-nueva" name="nombre" placeholder="nueva clase" style="flex:1"><select class="inp" name="grupo" aria-label="Grupo">${GRUPOS_CLASE.map((g) => html`<option>${g}</option>`)}</select><button type="submit" class="pri">Añadir</button></form>`;
}

export function abrirActivosObjetivo() {
  edObj.pesos = null;
  abrir({ titulo: 'Activos y objetivo', cuerpo: cuerpoActivosObjetivo, ancho: true });
}

// ---------- acciones ----------
export function registrarAccionesCartera() {
  accion('indice-quitar', (el) => {
    ui.indices = ui.indices.filter((x) => x !== el.dataset.id);
    repintar();
  });
  cambio('indice-anadir', (el) => {
    if (el.value) ui.indices = [...ui.indices, el.value];
    repintar();
  });
  cambio('aportacion', (el) => {
    const r = parseImporte(el.value);
    if (!r.ok || r.valor < 0) return toast('Aportación no válida', { tipo: 'error' });
    ui.aportacion = r.valor;
    repintar();
  });
  accion('exposicion-dim', (el) => {
    ui.dimension = el.dataset.valor;
    repintar();
  });
  cambio('filtro-ops', (el) => {
    ui.filtroOps = el.value;
    repintar();
  });
  accion('ops-mas', () => {
    ui.verOps += 50;
    repintar();
  });
  accion('operacion-form', (el) => abrirOperacion(est(), { id: el.dataset.id || null }));
  accion('operacion-borrar', async (el) => {
    if (await confirmar(`¿Borrar ${el.dataset.id}? Irá a la papelera 30 días; se recalculan rentabilidad y costes.`, { si: 'Borrar' })) op('operacion.borrar', { id: el.dataset.id }, { mensaje: `${el.dataset.id} borrada` });
  });
  formulario('operacion', async (f, d) => {
    const imp = parseImporte(d.importe);
    if (!esFecha(d.fecha.trim())) return toast('Fecha AAAA-MM-DD', { tipo: 'error' });
    if (!d.activo) return toast('Elige el activo', { tipo: 'error' });
    if (!imp.ok || imp.valor === 0) return toast('Importe no válido', { tipo: 'error' });
    const part = d.participaciones.trim() ? parseDecimal(d.participaciones.trim()) : null;
    if (part && !part.ok) return toast('Participaciones no válidas', { tipo: 'error' });
    const valor = { fecha: d.fecha.trim(), tipo: d.tipo, activo: d.tipo === 'traspaso' ? { origen: d.activo, destino: d.destino } : { activo: d.activo }, importe: ['comision', 'ajuste'].includes(d.tipo) ? imp.valor : Math.abs(imp.valor), ...(part ? { participaciones: part.valor } : {}), ...(d.nota.trim() ? { nota: d.nota.trim() } : {}) };
    if (d.tipo === 'traspaso' && !d.destino) return toast('Un traspaso necesita destino', { tipo: 'error' });
    let r;
    if (d.id) r = await op('operacion.editar', { id: d.id, cambios: { ...valor, participaciones: part ? part.valor : null, nota: d.nota.trim() || null } }, { mensaje: `${d.id} guardada` });
    else {
      const [mes, id] = d.mov ? d.mov.split('/') : [];
      r = await op('operacion.crear', { op: valor, ...(d.mov ? { mov: { mes, id } } : {}) }, { mensaje: d.mov ? 'Operación registrada y enlazada al movimiento' : 'Operación añadida' });
    }
    if (r) cerrar();
  });
  accion('activo-form', (el) => abrirActivo(est(), el.dataset.id || null));
  accion('activo-archivar', async (el) => {
    const a = est().modelo.activos.find((x) => x.id === el.dataset.id);
    const r = await op('bloque.editar', { ruta: 'cartera/activos.md', id: a.id, campos: { archivado: a.campos.archivado ? null : true } }, { mensaje: a.campos.archivado ? 'Activo reactivado' : 'Activo archivado' });
    if (r) cerrar();
  });
  formulario('activo', async (f, d) => {
    const m = est().modelo;
    if (!d.nombre.trim()) return toast('Escribe el nombre', { tipo: 'error' });
    const isin = d.isin.trim().toUpperCase();
    if (isin && !validarIsin(isin) && !(await confirmar(`El ISIN ${isin} no pasa el dígito de control. ¿Guardarlo igualmente?`, { si: 'Guardar' }))) return;
    const ter = d.ter.trim() ? parsePorcentaje(d.ter) : null;
    if (ter && !ter.ok) return toast('TER no válido', { tipo: 'error' });
    let exposicion = null;
    if (d.exposicion.trim()) {
      const r = fActivos.spec.bloques.campos.parseLinea(`exposicion: ${d.exposicion.trim()}`);
      if (r.valor === undefined) return toast(`Exposición: ${r.aviso}`, { tipo: 'error' });
      exposicion = r.valor;
    }
    const campos = { isin: isin || null, tipo: d.tipo, clase: d.clase || null, divisa: d.divisa.trim().toUpperCase() || 'EUR', ter: ter ? ter.valor : null, indice: d.indice || null, exposicion, traspasable: d.traspasable === 'on' };
    let r;
    if (d.id) r = await op('bloque.editar', { ruta: 'cartera/activos.md', id: d.id, titulo: d.nombre.trim(), campos }, { mensaje: 'Activo guardado' });
    else r = await op('bloque.crear', { ruta: 'cartera/activos.md', id: slugUnico(d.nombre, m.activos.map((a) => a.id)), titulo: d.nombre.trim(), campos: Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null)) }, { mensaje: 'Activo creado' });
    if (r) cerrar();
  });
  accion('valores-form', () => abrirValores());
  entrada('valor-activo', (el) => (vp.escritos[el.dataset.id] = el.value));
  entrada('valores-fecha', (el) => (vp.fecha = el.value));
  accion('precios-buscar', async () => {
    const e = est();
    const r = await ejecutarCon(vp.prog, 'precios', {});
    if (r?.estado !== 'ok') return;
    const porActivo = datosCartera(e).estado.porActivo;
    let rellenados = 0;
    for (const pr of r.resultado.json.precios) {
      const a = e.modelo.activos.find((x) => x.campos.isin === pr.isin);
      if (!a) continue;
      const p = porActivo.get(a.id);
      let valor = null;
      let motivo = '';
      if (pr.divisa !== (a.campos.divisa ?? 'EUR')) motivo = `en ${pr.divisa}: escribe tú el valor en euros`;
      else if (!p?.unidades) motivo = 'sin participaciones registradas: escribe tú el valor';
      else valor = Math.round((pr.valor * p.unidades) / 1e4);
      vp.propuestos[a.id] = { precio: pr.valor, divisa: pr.divisa, fecha: pr.fecha, url: pr.origen, valor, motivo };
      if (valor !== null) {
        vp.escritos[a.id] = formatearImporte(valor);
        rellenados++;
      }
    }
    if (r.resultado.json.precios.length) vp.fecha = r.resultado.json.precios.map((x) => x.fecha).sort().at(-1);
    repintarModal();
    toast(`${r.resultado.json.precios.length} precios propuestos${rellenados ? ` · ${rellenados} valores calculados con tus participaciones` : ''}: revísalos y guarda`);
  });
  formulario('valores', async (f, d) => {
    if (!esFecha(d.fecha.trim())) return toast('Fecha AAAA-MM-DD', { tipo: 'error' });
    const filas = [];
    for (const [k, v] of Object.entries(d)) {
      if (!k.startsWith('v:') || !v.trim()) continue;
      const r = parseImporte(v);
      if (!r.ok || r.valor < 0) return toast(`Valor no válido en ${k.slice(2)}`, { tipo: 'error' });
      const pr = vp.propuestos[k.slice(2)];
      filas.push({ activo: k.slice(2), valor: r.valor, origen: pr && pr.valor === r.valor ? `precio ${pr.fecha} · Claude` : 'manual' });
    }
    if (!filas.length) return toast('Escribe al menos un valor', { tipo: 'error' });
    const r = await op('valores.guardar', { fecha: d.fecha.trim(), filas }, { mensaje: `Valores guardados en cartera/valores/${d.fecha.trim()}.md` });
    if (r) cerrar();
  });
  accion('cartera-generar', () => abrirGenerar(est()));
  accion('generar-perfil', (el) => {
    perfilElegido = el.dataset.perfil;
    abrirGenerar(est());
  });
  accion('generar-crear', async () => {
    const { lista, perfil } = contexto.plantillas;
    const sel = lista.find((p) => perfil(p.doc) === perfilElegido);
    const r = await op('borrador.crear', { plantilla: { perfil: perfilElegido, titulo: sel.doc.titulo.replace(/^Plantilla · /, ''), filas: items(sel.doc) }, fecha: est().ahora.fecha }, { mensaje: `Borrador «${sel.doc.titulo.replace(/^Plantilla · /, '')}» creado · revísalo en Cartera → Borradores` });
    if (!r) return;
    cerrar();
    if (!revisarBase) return;
    // revisión opcional: un análisis privado enlazado desde el borrador (revisado_claude)
    const ruta = r.resultado.ruta;
    toast('Rex está revisando el borrador…');
    const rv = await ejecutarCon(revisionBase.prog, 'privado', { tarea: 'revisar-cartera-base', borrador: ruta }, { repintar: () => {} });
    if (rv?.estado !== 'ok') return toast(`La revisión no se pudo hacer: ${rv?.resultado?.mensaje ?? 'error'}`, { tipo: 'error' });
    const a = await op('analisis.guardar', { fecha: est().ahora.fecha, tarea: 'revisar-cartera-base', titulo: 'Revisión de la cartera base', mezcla: rv.resultado.fuentes ?? [], ejecucion: rv.resultado.ejecucion, modelo: rv.resultado.modelo, cifras: rv.resultado.cifras, resultado_md: rv.resultado.json.respuesta_md, json: rv.resultado.json, avisos: rv.resultado.avisos }, { silencioso: true });
    if (a) await op('borrador.revisado', { ruta, analisis: a.resultado.ruta }, { mensaje: 'Revisión de Rex lista: la verás al abrir el borrador' });
  });
  cambio('generar-revisar', (el) => (revisarBase = el.checked));
  accion('borrador-ver', (el) => abrirBorrador(est(), el.dataset.ruta));
  accion('borrador-aceptar', async (el) => {
    if (!(await confirmar('Aceptar el borrador crea los activos que te falten y sustituye tu objetivo por sus pesos. Tus operaciones y valores no cambian. ¿Seguir?', { si: 'Aceptar' }))) return;
    await op('borrador.aceptar', { ruta: el.dataset.ruta }, { mensaje: (r) => `Borrador aceptado: objetivo fijado${r.resultado?.creados.length ? ` · activos creados: ${r.resultado.creados.join(', ')} (añade su ISIN cuando los elijas)` : ''}` });
  });
  accion('borrador-descartar', (el) => {
    cerrar();
    op('fichero.borrar', { ruta: el.dataset.ruta, que: 'borrador de cartera' }, { mensaje: 'Borrador descartado (en la papelera)' });
  });
  cambio('objetivo-peso', (el) => {
    edObj.pesos = { ...(edObj.pesos ?? Object.fromEntries(est().modelo.objetivo.map((o) => [o.activo, formatearPorcentaje(o.peso)]))), [el.dataset.id]: el.value.trim() };
    repintarModal();
  });
  accion('objetivo-guardar', async () => {
    const pesos = [];
    for (const [activo, t] of Object.entries(edObj.pesos ?? Object.fromEntries(est().modelo.objetivo.map((o) => [o.activo, formatearPorcentaje(o.peso)])))) {
      if (!t) continue;
      const r = parsePorcentaje(t);
      if (!r.ok) return toast(`Peso no válido en ${activo}`, { tipo: 'error' });
      if (r.valor > 0) pesos.push({ activo, peso: r.valor, minimo: est().modelo.objetivo.find((o) => o.activo === activo)?.minimo });
    }
    const r = await op('objetivo.fijar', { pesos }, { mensaje: 'Objetivo guardado' });
    if (r) edObj.pesos = null;
  });
  formulario('objetivo-ajustes', (f, d) => {
    const red = parseImporte(d.redondeo);
    const um = parsePorcentaje(d.umbral);
    if (!red.ok || red.valor <= 0 || !um.ok) return toast('Valores no válidos', { tipo: 'error' });
    op('objetivo.fijar', { redondeo: red.valor, umbral: um.valor }, { mensaje: 'Guardado' });
  });
  cambio('clase-campo', (el) => op('lista.editar', { ruta: 'cartera/clases.md', clave: el.dataset.id, cambios: { [el.dataset.campo]: el.value.trim() || null } }, { mensaje: 'Clase guardada' }));
  formulario('clase-nueva', (f, d) => {
    if (!d.nombre.trim()) return;
    op('lista.crear', { ruta: 'cartera/clases.md', valor: { id: slugUnico(d.nombre, est().modelo.clases.map((c) => c.id)), nombre: d.nombre.trim(), grupo: d.grupo } }, { mensaje: 'Clase creada' });
  });
}
