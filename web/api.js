// Cliente de la API local. Los errores nunca son silenciosos: se ven en un toast en español.
import { toast } from './componentes/toast.js';
import { confirmar } from './componentes/modal.js';

const SESION = (() => {
  const k = 'finhub-sesion';
  let s = sessionStorage.getItem(k);
  if (!s) {
    s = crypto.getRandomValues(new Uint32Array(2)).join('-');
    sessionStorage.setItem(k, s);
  }
  return s;
})();

export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.error ?? `Error ${estado}`);
    this.estado = estado;
    this.codigo = datos?.codigo ?? null;
    this.datos = datos ?? {};
  }
}

export async function pedir(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Finhub-Sesion': SESION },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, { error: 'No hay conexión con el servidor de finhub. ¿Sigue en marcha? (finhub status)' });
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(r.status, datos);
  return datos;
}

export const obtener = (ruta) => pedir('GET', ruta);

let recargar = async () => {};
/** El estado registra cómo recargar los datos tras un 409 o un cambio. */
export const alRecargar = (fn) => (recargar = fn);

/**
 * Aplica una operación. Gestiona: mes cerrado (pide confirmación y reintenta), 409 por versión vieja
 * (recarga y avisa), solo lectura (423) y nube (503). Muestra el toast con «deshacer» 10 s.
 * → resultado o null si no se hizo.
 */
export async function op(nombre, args = {}, { versiones = {}, mensaje = 'Hecho', silencioso = false } = {}) {
  try {
    const r = await pedir('POST', '/api/ops', { op: nombre, args, versiones });
    await recargar();
    if (!silencioso) toast(mensaje, { deshacer: r.deshacer ? () => deshacer(r.deshacer) : null });
    return r;
  } catch (e) {
    if (e.codigo === 'mes_cerrado') {
      const si = await confirmar(e.message, { si: 'Editar igualmente', no: 'Cancelar' });
      return si ? op(nombre, { ...args, confirmarCerrado: true }, { versiones, mensaje, silencioso }) : null;
    }
    if (e.codigo === 'conflicto_version') {
      await recargar();
      toast('Ese fichero cambió (otro equipo o una edición a mano): he recargado los datos. Vuelve a intentarlo.', { tipo: 'error' });
      return null;
    }
    toast(e.message, { tipo: 'error' });
    return null;
  }
}

export async function deshacer(id) {
  try {
    await pedir('POST', '/api/deshacer', { id });
    await recargar();
    toast('Deshecho');
  } catch (e) {
    toast(e.message, { tipo: 'error' });
  }
}
