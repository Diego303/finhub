// Pestaña Conocimiento (§5, §6; maqueta: conoc(), ficha(), mixPanel()): fuentes con postura y acierto, ficha,
// tu mezcla (escalable, con selectores dinámicos), buscador y edición de notas, pulsos, CONTEXTO, familias,
// mezclas, predicciones con resolución manual y automática, y el visor de series de Datos. Sin IA.
import { html } from '../esc.js';
import { accion, cambio, formulario, entrada } from '../acciones.js';
import { op, obtener } from '../api.js';
import { abrir, cerrar, confirmar } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { graficoLineas } from '../graficos/linea.js';
import * as K from '/core/conocimiento.js';
import { TIPOS_NOTA, POSTURAS, FUENTES_FIJAS } from '/core/formato/conocimiento.js';
import { formatearDecimal } from '/core/dinero.js';
import { textoCorto, sumarDias, esFecha, MESES_CORTOS } from '/core/fechas.js';
import { leer } from '/core/formato/index.js';
import { bloques } from '/core/formato/motor.js';

const COLOR_POSTURA = (v) => (v === null ? 'var(--text-muted)' : v > 0.15 ? '#1D9E75' : v < -0.15 ? '#E24B4A' : '#888780');
const TEXTO_POSTURA = (v) => (v === null ? '—' : v > 0.15 ? 'alcista' : v < -0.15 ? 'bajista' : 'neutral');
const EP = { hecho: 'h', dato: 'h', consenso: 'c', opinión: 'o', especulación: 'e' };
const ESTADO_PRED = { pendiente: '…', acertada: '✓', fallida: '✗', 'no-medible': '∅' };
const POR_PAGINA = 30;

const ui = { familia: 'todas', mezclaAbierta: false, buscaFuente: '', plegadas: null, filtro: { texto: '', tipo: '', fuente: '', tema: '', desde: '', hasta: '', caducadas: true }, pagina: 1, serie: null, rango: 120, semilla: null, predFiltro: 'pendiente' };
let contexto = null;
let cache = { modelo: null, valor: null };
export const iniciarConocimiento = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();

/** Índice, resumen de fuentes y KPI: se recalculan solo si cambian los datos. */
export function datosConocimiento(estado) {
  const m = estado.modelo;
  if (cache.modelo !== m || cache.hoy !== estado.ahora.fecha) {
    const hoy = estado.ahora.fecha;
    const notas = K.indiceNotas(m);
    const resumen = K.resumenFuentes(m, hoy, notas);
    cache = { modelo: m, hoy, valor: { notas, resumen, kpis: K.kpisConocimiento(m, hoy, notas, resumen), porId: new Map(resumen.map((r) => [r.id, r])) } };
  }
  return cache.valor;
}

function pedirSemilla() {
  if (ui.semilla !== null) return;
  ui.semilla = { cargando: true };
  obtener('/api/semilla?tipo=base')
    .then((s) => {
      ui.semilla = { ficheros: s.ficheros, notas: Object.entries(s.ficheros).flatMap(([n, t]) => bloques(leer(`conocimiento/base/${n}`, t)).map((b) => ({ ...b, fichero: n }))) };
      repintar();
    })
    .catch(() => (ui.semilla = { ficheros: {}, notas: [] }));
}

// ---------- vista ----------
export function vistaConocimiento(estado) {
  const m = estado.modelo;
  const d = datosConocimiento(estado);
  pedirSemilla();
  const ids = new Set(d.notas.map((n) => n.id));
  const nuevasBase = ui.semilla?.notas?.filter((n) => !ids.has(n.id)) ?? [];
  const activas = d.resumen.filter((r) => r.activa).map((r) => r.id);
  const nombreMezcla = K.nombreMezclaActiva(activas, m.mezclas, d.resumen);
  const k = d.kpis;
  return html`${nuevasBase.length ? html`<div class="banda" style="justify-content:space-between">La Base de finhub tiene <b style="font-weight:500">${nuevasBase.length} notas</b> que aún no están en tu carpeta (hechos y consenso con su fuente). <button type="button" class="go pri" data-accion="base-revisar">revisar e importar</button></div>` : ''}
    <div class="kpis">
      <div class="box"><div class="lab">Fuentes</div><div class="k" style="font-size:19px">${k.fuentes}</div><div class="mut" style="font-size:10.5px">${k.familias} familias</div></div>
      <div class="box"><div class="lab">Notas</div><div class="k" style="font-size:19px">${k.notas}</div><div class="mut" style="font-size:10.5px">${k.nuevas} nuevas esta semana</div></div>
      <div class="box"><div class="lab">Activas en tu mezcla</div><div class="k" style="font-size:19px">${k.activas}</div><div class="mut" style="font-size:10.5px">${nombreMezcla}</div></div>
      <div class="box"><div class="lab">Más acertado</div><div class="k" style="font-size:${(k.mejor?.nombre ?? '—').length > 6 ? 14 : 19}px">${k.mejor?.nombre ?? '—'}</div><div class="mut" style="font-size:10.5px">${k.mejor ? `${Math.round(k.mejor.acierto.aciertoPb / 100)} % de ${k.mejor.acierto.resueltas} predicciones` : 'hacen falta 5 predicciones resueltas'}</div></div></div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:8px;margin-top:8px">
      <div>${cajaFuentes(m, d, activas, nombreMezcla)}${cajaBuscador(estado, d)}${cajaPredicciones(estado, d)}${cajaDatos(m)}</div>
      <div>${cajaPulsos(estado)}${cajaContexto(estado)}<div class="box" style="margin-top:8px"><div class="lab">Gestionar</div><div style="font-size:11px;line-height:1.9"><button type="button" class="enlace" data-accion="fuente-nueva">+ nueva fuente</button> · <button type="button" class="enlace" data-accion="familias">familias y caducidad</button><br><button type="button" class="enlace" data-accion="mezclas">mezclas guardadas (${m.mezclas.length})</button> · <button type="button" class="enlace" data-accion="nota-form" data-ruta="" data-id="">+ nota</button></div></div></div>
    </div>`;
}

function chipMezcla(d, activas, nombre) {
  return html`<button type="button" class="chip ck on" data-accion="mezcla-panel" aria-expanded="${ui.mezclaAbierta ? 'true' : 'false'}">Mezcla: ${nombre} · ${activas.length} de ${d.resumen.length}</button>`;
}

