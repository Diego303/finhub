// Modales (maqueta: .mw/.md) accesibles: role=dialog, foco atrapado, Esc y clic fuera cierran,
// el foco vuelve a donde estaba. Un solo modal a la vez, como en la maqueta.
import { html, pintar } from '../esc.js';

let anterior = null;
let alCerrarFn = null;
const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const raiz = () => document.getElementById('modal');
export const hayModal = () => !!raiz()?.firstElementChild;

/** abrir({titulo, cuerpo: html``, ancho, alCerrar}) → elemento del diálogo (para enlazar eventos). */
export function abrir({ titulo, cuerpo, ancho = false, alCerrar = null }) {
  if (!hayModal()) anterior = document.activeElement;
  alCerrarFn = alCerrar;
  pintar(
    raiz(),
    html`<div class="mw" data-fondo-modal>
      <div class="md ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <div class="entre"><b id="titulo-modal" style="font-weight:500;font-size:13px">${titulo}</b><button type="button" class="cerrar" data-cerrar-modal aria-label="Cerrar">×</button></div>
        ${cuerpo}
      </div>
    </div>`,
  );
  const dialogo = raiz().querySelector('[role=dialog]');
  const primero = dialogo.querySelector('[autofocus]') ?? [...dialogo.querySelectorAll(ENFOCABLES)].find((e) => !e.matches('[data-cerrar-modal]')) ?? dialogo.querySelector('[data-cerrar-modal]');
  primero?.focus();
  return dialogo;
}

export function cerrar() {
  if (!hayModal()) return;
  pintar(raiz(), '');
  const fn = alCerrarFn;
  alCerrarFn = null;
  fn?.();
  anterior?.focus?.();
  anterior = null;
}

/** Pregunta sí/no en un modal. → Promise<boolean> */
export function confirmar(texto, { si = 'Sí', no = 'Cancelar', titulo = 'Confirmar' } = {}) {
  return new Promise((ok) => {
    let respondido = false;
    const dialogo = abrir({
      titulo,
      cuerpo: html`<p style="font-size:12px;margin:12px 0">${texto}</p><div class="fila" style="justify-content:flex-end"><button type="button" data-no>${no}</button><button type="button" class="pri" data-si autofocus>${si}</button></div>`,
      alCerrar: () => !respondido && ok(false),
    });
    dialogo.querySelector('[data-si]').addEventListener('click', () => {
      respondido = true;
      cerrar();
      ok(true);
    });
    dialogo.querySelector('[data-no]').addEventListener('click', () => cerrar());
  });
}

document.addEventListener('click', (ev) => {
  if (ev.target.matches?.('[data-fondo-modal]') || ev.target.closest?.('[data-cerrar-modal]')) cerrar();
});

document.addEventListener('keydown', (ev) => {
  if (!hayModal()) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    cerrar();
    return;
  }
  if (ev.key === 'Tab') {
    const f = [...raiz().querySelectorAll(ENFOCABLES)];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (ev.shiftKey && (i <= 0)) {
      ev.preventDefault();
      f.at(-1).focus();
    } else if (!ev.shiftKey && i === f.length - 1) {
      ev.preventDefault();
      f[0].focus();
    }
  }
});
