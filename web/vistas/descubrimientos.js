// 🔭 Descubrimientos (§4.9, §5, maqueta: descView, dInforme, dEncaje, dSim). Panel «Qué investigar» (4 modos,
// periodo, tema, filtros, nombres de tus clases, profundidad) → trabajo «descubrir» (internet sí, privado no)
// → PROPUESTAS que tú guardas. Mapa de efectos del pulso, lista con filtros, informe con historial y
// comparación de versiones, «¿cómo encaja?» (trabajo «encaje», sin internet, guardado en privado), simulador
// (código, no toca tu cartera), seguir, «¿qué ha cambiado?», descartar, archivar y borrar.
import { html } from '../esc.js';
import { accion, cambio, entrada, formulario } from '../acciones.js';
import { op } from '../api.js';
import { abrir, cerrar, confirmar, repintarModal } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml, avisosHtml } from '../componentes/claude.js';
import { rexHacia } from './rex.js';
import * as D from '/core/descubrimientos.js';
import { formatearPct, formatearEuros } from '/core/dinero.js';
import { textoCorto, sumarDias } from '/core/fechas.js';
import { textoSeccion } from '/core/formato/motor.js';

const MODOS = [
  ['pulso', 'A partir del pulso', 'qué puede salir beneficiado o perjudicado'],
  ['nuevas', 'Nuevas ideas', 'temas, sectores, vehículos nuevos'],
  ['seguimiento', 'Seguimiento', '¿qué ha cambiado en lo que sigues?'],
  ['libre', 'Pregunta libre', 'lo que quieras investigar'],
];
const PERIODOS = [['hoy', 'hoy'], ['1s', '1 semana'], ['1m', '1 mes'], ['3m', '3 meses'], ['rango', 'rango…']];
const PROF = [['rapida', 'rápida'], ['normal', 'normal'], ['fondo', 'a fondo']];
const ESTADOS = [['todos', 'todos'], ['nuevo', 'nuevos'], ['siguiendo', 'siguiendo'], ['descartado', 'descartados'], ['archivado', 'archivados']];
const COL = { alcista: '#1D9E75', neutral: '#888780', bajista: '#E24B4A' };
const ETIQ = { hecho: 'h', dato: 'h', consenso: 'c', 'opinión': 'o', 'especulación': 'e' };

