// Estado de la página: datos del servidor parseados con /core/ (isomórfico) y sincronización.
// Cambios: SSE (/api/eventos) y, de respaldo, sondeo de /api/version cada 2 s (§2).
import { obtener, alRecargar } from './api.js';
import { construirModelo } from '/core/modelo.js';
import { fechaLocal, horaLocal } from '/core/fechas.js';

export const estado = {
  cargando: true,
  error: null,
  servidor: null, // /api/estado
  modelo: null,
  version: -1,
  vista: 'panel',
  rex: 'quieto',
  ahora: { fecha: fechaLocal(), hora: horaLocal() },
  tiempos: {},
};

const oyentes = new Set();
export const alCambiar = (fn) => oyentes.add(fn);
export function avisar() {
  for (const fn of oyentes) fn(estado);
}

/** Tema: auto (sistema), claro u oscuro (ajustes.md → tema). */
function aplicarTema() {
  const t = estado.modelo?.ajustes.tema ?? 'auto';
  if (t === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
}

let cargaEnCurso = null;
export function cargar() {
  if (cargaEnCurso) return cargaEnCurso;
  cargaEnCurso = (async () => {
    try {
      const t0 = performance.now();
      const [servidor, datos] = await Promise.all([obtener('/api/estado'), obtener('/api/datos')]);
      const t1 = performance.now();
      estado.servidor = servidor;
      estado.modelo = construirModelo(datos.ficheros);
      estado.version = datos.version;
      estado.ahora = { fecha: fechaLocal(), hora: horaLocal() };
      estado.tiempos.carga = Math.round(t1 - t0);
      estado.tiempos.modelo = Math.round(performance.now() - t1);
      estado.error = null;
      aplicarTema();
    } catch (e) {
      estado.error = e.message;
    } finally {
      estado.cargando = false;
      cargaEnCurso = null;
      avisar();
    }
  })();
  return cargaEnCurso;
}
alRecargar(cargar);

/** Recarga solo el estado del servidor (candado, conflictos), sin volver a pedir los datos. */
async function recargarServidor() {
  try {
    estado.servidor = await obtener('/api/estado');
    avisar();
  } catch {
    /* el sondeo lo reintentará */
  }
}

export function sincronizar() {
  const fuente = new EventSource('/api/eventos');
  fuente.addEventListener('version', (ev) => {
    const { version } = JSON.parse(ev.data);
    if (version !== estado.version) cargar();
  });
  fuente.addEventListener('candado', recargarServidor);
  fuente.addEventListener('carpeta', cargar);
  setInterval(async () => {
    try {
      const v = await obtener('/api/version');
      if (v.version !== estado.version) await cargar();
      else if (v.soloLectura !== estado.servidor?.soloLectura) await recargarServidor();
    } catch {
      if (!estado.error) {
        estado.error = 'Sin conexión con el servidor de finhub';
        avisar();
      }
    }
  }, 2000);
}

/** Estado de Rex (quieto · piensa · habla · feliz · preocupado). Con `ms`, vuelve solo a quieto. */
let tRex = null;
export function ponerRex(e, ms = 0) {
  estado.rex = e;
  clearTimeout(tRex);
  if (ms) tRex = setTimeout(() => ponerRex('quieto'), ms);
  document.querySelectorAll('[data-rex]').forEach((el) => (el.dataset.rexEstado = e));
}
