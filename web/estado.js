// Estado de la página: datos del servidor parseados con /core/ (isomórfico) y sincronización.
// Cambios: SSE (/api/eventos) y, de respaldo, sondeo de /api/version cada 2 s (§2).
import { obtener, alRecargar, fijarVersionVista } from './api.js';
import { construirModelo } from '/core/modelo.js';
import { fechaLocal, horaLocal } from '/core/fechas.js';
import { humorRex, huchaRex, accesoriosRex } from '/core/rex.js';
import { ponerAccesoriosFijos } from './componentes/rex-sprite.js';
import { cambioExterno } from './componentes/guardado.js';

export const estado = {
  cargando: true,
  error: null,
  servidor: null, // /api/estado
  modelo: null,
  version: -1,
  vista: 'panel',
  rex: 'quieto',
  reposo: 'quieto', // en reposo, Rex está preocupado si tu tasa de ahorro está baja (§5)
  guarida: null, // {humor, hucha, accesorios}
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
let otraCarga = null;
/**
 * Pide los datos y reconstruye el modelo. Si ya hay una carga en marcha, esa pudo pedir los datos ANTES
 * del cambio que motiva esta llamada: se encadena una más (una sola, aunque lleguen varias peticiones).
 */
export function cargar() {
  if (cargaEnCurso) {
    otraCarga ??= cargaEnCurso.then(() => {
      otraCarga = null;
      return cargar();
    });
    return otraCarga;
  }
  cargaEnCurso = (async () => {
    try {
      const t0 = performance.now();
      const [servidor, datos] = await Promise.all([obtener('/api/estado'), obtener('/api/datos')]);
      const t1 = performance.now();
      estado.servidor = servidor;
      estado.modelo = construirModelo(datos.ficheros);
      estado.version = datos.version;
      fijarVersionVista(datos.version);
      estado.ahora = { fecha: fechaLocal(), hora: horaLocal() };
      estado.tiempos.carga = Math.round(t1 - t0);
      estado.tiempos.modelo = Math.round(performance.now() - t1);
      estado.error = null;
      aplicarTema();
      calcularGuarida();
      vigilarAciertos();
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

// §14.18: cuando una predicción de un descubrimiento sale bien (a mano o sola), Rex lo celebra
let acertadas = null;
function vigilarAciertos() {
  const ahora = new Set(estado.modelo.predicciones.filter((p) => p.fuente === 'finhub-descubrir' && p.estado === 'acertada').map((p) => p.id));
  const nuevas = acertadas ? [...ahora].filter((id) => !acertadas.has(id)) : [];
  acertadas = ahora;
  if (nuevas.length) {
    const p = estado.modelo.predicciones.find((x) => x.id === nuevas[0]);
    document.dispatchEvent(new CustomEvent('finhub:celebrar', { detail: { texto: `🎉 ¡Acertó! «${p.texto}»${p.descubrimiento ? ` (${p.descubrimiento})` : ''}` } }));
  }
}

/** Humor, hucha y accesorios de Rex (una vez por carga, no en cada repintado). */
function calcularGuarida() {
  try {
    const m = estado.modelo;
    const hoy = estado.ahora.fecha;
    const humor = humorRex(m, hoy);
    const acc = accesoriosRex(m, hoy);
    estado.guarida = { humor, hucha: huchaRex(m, hoy), accesorios: acc.lista, error: acc.error ?? null };
    ponerAccesoriosFijos(acc.lista.filter((a) => a.logrado).map((a) => a.id));
    const reposo = humor.humor === 'preocupado' ? 'preocupado' : 'quieto';
    if (estado.rex === estado.reposo) estado.rex = reposo;
    estado.reposo = reposo;
  } catch (e) {
    estado.guarida = { humor: { humor: 'tranquilo', tasaPb: null }, hucha: null, accesorios: [], error: e.message };
  }
}

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
    const { version, rutas = [], origen } = JSON.parse(ev.data);
    if (origen === 'disco') cambioExterno(rutas);
    if (version !== estado.version) cargar();
  });
  fuente.addEventListener('candado', recargarServidor);
  fuente.addEventListener('carpeta', cargar);
  fuente.addEventListener('progreso', (ev) => document.dispatchEvent(new CustomEvent('finhub:progreso', { detail: JSON.parse(ev.data) })));
  fuente.addEventListener('claude', (ev) => document.dispatchEvent(new CustomEvent('finhub:claude-evento', { detail: JSON.parse(ev.data) })));
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
  if (ms) tRex = setTimeout(() => ponerRex(estado.reposo), ms);
  document.querySelectorAll('[data-rex]').forEach((el) => (el.dataset.rexEstado = e));
}
