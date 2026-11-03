// Rex a pantalla completa (maqueta: rexView): guarida, conversaciones y sus 5 modos. Sin Claude hasta F10.
import { html } from '../esc.js';
import { rex, ESTADOS } from '../componentes/rex-sprite.js';

export const MODOS = [['chat', 'Chat'], ['opinan', '¿Qué opinan mis canales?'], ['pausa', 'Pausa de 48 h'], ['semana', 'Resumen semanal'], ['quiz', 'Quiz']];
let modo = 'chat';
export const ponerModo = (m) => (modo = MODOS.some((x) => x[0] === m) ? m : 'chat');

function cuerpoModo(e) {
  const m = e.modelo;
  const aviso = (t) => html`<div class="mut" style="padding:30px 0;text-align:center;font-size:11.5px">${t}<br><span style="font-size:10.5px">Rex hablará con Claude en la fase F10.</span></div>`;
  switch (modo) {
    case 'chat':
      return html`<div class="fila" style="padding-bottom:6px"><span class="chip on">Mis finanzas + conocimiento</span><span class="chip">Conocimiento + internet</span></div>
        <div class="mut" style="font-size:10.5px;padding:6px 0">🔒 Ve tus gastos, cartera y base · <b style="font-weight:500">sin internet</b> · regla R1</div>
        <div class="msg r">¡Hola! Soy Rex. Pregúntame por tus gastos, tu cartera, tus metas o el mundo. Cito las notas y los ficheros en los que me baso, y si no tengo evidencia te digo <b>no concluyente</b>.</div>
        <div class="fila" style="margin-top:6px"><label class="sr-only" for="pregunta-rex">Pregúntale a Rex</label><input class="inp" id="pregunta-rex" placeholder="Pregúntale a Rex…" style="flex:1;padding:8px 10px;font-size:12.5px" disabled><button type="button" class="pri" disabled>Enviar</button></div>`;
    case 'opinan':
      return aviso('Pregunta algo y verás la postura de cada fuente de tu mezcla, con sus citas.');
    case 'pausa':
      return html`<div class="mut" style="font-size:11px;margin-bottom:8px">Antes de una decisión de inversión, escríbela aquí. Rex la guarda y te la devuelve en 48 horas con preguntas. Las buenas ideas sobreviven a 2 días; los impulsos, no.</div>
        ${m.decisiones.filter((d) => ['pausa-48h', 'lista'].includes(d.estado)).map((d) => html`<div class="box" style="margin-top:8px"><div class="entre"><b style="font-weight:500;font-size:12px">${d.titulo}</b><span class="mut" style="font-size:10.5px">${d.estado === 'lista' ? 'lista para revisar' : `vuelve ${d.vuelve ? `${d.vuelve.fecha} ${d.vuelve.hora}` : ''}`}</span></div></div>`)}
        ${aviso('')}`;
    case 'semana':
      return aviso('Un resumen por temas de todos tus pulsos de la semana.');
    default:
      return aviso('Preguntas sobre tu grupo «Base», con el progreso guardado en quiz/progreso.md.');
  }
}

export function vistaRex(e) {
  const m = e.modelo;
  return html`<div style="display:grid;grid-template-columns:230px minmax(0,1fr);gap:10px;min-height:520px">
    <div class="box"><div style="position:relative;height:150px;border-radius:8px;overflow:hidden;background:linear-gradient(var(--surface-1),var(--surface-1) 70%,#D3D1C755 70%)"><div style="position:absolute;left:14px;bottom:26px">${rex(96, 82, e.rex)}</div><div style="position:absolute;left:8px;top:6px;font-size:10px" class="mut">guarida, hucha y accesorios: F12</div></div>
      <div class="lab" style="margin-top:8px">Estados de Rex</div>
      <div class="fila" style="gap:4px">${ESTADOS.map((s) => html`<button type="button" class="chip ${e.rex === s ? 'on' : ''}" data-accion="rex-estado" data-estado="${s}" aria-pressed="${e.rex === s ? 'true' : 'false'}">${s}</button>`)}</div>
      <div style="border-top:.5px solid var(--border);margin-top:10px;padding-top:8px">${modo === 'chat' ? html`<button type="button" style="width:100%;margin-bottom:8px" disabled>+ nueva conversación</button>${m.chats.map((c) => html`<div style="padding:5px 4px;font-size:11px;border-radius:6px">${c.titulo.replace(/^Conversación · /, '')} <span class="mut" style="font-size:10px">· ${c.modo === 'web' ? 'internet' : 'mis finanzas'}</span></div>`)}` : html`<div class="mut" style="font-size:10.5px">Todo lo que haces aquí se guarda en Markdown: chat/, decisiones/, quiz/.</div>`}</div></div>
    <div class="box" style="display:flex;flex-direction:column"><div class="tabs" role="tablist" aria-label="Modos de Rex" style="margin-bottom:8px">${MODOS.map(([k, t]) => html`<button type="button" role="tab" aria-selected="${modo === k ? 'true' : 'false'}" data-accion="rex-modo" data-modo="${k}">${t}</button>`)}</div>${cuerpoModo(e)}</div>
  </div>`;
}