const ds = { modo: 'pulso', periodo: '1m', desde: '', hasta: '', tema: '', filtros: null, misClases: false, profundidad: 'normal', filtro: 'todos', segId: null, prog: nuevoProgreso(), propuestas: null, guardadas: new Set() };
const enc = { id: null, prog: nuevoProgreso(), ruta: null };
const sim = { id: null, pct: 5, de: 'todo' };
const inf = { id: null, version: null };
let contexto = null;
export const iniciarDescubrimientos = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();
const pctT = (x) => (x === null || x === undefined ? '—' : formatearPct(Math.round(x * 10000)));
const pb = (x) => (x === null || x === undefined ? '—' : formatearPct(x, 1).replace(/^\+/, ''));
const ter = (x) => (x === null || x === undefined ? '—' : `${(x / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
const citas = (lista = []) => lista.map((c) => html`<span class="cit">[${c.replace(/^web:/, '')}]</span> `);
const filtrosDe = (m) => (ds.filtros ??= new Set(m.ajustes.descubrir_filtros ?? []));

/** «[hecho] … · [opinión] …» → etiquetas de afirmación (§0.2: hecho, consenso, opinión, especulación). */
function afirmaciones(texto) {
  if (!texto) return '';
  return String(texto).split(' · ').map((p) => {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(p.trim());
    return m ? html`<div style="font-size:11px;margin:2px 0"><span class="ep ${ETIQ[m[1]] ?? 'e'}">${m[1]}</span> ${m[2]}</div>` : html`<div style="font-size:11px">${p}</div>`;
  });
}

function prediccionesDe(m, d) {
  const ids = new Set(d.versiones.flatMap((v) => v.campos.predicciones ?? []));
  return m.predicciones.filter((p) => ids.has(p.id) || p.descubrimiento === d.id);
}

// ---------- vista ----------
export function vistaDescubrimientos(e) {
  const m = e.modelo;
  const hoy = e.ahora.fecha;
  const lista = D.listaDescubrimientos(m);
  const vis = lista.filter((d) => ds.filtro === 'todos' || (d.estado ?? 'nuevo') === ds.filtro);
  return html`<div class="desc-rejilla" style="display:grid;grid-template-columns:250px minmax(0,1fr);gap:8px">${panel(m, hoy, lista)}<div>${mapa(m, hoy)}${propuestas(m)}
    <div class="entre" style="margin:10px 0 6px;flex-wrap:wrap;gap:4px"><span role="group" aria-label="Filtrar por estado">${ESTADOS.map(([k, t]) => html`<button type="button" class="chip ck ${ds.filtro === k ? 'on' : ''}" data-accion="desc-filtro" data-id="${k}" aria-pressed="${ds.filtro === k ? 'true' : 'false'}">${t} ${k === 'todos' ? lista.length : lista.filter((d) => (d.estado ?? 'nuevo') === k).length}</button>`)}</span><span class="mut" style="font-size:10.5px">conocimiento/descubrimientos/ · públicos · el encaje es privado</span></div>
    ${vis.length ? vis.map((d) => tarjeta(m, d, hoy)) : html`<div class="box mut" style="font-size:11.5px">${lista.length ? 'Ninguno con ese estado.' : 'Aún no hay descubrimientos: investiga a partir del pulso o con una pregunta.'}</div>`}
    ${acierto(m)}
    <div class="mut" style="font-size:10.5px;margin-top:8px;text-align:center">Es para informarte. Los cambios en tu cartera los haces tú.</div></div></div>`;
}

function panel(m, hoy, lista) {
  const seguidos = lista.filter((d) => d.estado === 'siguiendo');
  const enMarcha = ds.prog.fase === 'trabajando';
  const filtros = filtrosDe(m);
  const notasPeriodo = (() => {
    const [desde, hasta] = ds.periodo === 'rango' ? [ds.desde, ds.hasta] : [sumarDias(hoy, -{ hoy: 0, '1s': 7, '1m': 30, '3m': 91 }[ds.periodo]), hoy];
    const dias = m.mundo.filter((x) => x.fecha >= desde && x.fecha <= hasta);
    return `${dias.reduce((a, x) => a + x.notas.length, 0)} noticias de ${dias.length} pulsos en ese periodo`;
  })();
  const puede = !enMarcha && (ds.modo !== 'libre' || ds.tema.trim()) && (ds.modo !== 'seguimiento' || ds.segId) && (ds.periodo !== 'rango' || (ds.desde && ds.hasta && ds.desde <= ds.hasta));
  return html`<div class="box"><div class="lab">1 · Qué investigar</div>
    <div role="radiogroup" aria-label="Modo">${MODOS.map(([k, t, sub]) => html`<button type="button" class="tg" role="radio" aria-checked="${ds.modo === k ? 'true' : 'false'}" data-accion="desc-modo" data-id="${k}" style="width:100%;text-align:left;background:none"><span class="sw ${ds.modo === k ? 'on' : ''}" style="width:14px;border-radius:50%"></span><span style="font-size:11.5px">${t}<div class="mut" style="font-size:10px">${sub}</div></span></button>`)}</div>
    ${ds.modo === 'pulso' || ds.modo === 'seguimiento'
      ? html`<div class="lab" style="margin-top:10px">2 · Periodo</div><div>${PERIODOS.map(([k, t]) => html`<button type="button" class="chip ck ${ds.periodo === k ? 'on' : ''}" data-accion="desc-periodo" data-id="${k}" aria-pressed="${ds.periodo === k ? 'true' : 'false'}">${t}</button>`)}</div>
        ${ds.periodo === 'rango' ? html`<div class="fila" style="gap:4px"><input class="inp" type="date" aria-label="desde" data-cambio="desc-desde" value="${ds.desde}" max="${hoy}"><input class="inp" type="date" aria-label="hasta" data-cambio="desc-hasta" value="${ds.hasta}" max="${hoy}"></div>` : ''}
        ${ds.modo === 'pulso' ? html`<div class="mut" style="font-size:10.5px">${notasPeriodo}</div>` : html`<label class="lab" for="desc-seg" style="margin-top:6px">Descubrimiento a revisar</label><select id="desc-seg" class="inp" style="width:100%" data-cambio="desc-seg"><option value="">— elige —</option>${lista.filter((d) => d.estado !== 'descartado').map((d) => html`<option value="${d.id}" ${ds.segId === d.id ? 'selected' : ''}>${d.id} · ${d.titulo}${d.estado === 'siguiendo' ? ' (sigues)' : ''}</option>`)}</select><div class="mut" style="font-size:10.5px">${seguidos.length} en seguimiento · las noticias desde su última versión</div>`}`
      : ''}
    <label class="lab" for="desc-tema" style="margin-top:10px;display:block">${ds.modo === 'libre' ? '2 · Pregunta' : `${ds.modo === 'nuevas' ? '2' : '3'} · Tema o pregunta (opcional)`}</label><input id="desc-tema" class="inp" style="width:100%;box-sizing:border-box" data-entrada-texto="desc-tema" value="${ds.tema}" maxlength="2000" placeholder="${ds.modo === 'nuevas' ? 'p. ej. salud, defensa, India, bonos ligados a inflación…' : '¿Qué fondos indexados hay de…?'}">
    <div class="entre" style="margin-top:10px"><span class="lab" style="margin:0">Filtros</span><button type="button" class="go" data-accion="desc-editar-listas" style="font-size:10px">editar</button></div><div>${(m.ajustes.descubrir_filtros ?? []).map((t) => html`<button type="button" class="chip ck ${filtros.has(t) ? 'on' : ''}" data-accion="desc-filtro-uso" data-id="${t}" aria-pressed="${filtros.has(t) ? 'true' : 'false'}">${t}</button>`)}</div>
    <label class="tg" style="border:0;margin-top:4px"><input type="checkbox" data-cambio="desc-clases" ${ds.misClases ? 'checked' : ''}><span style="font-size:11px">Tener en cuenta mis clases de activo<div class="mut" style="font-size:10px">solo nombres (${m.clases.slice(0, 3).map((c) => c.nombre).join(', ') || 'ninguna'}…), nunca importes</div></span></label>
    <div class="lab" style="margin-top:8px">Profundidad</div><div>${PROF.map(([k, t]) => html`<button type="button" class="chip ck ${ds.profundidad === k ? 'on' : ''}" data-accion="desc-prof" data-id="${k}" aria-pressed="${ds.profundidad === k ? 'true' : 'false'}">${t}</button>`)}</div>
    <div class="mut" style="font-size:10.5px;margin:10px 0">🔒 Trabajo <b style="font-weight:500;color:var(--text-primary)">descubrir</b>: con internet · <b style="font-weight:500;color:var(--text-primary)">sin</b> tus importes, gastos ni metas · el encaje con tu cartera se calcula después, sin internet</div>
    <button type="button" class="pri" style="width:100%" data-accion="desc-investigar" ${puede ? '' : 'disabled'}>${enMarcha ? html`<span class="think">Rex investigando</span>` : '🔭 Investigar con Claude'}</button>
    ${progresoHtml(ds.prog, { que: 'Rex está investigando…' })}${ds.prog.fase === 'hecho' ? errorHtml(ds.prog.resultado) : ''}
    <div class="mut" style="font-size:10px;margin-top:6px">Es para informarte. Los cambios en tu cartera los haces tú.</div></div>`;
}

function mapa(m, hoy) {
  const mp = D.mapaEfectos(m, hoy, 4);
  const color = (s) => (s === '▲' ? '#1D9E75' : s === '▼' ? '#E24B4A' : 'var(--text-muted)');
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Mapa de efectos del pulso · últimas 4 semanas</span><span class="mut" style="font-size:10.5px">posible efecto · especulación · contexto, no causa <button type="button" class="go" data-accion="desc-editar-listas" style="font-size:10px">sectores</button></span></div>
    ${mp.filas.length ? html`<table class="tb" style="margin-top:6px" data-mapa-efectos><thead><tr><th scope="col">sector</th>${mp.semanas.map((s) => html`<th scope="col" style="text-align:center" title="${s.desde} → ${s.hasta}">sem ${s.id.slice(-2)}</th>`)}<th scope="col">lectura</th></tr></thead><tbody>${mp.filas.map((f, i) => html`<tr><td>${f.sector.replace(/-/g, ' ')}</td>${f.celdas.map((c, j) => html`<td style="text-align:center;font-size:13px;color:${color(c.signo)}">${c.notas.length ? html`<button type="button" class="celda-efecto" data-accion="desc-celda" data-fila="${i}" data-col="${j}" aria-label="${f.sector}, semana ${mp.semanas[j].id.slice(-2)}: ${c.signo} (${c.notas.length} notas)" style="background:none;border:0;color:inherit;font:inherit;cursor:pointer">${c.signo}</button>` : html`<span class="mut" aria-label="sin notas">·</span>`}</td>`)}<td class="mut" style="font-size:10.5px">${f.lectura}</td></tr>`)}</tbody></table>` : html`<div class="mut" style="font-size:11px">Sin sectores: añádelos en «sectores».</div>`}
    <div class="mut" style="font-size:10.5px;margin-top:4px">Sale del campo «efectos» de las notas de Mundo: ▲ si hay al menos 2 notas a favor más que en contra, ▼ al revés, • si no. Las flechas son la lectura del modelo, no una predicción.</div></div>`;
}

