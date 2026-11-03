// Modales (maqueta: .mw/.md) accesibles: role=dialog, foco atrapado, Esc y clic fuera cierran,
// el foco vuelve a donde estaba. Un solo modal a la vez, como en la maqueta.
import { html, pintar } from '../esc.js';

let anterior = null;
let alCerrarFn = null;
let actual = null; // {titulo, cuerpo: fn, ancho} si el cuerpo se puede repintar
const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const raiz = () => document.getElementById('modal');
export const hayModal = () => !!raiz()?.firstElementChild;

/**
 * abrir({titulo, cuerpo: html`` | () => html``, ancho, alCerrar}) → elemento del diálogo.
 * Si `cuerpo` es una función, el modal se repinta solo cuando cambian los datos (repintarModal).
 */
export function abrir({ titulo, cuerpo, ancho = false, alCerrar = null }) {
  if (!hayModal()) anterior = document.activeElement;
  alCerrarFn = alCerrar;
  actual = typeof cuerpo === 'function' ? { titulo, cuerpo, ancho } : null;
  pintarModal(titulo, typeof cuerpo === 'function' ? cuerpo() : cuerpo, ancho);
  const dialogo = raiz().querySelector('[role=dialog]');
  const primero = dialogo.querySelector('[autofocus]') ?? [...dialogo.querySelectorAll(ENFOCABLES)].find((e) => !e.matches('[data-cerrar-modal]')) ?? dialogo.querySelector('[data-cerrar-modal]');
  primero?.focus();
  return dialogo;
}

/** Vuelve a pintar el modal abierto (si su cuerpo es una función), conservando el foco por id. */
export function repintarModal() {
  if (!actual || !hayModal()) return;
  const id = document.activeElement?.id;
  const pos = document.activeElement?.selectionStart;
  pintarModal(actual.titulo, actual.cuerpo(), actual.ancho);
  const el = id ? document.getElementById(id) : null;
  if (el) {
    el.focus();
    if (pos !== undefined && pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos);
  }
}

function pintarModal(titulo, cuerpo, ancho) {
  pintar(
    raiz(),
    html`<div class="mw" data-fondo-modal>
      <div class="md ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <div class="entre"><b id="titulo-modal" style="font-weight:500;font-size:13px">${titulo}</b><button type="button" class="cerrar" data-cerrar-modal aria-label="Cerrar">×</button></div>
        ${cuerpo}
      </div>
    </div>`,
  );
}

export function cerrar() {
  if (!hayModal()) return;
  actual = null;
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

/**
 * Pregunta con varias salidas: elegir('¿…?', [['esteMes', 'También este mes'], ['siguiente', 'Solo desde el mes que viene']]).
 * → Promise<valor elegido | null si se cierra sin elegir> (Esc o × nunca cuentan como respuesta).
 */
export function elegir(texto, opciones, { titulo = 'Elige' } = {}) {
  return new Promise((ok) => {
    let respondido = false;
    const dialogo = abrir({
      titulo,
      cuerpo: html`<p style="font-size:12px;margin:12px 0">${texto}</p><div class="fila" style="justify-content:flex-end">${opciones.map(([v, t], i) => html`<button type="button" class="${i === 0 ? 'pri' : ''}" data-opcion="${v}" ${i === 0 ? 'autofocus' : ''}>${t}</button>`)}</div>`,
      alCerrar: () => !respondido && ok(null),
    });
    dialogo.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-opcion]');
      if (!b) return;
      respondido = true;
      cerrar();
      ok(b.dataset.opcion);
    });
  });
}
