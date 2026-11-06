// Deshacer (§2.5): las últimas 30 inversas por sesión. Una inversa solo se aplica si los ficheros
// siguen exactamente como los dejó la operación; si no, «el fichero cambió después».
import { randomBytes } from 'node:crypto';
import { versionDe } from './almacen.js';

export const MAX_POR_SESION = 30;
export const DURACION_MS = 10 * 1000; // §2.5: lo que dura el toast
export const GRACIA_MS = 5 * 1000; // el viaje de ida y vuelta, con la máquina ocupada

export class Deshacer {
  constructor({ ahora = () => Date.now() } = {}) {
    this.sesiones = new Map();
    this.ahora = ahora;
  }

  /** Guarda la inversa de una operación aplicada. `esperado` = {ruta: texto|null} tras la operación. */
  guardar(sesion, { op, inversa, esperado, papelera = [] }) {
    if (!inversa) return null;
    const id = `d-${randomBytes(4).toString('hex')}`;
    const pila = this.sesiones.get(sesion) ?? [];
    pila.push({ id, op, inversa, versiones: Object.fromEntries(Object.entries(esperado).map(([r, t]) => [r, t === null ? null : versionDe(t)])), papelera, creado: this.ahora() });
    while (pila.length > MAX_POR_SESION) pila.shift();
    this.sesiones.set(sesion, pila);
    return id;
  }

  /** Saca la entrada `id` (o la última) de la pila de la sesión. */
  tomar(sesion, id = null) {
    const pila = this.sesiones.get(sesion) ?? [];
    const i = id ? pila.findIndex((x) => x.id === id) : pila.length - 1;
    if (i < 0 || this.ahora() - pila[i].creado > DURACION_MS + GRACIA_MS) return null;
    return pila.splice(i, 1)[0];
  }

  devolver(sesion, entrada) {
    const pila = this.sesiones.get(sesion) ?? [];
    pila.push(entrada);
    this.sesiones.set(sesion, pila);
  }
}