function propuestas(m) {
  const p = ds.propuestas;
  if (!p) return '';
  const r = p.resultado;
  const seg = p.modo === 'seguimiento';
  return html`<div class="box" style="margin-top:8px;border:1px solid var(--border-strong)" data-propuestas><div class="entre"><b style="font-weight:500;font-size:12.5px">${seg ? `¿Qué ha cambiado en ${p.anterior}?` : `Propuestas de Claude · ${r.json.descubrimientos.length}`}</b><button type="button" class="go" data-accion="desc-propuestas-cerrar">cerrar</button></div>
    <div class="mut" style="font-size:10.5px">Nada se ha guardado: revisa cada una y guárdala si te interesa. ${r.modelo ? `· ${r.modelo}` : ''}</div>${avisosHtml(r.avisos)}
    ${r.texto ? html`<div style="font-size:11.5px;white-space:pre-wrap;margin-top:6px">${r.texto.slice(0, 1500)}</div>` : ''}
    ${seg && !r.json.descubrimientos.length ? html`<div style="font-size:11.5px;margin-top:6px">Sin cambios relevantes${r.json.cambios ? `: ${r.json.cambios}` : ''}.</div><div style="margin-top:6px"><button type="button" class="pri" data-accion="desc-guardar-sin-cambios" ${ds.guardadas.has(0) ? 'disabled' : ''}>${m.ajustes.descubrir_sin_cambios === 'nada' ? 'aplazar la revisión' : 'guardar versión «sin cambios relevantes»'}</button></div>` : ''}
    ${r.json.descubrimientos.map((d, i) => html`<div style="border-top:0.5px solid var(--border);padding:8px 0;margin-top:6px;border-left:3px solid ${COL[d.postura] ?? 'var(--gris)'};padding-left:8px"><b style="font-weight:500">${d.titulo}</b> <span class="mut" style="font-size:10.5px">· ${d.tipo} · ${d.postura} · confianza ${d.confianza} · revisar en ${d.revisar_en_dias} días</span>
      <div style="font-size:11.5px;margin-top:4px">${d.tesis} ${citas(d.citas)}</div>
      ${seg && r.json.cambios ? html`<div style="font-size:11px;margin-top:2px"><span class="mut">cambios:</span> ${r.json.cambios}</div>` : ''}
      <div style="font-size:11px;margin-top:2px"><span class="mut">riesgos:</span> ${d.riesgos}</div><div style="font-size:11px"><span class="mut">la invalidaría:</span> ${d.la_invalidaria}</div>
      <div style="font-size:11px"><span class="mut">para informarte:</span> ${d.vehiculos.map((v) => `${v.nombre}${v.isin ? ` (${v.isin})` : ''}`).join(' · ') || '—'}</div>
      ${d.prediccion ? html`<div class="mut" style="font-size:10.5px">◎ predicción: «${d.prediccion.texto}» (${d.prediccion.horizonte})</div>` : ''}
      <div style="margin-top:4px">${afirmaciones(d.afirmaciones.map((a) => `[${a.tipo}] ${a.texto}`).join(' · '))}</div>
      <div style="margin-top:6px"><button type="button" class="pri" data-accion="desc-guardar" data-i="${i}" ${ds.guardadas.has(i) ? 'disabled' : ''}>${ds.guardadas.has(i) ? 'guardado' : seg ? 'guardar como nueva versión' : 'guardar descubrimiento'}</button></div></div>`)}</div>`;
}

