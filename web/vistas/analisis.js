// Pestaña Análisis (§5, maqueta: analisis()): tarea, rol y mezcla; «Analizar con Claude» (trabajo privado:
// tus datos y tu base, sin internet); comparar con otra mezcla; escenarios con probabilidad subjetiva y rangos
// del CÓDIGO, ideas para estudiar, abogado del diablo, ¿qué opinan?, pausa de 48 h, seguir en Rex,
// calibración e historial. Cada análisis se guarda en analisis/ (privado) y su rango base queda registrado.
import { html } from '../esc.js';
import { accion, cambio, entrada } from '../acciones.js';
import { op, obtener } from '../api.js';
import { abrir, confirmar } from '../componentes/modal.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml, avisosHtml } from '../componentes/claude.js';
import { datosConocimiento } from './conocimiento.js';
import { rexHacia } from './rex.js';
import * as K from '/core/conocimiento.js';
import { rangos12m, filasCartera, historicoMezcla, componentesDe } from '/core/herramientas.js';
import { formatearPct } from '/core/dinero.js';
import { sumarDias, textoCorto } from '/core/fechas.js';
import { textoSeccion } from '/core/formato/motor.js';

const OCULTAS = new Set(['explicame', 'pausa-48h', 'tu-ano', 'revisar-cartera-base', 'abogado-diablo']);
const an = { catalogo: null, tarea: 'escenarios-12m', rol: '', pregunta: '', comparar: false, mezclaB: null, progA: nuevoProgreso(), progB: nuevoProgreso(), ruta: null, diablo: nuevoProgreso() };
let contexto = null;
export const iniciarAnalisis = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();

async function catalogo() {
  if (an.catalogo === null) {
    an.catalogo = { tareas: [], roles: [] };
    try {
      an.catalogo = await obtener('/api/claude/tareas');
    } catch {
      /* sin servidor */
    }
    repintar();
  }
  return an.catalogo;
}

/** Texto con las citas [ID] resaltadas (escapado siempre). */
export function textoConCitas(texto) {
  return String(texto ?? '').split(/(\[[A-Z]{1,4}-\d{2,6}(?:-\d{2})?\])/).map((p, i) => (i % 2 ? html`<span class="cit">${p}</span>` : p));
}

function rangos(m) {
  const r = rangos12m(historicoMezcla(componentesDe(filasCartera(m), m.clases), (id) => m.serie(id)));
  return r.error ? null : r;
}
const rango = (a) => `${formatearPct(a[0], 0)} … ${formatearPct(a[1], 0)}`;

export function vistaAnalisis(estado) {
  catalogo();
  const m = estado.modelo;
  const d = datosConocimiento(estado);
  const tareas = (an.catalogo?.tareas ?? []).filter((t) => t.trabajo === 'privado' && !OCULTAS.has(t.id));
  const roles = (an.catalogo?.roles ?? []).filter((r) => r.trabajo === 'privado');
  const activas = d.resumen.filter((r) => r.activa).map((r) => r.id);
  const nombre = K.nombreMezclaActiva(activas, m.mezclas, d.resumen);
  const t = tareas.find((x) => x.id === an.tarea) ?? tareas[0];
  const ocupado = an.progA.fase === 'trabajando' || an.progB.fase === 'trabajando';
  return html`<div style="display:grid;grid-template-columns:250px minmax(0,1fr);gap:8px">
    <div class="box"><div class="lab">1 · Tarea</div>${tareas.length ? tareas.map((x) => html`<label class="tg" style="cursor:pointer"><input type="radio" name="tarea" data-cambio="an-tarea" value="${x.id}" ${x.id === t?.id ? 'checked' : ''}><span style="font-size:11.5px">${x.titulo}${x.origen === 'carpeta' ? html` <span class="mut">· tuya</span>` : ''}</span></label>`) : html`<div class="mut" style="font-size:11px">Cargando tareas…</div>`}
      <label class="lab" style="margin-top:12px;display:block" for="an-rol">2 · Rol experto</label><select class="inp" id="an-rol" data-cambio="an-rol" style="width:100%"><option value="">— sin rol</option>${roles.map((r) => html`<option value="${r.id}" ${r.id === an.rol ? 'selected' : ''}>${r.titulo}</option>`)}</select>
      <div class="lab" style="margin-top:12px">3 · Conocimiento</div><div class="mut" style="font-size:11px">Tu mezcla: <b style="font-weight:500;color:var(--text-primary)">${nombre}</b> · ${activas.length} fuentes <button type="button" class="enlace" data-accion="vista" data-vista="conocimiento">cambiar</button></div>
      <label class="tg" style="border:0;margin-top:6px"><input type="checkbox" data-cambio="an-comparar" ${an.comparar ? 'checked' : ''}><span style="font-size:11px">Comparar con otra mezcla</span></label>
      ${an.comparar ? html`<select class="inp" data-cambio="an-mezcla-b" aria-label="Otra mezcla" style="width:100%">${m.mezclas.map((x) => html`<option value="${x.id}" ${x.id === (an.mezclaB ?? m.mezclas[0]?.id) ? 'selected' : ''}>${x.nombre}</option>`)}</select>` : ''}
      ${t && t.esquema === 'chat' ? html`<label class="sr-only" for="an-pregunta">Pregunta</label><textarea class="inp" id="an-pregunta" rows="3" data-entrada-texto="an-pregunta" placeholder="Tu pregunta (opcional)" style="width:100%;margin-top:8px">${an.pregunta}</textarea>` : ''}
      <div class="mut" style="font-size:10.5px;margin:8px 0">🔒 Trabajo <b style="font-weight:500;color:var(--text-primary)">privado</b>: tus datos y tu base · sin internet</div>
      <button type="button" class="pri" data-accion="an-analizar" style="width:100%" ${t && !ocupado ? '' : 'disabled'}>Analizar con Claude</button></div>
    <div>${cajaResultado(estado, t, nombre)}${cajaCalibracion(m)}${cajaHistorial(m)}</div></div>`;
}

