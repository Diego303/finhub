// Rex a pantalla completa (§5 Rex, maqueta: rexView): guarida, conversaciones (crear, renombrar, buscar,
// borrar) y sus 5 modos: Chat («Mis finanzas + conocimiento» → privado; «Conocimiento + internet» → rex-web,
// con su aviso fijo), ¿Qué opinan mis canales?, Pausa de 48 h, Resumen semanal y Quiz. La respuesta llega
// en directo (SSE) y se guarda en chat/privado/ o chat/web/ (separados, R1).
import { html } from '../esc.js';
import { accion, entrada, formulario } from '../acciones.js';
import { op } from '../api.js';
import { confirmar } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { rex, ESTADOS } from '../componentes/rex-sprite.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml, avisosHtml } from '../componentes/claude.js';
import { datosConocimiento } from './conocimiento.js';
import { textoConCitas } from './analisis.js';
import { bloques, cabeceras, items } from '/core/formato/motor.js';
import { desescaparMensaje } from '/core/formato/textos.js';
import { semanaIso, limitesSemana, textoCorto, sumarDias } from '/core/fechas.js';
import { normalizar } from '/core/ids.js';

export const MODOS = [['chat', 'Chat'], ['opinan', '¿Qué opinan mis canales?'], ['pausa', 'Pausa de 48 h'], ['semana', 'Resumen semanal'], ['quiz', 'Quiz']];
const COLOR_POSTURA = { alcista: 'var(--t-verde)', neutral: 'var(--t-gris)', bajista: 'var(--t-rojo)' };
let modo = 'chat';
export const ponerModo = (m) => (modo = MODOS.some((x) => x[0] === m) ? m : 'chat');

const rx = {
  chat: 'privado', // privado | web
  ruta: null,
  busca: '',
  pregunta: '',
  enviada: null,
  prog: nuevoProgreso(),
  opinan: { pregunta: '', prog: nuevoProgreso() },
  pausa: { idea: '', prog: nuevoProgreso() },
  semana: { prog: nuevoProgreso() },
  quiz: { prog: nuevoProgreso(), preguntas: [], respuestas: {} },
  renombrar: null,
};
let contexto = null;
export const iniciarRex = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();

// «?» Explícame (§5 Global): abre Rex «Mis finanzas» con el contexto de una cifra.
let explicame = null;
export function ponerExplicame(x) {
  explicame = x;
  modo = 'chat';
  rx.chat = 'privado';
  rx.ruta = null;
}
export const quitarExplicame = () => (explicame = null);

/** Ir a Rex en un modo con algo ya escrito (desde Análisis). */
export function rexHacia(m, { pregunta = '', idea = '' } = {}) {
  ponerModo(m);
  if (m === 'chat') Object.assign(rx, { chat: 'privado', ruta: null, pregunta });
  if (m === 'opinan') rx.opinan.pregunta = pregunta;
  if (m === 'pausa') rx.pausa.idea = idea;
  if (location.hash === '#rex') repintar();
  else location.hash = 'rex';
}

const conversaciones = (m) => [...m.docs.keys()].filter((r) => r.startsWith(`chat/${rx.chat}/`)).sort().reverse().map((r) => ({ ruta: r, titulo: m.doc(r).titulo.replace(/^Conversación · /, ''), doc: m.doc(r) }));