function cajaFuentes(m, d, activas, nombreMezcla) {
  const lista = d.resumen.filter((r) => ui.familia === 'todas' || r.familia === ui.familia);
  const fam = new Map(m.familias.map((f) => [f.id, f.nombre]));
  return html`<div class="box"><div class="entre" style="flex-wrap:wrap;gap:4px"><span class="lab" style="margin:0">Fuentes · clic en una para ver su ficha</span><span>${chipMezcla(d, activas, nombreMezcla)}</span></div>
    ${ui.mezclaAbierta ? panelMezcla(m, d, activas) : ''}
    <div style="margin-top:6px"><button type="button" class="chip ck ${ui.familia === 'todas' ? 'on' : ''}" data-accion="fuentes-familia" data-id="todas">todas</button>${m.familias.map((f) => html`<button type="button" class="chip ck ${ui.familia === f.id ? 'on' : ''}" data-accion="fuentes-familia" data-id="${f.id}">${f.nombre}</button>`)}</div>
    <div class="desplazable"><table class="tb" style="margin-top:6px"><thead><tr><th><span class="sr-only">en tu mezcla</span></th><th>fuente</th><th>familia</th><th class="n">notas</th><th>postura</th><th class="n">acierto</th><th>última</th></tr></thead><tbody>
    ${lista.map((r) => html`<tr class="ck" data-accion="ficha" data-id="${r.id}"><td><input type="checkbox" data-cambio="fuente-activa" data-id="${r.id}" ${r.activa ? 'checked' : ''} aria-label="${r.nombre} en tu mezcla"></td><td><button type="button" class="enlace" style="text-decoration:none" data-accion="ficha" data-id="${r.id}">${r.nombre}</button>${r.privada ? ' 🔒' : ''}</td><td class="mut">${fam.get(r.familia) ?? r.familia}</td><td class="n">${r.notas}</td>
      <td>${r.fija || r.familia === 'mias' || r.postura === null ? html`<span class="dim">—</span>` : html`<svg width="60" height="10" role="img" aria-label="postura ${TEXTO_POSTURA(r.postura)}"><rect x="0" y="4" width="60" height="2" fill="var(--border-strong)"/><circle cx="${30 + r.postura * 26}" cy="5" r="4" fill="${COLOR_POSTURA(r.postura)}"/></svg>`}</td>
      <td class="n">${r.acierto.aciertoPb === null ? html`<span class="dim" title="${r.acierto.resueltas} resueltas: hacen falta 5">—</span>` : html`<span style="color:${r.acierto.aciertoPb >= 6500 ? 'var(--text-success)' : r.acierto.aciertoPb < 5500 ? 'var(--text-warning)' : 'inherit'}">${Math.round(r.acierto.aciertoPb / 100)} %</span>`}</td><td class="mut">${r.ultima ? textoCorto(r.ultima) : '—'}</td></tr>`)}</tbody></table></div>
    <div class="mut" style="font-size:10.5px;margin-top:6px">Postura: media de sus notas (las recientes pesan más; vida media 90 días). Acierto: predicciones resueltas que se cumplieron (con 5 o más). La casilla añade o quita la fuente de tu mezcla (se guarda en _fuentes.md).</div></div>`;
}

function panelMezcla(m, d, activas) {
  const q = ui.buscaFuente.trim().toLowerCase();
  const on = new Set(activas);
  const plegadas = ui.plegadas ?? new Set(m.familias.filter((f) => f.plegada).map((f) => f.id));
  return html`<div class="box" style="margin-top:6px;max-height:330px;overflow:auto" data-panel-mezcla>
    <div class="fila" style="flex-wrap:wrap;margin-bottom:6px"><label class="sr-only" for="buscar-fuente">Buscar fuente</label><input class="inp" id="buscar-fuente" placeholder="buscar fuente…" value="${ui.buscaFuente}" data-entrada-texto="buscar-fuente" style="flex:1;min-width:110px"><button type="button" class="go" data-accion="mezcla-todas">todas</button><button type="button" class="go" data-accion="mezcla-ninguna">ninguna</button></div>
    <div style="margin-bottom:6px">${m.mezclas.map((x) => html`<button type="button" class="chip ck" data-accion="mezcla-aplicar" data-id="${x.id}" title="${K.resolverMezcla(x.miembros, d.resumen).fuentes.length} fuentes">${x.nombre}</button>`)}<button type="button" class="chip ck" data-accion="mezcla-guardar">+ guardar mezcla</button></div>
    ${m.familias.map((f) => {
      const lista = d.resumen.filter((r) => r.familia === f.id && (!q || r.nombre.toLowerCase().includes(q) || r.id.includes(q)));
      if (!lista.length) return '';
      const n = lista.filter((r) => on.has(r.id)).length;
      const abierta = q || f.id === 'fija' || !plegadas.has(f.id);
      return html`<div style="border-top:.5px solid var(--border);padding:5px 0"><div class="entre"><button type="button" class="enlace" style="text-decoration:none" data-accion="familia-plegar" data-id="${f.id}" aria-expanded="${abierta ? 'true' : 'false'}">${abierta ? '▾' : '▸'} <b style="font-weight:500">${f.nombre}</b> <span class="mut">${n}/${lista.length}</span></button><button type="button" class="enlace mut" style="font-size:10.5px" data-accion="familia-todas" data-id="${f.id}">${n === lista.length ? 'quitar todos' : 'añadir todos'}</button></div>
        ${abierta ? html`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0 10px;margin-top:3px">${lista.map((r) => html`<label style="display:flex;gap:5px;align-items:center;font-size:11px;padding:1px 0"><input type="checkbox" data-cambio="fuente-activa" data-id="${r.id}" ${on.has(r.id) ? 'checked' : ''}>${r.nombre}${r.postura !== null && !r.fija ? html` <span style="color:${COLOR_POSTURA(r.postura)};font-size:9px" aria-hidden="true">●</span>` : ''}</label>`)}</div>` : ''}</div>`;
    })}
    ${on.size && d.resumen.some((r) => r.privada && on.has(r.id)) ? html`<div class="mut" style="font-size:10.5px;margin-top:4px">🔒 Las fuentes privadas (Mis notas) nunca entran en Rex con internet ni en el pulso, aunque estén en tu mezcla.</div>` : ''}</div>`;
}

function cajaPulsos(estado) {
  const m = estado.modelo;
  const hoy = estado.ahora.fecha;
  const porDia = new Map(m.mundo.map((x) => [x.fecha, x.notas.length]));
  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i - 13));
  return html`<div class="box"><div class="lab">Pulsos · últimos 14 días</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${dias.map((f) => {
    const n = porDia.get(f) ?? 0;
    return html`<div title="${textoCorto(f)}: ${n} noticias" role="img" aria-label="${textoCorto(f)}: ${n} noticias" style="height:18px;border-radius:3px;${n ? `background:rgba(29,158,117,${0.2 + Math.min(1, n / 6) * 0.7})` : 'border:.5px dashed var(--border-strong)'}"></div>`;
  })}</div><div class="mut" style="font-size:10.5px;margin-top:5px">${dias.filter((f) => !porDia.get(f)).length} días sin pulso · el pulso con Claude llega en F10</div></div>`;
}