function tablaEscenarios(json, rg, lbl = null) {
  const r = { base: rg?.base, optimista: rg?.optimista, pesimista: rg?.pesimista };
  return html`<table class="tb"><thead><tr><th>escenario${lbl ? ` · ${lbl}` : ''}</th><th class="n">prob.*</th><th>tu cartera en 12 m</th>${lbl ? '' : html`<th>qué lo haría probable</th>`}</tr></thead><tbody>${json.escenarios.map((e) => html`<tr><td>${e.nombre}</td><td class="n"><b style="font-weight:500">${e.prob} %</b></td><td class="mut">${r[e.nombre] ? rango(r[e.nombre]) : '—'}</td>${lbl ? '' : html`<td class="mut" style="font-size:11px">${textoConCitas(e.porque)}</td>`}</tr>`)}</tbody></table>`;
}

function cuerpoRespuesta(t, res, rg, lbl = null) {
  if (!res || res.estado !== 'ok') return errorHtml(res);
  const j = res.resultado.json;
  if (j.escenarios) return html`${tablaEscenarios(j, rg, lbl)}${j.no_concluyente ? html`<div class="mut" style="font-size:11px">no concluyente</div>` : ''}`;
  if (j.ideas) return '';
  return html`<div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${textoConCitas(j.respuesta_md ?? j.texto_md ?? '')}</div>`;
}