function tarjeta(m, d, hoy) {
  const c = d.ultima;
  const rd = D.rendimientoDesde(d, m);
  const vsNombre = m.series.find((s) => s.id === (d.vs ?? D.VS_DEFECTO))?.titulo?.replace(/^Serie · /, '') ?? 'MSCI World';
  const preds = prediccionesDe(m, d);
  const toca = d.estado === 'siguiendo' && d.revisar && d.revisar <= hoy;
  return html`<div class="box" style="margin-bottom:8px;border-left:3px solid ${COL[d.postura] ?? 'var(--gris)'}" data-descubrimiento="${d.id}"><div class="entre" style="gap:8px;flex-wrap:wrap;align-items:flex-start"><div><b style="font-weight:500;font-size:12.5px">${d.titulo}</b> <span class="mut" style="font-size:10.5px">· ${d.tipo ?? ''} · ${d.id} · ${d.version}</span><div class="mut" style="font-size:10.5px">origen: ${d.origen ?? '—'} · ${d.descubierto ? textoCorto(d.descubierto) : '—'} · revisar: ${d.revisar ? textoCorto(d.revisar) : '—'}${toca ? html` <b style="font-weight:500;color:var(--text-warning)">· toca revisar</b>` : ''}</div></div>
    <div style="text-align:right"><span class="chip" style="border-color:${COL[d.postura]};color:${COL[d.postura]}">${d.postura ?? '—'}</span><span class="chip">confianza ${d.confianza ?? '—'}</span><span class="chip ${d.estado === 'siguiendo' ? 'on' : ''}">${d.estado ?? 'nuevo'}</span>
      <div style="font-size:10.5px;margin-top:2px" data-rendimiento>${rd ? html`desde el descubrimiento: <b style="font-weight:500;color:${rd.ref >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}">${pctT(rd.ref)}</b> <span class="mut">frente al ${vsNombre} ${pctT(rd.vs)}</span>` : html`<span class="mut">desde el descubrimiento: —${d.referencia ? '' : ' (sin referencia)'}</span>`}</div></div></div>
    <div style="font-size:11.5px;margin-top:6px">${c.tesis ?? ''} ${citas(c.citas)}</div>
    ${c.riesgos ? html`<div style="font-size:11px;margin-top:4px"><span class="mut">riesgos:</span> ${c.riesgos}</div>` : ''}${c.vehiculos ? html`<div style="font-size:11px;margin-top:2px"><span class="mut">para informarte:</span> ${c.vehiculos}</div>` : ''}
    ${preds.map((p) => html`<div style="font-size:10.5px;margin-top:2px" class="mut">${p.estado === 'acertada' ? '🎉' : '◎'} predicción registrada (${p.id}): «${p.texto}» · ${p.estado}</div>`)}
    <div class="fila" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button type="button" class="go" data-accion="desc-informe" data-id="${d.id}">ver informe</button><button type="button" class="go pri" data-accion="desc-encaje" data-id="${d.id}">¿cómo encaja con mi cartera?</button><button type="button" class="go" data-accion="desc-sim" data-id="${d.id}">probar en simulador</button><button type="button" class="go" data-accion="desc-estado" data-id="${d.id}" data-estado="${d.estado === 'siguiendo' ? 'nuevo' : 'siguiendo'}">${d.estado === 'siguiendo' ? 'dejar de seguir' : 'seguir'}</button><button type="button" class="go" data-accion="desc-cambio" data-id="${d.id}" ${ds.prog.fase === 'trabajando' ? 'disabled' : ''}>¿qué ha cambiado?</button>${d.estado !== 'descartado' ? html`<button type="button" class="go" data-accion="desc-estado" data-id="${d.id}" data-estado="descartado">descartar</button>` : ''}${d.estado !== 'archivado' ? html`<button type="button" class="go" data-accion="desc-estado" data-id="${d.id}" data-estado="archivado">archivar</button>` : ''}<button type="button" class="go" data-accion="desc-borrar" data-id="${d.id}" aria-label="borrar ${d.titulo}">borrar</button></div></div>`;
}

function acierto(m) {
  const ps = m.predicciones.filter((p) => p.fuente === 'finhub-descubrir');
  if (!ps.length) return '';
  const ok = ps.filter((p) => p.estado === 'acertada').length;
  const mal = ps.filter((p) => p.estado === 'fallida').length;
  return html`<div class="mut" style="font-size:10.5px;margin-top:6px">Predicciones de los descubrimientos (aparte de las de tus fuentes): ${ok + mal ? `${ok} de ${ok + mal} acertadas` : 'ninguna resuelta aún'} · ${ps.filter((p) => p.estado === 'pendiente').length} pendientes.</div>`;
}

// ---------- modales ----------
function cuerpoInforme() {
  const m = est().modelo;
  const d = m.descubrimientos.find((x) => x.id === inf.id);
  if (!d) return html`<div class="mut">Ese descubrimiento ya no existe.</div>`;
  const v = d.versiones.find((x) => x.id === inf.version) ?? d.versiones[0];
  const i = d.versiones.indexOf(v);
  const ant = d.versiones[i + 1] ?? null;
  const c = v?.campos ?? {};
  const CAMPOS = [['tesis', 'Tesis'], ['saldria_bien_si', 'Qué tendría que pasar para que saliera bien'], ['la_invalidaria', 'Qué la invalidaría'], ['riesgos', 'Riesgos'], ['vehiculos', 'Vehículos para informarte']];
  const cambiado = (k) => ant && JSON.stringify(ant.campos[k] ?? null) !== JSON.stringify(c[k] ?? null);
  const encajes = [...m.docs.keys()].filter((r) => r.startsWith(`analisis/encajes/${d.id}-`)).sort().reverse();
  return html`<div class="mut" style="font-size:10.5px">${d.id} · ${d.tipo ?? ''} · ${d.origen ?? ''} · ${d.ruta}</div>
    ${c.cambios ? html`<div class="banda" style="display:block;margin-top:6px;font-size:11px"><b style="font-weight:500">${v.id} · ${textoCorto(v.titulo)}</b>: ${c.cambios}</div>` : ''}
    ${CAMPOS.filter(([k]) => c[k]).map(([k, t]) => html`<div style="padding:7px 0;border-top:0.5px solid var(--border)"><div class="lab" style="margin:0">${t}${cambiado(k) ? html` <span class="chip" style="font-size:9.5px">cambió en ${v.id}</span>` : ''}</div><div style="font-size:11.5px">${c[k]}</div>${cambiado(k) && ant.campos[k] ? html`<div class="mut" style="font-size:10.5px;margin-top:2px"><s>${ant.campos[k]}</s> <span>(${ant.id})</span></div>` : ''}</div>`)}
    ${c.afirmaciones ? html`<div style="padding:7px 0;border-top:0.5px solid var(--border)"><div class="lab" style="margin:0">Afirmaciones</div>${afirmaciones(c.afirmaciones)}</div>` : ''}
    <div style="padding:7px 0;border-top:0.5px solid var(--border)"><div class="lab" style="margin:0">Evidencia</div><div style="font-size:11.5px">${citas(c.citas)}${(c.citas ?? []).filter((x) => x.startsWith('web:')).length ? html` · ${(c.citas ?? []).filter((x) => x.startsWith('web:')).length} fuentes web citadas` : ''}</div></div>
    <div class="lab" style="margin-top:8px">Historial (pulsa una versión para verla y compararla con la anterior)</div><div style="font-size:11px;line-height:1.8">${d.versiones.map((x) => html`<button type="button" class="go ${x === v ? 'pri' : ''}" data-accion="desc-version" data-id="${x.id}" aria-pressed="${x === v ? 'true' : 'false'}">${x.id} · ${textoCorto(x.titulo)}</button> <span class="mut">${x.campos.cambios ?? (x === d.versiones.at(-1) ? 'primera versión' : 'versión anterior')}</span><br>`)}</div>
    ${encajes.length ? html`<div class="lab" style="margin-top:8px">Encajes guardados (privados)</div>${encajes.map((r) => html`<div style="font-size:11px">${r} · ${textoSeccion(m.doc(r), 'Resultado')?.slice(0, 160) ?? ''}</div>`)}` : ''}
    <div class="mut" style="font-size:10.5px;margin-top:8px">No es una recomendación de compra. Cada afirmación lleva su tipo: hecho, consenso, opinión o especulación.</div>`;
}

