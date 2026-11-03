// Marcador de lo que se construye en una fase posterior: dice qué habrá y cuándo, sin fingir datos.
import { html } from '../esc.js';

export function proximamente(titulo, fase, puntos = [], extra = '') {
  return html`<div class="box proximamente">
    <div class="lab" style="margin:0">${titulo}</div>
    <div style="font-size:12px;margin-top:6px">Llega en la fase <b style="font-weight:500">${fase}</b>.</div>
    ${puntos.length ? html`<ul class="mut">${puntos.map((p) => html`<li>${p}</li>`)}</ul>` : ''}
    ${extra}
  </div>`;
}