function cajaResultado(estado, t, nombre) {
  const m = estado.modelo;
  const rg = rangos(m);
  const a = an.progA.resultado;
  const b = an.progB.resultado;
  const j = a?.estado === 'ok' ? a.resultado.json : null;
  const titulo = t ? `${t.titulo}${an.rol ? ` · ${(an.catalogo?.roles ?? []).find((r) => r.id === an.rol)?.titulo ?? ''}` : ''}` : 'Análisis';
  const vacio = an.progA.fase === 'listo';
  return html`<div class="box" data-resultado-analisis><div class="entre"><span class="lab" style="margin:0">${titulo}</span><span class="mut" style="font-size:10.5px">${an.ruta ?? ''}</span></div>
    ${progresoHtml(an.progA, { que: 'Rex está analizando con tus datos…' })}${progresoHtml(an.progB, { que: 'Y ahora con la otra mezcla…' })}
    ${vacio ? html`<div class="mut" style="font-size:11.5px;padding:14px 0">Elige una tarea y pulsa «Analizar con Claude». Las cifras las calcula el código; Claude pone la probabilidad subjetiva y las ideas, citando tus notas.</div>` : ''}
    ${an.progA.fase === 'hecho' ? (an.comparar && b ? html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div>${cuerpoRespuesta(t, a, rg, nombre)}</div><div>${cuerpoRespuesta(t, b, rg, m.mezclas.find((x) => x.id === an.mezclaB)?.nombre ?? 'otra')}</div></div>${j?.escenarios && b?.estado === 'ok' ? html`<div class="banda aviso" style="margin-top:8px">Con la otra mezcla el pesimista pasa de ${j.escenarios.find((e) => e.nombre === 'pesimista')?.prob} % a ${b.resultado.json.escenarios?.find((e) => e.nombre === 'pesimista')?.prob ?? '—'} %. Lee sus argumentos antes de quedarte con el número.</div>` : ''}` : cuerpoRespuesta(t, a, rg)) : ''}
    ${j?.escenarios && rg ? html`<div style="font-size:11px;margin-top:6px">Peor caso histórico a 12 meses de tu mezcla: <b style="font-weight:500;color:var(--text-danger)">${formatearPct(rg.peor, 0)}</b> <span class="mut">(código · grupo Datos) · ver <button type="button" class="enlace" data-accion="vista" data-vista="herramientas">prueba de crisis</button></span></div>${rg.aviso ? html`<div class="banda aviso" style="margin-top:4px">⚠ ${rg.aviso}</div>` : ''}<div class="mut" style="font-size:10.5px;margin-top:4px">* Probabilidad subjetiva del modelo con la mezcla «${nombre}». Rangos calculados por código (${rg.ventanas} ventanas de 12 meses). Rango base registrado: se puntuará el ${textoCorto(sumarDias(estado.ahora.fecha, 365))} ${sumarDias(estado.ahora.fecha, 365).slice(0, 4)}.</div>` : ''}
    ${a?.estado === 'ok' ? avisosHtml(a.resultado.avisos) : ''}
    ${j?.ideas?.length ? html`<div class="lab" style="margin-top:10px">Ideas para estudiar</div>${j.ideas.map((i) => html`<div style="padding:6px 0;border-top:.5px solid var(--border)"><span class="ep ${i.tipo === 'consenso' ? 'c' : i.tipo === 'especulación' ? 'e' : 'o'}">${i.tipo === 'opinión' ? 'opinión del modelo' : i.tipo}</span> <b style="font-weight:500">${i.titulo}</b> ${i.citas.map((c) => html`<span class="cit">[${c}]</span>`)}<div class="mut" style="font-size:11px">${textoConCitas(i.texto)}</div></div>`)}` : ''}
    ${a?.estado === 'ok' ? html`<div class="fila" style="margin-top:10px;flex-wrap:wrap"><button type="button" data-accion="an-diablo" ${an.ruta && an.diablo.fase !== 'trabajando' ? '' : 'disabled'}>Abogado del diablo</button><button type="button" data-accion="an-opinan">¿Qué opinan mis canales?</button><button type="button" data-accion="an-pausa">Pausa de 48 h para una idea</button><button type="button" data-accion="an-rex">Seguir en Rex</button></div>` : ''}
    ${progresoHtml(an.diablo, { que: 'El abogado del diablo está leyendo tu análisis…' })}
    ${an.diablo.fase === 'hecho' ? (an.diablo.resultado?.estado === 'ok' ? html`<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--surface-1)" data-diablo><div class="lab">Abogado del diablo</div><div style="font-size:11.5px;line-height:1.7;white-space:pre-wrap">${textoConCitas(an.diablo.resultado.resultado.json.respuesta_md)}</div></div>` : errorHtml(an.diablo.resultado)) : ''}</div>`;
}

function cajaCalibracion(m) {
  const cal = K.calibracion(m.predicciones);
  const pend = m.predicciones.filter((p) => p.fuente?.startsWith('finhub') && p.estado === 'pendiente').length;
  return html`<div class="box" style="margin-top:8px"><div class="lab">Calibración · tus predicciones registradas</div><div style="font-size:11.5px">${cal.pb === null ? 'Aún no hay rangos de finhub resueltos' : `${cal.aciertos} de ${cal.resueltos} rangos acertados (${Math.round(cal.pb / 100)} %)`} · <span class="mut">objetivo: 80 % · ${pend} pendientes de resolver</span></div></div>`;
}

function cajaHistorial(m) {
  const lista = [...m.docs.keys()].filter((r) => /^analisis\/[^/]+\.md$/.test(r)).sort().reverse();
  return html`<div class="box" style="margin-top:8px"><div class="lab">Historial · ${lista.length} análisis (analisis/, privado)</div>${lista.length ? lista.slice(0, 15).map((r) => {
    const d = m.doc(r);
    return html`<div class="entre" style="padding:4px 0;border-top:.5px solid var(--border);font-size:11px"><button type="button" class="enlace" data-accion="an-ver" data-ruta="${r}">${d.titulo.replace(/^Análisis · /, '')}</button><button type="button" class="go" data-accion="an-borrar" data-ruta="${r}" aria-label="Borrar ${r}">🗑</button></div>`;
  }) : html`<div class="mut" style="font-size:11px">Aún no hay análisis.</div>`}</div>`;
}

// ---------- acciones ----------
export function registrarAccionesAnalisis() {
  cambio('an-tarea', (el) => {
    an.tarea = el.value;
    repintar();
  });
  cambio('an-rol', (el) => (an.rol = el.value));
  cambio('an-comparar', (el) => {
    an.comparar = el.checked;
    repintar();
  });
  cambio('an-mezcla-b', (el) => (an.mezclaB = el.value));
  entrada('an-pregunta', (el) => (an.pregunta = el.value));
  accion('an-analizar', async () => {
    const e = est();
    const m = e.modelo;
    const d = datosConocimiento(e);
    const t = (an.catalogo?.tareas ?? []).find((x) => x.id === an.tarea) ?? (an.catalogo?.tareas ?? []).find((x) => x.trabajo === 'privado' && !OCULTAS.has(x.id));
    if (!t) return;
    an.tarea = t.id;
    const fuentesA = d.resumen.filter((r) => r.activa).map((r) => r.id);
    an.ruta = null;
    an.progB = nuevoProgreso();
    an.diablo = nuevoProgreso();
    const params = (fuentes) => ({ tarea: t.id, rol: an.rol || null, fuentes, pregunta: an.pregunta.trim() || null });
    const a = await ejecutarCon(an.progA, 'privado', params(fuentesA), { repintar });
    if (a?.estado !== 'ok') return;
    if (an.comparar && m.mezclas.length) {
      an.mezclaB ??= m.mezclas[0].id;
      const mz = m.mezclas.find((x) => x.id === an.mezclaB);
      await ejecutarCon(an.progB, 'privado', params(K.resolverMezcla(mz.miembros, d.resumen).fuentes), { repintar });
    }
    // se guarda en analisis/ (privado) y el rango base del código queda como predicción de finhub
    const j = a.resultado.json;
    const rg = rangos(m);
    const base = j.escenarios?.find((x) => x.nombre === 'base');
    const hoy = e.ahora.fecha;
    const prediccion = base && rg ? { texto: `cartera 12 m en [${Math.round(rg.base[0] / 100)}, ${Math.round(rg.base[1] / 100)}] % (base, ${base.prob} %)`, medir: `cartera twr ${hoy}→${sumarDias(hoy, 365)} en ${Math.round(rg.base[0] / 100)}…${Math.round(rg.base[1] / 100)}` } : null;
    const resultado = j.escenarios ? j.escenarios.map((x) => `- ${x.nombre} · ${x.prob} %: ${x.porque}`).join('\n') + (j.ideas?.length ? `\n\nIdeas:\n${j.ideas.map((i) => `- [${i.tipo}] ${i.titulo}: ${i.texto}`).join('\n')}` : '') : j.ideas ? j.ideas.map((i) => `- [${i.tipo}] ${i.titulo}: ${i.texto}`).join('\n') : j.respuesta_md ?? '';
    const r = await op('analisis.guardar', { fecha: hoy, tarea: t.id, titulo: t.titulo, rol: an.rol || null, mezcla: fuentesA, ejecucion: a.resultado.ejecucion, modelo: a.resultado.modelo, cifras: a.resultado.cifras, resultado_md: resultado, json: j, avisos: a.resultado.avisos, prediccion }, { mensaje: (x) => `Análisis guardado en ${x.resultado.ruta}${x.resultado.prediccion ? ` · rango registrado (${x.resultado.prediccion})` : ''}` });
    if (r) an.ruta = r.resultado.ruta;
    repintar();
  });
  accion('an-diablo', async () => {
    if (!an.ruta) return;
    await ejecutarCon(an.diablo, 'privado', { tarea: 'abogado-diablo', rol: 'diablo', analisis: an.ruta }, { repintar });
  });
  accion('an-opinan', () => {
    const j = an.progA.resultado?.resultado?.json;
    rexHacia('opinan', { pregunta: an.pregunta || j?.ideas?.[0]?.titulo || '¿Qué esperan mis canales para los próximos 12 meses?' });
  });
  accion('an-pausa', () => {
    const j = an.progA.resultado?.resultado?.json;
    rexHacia('pausa', { idea: j?.ideas?.[0]?.titulo ?? '' });
  });
  accion('an-rex', () => rexHacia('chat', { pregunta: `Sobre mi análisis «${an.ruta ?? an.tarea}»: ` }));
  accion('an-ver', (el) => {
    const d = est().modelo.doc(el.dataset.ruta);
    abrir({ titulo: d.titulo, ancho: true, cuerpo: html`<div style="font-size:11.5px;line-height:1.7;white-space:pre-wrap;margin-top:8px">${textoConCitas(textoSeccion(d, 'Resultado'))}</div>${textoSeccion(d, 'Avisos') ? html`<div class="mut" style="font-size:10.5px;margin-top:8px;white-space:pre-wrap">${textoSeccion(d, 'Avisos')}</div>` : ''}<div class="mut" style="font-size:10.5px;margin-top:8px">${el.dataset.ruta} · cifras que se dieron a Claude:\n</div><div class="mut" style="font-size:10.5px;white-space:pre-wrap">${textoSeccion(d, 'Cifras (código)')}</div>` });
  });
  accion('an-borrar', async (el) => {
    if (await confirmar(`¿Borrar ${el.dataset.ruta}? Irá a la papelera 30 días.`, { si: 'Borrar' })) op('fichero.borrar', { ruta: el.dataset.ruta, que: 'análisis' }, { mensaje: 'Análisis borrado' });
  });
}