function cuerpoSim() {
  const e = est();
  const m = e.modelo;
  const d = m.descubrimientos.find((x) => x.id === sim.id);
  if (!d) return html`<div class="mut">Ese descubrimiento ya no existe.</div>`;
  const s = D.simular(m, e.ahora.fecha, d, { pct: sim.pct, de: sim.de });
  const activos = m.activos.filter((a) => !a.campos.archivado);
  return html`<div style="font-size:11.5px;margin:8px 0" class="fila" role="group" aria-label="Simulación"><label for="sim-pct">Si dedicaras</label> <input id="sim-pct" class="inp" type="number" min="0" max="50" step="1" value="${sim.pct}" data-cambio="sim-pct" style="width:56px;text-align:right"> <span>% de la cartera, sacándolo</span> <select class="inp" data-cambio="sim-de" aria-label="de dónde sale"><option value="todo" ${sim.de === 'todo' ? 'selected' : ''}>en proporción de todo</option>${activos.map((a) => html`<option value="activo:${a.id}" ${sim.de === `activo:${a.id}` ? 'selected' : ''}>solo de ${a.titulo}</option>`)}<option value="aportaciones" ${sim.de === 'aportaciones' ? 'selected' : ''}>solo de nuevas aportaciones</option></select></div>
    ${s.error ? html`<div class="banda aviso">${s.error}</div>` : html`<table class="tb" data-simulador><thead><tr><th scope="col"></th><th scope="col" class="n">ahora</th><th scope="col" class="n">con el cambio</th></tr></thead><tbody>
      ${s.clases.map((c) => html`<tr><td>${c.nombre}</td><td class="n mut">${pb(c.antesPb)}</td><td class="n"><b style="font-weight:500">${pb(c.despuesPb)}</b></td></tr>`)}
      ${s.exposicion.antes.slice(0, 3).map((x) => html`<tr><td>Exposición ${x.nombre}</td><td class="n mut">${pb(x.pb)}</td><td class="n"><b style="font-weight:500">${pb(s.exposicion.despues.find((y) => y.nombre === x.nombre)?.pb ?? 0)}</b></td></tr>`)}
      <tr><td>TER medio</td><td class="n mut">${ter(s.ter.antes)}</td><td class="n"><b style="font-weight:500">${ter(s.ter.despues)}</b></td></tr>
      ${s.crisis.map((c) => html`<tr><td>Caída en «${c.nombre}»</td><td class="n mut">${pb(c.antesPb)}</td><td class="n"><b style="font-weight:500">${pb(c.despuesPb)}</b></td></tr>`)}
      <tr><td>Si lo hubieras tenido el último año</td><td class="n mut">${pctT(s.ultimoAnio.antes)}</td><td class="n"><b style="font-weight:500">${pctT(s.ultimoAnio.despues)}</b></td></tr></tbody></table>
      <div class="mut" style="font-size:10.5px;margin-top:4px">Equivale a ${formatearEuros(s.valorNuevo)} de hoy (${pb(s.pesoPb)}).</div>${avisosHtml(s.avisos)}`}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Calculado por código con tus pesos y las series del grupo «Datos». No cambia tu cartera: si te convence, lo haces tú en Cartera.</div>
    <div class="fila" style="gap:6px;margin-top:10px"><button type="button" class="go pri" data-accion="desc-encaje" data-id="${d.id}">¿cómo encaja? (con este %)</button></div>`;
}

