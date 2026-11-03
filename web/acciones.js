// Delegación de eventos: los elementos llevan data-accion="nombre" (botones, para el teclado).
// Sin manejadores en línea: la CSP (script-src 'self') no los permitiría.
const acciones = new Map();
const cambios = new Map();
const formularios = new Map();
const entradas = new Map();

/** accion('abrir-r1', (el, ev) => …) */
export const accion = (nombre, fn) => acciones.set(nombre, fn);
/** cambio('tema', (el, ev) => …) para <select>/<input data-cambio="…"> */
export const cambio = (nombre, fn) => cambios.set(nombre, fn);
/** formulario('anotar', (form, datos) => …) para <form data-form="…"> (Enter envía). */
export const formulario = (nombre, fn) => formularios.set(nombre, fn);
/** entrada('borrador', (el, ev) => …) para <input data-entrada-texto="…"> (cada tecla). */
export const entrada = (nombre, fn) => entradas.set(nombre, fn);

export function delegar(raiz) {
  raiz.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-accion]');
    if (!el || !raiz.contains(el)) return;
    const fn = acciones.get(el.dataset.accion);
    if (!fn) return;
    ev.preventDefault();
    fn(el, ev);
  });
  raiz.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-cambio]');
    if (!el) return;
    cambios.get(el.dataset.cambio)?.(el, ev);
  });
  raiz.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-entrada-texto]');
    if (el) entradas.get(el.dataset.entradaTexto)?.(el, ev);
  });
  raiz.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    formularios.get(f.dataset.form)?.(f, Object.fromEntries(new FormData(f)), ev);
  });
  // elementos que no son botones (p. ej. un hito del gráfico, role="button"): Enter y espacio los activan
  raiz.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = ev.target.closest('[data-accion][role="button"]');
    if (!el || el.tagName === 'BUTTON') return;
    const fn = acciones.get(el.dataset.accion);
    if (!fn) return;
    ev.preventDefault();
    fn(el, ev);
  });
}