// ---------- guarida (§5): hucha con el progreso medio de tus metas, humor y accesorios ----------
function guarida(e) {
  const g = e.guarida ?? { humor: { humor: 'tranquilo', tasaPb: null }, hucha: null, accesorios: [] };
  const h = g.hucha === null ? 0 : g.hucha / 10000;
  const tasa = g.humor.tasaPb === null ? 'sin entradas este mes' : `tasa de ahorro ${Math.round(g.humor.tasaPb / 100)} %`;
  return html`<div data-guarida style="position:relative;height:150px;border-radius:8px;overflow:hidden;background:linear-gradient(var(--surface-1),var(--surface-1) 70%,#D3D1C755 70%)"><div style="position:absolute;left:14px;bottom:26px">${rex(96, 82, e.rex)}</div>
      <svg style="position:absolute;right:16px;bottom:20px" width="60" height="78" viewBox="0 0 30 39" role="img" aria-label="${g.hucha === null ? 'Hucha: aún no tienes metas' : `Hucha: tus metas van, de media, al ${Math.round(h * 100)} %`}"><rect x="3" y="6" width="24" height="31" rx="5" fill="none" stroke="var(--text-secondary)" stroke-width="1.2"/><rect x="4.2" y="${7 + 29 * (1 - h)}" width="21.6" height="${29 * h}" rx="4" fill="#EF9F27" opacity=".85"/><rect x="9" y="2" width="12" height="4" rx="1" fill="var(--text-secondary)"/><text x="15" y="${Math.max(11, 7 + 29 * (1 - h) - 2)}" font-size="5" text-anchor="middle" fill="var(--text-primary)" font-family="var(--font-mono)">${g.hucha === null ? '—' : `${Math.round(h * 100)}%`}</text></svg>
      <div style="position:absolute;left:8px;top:6px;font-size:10px" class="mut">humor: <b style="font-weight:500;color:var(--text-primary)" data-humor>${g.humor.humor}</b> · ${tasa}</div></div>
    <div class="lab" style="margin-top:8px">Accesorios de Rex</div>${g.error ? html`<div class="mut" style="font-size:10.5px">⚠ accesorios en Ajustes: ${g.error}</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:10px;text-align:center" role="list">${g.accesorios.map((a) => html`<div role="listitem" data-accesorio="${a.id}" data-logrado="${a.logrado ? 'true' : 'false'}" title="${a.que}" aria-label="${a.nombre}: ${a.logrado ? 'conseguido' : `se consigue con ${a.que}`}" style="padding:5px 0;border-radius:6px;border:0.5px solid var(--border);${a.logrado ? '' : 'color:var(--text-muted)'}"><div style="font-size:15px;${a.logrado ? '' : 'opacity:.35;filter:grayscale(1)'}" aria-hidden="true">${a.emoji}</div>${a.nombre}</div>`)}</div>`;
}

// ---------- vista ----------
export function vistaRex(e) {
  const m = e.modelo;
  const lista = conversaciones(m).filter((c) => !rx.busca || normalizar(c.titulo).includes(normalizar(rx.busca)));
  return html`<div style="display:grid;grid-template-columns:230px minmax(0,1fr);gap:10px;min-height:520px">
    <div class="box">${guarida(e)}
      <div class="lab" style="margin-top:8px">Estados de Rex</div>
      <div class="fila" style="gap:4px">${ESTADOS.map((s) => html`<button type="button" class="chip ${e.rex === s ? 'on' : ''}" data-accion="rex-estado" data-estado="${s}" aria-pressed="${e.rex === s ? 'true' : 'false'}">${s}</button>`)}</div>
      <div style="border-top:.5px solid var(--border);margin-top:10px;padding-top:8px">${modo === 'chat' ? html`<button type="button" style="width:100%;margin-bottom:6px" data-accion="chat-nueva">+ nueva conversación</button>
        <label class="sr-only" for="chat-busca">Buscar conversación</label><input class="inp" id="chat-busca" placeholder="buscar…" value="${rx.busca}" data-entrada-texto="chat-busca" style="width:100%;box-sizing:border-box;margin-bottom:6px">
        ${lista.map((c) => html`<div class="conv ${c.ruta === rx.ruta ? 'on' : ''}">${rx.renombrar === c.ruta ? html`<form data-form="chat-renombrar" class="fila"><input type="hidden" name="ruta" value="${c.ruta}"><label class="sr-only" for="ren-${c.ruta}">Título</label><input class="inp" id="ren-${c.ruta}" name="titulo" value="${c.titulo}" style="flex:1;font-size:11px" autofocus></form>` : html`<button type="button" class="enlace" style="text-decoration:none;flex:1" data-accion="chat-abrir" data-ruta="${c.ruta}">${c.titulo}</button><button type="button" class="go" data-accion="chat-ren" data-ruta="${c.ruta}" aria-label="Renombrar ${c.titulo}">✎</button><button type="button" class="go" data-accion="chat-borrar" data-ruta="${c.ruta}" aria-label="Borrar ${c.titulo}">🗑</button>`}</div>`)}
        ${!lista.length ? html`<div class="mut" style="font-size:10.5px">Sin conversaciones${rx.busca ? ' con ese texto' : ''}.</div>` : ''}` : html`<div class="mut" style="font-size:10.5px">Todo lo que haces aquí se guarda en Markdown: chat/, decisiones/, quiz/ y conocimiento/mundo/.</div>`}</div></div>
    <div class="box" style="display:flex;flex-direction:column"><div class="tabs" role="tablist" aria-label="Modos de Rex" style="margin-bottom:8px">${MODOS.map(([k, t]) => html`<button type="button" role="tab" aria-selected="${modo === k ? 'true' : 'false'}" data-accion="rex-modo" data-modo="${k}">${t}</button>`)}</div>${cuerpoModo(e)}</div>
  </div>`;
}