function cuerpoEncaje() {
  const m = est().modelo;
  const d = m.descubrimientos.find((x) => x.id === enc.id);
  if (!d) return html`<div class="mut">Ese descubrimiento ya no existe.</div>`;
  const r = enc.prog.resultado;
  const j = r?.estado === 'ok' ? r.resultado.json : null;
  const s = D.simular(m, est().ahora.fecha, d, { pct: sim.id === d.id ? sim.pct : 5, de: sim.id === d.id ? sim.de : 'todo' });
  const anterior = [...m.docs.keys()].filter((x) => x.startsWith(`analisis/encajes/${d.id}-`)).sort().at(-1);
  return html`<div class="mut" style="font-size:10.5px;margin:4px 0 8px">🔒 Trabajo <b style="font-weight:500">encaje</b>: lee el informe (ya validado) y tu cartera · sin internet · se guarda en analisis/encajes/ (privado), nunca junto al descubrimiento</div>
    ${s.error ? '' : html`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${[['Dedicarías', pb(s.pesoPb), sim.id === d.id ? (sim.de === 'todo' ? 'en proporción de todo' : sim.de === 'aportaciones' ? 'de nuevas aportaciones' : 'de un activo') : 'por defecto (5 %)'], ['TER medio', ter(s.ter.despues), `ahora ${ter(s.ter.antes)}`], ['El último año', pctT(s.ultimoAnio.despues), `ahora ${pctT(s.ultimoAnio.antes)}`]].map((x) => html`<div style="background:var(--surface-1);border-radius:8px;padding:7px 9px"><div class="mut" style="font-size:10.5px">${x[0]}</div><div style="font-size:15px;font-weight:500">${x[1]}</div><div class="mut" style="font-size:10px">${x[2]}</div></div>`)}</div>`}
    ${progresoHtml(enc.prog, { que: 'Claude está mirando cómo encaja…' })}${enc.prog.fase === 'hecho' ? errorHtml(r) : ''}
    ${j ? html`<div data-encaje-resultado style="margin-top:10px"><div style="font-size:11.5px"><span class="mut">Ya tienes:</span> ${j.ya_tienes}</div><div style="font-size:11.5px;margin-top:4px"><span class="mut">Solapamiento:</span> ${j.solapamiento}</div><div style="font-size:11.5px;line-height:1.7;margin-top:6px;white-space:pre-wrap">${j.comentario_md}</div>${citas(j.citas)}${avisosHtml(r.resultado.avisos)}</div>` : !enc.prog.fase || enc.prog.fase === 'listo' ? html`<div class="mut" style="font-size:11px;margin-top:8px">${anterior ? `Último encaje guardado: ${anterior}` : 'Aún no has pedido el encaje de este descubrimiento.'}</div>` : ''}
    <div class="fila" style="gap:6px;margin-top:10px;flex-wrap:wrap">${j && !enc.ruta ? html`<button type="button" class="pri" data-accion="encaje-guardar">guardar en privado</button>` : ''}${enc.ruta ? html`<span class="mut" style="font-size:10.5px">guardado en ${enc.ruta}</span>` : ''}<button type="button" class="go ${j ? '' : 'pri'}" data-accion="encaje-pedir" ${enc.prog.fase === 'trabajando' ? 'disabled' : ''}>${j ? 'pedir de nuevo' : '¿cómo encaja? · pedir a Claude'}</button><button type="button" class="go" data-accion="desc-sim" data-id="${d.id}">probar un % en el simulador</button><button type="button" class="go" data-accion="encaje-pausa" data-id="${d.id}">pausa de 48 h</button><button type="button" class="go" data-accion="encaje-diario" data-id="${d.id}">al diario de decisiones</button></div>`;
}

function cuerpoListas() {
  const m = est().modelo;
  return html`<form data-form="desc-listas"><label class="lab" for="dl-sect">Sectores del mapa de efectos (uno por línea, ids en minúsculas con guiones)</label><textarea id="dl-sect" class="inp" name="sectores" rows="7" style="width:100%;box-sizing:border-box">${(m.ajustes.sectores_efectos ?? []).join('\n')}</textarea>
    <label class="lab" for="dl-filt" style="margin-top:8px;display:block">Filtros de Descubrimientos (uno por línea)</label><textarea id="dl-filt" class="inp" name="filtros" rows="5" style="width:100%;box-sizing:border-box">${(m.ajustes.descubrir_filtros ?? []).join('\n')}</textarea>
    <div class="mut" style="font-size:10.5px">Se guardan en ajustes.md. Los sectores también los usa el pulso para rellenar «efectos».</div><div style="text-align:right;margin-top:8px"><button type="submit" class="pri">Guardar</button></div></form>`;
}

// ---------- acciones ----------
function parametros(m) {
  const p = { modo: ds.modo, tema: ds.tema.trim(), filtros: [...filtrosDe(m)], misClases: ds.misClases, profundidad: ds.profundidad };
  if (ds.modo === 'pulso' || ds.modo === 'seguimiento') Object.assign(p, { periodo: ds.periodo }, ds.periodo === 'rango' ? { desde: ds.desde, hasta: ds.hasta } : {});
  if (ds.modo === 'seguimiento') p.id = ds.segId;
  return p;
}

async function investigar() {
  const m = est().modelo;
  const params = parametros(m);
  ds.propuestas = null;
  ds.guardadas = new Set();
  const r = await ejecutarCon(ds.prog, 'descubrir', params, { repintar, desclasificar: ds.misClases });
  if (r?.estado === 'ok') {
    const hoy = est().ahora.fecha;
    const desde = ds.periodo === 'rango' ? ds.desde : sumarDias(hoy, -{ hoy: 0, '1s': 7, '1m': 30, '3m': 91 }[ds.periodo]);
    const origen = { pulso: `pulso ${desde} → ${ds.periodo === 'rango' ? ds.hasta : hoy}`, nuevas: `nuevas ideas${params.tema ? `: ${params.tema}` : ''}`, libre: `pregunta: ${params.tema}`, seguimiento: `seguimiento de ${ds.segId}` }[ds.modo];
    ds.propuestas = { modo: ds.modo, anterior: ds.segId, origen: origen.slice(0, 200), resultado: r.resultado };
    if (!r.resultado.json.descubrimientos.length && ds.modo !== 'seguimiento') toast('Claude no ha encontrado nada con evidencia suficiente');
  }
  repintar();
}

async function pedirEncaje() {
  const params = { descubrimiento: enc.id, ...(sim.id === enc.id ? { pct: sim.pct, de: sim.de } : {}) };
  enc.ruta = null;
  await ejecutarCon(enc.prog, 'encaje', params);
}

