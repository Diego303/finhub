// Toasts (maqueta: .toast). Con «deshacer», duran 10 s (§2.5). Anunciados a lectores de pantalla.
import { html, pintar } from '../esc.js';

let temporizador = null;
let alDeshacer = null;

function raiz() {
  return document.getElementById('toast');
}

/** toast('Anotado', {tipo: 'error'|'ok', deshacer: () => …, ms}) */
export function toast(texto, { tipo = 'ok', deshacer = null, ms } = {}) {
  const r = raiz();
  if (!r) return;
  alDeshacer = deshacer;
  pintar(r, html`<div class="toast ${tipo === 'error' ? 'error' : ''}" role="${tipo === 'error' ? 'alert' : 'status'}"><span>${texto}</span>${deshacer ? html`<button type="button" data-toast-deshacer>deshacer</button>` : ''}</div>`);
  clearTimeout(temporizador);
  temporizador = setTimeout(cerrarToast, ms ?? (deshacer ? 10000 : tipo === 'error' ? 6000 : 3200));
  document.dispatchEvent(new CustomEvent('finhub:toast', { detail: { tipo, texto } }));
}

export function cerrarToast() {
  const r = raiz();
  if (r) pintar(r, '');
  alDeshacer = null;
}

document.addEventListener('click', (ev) => {
  if (ev.target.closest?.('[data-toast-deshacer]') && alDeshacer) {
    const fn = alDeshacer;
    cerrarToast();
    fn();
  }
});