function cajaContexto(estado) {
  const lista = estado.servidor?.contexto ?? [];
  return html`<div class="box" style="margin-top:8px"><div class="lab">CONTEXTO · ${lista.length} texto(s)</div>${lista.map((f) => html`<div style="padding:4px 0;border-top:.5px solid var(--border);font-size:11px;word-break:break-all">${f.replace(/^CONTEXTO\//, '')}</div>`)}
    <button type="button" class="go" style="margin-top:6px" disabled title="Llega en F10">procesar</button><div class="mut" style="font-size:10.5px;margin-top:6px">🔒 Trabajo <b style="font-weight:500">ingesta</b>: sin internet · solo escribe en conocimiento/ (F10).</div></div>`;
}

function cajaBuscador(estado, d) {
  const m = estado.modelo;
  const f = ui.filtro;
  const r = K.buscarNotas(d.notas, f, { hoy: estado.ahora.fecha, fuentes: m.fuentes, familias: m.familias });
  const temas = [...new Set(d.notas.flatMap((n) => n.temas))].sort();
  const pag = r.slice(0, ui.pagina * POR_PAGINA);
  const nombre = (id) => d.porId.get(id)?.nombre ?? id;
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Buscador de notas · ${r.length} de ${d.notas.length}</span><button type="button" class="go" data-accion="nota-form" data-ruta="" data-id="">+ nota</button></div>
    <div class="fila" style="flex-wrap:wrap;margin:6px 0;gap:6px;font-size:11px">
      <label class="sr-only" for="busca-texto">Buscar</label><input class="inp" id="busca-texto" placeholder="buscar en título, texto, temas…" value="${f.texto}" data-entrada-texto="busca" data-campo="texto" style="flex:1;min-width:160px">
      <select class="inp" data-cambio="busca" data-campo="tipo" aria-label="Tipo"><option value="">tipo</option>${TIPOS_NOTA.map((t) => html`<option ${f.tipo === t ? 'selected' : ''}>${t}</option>`)}</select>
      <select class="inp" data-cambio="busca" data-campo="fuente" aria-label="Fuente"><option value="">fuente</option>${d.resumen.filter((x) => x.notas).map((x) => html`<option value="${x.id}" ${f.fuente === x.id ? 'selected' : ''}>${x.nombre}</option>`)}</select>
      <select class="inp" data-cambio="busca" data-campo="tema" aria-label="Tema"><option value="">tema</option>${temas.map((t) => html`<option ${f.tema === t ? 'selected' : ''}>${t}</option>`)}</select>
      <input class="inp" placeholder="desde" value="${f.desde}" data-cambio="busca" data-campo="desde" aria-label="Desde (AAAA-MM-DD)" style="width:90px"><input class="inp" placeholder="hasta" value="${f.hasta}" data-cambio="busca" data-campo="hasta" aria-label="Hasta (AAAA-MM-DD)" style="width:90px">
      <label><input type="checkbox" data-cambio="busca-caducadas" ${f.caducadas ? 'checked' : ''}> caducadas</label></div>
    ${pag.map((n) => {
      const cad = K.caducada(n, estado.ahora.fecha, m.fuentes, m.familias);
      return html`<button type="button" class="nota-fila" data-accion="nota-ver" data-ruta="${n.ruta}" data-id="${n.id}" style="${cad ? 'opacity:.55' : ''}"><span class="ep ${EP[n.tipo] ?? 'c'}">${n.tipo}</span> ${n.titulo} <span class="cit">[${n.id}]</span><span class="mut" style="font-size:10.5px;display:block">${nombre(n.fuente)} · ${n.fecha ? textoCorto(n.fecha) + ' ' + n.fecha.slice(0, 4) : 'sin fecha'}${n.temas.length ? ` · ${n.temas.join(', ')}` : ''}${cad ? ' · caducada' : ''}${n.editada ? ' · editada' : ''}${n.verificar ? ` · verificar ${n.verificar}` : ''}</span></button>`;
    })}
    ${r.length > pag.length ? html`<button type="button" class="go" data-accion="busca-mas">ver ${Math.min(POR_PAGINA, r.length - pag.length)} más</button>` : ''}
    ${!r.length ? html`<div class="mut" style="font-size:11px;padding:6px 0">Ninguna nota con esos filtros.</div>` : ''}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Las caducadas no entran en los análisis, pero siguen aquí y se pueden buscar.</div></div>`;
}

function cajaPredicciones(estado, d) {
  const m = estado.modelo;
  const cartera = { activos: m.activos, operaciones: m.operaciones, fotos: m.fotos };
  const listas = m.predicciones.filter((p) => p.estado === 'pendiente' && K.resolverPrediccion(p, { series: (id) => m.serie(id), cartera, hoy: estado.ahora.fecha }));
  const cal = K.calibracion(m.predicciones);
  const lista = [...m.predicciones].filter((p) => ui.predFiltro === 'todas' || (ui.predFiltro === 'pendiente' ? p.estado === 'pendiente' : p.estado !== 'pendiente')).reverse();
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Predicciones · ${m.predicciones.filter((p) => p.estado === 'pendiente').length} pendientes</span><span>${[['pendiente', 'pendientes'], ['resueltas', 'resueltas'], ['todas', 'todas']].map(([k, t]) => html`<button type="button" class="chip ck ${ui.predFiltro === k ? 'on' : ''}" data-accion="pred-filtro" data-id="${k}">${t}</button>`)}<button type="button" class="go" data-accion="pred-form">+ predicción</button></span></div>
    ${listas.length ? html`<div class="banda" style="margin-top:6px;justify-content:space-between">${listas.length} se pueden resolver ya con las series de Datos o tu cartera. <button type="button" class="go pri" data-accion="pred-auto">resolver automáticamente</button></div>` : ''}
    ${lista.length ? lista.map((p) => html`<div class="entre" style="padding:5px 0;border-top:.5px solid var(--border);font-size:11.5px;align-items:flex-start;gap:8px" data-prediccion="${p.id}"><span><span style="font-weight:500">${ESTADO_PRED[p.estado]}</span> «${p.texto}» <span class="cit">[${p.id}]</span><span class="mut" style="display:block;font-size:10.5px">${d.porId.get(p.fuente)?.nombre ?? p.fuente}${p.medir ? ` · medir: ${p.medir}` : ' · resolución manual'}${p.resuelta ? ` · resuelta ${p.resuelta}` : ''}${p.valor !== undefined ? ` · valor ${formatearDecimal(Math.round(p.valor / 10000) * 10000)}` : ''}</span></span>
      <span class="fila" style="flex-shrink:0">${p.estado === 'pendiente' ? html`<button type="button" class="go" data-accion="pred-resolver" data-id="${p.id}" data-estado="acertada" aria-label="Acertada">✓</button><button type="button" class="go" data-accion="pred-resolver" data-id="${p.id}" data-estado="fallida" aria-label="Fallida">✗</button><button type="button" class="go" data-accion="pred-resolver" data-id="${p.id}" data-estado="no-medible">no medible</button>` : html`<button type="button" class="go" data-accion="pred-resolver" data-id="${p.id}" data-estado="pendiente">reabrir</button>`}</span></div>`) : html`<div class="mut" style="font-size:11px;padding:6px 0">Ninguna.</div>`}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Calibración de finhub: ${cal.pb === null ? 'aún sin rangos resueltos' : `${Math.round(cal.pb / 100)} % de ${cal.resueltos} rangos contuvieron el valor real`}. Con medir (serie, métrica, periodo y condición) se resuelven solas al terminar el periodo.</div></div>`;
}

function cajaDatos(m) {
  const sel = m.series.find((s) => s.id === ui.serie) ?? null;
  let visor = '';
  if (sel) {
    const filas = m.serie(sel.id);
    const vis = filas.slice(-ui.rango);
    const doc = m.doc(sel.ruta);
    const meses = filas.map((f) => f.mes);
    let huecos = 0;
    for (let i = 1; i < meses.length; i++) {
      const [a1, m1] = meses[i - 1].split('-').map(Number);
      const [a2, m2] = meses[i].split('-').map(Number);
      huecos += (a2 - a1) * 12 + (m2 - m1) - 1;
    }
    visor = html`<div style="margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)" data-visor="${sel.id}"><div class="entre"><b style="font-weight:500;font-size:12px">${m.doc(sel.ruta).titulo.replace(/^Serie · /, '')}</b><span>${[[60, '5 años'], [120, '10 años'], [10000, 'todo']].map(([n, t]) => html`<button type="button" class="chip ck ${ui.rango === n ? 'on' : ''}" data-accion="serie-rango" data-n="${n}">${t}</button>`)}<button type="button" class="go" data-accion="serie-cerrar" aria-label="Cerrar el visor">×</button></span></div>
      ${vis.length > 1 ? graficoLineas({ series: [{ nombre: sel.id, color: '#378ADD', valores: vis.map((f) => f.valor), grosor: 1.6 }], ancho: 460, alto: 130, etiquetaY: (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)), etiquetasX: vis.map((f, i) => (i % Math.max(1, Math.round(vis.length / 6)) ? '' : `${MESES_CORTOS[+f.mes.slice(5) - 1]} ${f.mes.slice(2, 4)}`)), titulo: `serie ${sel.id}` }) : html`<div class="mut">Sin filas.</div>`}
      <div class="mut" style="font-size:10.5px">${filas.length} meses · ${filas[0]?.mes ?? '—'} … ${filas.at(-1)?.mes ?? '—'} · ${huecos ? `${huecos} meses sin dato (se interpolan y se marcan)` : 'sin huecos'} · ${filas.filter((f) => f.aproximacion).length} aproximados · fuente: ${sel.fuente ?? '—'} · método: ${sel.metodo ?? '—'}${doc.avisos.length ? html` · <span style="color:var(--text-warning)">⚠ ${doc.avisos.map((a) => a.mensaje).join(' · ')}</span>` : ''}</div></div>`;
  }
  return html`<div class="box" style="margin-top:8px"><div class="lab">Datos · series para calcular (conocimiento/datos/series/)</div>
    ${m.series.length ? html`<div class="desplazable"><table class="tb"><thead><tr><th>serie</th><th>unidad</th><th class="n">meses</th><th>actualizada</th><th></th></tr></thead><tbody>${m.series.map((s) => html`<tr class="ck" data-accion="serie-ver" data-id="${s.id}"><td>${s.id}${s.sintetica ? html` <span class="chip">sintética</span>` : ''}</td><td class="mut">${s.unidad ?? '—'}</td><td class="n">${s.filas}</td><td class="mut">${s.actualizado ?? '—'}</td><td>${m.doc(s.ruta).avisos.length ? html`<span style="color:var(--text-warning)" title="${m.doc(s.ruta).avisos.map((a) => a.mensaje).join(' · ')}">⚠ ${m.doc(s.ruta).avisos.length}</span>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="mut" style="font-size:11px">Aún no hay series. Se crean en tu máquina con el trabajo «datos» y tu luz verde (F9), siguiendo semilla/datos-manifiesto.md.</div>`}
    ${visor}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Los valores de los índices no se guardan en el repo (licencias): el manifiesto dice qué serie, de qué fuente gratuita y con qué método.${m.series.some((s) => s.sintetica) ? ' Las del ejemplo son SINTÉTICAS.' : ''}</div></div>`;
}

// ---------- modales ----------
function abrirFicha(estado, id) {
  const cuerpo = () => {
    const e = est();
    const m = e.modelo;
    const d = datosConocimiento(e);
    const r = d.porId.get(id);
    if (!r) return html`<div class="mut">Esa fuente ya no existe.</div>`;
    const notas = d.notas.filter((n) => n.fuente === id);
    const t12 = K.posturaEnElTiempo(notas, e.ahora.fecha, 12);
    const t = t12.slice(Math.max(0, t12.findIndex((x) => x.postura !== null))); // desde el primer mes con postura
    const preds = m.predicciones.filter((p) => p.fuente === id);
    const fam = m.familias.find((f) => f.id === r.familia);
    return html`<div class="mut" style="font-size:11px">${fam?.nombre ?? r.familia} · ${r.notas} notas · última ${r.ultima ? textoCorto(r.ultima) : '—'}${r.prefijo ? ` · ids ${r.prefijo}-…` : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0">${[['Postura media', TEXTO_POSTURA(r.postura)], ['Acierto', r.acierto.aciertoPb === null ? `${r.acierto.resueltas} resueltas (hacen falta 5)` : `${Math.round(r.acierto.aciertoPb / 100)} %`], ['En tu mezcla', r.activa ? 'sí' : 'no']].map(([a, b]) => html`<div style="background:var(--surface-1);border-radius:8px;padding:7px 9px"><div class="mut" style="font-size:10.5px">${a}</div><div style="font-size:14px;font-weight:500">${b}</div></div>`)}</div>
      ${t.length > 1 && t.some((x) => x.postura !== null) ? html`<div class="lab">Postura en el tiempo · ${t.length} meses</div>${graficoLineas({ series: [{ nombre: 'postura', color: COLOR_POSTURA(r.postura), valores: t.map((x) => x.postura ?? 0), grosor: 2 }], ancho: 460, alto: 80, min: -1, max: 1, etiquetaY: (v) => (v > 0.3 ? 'alc.' : v < -0.3 ? 'baj.' : 'neu.'), etiquetasX: t.map((x, i) => (i % 3 ? '' : MESES_CORTOS[+x.mes.slice(5) - 1])), titulo: `postura de ${r.nombre} en ${t.length} meses` })}` : ''}
      ${r.temas.length ? html`<div class="lab" style="margin-top:8px">Temas frecuentes</div>${r.temas.map(([tm, n]) => html`<span class="chip">${tm} · ${n}</span>`)}` : ''}
      <div class="lab" style="margin-top:8px">Predicciones registradas</div>${preds.length ? preds.map((p) => html`<div style="font-size:11px;line-height:1.7">${ESTADO_PRED[p.estado]} «${p.texto}» · <span class="mut">${p.estado}</span></div>`) : html`<div class="mut" style="font-size:11px">Ninguna.</div>`}
      <form class="fila" data-form="fuente-editar" style="flex-wrap:wrap;margin-top:12px;font-size:11px;gap:6px"><input type="hidden" name="id" value="${id}">
        <label>nombre <input class="inp" name="nombre" value="${r.nombre}" style="width:180px"></label>
        <label>familia <select class="inp" name="familia" ${r.fija ? 'disabled' : ''}>${m.familias.map((f) => html`<option value="${f.id}" ${f.id === r.familia ? 'selected' : ''}>${f.nombre}</option>`)}</select></label>
        <label>caducidad <input class="inp" name="caducidad" value="${r.caducidad ? `${r.caducidad.n}${r.caducidad.unidad}` : ''}" placeholder="180d" style="width:56px"></label><button type="submit" class="go">guardar</button></form>
      <div class="entre" style="margin-top:10px">${r.fija ? html`<span class="mut" style="font-size:10.5px">fuente fija: no se borra</span>` : html`<button type="button" class="go" data-accion="fuente-borrar" data-id="${id}">borrar fuente</button>`}<button type="button" class="pri" data-accion="ficha-mezcla" data-id="${id}">${r.activa ? 'quitar de mi mezcla' : 'añadir a mi mezcla'}</button></div>`;
  };
  abrir({ titulo: datosConocimiento(estado).porId.get(id)?.nombre ?? id, cuerpo, ancho: true });
}

function abrirNota(estado, ruta, id, editar = false) {
  const cuerpo = () => {
    const d = datosConocimiento(est());
    const n = id ? d.notas.find((x) => x.id === id && x.ruta === ruta) : null;
    if (id && !n) return html`<div class="mut">Esa nota ya no existe.</div>`;
    const fuentesManual = d.resumen.filter((r) => !['mundo', 'datos'].includes(r.id));
    if (n && !editar) {
      const cad = K.fechaCaducidad(n, est().modelo.fuentes, est().modelo.familias);
      return html`<div class="fila" style="margin:6px 0"><span class="ep ${EP[n.tipo] ?? 'c'}">${n.tipo}</span> <span class="cit">[${n.id}]</span> <span class="mut" style="font-size:11px">${d.porId.get(n.fuente)?.nombre ?? n.fuente} · ${n.fecha ?? 'sin fecha'}${n.postura ? ` · ${n.postura}` : ''}</span></div>
        <div style="font-size:12px;line-height:1.7;white-space:pre-line" data-nota-cuerpo>${n.cuerpo}</div>
        <div class="mut" style="font-size:10.5px;margin-top:8px;line-height:1.6">${n.temas.length ? `temas: ${n.temas.join(', ')} · ` : ''}${n.activos.length ? `activos: ${n.activos.join(', ')} · ` : ''}${cad ? `caduca: ${cad} · ` : ''}${n.verificar ? `verificar en ${n.verificar} · ` : ''}${n.editada ? 'editada a mano · ' : ''}${n.ruta}${n.origen ? html`<br>origen: ${n.origen}` : ''}</div>
        <div class="entre" style="margin-top:12px"><span class="fila"><button type="button" class="go" data-accion="nota-borrar" data-ruta="${n.ruta}" data-id="${n.id}">borrar</button><form class="fila" data-form="nota-mover" style="gap:4px"><input type="hidden" name="ruta" value="${n.ruta}"><input type="hidden" name="id" value="${n.id}"><select class="inp" name="fuente" aria-label="Mover a la fuente"><option value="">mover a…</option>${fuentesManual.filter((r) => r.id !== n.fuente).map((r) => html`<option value="${r.id}">${r.nombre}</option>`)}</select><button type="submit" class="go">mover</button></form></span><button type="button" class="pri" data-accion="nota-form" data-ruta="${n.ruta}" data-id="${n.id}">editar</button></div>`;
    }
    const c = n ?? { tipo: 'opinión', temas: [], activos: [], titulo: '', cuerpo: '', postura: null, caduca: null, fuente: 'mias' };
    return html`<form data-form="nota" style="font-size:11.5px;line-height:2.2;margin-top:6px"><input type="hidden" name="ruta" value="${ruta ?? ''}"><input type="hidden" name="id" value="${id ?? ''}">
      <label>título <input class="inp" name="titulo" value="${c.titulo}" style="width:100%" autofocus></label>
      ${n ? '' : html`<label>fuente <select class="inp" name="fuente">${fuentesManual.map((r) => html`<option value="${r.id}" ${r.id === 'mias' ? 'selected' : ''}>${r.nombre}</option>`)}</select></label>`}
      <label>tipo <select class="inp" name="tipo">${TIPOS_NOTA.map((t) => html`<option ${t === c.tipo ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label>postura <select class="inp" name="postura"><option value="">—</option>${POSTURAS.map((p) => html`<option ${p === c.postura ? 'selected' : ''}>${p}</option>`)}</select></label>
      <label>caduca <input class="inp" name="caduca" value="${c.caduca ?? ''}" placeholder="AAAA-MM-DD" style="width:100px"></label><br>
      <label>temas <input class="inp" name="temas" value="${c.temas.join(', ')}" style="width:220px"></label> <label>activos <input class="inp" name="activos" value="${c.activos.join(', ')}" style="width:160px"></label>
      <label style="display:block;line-height:1.4;margin-top:6px">texto<br><textarea class="inp" name="cuerpo" rows="5" style="width:100%">${c.cuerpo}</textarea></label>
      <div class="mut" style="font-size:10.5px;line-height:1.5">${n ? 'Al guardar queda marcada como «editada»: si vuelves a procesar el mismo documento, no se pisa.' : 'Mis notas son privadas: nunca salen de tu máquina ni entran en trabajos con internet.'}</div>
      <div style="text-align:right"><button type="submit" class="pri">${n ? 'Guardar' : 'Crear nota'}</button></div></form>`;
  };
  abrir({ titulo: editar || !id ? (id ? `Editar ${id}` : 'Nueva nota') : datosConocimiento(estado).notas.find((x) => x.id === id && x.ruta === ruta)?.titulo ?? id, cuerpo, ancho: true });
}

function abrirMezclas() {
  abrir({
    titulo: 'Mezclas guardadas',
    ancho: true,
    cuerpo: () => {
      const m = est().modelo;
      const d = datosConocimiento(est());
      const exist = new Set(d.resumen.map((r) => r.id));
      return html`<div class="mut" style="font-size:11px;margin:6px 0">Una mezcla es una lista de fuentes y selectores dinámicos que se recalculan solos: <code>@postura&lt;=-0,3</code>, <code>@familia=yt</code>, <code>@acierto&gt;=65</code>.</div>
        <table class="tb"><thead><tr><th>mezcla</th><th>miembros</th><th class="n">fuentes</th><th></th></tr></thead><tbody>${m.mezclas.map((x) => {
          const r = K.resolverMezcla(x.miembros, d.resumen);
          const texto = x.miembros.map((y) => (typeof y === 'string' ? y : `@${y.campo}${y.op}${typeof y.valor === 'number' ? String(y.valor).replace('.', ',') : y.valor}`)).join(', ');
          return html`<tr><td>${x.nombre}</td><td><form class="fila" data-form="mezcla-miembros" style="gap:4px"><input type="hidden" name="id" value="${x.id}"><label class="sr-only" for="mz-${x.id}">Miembros de ${x.nombre}</label><input class="inp" id="mz-${x.id}" name="miembros" value="${texto}" style="width:100%;font-size:10.5px"><button type="submit" class="go">ok</button></form>${r.borradas.length ? html`<div style="color:var(--text-warning);font-size:10.5px">⚠ usa fuentes borradas: ${r.borradas.join(', ')} <button type="button" class="go" data-accion="mezcla-limpiar" data-id="${x.id}">limpiar</button></div>` : ''}</td><td class="n">${r.fuentes.length}</td><td style="white-space:nowrap"><button type="button" class="go" data-accion="mezcla-aplicar" data-id="${x.id}">usar</button> <button type="button" class="go" data-accion="mezcla-borrar" data-id="${x.id}" aria-label="Borrar ${x.nombre}">🗑</button></td></tr>`;
        })}</tbody></table>
        <div class="mut" style="font-size:10.5px;margin-top:6px">${exist.size} fuentes en total. «usar» la convierte en tu mezcla activa.</div>`;
    },
  });
}

function abrirFamilias() {
  abrir({
    titulo: 'Familias y caducidad',
    cuerpo: () => {
      const m = est().modelo;
      return html`<table class="tb" style="margin-top:6px"><thead><tr><th>familia</th><th>caducidad</th><th></th></tr></thead><tbody>${m.familias.map((f) => html`<tr><td>${f.nombre}</td><td><label class="sr-only" for="fam-c-${f.id}">Caducidad de ${f.nombre}</label><input class="inp" id="fam-c-${f.id}" value="${f.caducidad ? `${f.caducidad.n}${f.caducidad.unidad}` : ''}" placeholder="sin caducidad" data-cambio="familia-caducidad" data-id="${f.id}" style="width:90px"></td><td>${['fija', 'mias'].includes(f.id) ? '' : html`<button type="button" class="go" data-accion="familia-borrar" data-id="${f.id}" aria-label="Borrar ${f.nombre}">🗑</button>`}</td></tr>`)}</tbody></table>
        <form class="fila" data-form="familia-nueva" style="margin-top:8px"><label class="sr-only" for="familia-nueva">Nueva familia</label><input class="inp" id="familia-nueva" name="nombre" placeholder="nueva familia" style="flex:1"><button type="submit" class="pri">Añadir</button></form>
        <div class="mut" style="font-size:10.5px;margin-top:6px">Caducidad: 90d, 6m, 1a… Las notas caducadas no entran en los análisis, pero siguen buscables.</div>`;
    },
  });
}

async function abrirBase() {
  const d = datosConocimiento(est());
  const ids = new Set(d.notas.map((n) => n.id));
  const nuevas = (ui.semilla?.notas ?? []).filter((n) => !ids.has(n.id));
  const porFichero = Map.groupBy ? Map.groupBy(nuevas, (n) => n.fichero) : nuevas.reduce((acc, n) => acc.set(n.fichero, [...(acc.get(n.fichero) ?? []), n]), new Map());
  abrir({
    titulo: `Base de finhub · ${nuevas.length} notas nuevas`,
    ancho: true,
    cuerpo: html`<div class="mut" style="font-size:11px;margin:6px 0">Notas de referencia escritas para finhub con su fuente (URL y fecha): hechos, datos y consenso, nunca opiniones. Las de fiscalidad llevan «verificar» porque cambian cada año. Se copian a conocimiento/base/ y desde ahí son tuyas (puedes editarlas o borrarlas).</div>
      ${[...porFichero].map(([f, ns]) => html`<details style="border-top:.5px solid var(--border);padding:5px 0"><summary style="font-size:11.5px;cursor:pointer">${f} · ${ns.length} notas</summary>${ns.slice(0, 60).map((n) => html`<div style="font-size:11px;padding:2px 0 2px 12px"><span class="cit">[${n.id}]</span> ${n.titulo}</div>`)}</details>`)}
      <div style="text-align:right;margin-top:10px"><button type="button" class="pri" data-accion="base-importar">Importar ${nuevas.length} notas</button></div>`,
  });
}

// ---------- acciones ----------
const listaIds = (t) => String(t ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export function registrarAccionesConocimiento() {
  accion('fuentes-familia', (el) => {
    ui.familia = el.dataset.id;
    repintar();
  });
  accion('mezcla-panel', () => {
    ui.mezclaAbierta = !ui.mezclaAbierta;
    repintar();
  });
  entrada('buscar-fuente', (el) => {
    ui.buscaFuente = el.value;
    repintar();
  });
  accion('familia-plegar', (el) => {
    const m = est().modelo;
    ui.plegadas ??= new Set(m.familias.filter((f) => f.plegada).map((f) => f.id));
    ui.plegadas.has(el.dataset.id) ? ui.plegadas.delete(el.dataset.id) : ui.plegadas.add(el.dataset.id);
    repintar();
  });
  const activar = (ids, mensaje) => op('fuentes.activas', { ids: [...ids] }, { mensaje, silencioso: false });
  const activasAhora = () => new Set(datosConocimiento(est()).resumen.filter((r) => r.activa).map((r) => r.id));
  cambio('fuente-activa', (el) => {
    const s = activasAhora();
    el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id);
    activar(s, el.checked ? 'Añadida a tu mezcla' : 'Quitada de tu mezcla');
  });
  accion('familia-todas', (el) => {
    const d = datosConocimiento(est());
    const s = activasAhora();
    const fam = d.resumen.filter((r) => r.familia === el.dataset.id);
    const todas = fam.every((r) => s.has(r.id));
    for (const r of fam) todas ? s.delete(r.id) : s.add(r.id);
    activar(s, todas ? 'Familia quitada de tu mezcla' : 'Familia añadida a tu mezcla');
  });
  accion('mezcla-todas', () => activar(datosConocimiento(est()).resumen.map((r) => r.id), 'Todas las fuentes en tu mezcla'));
  accion('mezcla-ninguna', () => activar(['base', 'datos'], 'Mezcla: solo Base y Datos'));
  accion('mezcla-aplicar', (el) => {
    const m = est().modelo;
    const x = m.mezclas.find((y) => y.id === el.dataset.id);
    activar(K.resolverMezcla(x.miembros, datosConocimiento(est()).resumen).fuentes, `Tu mezcla: «${x.nombre}»`);
  });
  accion('mezcla-guardar', async () => {
    const ids = [...activasAhora()];
    if (!ids.length) return toast('Tu mezcla está vacía', { tipo: 'error' });
    const n = est().modelo.mezclas.length + 1;
    await op('mezcla.crear', { nombre: `Mi mezcla ${n}`, miembros: ids }, { mensaje: `Mezcla «Mi mezcla ${n}» guardada en conocimiento/_mezclas.md (renómbrala en Gestionar)` });
  });
  accion('mezclas', () => abrirMezclas());
  formulario('mezcla-miembros', (f, d) => {
    const miembros = [];
    for (const t of d.miembros.split(',').map((x) => x.trim()).filter(Boolean)) {
      const s = /^@(postura|familia|acierto)(<=|>=|!=|=|<|>)(.+)$/.exec(t);
      if (t.startsWith('@') && !s) return toast(`Selector no válido: ${t}`, { tipo: 'error' });
      miembros.push(s ? { campo: s[1], op: s[2], valor: s[1] === 'familia' ? s[3] : Number(s[3].replace(',', '.')) } : t.toLowerCase());
    }
    if (!miembros.length) return toast('La mezcla no puede quedar vacía', { tipo: 'error' });
    op('lista.editar', { ruta: 'conocimiento/_mezclas.md', clave: d.id, cambios: { miembros } }, { mensaje: 'Mezcla guardada' });
  });
  accion('mezcla-limpiar', (el) => op('mezcla.limpiar', { id: el.dataset.id }, { mensaje: (r) => (r.resultado.borrada ? 'La mezcla se quedó vacía: a la papelera' : `Quitadas ${r.resultado.quitadas} fuentes borradas`) }));
  accion('mezcla-borrar', async (el) => {
    if (await confirmar('¿Borrar esta mezcla? Irá a la papelera 30 días.', { si: 'Borrar' })) {
      await op('lista.borrar', { ruta: 'conocimiento/_mezclas.md', clave: el.dataset.id, que: `mezcla ${el.dataset.id}` }, { mensaje: 'Mezcla borrada' });
      abrirMezclas();
    }
  });
  accion('ficha', (el) => abrirFicha(est(), el.dataset.id));
  accion('ficha-mezcla', (el) => {
    const s = activasAhora();
    s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id);
    activar(s, 'Mezcla actualizada');
  });
  formulario('fuente-editar', (f, d) => {
    const r = datosConocimiento(est()).porId.get(d.id);
    const cambios = { nombre: d.nombre.trim() };
    if (!cambios.nombre) return toast('El nombre no puede quedar vacío', { tipo: 'error' });
    if (d.familia && !r.fija) cambios.familia = d.familia;
    const c = d.caducidad.trim();
    if (c && !/^\d+\s*[dma]$/i.test(c)) return toast('Caducidad: 90d, 6m o 1a', { tipo: 'error' });
    cambios.caducidad = c ? { n: +c.slice(0, -1), unidad: c.slice(-1).toLowerCase(), dias: +c.slice(0, -1) * { d: 1, m: 30, a: 365 }[c.slice(-1).toLowerCase()] } : null;
    op('lista.editar', { ruta: 'conocimiento/_fuentes.md', clave: d.id, cambios }, { mensaje: 'Fuente guardada' });
  });
  accion('fuente-borrar', async (el) => {
    const r = datosConocimiento(est()).porId.get(el.dataset.id);
    if (!(await confirmar(`¿Borrar «${r.nombre}» y sus ${r.notas} notas? Todo irá a la papelera 30 días.`, { si: 'Borrar' }))) return;
    const res = await op('fuente.borrar', { id: el.dataset.id }, { mensaje: `Fuente «${r.nombre}» en la papelera` });
    if (res) cerrar();
  });
  accion('fuente-nueva', () =>
    abrir({
      titulo: 'Nueva fuente',
      cuerpo: html`<form data-form="fuente-nueva" style="font-size:11.5px;line-height:2.3;margin-top:6px"><label>nombre <input class="inp" name="nombre" style="width:220px" autofocus></label><br><label>familia <select class="inp" name="familia">${est().modelo.familias.map((f) => html`<option value="${f.id}">${f.nombre}</option>`)}</select></label> <label>caducidad <input class="inp" name="caducidad" placeholder="180d" style="width:60px"></label><div style="text-align:right"><button type="submit" class="pri">Crear</button></div></form>`,
    }),
  );
  formulario('fuente-nueva', async (f, d) => {
    const c = d.caducidad.trim();
    if (c && !/^\d+\s*[dma]$/i.test(c)) return toast('Caducidad: 90d, 6m o 1a', { tipo: 'error' });
    const r = await op('fuente.crear', { nombre: d.nombre, familia: d.familia, caducidad: c ? { n: +c.slice(0, -1), unidad: c.slice(-1).toLowerCase(), dias: +c.slice(0, -1) * { d: 1, m: 30, a: 365 }[c.slice(-1).toLowerCase()] } : null }, { mensaje: (x) => `Fuente creada (${x.resultado.id}, notas ${x.resultado.prefijo}-…)` });
    if (r) cerrar();
  });
  accion('familias', () => abrirFamilias());
  cambio('familia-caducidad', (el) => {
    const c = el.value.trim();
    if (c && !/^\d+\s*[dma]$/i.test(c)) return toast('Caducidad: 90d, 6m o 1a', { tipo: 'error' });
    op('lista.editar', { ruta: 'conocimiento/_familias.md', clave: el.dataset.id, cambios: { caducidad: c ? { n: +c.slice(0, -1), unidad: c.slice(-1).toLowerCase(), dias: +c.slice(0, -1) * { d: 1, m: 30, a: 365 }[c.slice(-1).toLowerCase()] } : null } }, { mensaje: 'Caducidad guardada' });
  });
  formulario('familia-nueva', (f, d) => {
    if (!d.nombre.trim()) return;
    const ids = est().modelo.familias.map((x) => x.id);
    let id = d.nombre.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'familia';
    for (let n = 2; ids.includes(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    op('lista.crear', { ruta: 'conocimiento/_familias.md', valor: { id, nombre: d.nombre.trim() } }, { mensaje: 'Familia creada' });
  });
  accion('familia-borrar', async (el) => {
    const m = est().modelo;
    const destino = m.familias.find((f) => f.id !== el.dataset.id && f.id !== 'fija' && f.id !== 'mias') ?? m.familias.find((f) => f.id !== el.dataset.id);
    if (!(await confirmar(`¿Borrar la familia? Sus fuentes pasan a «${destino.nombre}».`, { si: 'Borrar' }))) return;
    await op('familia.borrar', { id: el.dataset.id, destino: destino.id }, { mensaje: 'Familia borrada' });
    abrirFamilias();
  });
  // buscador
  const filtrar = (campo, valor) => {
    ui.filtro = { ...ui.filtro, [campo]: valor };
    ui.pagina = 1;
    repintar();
  };
  entrada('busca', (el) => filtrar(el.dataset.campo, el.value));
  cambio('busca', (el) => {
    if (['desde', 'hasta'].includes(el.dataset.campo) && el.value && !esFecha(el.value)) return toast('Fecha: AAAA-MM-DD', { tipo: 'error' });
    filtrar(el.dataset.campo, el.value);
  });
  cambio('busca-caducadas', (el) => filtrar('caducadas', el.checked));
  accion('busca-mas', () => {
    ui.pagina++;
    repintar();
  });
  accion('nota-ver', (el) => abrirNota(est(), el.dataset.ruta, el.dataset.id));
  accion('nota-form', (el) => abrirNota(est(), el.dataset.ruta || null, el.dataset.id || null, true));
  accion('nota-borrar', async (el) => {
    if (!(await confirmar(`¿Borrar la nota ${el.dataset.id}? Irá a la papelera 30 días.`, { si: 'Borrar' }))) return;
    const r = await op('bloque.borrar', { ruta: el.dataset.ruta, id: el.dataset.id, que: `nota ${el.dataset.id}` }, { mensaje: `Nota ${el.dataset.id} borrada` });
    if (r) cerrar();
  });
  formulario('nota-mover', async (f, d) => {
    if (!d.fuente) return toast('Elige la fuente', { tipo: 'error' });
    const r = await op('nota.mover', { ruta: d.ruta, id: d.id, fuente: d.fuente }, { mensaje: (x) => `Nota movida a ${x.resultado.ruta}` });
    if (r) cerrar();
  });
  formulario('nota', async (f, d) => {
    if (!d.titulo.trim()) return toast('Escribe el título', { tipo: 'error' });
    if (!d.cuerpo.trim()) return toast('Escribe el texto', { tipo: 'error' });
    if (d.caduca.trim() && !esFecha(d.caduca.trim())) return toast('Caduca: AAAA-MM-DD', { tipo: 'error' });
    const campos = { tipo: d.tipo, postura: d.postura || null, caduca: d.caduca.trim() || null, temas: listaIds(d.temas).map((t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')), activos: listaIds(d.activos) };
    let r;
    if (d.id) r = await op('nota.editar', { ruta: d.ruta, id: d.id, titulo: d.titulo.trim(), campos: { ...campos, temas: campos.temas.length ? campos.temas : null, activos: campos.activos.length ? campos.activos : null }, cuerpo: d.cuerpo }, { mensaje: `Nota ${d.id} guardada` });
    else r = await op('nota.crear', { fuente: d.fuente, titulo: d.titulo.trim(), fecha: est().ahora.fecha, campos, cuerpo: d.cuerpo }, { mensaje: (x) => `Nota ${x.resultado.id} creada` });
    if (r) cerrar();
  });
  // predicciones
  accion('pred-filtro', (el) => {
    ui.predFiltro = el.dataset.id;
    repintar();
  });
  accion('pred-resolver', (el) => op('prediccion.resolver', { id: el.dataset.id, estado: el.dataset.estado }, { mensaje: `${el.dataset.id}: ${el.dataset.estado}` }));
  accion('pred-auto', () => op('predicciones.resolverAuto', {}, { mensaje: (r) => `Resueltas: ${r.resultado.resueltas.map((x) => `${x.id} ${x.estado}`).join(', ') || 'ninguna'}` }));
  accion('pred-form', () =>
    abrir({
      titulo: 'Nueva predicción',
      cuerpo: html`<form data-form="prediccion" style="font-size:11.5px;line-height:2.2;margin-top:6px"><label>fuente <select class="inp" name="fuente">${datosConocimiento(est()).resumen.map((r) => html`<option value="${r.id}">${r.nombre}</option>`)}</select></label><br>
        <label>qué predice <input class="inp" name="texto" style="width:100%" autofocus></label>
        <label>medir (opcional) <input class="inp" name="medir" placeholder="msci-world-nr-eur variacion 2026-11-01→2027-11-01 > 0" style="width:100%"></label>
        <div class="mut" style="font-size:10.5px;line-height:1.5">medir = serie · caída-max | subida-max | variacion | nivel | twr · desde→hasta · condición (&gt;, &gt;=, &lt;, &lt;=, = o «en a…b»). Las cifras en %. Sin «medir», se resuelve a mano.</div>
        <div style="text-align:right"><button type="submit" class="pri">Registrar</button></div></form>`,
    }),
  );
  formulario('prediccion', async (f, d) => {
    if (!d.texto.trim()) return toast('Escribe la predicción', { tipo: 'error' });
    if (d.medir.trim() && !K.parseMedir(d.medir)) return toast('«medir» no se entiende: revisa el formato', { tipo: 'error' });
    const r = await op('prediccion.crear', { fuente: d.fuente, texto: d.texto, medir: d.medir.trim() || null }, { mensaje: (x) => `Predicción ${x.resultado.id} registrada` });
    if (r) cerrar();
  });
  // datos
  accion('serie-ver', (el) => {
    ui.serie = el.dataset.id;
    repintar();
  });
  accion('serie-cerrar', () => {
    ui.serie = null;
    repintar();
  });
  accion('serie-rango', (el) => {
    ui.rango = Number(el.dataset.n);
    repintar();
  });
  // Base de finhub
  accion('base-revisar', () => abrirBase());
  accion('base-importar', async () => {
    const r = await op('base.importar', { ficheros: ui.semilla.ficheros }, { mensaje: (x) => `Importadas ${x.resultado.importadas} notas a conocimiento/base/` });
    if (r) cerrar();
  });
}