function abrirInforme(id) {
  Object.assign(inf, { id, version: null });
  const d = est().modelo.descubrimientos.find((x) => x.id === id);
  abrir({ titulo: d ? d.titulo : id, cuerpo: cuerpoInforme, ancho: true });
}

export function abrirSim(id) {
  if (sim.id !== id) Object.assign(sim, { id, pct: 5, de: 'todo' });
  const d = est().modelo.descubrimientos.find((x) => x.id === id);
  abrir({ titulo: `Simulador · ${d?.titulo ?? id}`, cuerpo: cuerpoSim, ancho: true });
}

function abrirEncaje(id) {
  if (enc.id !== id || enc.prog.fase !== 'trabajando') Object.assign(enc, { id, prog: nuevoProgreso(), ruta: null });
  const d = est().modelo.descubrimientos.find((x) => x.id === id);
  abrir({ titulo: `¿Cómo encaja con tu cartera? · ${d?.titulo ?? id}`, cuerpo: cuerpoEncaje, ancho: true });
}

/** Desde Pendientes: «Precios de lo que sigues» → trabajo «precios» (solo los ISIN) y tú confirmas. */
const pr = { prog: nuevoProgreso(), propuestos: null };
function cuerpoPrecios() {
  const m = est().modelo;
  const seguidos = D.isinsSeguidos(m);
  return html`<div class="mut" style="font-size:11px;margin:6px 0">Precios de los vehículos de referencia de lo que sigues. El trabajo <b style="font-weight:500">precios</b> solo recibe estos ISIN y nombres (con internet, sin tus datos). Tú confirmas antes de guardar en conocimiento/datos/series/.</div>
    ${seguidos.map((s) => html`<div class="pd" style="grid-template-columns:1fr auto"><span>${s.nombre} <span class="mut">${s.isin}</span></span><span class="mut" style="font-size:10.5px">último: ${D.ultimoPrecio(m, s.isin) ?? '—'}</span></div>`)}
    ${progresoHtml(pr.prog, { que: 'Claude está buscando precios…' })}${pr.prog.fase === 'hecho' ? errorHtml(pr.prog.resultado) : ''}
    ${pr.propuestos ? html`<table class="tb" style="margin-top:8px" data-precios-seguimiento><thead><tr><th scope="col">ISIN</th><th scope="col" class="n">precio</th><th scope="col">fecha</th><th scope="col">origen</th></tr></thead><tbody>${pr.propuestos.map((p) => html`<tr><td>${p.isin}</td><td class="n">${p.valor.toLocaleString('es-ES')} ${p.divisa}</td><td>${p.fecha}</td><td class="mut" style="font-size:10.5px">${p.origen}</td></tr>`)}</tbody></table>` : ''}
    <div class="entre" style="margin-top:10px"><button type="button" data-accion="seg-precios-buscar" ${seguidos.length && pr.prog.fase !== 'trabajando' ? '' : 'disabled'}>Buscar precios con Claude</button><button type="button" class="pri" data-accion="seg-precios-guardar" ${pr.propuestos?.length ? '' : 'disabled'}>Guardar precios</button></div>`;
}
export function abrirPreciosSeguimiento() {
  if (pr.prog.fase !== 'trabajando') Object.assign(pr, { prog: nuevoProgreso(), propuestos: null });
  abrir({ titulo: 'Precios de lo que sigues', cuerpo: cuerpoPrecios, ancho: true });
}