function cuerpoModo(e) {
  if (modo === 'chat') return cuerpoChat(e);
  if (modo === 'opinan') return cuerpoOpinan(e);
  if (modo === 'pausa') return cuerpoPausa(e);
  if (modo === 'semana') return cuerpoSemana(e);
  return cuerpoQuiz(e);
}

const burbuja = (quien, texto) => html`<div class="msg ${quien === 'Tú' ? 'u' : 'r'}">${quien === 'Tú' ? texto : textoConCitas(texto)}</div>`;

function cuerpoChat(e) {
  const m = e.modelo;
  const d = rx.ruta ? m.doc(rx.ruta) : null;
  const turnos = d ? bloques(d).map((b) => ({ quien: b.id, texto: desescaparMensaje(b.cuerpo) })) : [];
  const web = rx.chat === 'web';
  const trabajando = rx.prog.fase === 'trabajando';
  return html`<div class="fila" style="padding-bottom:6px"><button type="button" class="chip ck ${!web ? 'on' : ''}" data-accion="chat-modo" data-id="privado" aria-pressed="${!web ? 'true' : 'false'}">Mis finanzas + conocimiento</button><button type="button" class="chip ck ${web ? 'on' : ''}" data-accion="chat-modo" data-id="web" aria-pressed="${web ? 'true' : 'false'}">Conocimiento + internet</button></div>
    ${web ? html`<div class="banda aviso" style="display:block" data-aviso-web>🌐 <b style="font-weight:500">Este modo puede salir a internet; no escribas datos personales.</b> Rex solo ve tu base pública (nunca Mis notas ni tus cifras). Se guarda aparte, en chat/web/.</div>` : html`<div class="mut" style="font-size:10.5px;padding:6px 0">🔒 Ve tus gastos, cartera y base · <b style="font-weight:500">sin internet</b> · regla R1</div>`}
    ${explicame && !web ? html`<div class="banda" style="display:block;margin-bottom:6px" data-explicame><div class="entre"><b style="font-weight:500">«?» Explícame: ${explicame.cifra}</b><button type="button" class="go" data-accion="explicame-quitar" aria-label="Quitar el contexto">×</button></div><div style="font-size:11.5px">${explicame.valor}${explicame.detalle ? html` <span class="mut">· ${explicame.detalle}</span>` : ''}</div><button type="button" class="pri" style="margin-top:6px" data-accion="explicame-ir" ${trabajando ? 'disabled' : ''}>Explícamelo con mis números</button></div>` : ''}
    <div class="chat" data-chat>${!turnos.length && !rx.enviada ? html`<div class="msg r">¡Hola! Soy Rex. ${web ? 'Pregúntame por economía o inversión en general: puedo buscar en internet.' : 'Pregúntame por tus gastos, tu cartera, tus metas o el mundo.'} Cito las notas en las que me baso, y si no tengo evidencia te digo <b>no concluyente</b>.</div>` : ''}
      ${turnos.map((t) => burbuja(t.quien, t.texto))}
      ${rx.enviada ? html`${burbuja('Tú', rx.enviada)}${trabajando ? html`<div class="msg r" aria-live="polite">${rx.prog.texto.replace(/```json[\s\S]*$/, '').trim() || html`<span class="mut">Rex está pensando…</span>`}</div>` : ''}` : ''}</div>
    ${trabajando ? progresoHtml(rx.prog, { que: web ? 'Rex está buscando…' : 'Rex está pensando con tus datos…' }) : ''}
    ${rx.prog.fase === 'hecho' ? html`${errorHtml(rx.prog.resultado)}${rx.prog.resultado?.estado === 'ok' ? avisosHtml(rx.prog.resultado.resultado.avisos) : ''}` : ''}
    <form class="fila" data-form="chat-enviar" style="margin-top:6px"><label class="sr-only" for="pregunta-rex">Pregúntale a Rex</label><input class="inp" id="pregunta-rex" name="pregunta" value="${rx.pregunta}" data-entrada-texto="chat-pregunta" placeholder="${web ? 'Pregunta general (sin datos personales)…' : 'Pregúntale a Rex…'}" style="flex:1;padding:8px 10px;font-size:12.5px" ${trabajando ? 'disabled' : ''}><button type="submit" class="pri" ${trabajando ? 'disabled' : ''}>Enviar</button></form>`;
}

function cuerpoOpinan(e) {
  const d = datosConocimiento(e);
  const p = rx.opinan.prog;
  const r = p.resultado;
  const j = r?.estado === 'ok' ? r.resultado.json : null;
  return html`<div class="mut" style="font-size:11px;margin-bottom:8px">Qué dicen sobre una pregunta las fuentes de tu mezcla (${d.resumen.filter((x) => x.activa).length} activas), cada una con su postura y la nota que lo respalda. 🔒 Trabajo <b style="font-weight:500">conocimiento</b>: sin internet y sin Mis notas.</div>
    <form class="fila" data-form="opinan"><label class="sr-only" for="opinan-pregunta">Pregunta</label><input class="inp" id="opinan-pregunta" name="pregunta" value="${rx.opinan.pregunta}" data-entrada-texto="opinan-pregunta" placeholder="¿Está cara la bolsa americana?" style="flex:1"><button type="submit" class="pri" ${p.fase === 'trabajando' ? 'disabled' : ''}>Preguntar</button></form>
    ${progresoHtml(p, { que: 'Rex está leyendo tus fuentes…' })}${p.fase === 'hecho' ? errorHtml(r) : ''}
    ${j ? html`<table class="tb" style="margin-top:8px" data-opinan><thead><tr><th>fuente</th><th>postura</th><th>argumento</th></tr></thead><tbody>${j.fuentes.map((f) => html`<tr><td>${d.porId.get(f.id)?.nombre ?? f.id}</td><td><span style="color:${COLOR_POSTURA[f.postura]}">●</span> ${f.postura}</td><td style="font-size:11px">${f.argumento}${f.cita ? html` <span class="cit">[${f.cita}]</span>` : ''}</td></tr>`)}</tbody></table>
      <div style="font-size:11.5px;line-height:1.7;margin-top:8px"><b style="font-weight:500">Coinciden:</b> ${textoConCitas(j.coinciden)}<br><b style="font-weight:500">Discrepan:</b> ${textoConCitas(j.discrepan)}</div>
      <div style="margin-top:6px;font-size:11.5px"><span class="ep o">opinión del modelo</span> ${j.opinion_modelo}</div>${avisosHtml(r.resultado.avisos)}` : ''}`;
}

function cuerpoPausa(e) {
  const m = e.modelo;
  const p = rx.pausa.prog;
  const ahora = `${e.ahora.fecha} ${e.ahora.hora}`;
  const pausas = m.decisiones.filter((d) => ['pausa-48h', 'lista'].includes(d.estado));
  return html`<div class="mut" style="font-size:11px;margin-bottom:8px">Antes de una decisión de inversión, escríbela aquí. Rex la guarda y te la devuelve en 48 horas con preguntas. Las buenas ideas sobreviven a 2 días; los impulsos, no.</div>
    <form data-form="pausa"><label class="sr-only" for="pausa-idea">Decisión</label><textarea class="inp" id="pausa-idea" name="idea" rows="2" data-entrada-texto="pausa-idea" placeholder="Quiero subir el ETF Nasdaq 100 al 10 %…" style="width:100%">${rx.pausa.idea}</textarea><div style="text-align:right;margin-top:6px"><button type="submit" class="pri" ${p.fase === 'trabajando' ? 'disabled' : ''}>Pausar 48 h</button></div></form>
    ${progresoHtml(p, { que: 'Rex está preparando las preguntas…' })}${p.fase === 'hecho' ? errorHtml(p.resultado) : ''}
    ${pausas.map((d) => {
      const lista = d.estado === 'lista' || (d.vuelve && `${d.vuelve.fecha} ${d.vuelve.hora}` <= ahora);
      return html`<div class="box" style="margin-top:8px" data-pausa="${d.ruta}"><div class="entre"><b style="font-weight:500;font-size:12px">${d.titulo}</b><span class="mut" style="font-size:10.5px">${lista ? 'lista para revisar' : `vuelve ${d.vuelve ? `${textoCorto(d.vuelve.fecha)} ${d.vuelve.hora}` : ''}`}</span></div>${lista ? html`<button type="button" class="go" style="margin-top:6px" data-accion="vista" data-vista="metas">revisarla en el diario →</button>` : ''}</div>`;
    })}`;
}

function cuerpoSemana(e) {
  const m = e.modelo;
  const p = rx.semana.prog;
  const semana = semanaIso(e.ahora.fecha).id;
  const rutas = [...m.docs.keys()].filter((r) => /^conocimiento\/mundo\/semana-/.test(r)).sort().reverse();
  const d = rutas[0] ? m.doc(rutas[0]) : null;
  const cab = d ? cabeceras(d) : {};
  return html`<div class="entre"><span class="mut" style="font-size:11px">Un resumen por temas de todos tus pulsos de la semana. 🔒 Trabajo <b style="font-weight:500">conocimiento</b>: sin internet.</span><button type="button" class="pri" data-accion="semana-hacer" ${p.fase === 'trabajando' ? 'disabled' : ''}>Resumen de la semana ${semana.replace(/^\d{4}-W/, '')}</button></div>
    ${progresoHtml(p, { que: 'Rex está repasando los pulsos de la semana…' })}${p.fase === 'hecho' ? errorHtml(p.resultado) : ''}
    ${d ? html`<div style="margin-top:10px" data-semana><div class="lab">${d.titulo} · ${cab.pulsos ?? 0} pulsos · ${cab.noticias ?? 0} noticias</div>${d.secciones.filter((s) => s.nombre).map((s) => html`<div style="padding:6px 0;border-top:.5px solid var(--border)"><b style="font-weight:500;font-size:12px">${s.nombre}</b><div style="font-size:11.5px;line-height:1.6">${textoConCitas(s.nodos.map((n) => n.texto ?? '').join('\n').trim())}</div></div>`)}</div>` : html`<div class="mut" style="font-size:11px;margin-top:10px">Aún no hay resúmenes semanales.</div>`}`;
}

function cuerpoQuiz(e) {
  const m = e.modelo;
  const q = rx.quiz;
  const progreso = m.doc('quiz/progreso.md') ? items(m.doc('quiz/progreso.md')) : [];
  const aciertos = progreso.filter((x) => x.resultado === 'acierto').length;
  return html`<div class="entre"><span class="mut" style="font-size:11px">Preguntas sobre tu Base. Llevas ${aciertos} de ${progreso.length} acertadas (quiz/progreso.md).</span><button type="button" class="pri" data-accion="quiz-nuevo" ${q.prog.fase === 'trabajando' ? 'disabled' : ''}>Nuevas preguntas</button></div>
    ${progresoHtml(q.prog, { que: 'Rex está preparando preguntas…' })}${q.prog.fase === 'hecho' ? errorHtml(q.prog.resultado) : ''}
    ${q.preguntas.map((p, i) => {
      const r = q.respuestas[i];
      return html`<div class="box" style="margin-top:8px" data-quiz="${i}"><div style="font-size:12px;font-weight:500">${p.pregunta} <span class="cit">[${p.nota}]</span></div><div class="fila" style="flex-wrap:wrap;margin-top:6px">${p.opciones.map((o, k) => html`<button type="button" class="chip ck ${r !== undefined && k === p.correcta ? 'on' : ''}" data-accion="quiz-responder" data-i="${i}" data-k="${k}" ${r !== undefined ? 'disabled' : ''} style="${r === k && k !== p.correcta ? 'border-color:var(--text-danger);color:var(--text-danger)' : ''}">${o}</button>`)}</div>${r !== undefined ? html`<div style="font-size:11px;margin-top:6px">${r === p.correcta ? '✓ ¡Bien!' : '✗ No era esa.'} <span class="mut">${p.explicacion}</span></div>` : ''}</div>`;
    })}`;
}

// ---------- acciones ----------
async function enviar(pregunta, { tarea = null } = {}) {
  const e = est();
  const m = e.modelo;
  const web = rx.chat === 'web';
  const fuentes = datosConocimiento(e).resumen.filter((r) => r.activa).map((r) => r.id);
  let ruta = rx.ruta;
  if (!ruta) {
    const c = await op('chat.crear', { modo: rx.chat, titulo: tarea === 'explicame' ? `Explícame: ${explicame?.cifra}` : pregunta.slice(0, 60), mezcla: fuentes, fecha: e.ahora.fecha }, { silencioso: true });
    if (!c) return;
    ruta = rx.ruta = c.resultado.ruta;
  }
  rx.enviada = pregunta;
  rx.pregunta = '';
  const sesion = cabeceras(est().modelo.doc(ruta) ?? m.doc(ruta) ?? { secciones: [{ nodos: [] }] }).sesion ?? null;
  const trabajo = web ? 'rex-web' : 'privado';
  const params = { pregunta, fuentes, ...(tarea ? { tarea } : {}) };
  let r = await ejecutarCon(rx.prog, trabajo, params, { repintar, resume: sesion });
  if (r?.estado === 'rechazado' && sesion) r = await ejecutarCon(rx.prog, trabajo, params, { repintar }); // sesión de otro equipo o caducada: se empieza una nueva
  if (r?.estado !== 'ok') return repintar();
  const j = r.resultado.json;
  const ahora = est().ahora;
  const texto = `${j.respuesta_md}${j.citas.length ? `\n\nFuentes: ${j.citas.map((c) => (/^https?:/.test(c) ? c : `[${c}]`)).join(' ')}` : ''}`;
  await op('chat.turno', { ruta, tu: pregunta, rex: texto, cuando: `${ahora.fecha} ${ahora.hora}`, sesion: r.resultado.sesion }, { silencioso: true });
  rx.enviada = null;
  repintar();
}

export function registrarAccionesRex() {
  accion('chat-modo', (el) => {
    rx.chat = el.dataset.id;
    rx.ruta = null;
    rx.enviada = null;
    rx.prog = nuevoProgreso();
    repintar();
  });
  accion('chat-nueva', () => {
    rx.ruta = null;
    rx.enviada = null;
    rx.prog = nuevoProgreso();
    repintar();
    document.getElementById('pregunta-rex')?.focus();
  });
  accion('chat-abrir', (el) => {
    rx.ruta = el.dataset.ruta;
    rx.enviada = null;
    rx.prog = nuevoProgreso();
    repintar();
  });
  accion('chat-ren', (el) => {
    rx.renombrar = el.dataset.ruta;
    repintar();
  });
  formulario('chat-renombrar', async (f, d) => {
    rx.renombrar = null;
    if (d.titulo.trim()) await op('chat.renombrar', { ruta: d.ruta, titulo: d.titulo }, { mensaje: 'Conversación renombrada' });
    repintar();
  });
  accion('chat-borrar', async (el) => {
    if (!(await confirmar('¿Borrar esta conversación? Irá a la papelera 30 días.', { si: 'Borrar' }))) return;
    const r = await op('fichero.borrar', { ruta: el.dataset.ruta, que: 'conversación de Rex' }, { mensaje: 'Conversación borrada' });
    if (r && rx.ruta === el.dataset.ruta) rx.ruta = null;
  });
  entrada('chat-busca', (el) => {
    rx.busca = el.value;
    repintar();
  });
  entrada('chat-pregunta', (el) => (rx.pregunta = el.value));
  formulario('chat-enviar', (f, d) => {
    // con Rex trabajando el campo está desactivado y no viene en el formulario
    if (!d.pregunta?.trim()) return;
    enviar(d.pregunta.trim());
  });
  accion('explicame-ir', () => {
    if (!explicame) return;
    const x = explicame;
    rx.ruta = null;
    enviar(`Explícame «${x.cifra}»: ${x.valor}${x.detalle ? ` (${x.detalle})` : ''}`, { tarea: 'explicame' }).then(() => (explicame = null));
  });
  // ¿Qué opinan?
  entrada('opinan-pregunta', (el) => (rx.opinan.pregunta = el.value));
  formulario('opinan', async (f, d) => {
    if (!d.pregunta?.trim()) return toast('Escribe la pregunta', { tipo: 'error' });
    const fuentes = datosConocimiento(est()).resumen.filter((r) => r.activa).map((r) => r.id);
    await ejecutarCon(rx.opinan.prog, 'conocimiento', { tarea: 'opinan-canales', pregunta: d.pregunta.trim(), fuentes }, { repintar });
  });
  // Pausa de 48 h
  entrada('pausa-idea', (el) => (rx.pausa.idea = el.value));
  formulario('pausa', async (f, d) => {
    const idea = (d.idea ?? '').trim();
    if (!idea) return toast('Escribe la decisión', { tipo: 'error' });
    const r = await ejecutarCon(rx.pausa.prog, 'privado', { tarea: 'pausa-48h', pregunta: idea }, { repintar });
    if (r?.estado !== 'ok') return;
    const j = r.resultado.json;
    const ok = await op('decision.crear', { titulo: idea.split('\n')[0].slice(0, 120), fecha: est().ahora.fecha, estado: 'pausa-48h', secciones: { Qué: idea, 'Preguntas de Rex': j.preguntas.map((p, i) => `${i + 1}. ${p}`).join('\n') } }, { mensaje: `En pausa: vuelve el ${textoCorto(sumarDias(est().ahora.fecha, 2))} a esta hora, con ${j.preguntas.length} preguntas de Rex` });
    if (ok) rx.pausa.idea = '';
    repintar();
  });
  // Resumen semanal
  accion('semana-hacer', async () => {
    const e = est();
    const r = await ejecutarCon(rx.semana.prog, 'conocimiento', { tarea: 'resumen-semanal', semana: e.ahora.fecha }, { repintar });
    if (r?.estado !== 'ok') return;
    const { desde, hasta } = limitesSemana(e.ahora.fecha);
    const dias = e.modelo.mundo.filter((x) => x.fecha >= desde && x.fecha <= hasta);
    await op('semana.guardar', { semana: semanaIso(e.ahora.fecha).id, periodo: { desde, hasta }, pulsos: dias.reduce((a, x) => a + x.pulsos.length, 0), noticias: dias.reduce((a, x) => a + x.notas.length, 0), mezcla: ['mundo'], secciones: r.resultado.json.secciones }, { mensaje: (x) => `Resumen guardado en ${x.resultado.ruta}` });
  });
  // Quiz
  accion('quiz-nuevo', async () => {
    rx.quiz.preguntas = [];
    rx.quiz.respuestas = {};
    const r = await ejecutarCon(rx.quiz.prog, 'conocimiento', { tarea: 'quiz', quiz: 6 }, { repintar });
    if (r?.estado === 'ok') rx.quiz.preguntas = r.resultado.json.preguntas.filter((p) => p.correcta < p.opciones.length);
    repintar();
  });
  accion('quiz-responder', async (el) => {
    const i = +el.dataset.i;
    const k = +el.dataset.k;
    const p = rx.quiz.preguntas[i];
    rx.quiz.respuestas[i] = k;
    repintar();
    await op('quiz.responder', { fecha: est().ahora.fecha, nota: p.nota, resultado: k === p.correcta ? 'acierto' : 'fallo' }, { silencioso: true });
  });
}

