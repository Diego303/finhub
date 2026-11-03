// Delegación de eventos: los elementos llevan data-accion="nombre" (botones, para el teclado).
// Sin manejadores en línea: la CSP (script-src 'self') no los permitiría.
const acciones = new Map();
const cambios = new Map();

/** accion('abrir-r1', (el, ev) => …) */
export const accion = (nombre, fn) => acciones.set(nombre, fn);
/** cambio('tema', (el, ev) => …) para <select>/<input data-cambio="…"> */
export const cambio = (nombre, fn) => cambios.set(nombre, fn);

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
}