export function registrarAccionesDescubrimientos() {
  accion('desc-modo', (el) => {
    ds.modo = el.dataset.id;
    repintar();
  });
  accion('desc-periodo', (el) => {
    ds.periodo = el.dataset.id;
    repintar();
  });
  cambio('desc-desde', (el) => ((ds.desde = el.value), repintar()));
  cambio('desc-hasta', (el) => ((ds.hasta = el.value), repintar()));
  cambio('desc-seg', (el) => ((ds.segId = el.value || null), repintar()));
  entrada('desc-tema', (el) => {
    const antes = !!ds.tema.trim();
    ds.tema = el.value;
    if (antes !== !!ds.tema.trim()) repintar();
  });
  accion('desc-filtro-uso', (el) => {
    const f = filtrosDe(est().modelo);
    f.has(el.dataset.id) ? f.delete(el.dataset.id) : f.add(el.dataset.id);
    repintar();
  });
  cambio('desc-clases', (el) => ((ds.misClases = el.checked), repintar()));
  accion('desc-prof', (el) => {
    ds.profundidad = el.dataset.id;
    repintar();
  });
  accion('desc-filtro', (el) => {
    ds.filtro = el.dataset.id;
    repintar();
  });
  accion('desc-investigar', investigar);
  accion('desc-cambio', (el) => {
    Object.assign(ds, { modo: 'seguimiento', segId: el.dataset.id });
    investigar();
    document.querySelector('[data-accion="desc-investigar"]')?.scrollIntoView?.({ block: 'nearest' });
  });
  accion('desc-propuestas-cerrar', () => {
    ds.propuestas = null;
    repintar();
  });
  accion('desc-guardar', async (el) => {
    const i = +el.dataset.i;
    const p = ds.propuestas;
    const d = p.resultado.json.descubrimientos[i];
    const hoy = est().ahora.fecha;
    const r = p.modo === 'seguimiento'
      ? await op('descubrimiento.version', { id: p.anterior, fecha: hoy, d, cambios: p.resultado.json.cambios ?? null }, { mensaje: (x) => `Nueva versión ${x.resultado.version} de ${p.anterior}` })
      : await op('descubrimiento.crear', { fecha: hoy, origen: p.origen, d }, { mensaje: (x) => `Guardado como ${x.resultado.id}${x.resultado.prediccion ? ` · predicción ${x.resultado.prediccion} registrada` : ''}` });
    if (r) ds.guardadas.add(i);
    repintar();
  });
  accion('desc-guardar-sin-cambios', async () => {
    const p = ds.propuestas;
    const r = await op('descubrimiento.version', { id: p.anterior, fecha: est().ahora.fecha, sinCambios: true, cambios: p.resultado.json.cambios ?? null }, { mensaje: (x) => (x.resultado.version ? `Versión ${x.resultado.version}: sin cambios relevantes` : 'Revisión aplazada') });
    if (r) ds.guardadas.add(0);
    repintar();
  });
  accion('desc-celda', (el) => {
    const m = est().modelo;
    const mp = D.mapaEfectos(m, est().ahora.fecha, 4);
    const f = mp.filas[+el.dataset.fila];
    const s = mp.semanas[+el.dataset.col];
    const c = f.celdas[+el.dataset.col];
    abrir({ titulo: `${f.sector.replace(/-/g, ' ')} · semana ${s.id.slice(-2)} (${textoCorto(s.desde)} – ${textoCorto(s.hasta)})`, cuerpo: html`<div class="mut" style="font-size:10.5px;margin:4px 0 8px">posible efecto · especulación · contexto, no causa · neto ${c.neto > 0 ? '+' : ''}${c.neto}</div>${c.notas.map((n) => html`<div class="pd" style="grid-template-columns:auto 1fr"><span style="color:${n.efecto === '▲' ? '#1D9E75' : n.efecto === '▼' ? '#E24B4A' : 'var(--text-muted)'}">${n.efecto}</span><span><span class="cit">[${n.id}]</span> ${n.titulo}</span></div>`)}` });
  });
  accion('desc-informe', (el) => abrirInforme(el.dataset.id));
  accion('desc-version', (el) => {
    inf.version = el.dataset.id;
    repintarModal();
  });
  accion('desc-sim', (el) => abrirSim(el.dataset.id));
  cambio('sim-pct', (el) => {
    sim.pct = Math.max(0, Math.min(50, Math.round(+el.value || 0)));
    repintarModal();
  });
  cambio('sim-de', (el) => {
    sim.de = el.value;
    repintarModal();
  });
  accion('desc-encaje', (el) => abrirEncaje(el.dataset.id));
  accion('encaje-pedir', pedirEncaje);
  accion('encaje-guardar', async () => {
    const r = enc.prog.resultado;
    const m = est().modelo;
    const d = m.descubrimientos.find((x) => x.id === enc.id);
    const x = await op('encaje.guardar', { fecha: est().ahora.fecha, descubrimiento: enc.id, version: d?.versiones[0]?.id ?? null, ejecucion: r.resultado.ejecucion, modelo: r.resultado.modelo, cifras: r.resultado.cifras, json: r.resultado.json, avisos: r.resultado.avisos }, { mensaje: (y) => `Encaje guardado en ${y.resultado.ruta}` });
    if (x) enc.ruta = x.resultado.ruta;
    repintarModal();
  });
  accion('encaje-pausa', (el) => {
    const d = est().modelo.descubrimientos.find((x) => x.id === el.dataset.id);
    cerrar();
    rexHacia('pausa', { idea: d ? `${d.titulo} (${d.id})` : '' });
  });
  accion('encaje-diario', async (el) => {
    const m = est().modelo;
    const d = m.descubrimientos.find((x) => x.id === el.dataset.id);
    if (!d) return;
    const j = enc.id === d.id && enc.prog.resultado?.estado === 'ok' ? enc.prog.resultado.resultado.json : null;
    const hoy = est().ahora.fecha;
    await op('decision.crear', { titulo: `Idea: ${d.titulo}`, fecha: hoy, estado: 'lista', revisar: sumarDias(hoy, 30), origen: `descubrimiento ${d.id}${enc.ruta ? ` · ${enc.ruta}` : ''}`, secciones: { Qué: `Estudiar «${d.titulo}» (${d.id}).`, 'Por qué': d.versiones[0]?.campos.tesis ?? '', ...(j ? { Alternativas: j.comentario_md.slice(0, 1500) } : {}) } }, { mensaje: (x) => `Al diario de decisiones: ${x.resultado.ruta}` });
  });
  accion('desc-estado', (el) => {
    const id = el.dataset.id;
    const nuevo = el.dataset.estado;
    op('descubrimiento.estado', { id, estado: nuevo }, { mensaje: { siguiendo: `Sigues ${id}`, nuevo: `Dejas de seguir ${id}`, descartado: `${id} descartado`, archivado: `${id} archivado` }[nuevo] ?? 'Hecho' });
  });
  accion('desc-borrar', async (el) => {
    const id = el.dataset.id;
    if (await confirmar(`¿Borrar ${id} y todas sus versiones? Irá a la papelera 30 días (los encajes guardados no se tocan).`, { si: 'Borrar' })) op('fichero.borrar', { ruta: `conocimiento/descubrimientos/${id}.md`, que: `descubrimiento ${id}` }, { mensaje: `${id} borrado` });
  });
  accion('desc-editar-listas', () => abrir({ titulo: 'Sectores del mapa y filtros', cuerpo: cuerpoListas }));
  formulario('desc-listas', async (f, datos) => {
    const lista = (t) => [...new Set(String(t ?? '').split('\n').map((x) => x.trim()).filter(Boolean))];
    const sectores = lista(datos.sectores).map((x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const ok = await op('descubrir.listas', { sectores, filtros: lista(datos.filtros) }, { mensaje: 'Sectores y filtros guardados' });
    ds.filtros = null;
    if (ok) cerrar();
  });
  // precios de lo que sigues (desde Pendientes)
  accion('seg-precios-buscar', async () => {
    pr.propuestos = null;
    const r = await ejecutarCon(pr.prog, 'precios', { seguimiento: true });
    if (r?.estado === 'ok') pr.propuestos = r.resultado.json.precios;
    repintarModal();
  });
  accion('seg-precios-guardar', async () => {
    const r = await op('precios.seguimiento', { precios: pr.propuestos }, { mensaje: (x) => `${x.resultado.series.length} precios guardados` });
    if (r) cerrar();
  });
}

