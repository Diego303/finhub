// finhub · web. Sin build: módulos ES servidos por el servidor local; /core/ es el mismo código del servidor.
import { html, pintar } from './esc.js';
import { estado, alCambiar, cargar, sincronizar, ponerRex } from './estado.js';
import { accion, delegar } from './acciones.js';
import { pedir } from './api.js';
import { toast } from './componentes/toast.js';
import { abrir, confirmar, hayModal, repintarModal } from './componentes/modal.js';
import { cabecera, bandas } from './componentes/cabecera.js';
import { abrirEntrada } from './componentes/gestion.js';
import { cajaPendientes, abrirDestino } from './componentes/pendientes.js';
import { barraR1, abrirR1 } from './componentes/r1.js';
import { abrirAjustes } from './componentes/ajustes.js';
import { abrirPapelera } from './componentes/papelera.js';
import { arrancarAnimacion } from './componentes/rex-sprite.js';
import * as basicas from './vistas/basicas.js';
import { vistaRex, ponerModo, ponerExplicame, quitarExplicame } from './vistas/rex.js';
import { vistaPanel } from './vistas/panel.js';
import { vistaConocimiento, iniciarConocimiento, registrarAccionesConocimiento } from './vistas/conocimiento.js';
import { vistaHerramientas, iniciarHerramientas, registrarAccionesHerramientas } from './vistas/herramientas.js';
import { vistaTuAnio, registrarAccionesTuAnio } from './vistas/tu-ano.js';
import { muestrario } from './vistas/muestrario.js';
import { vistaMes, iniciarMes, registrarAccionesMes, enDobleClic, abrirRecurrentes, abrirCierre } from './vistas/mes.js';
import { iniciarEditores, registrarEditores } from './componentes/editores.js';
import { vistaMetas, iniciarMetas, registrarAccionesMetas } from './vistas/metas.js';
import { vistaCartera, iniciarCartera, registrarAccionesCartera, abrirValores, abrirActivosObjetivo } from './vistas/cartera.js';

export const PESTANAS = [
  ['panel', 'Panel', vistaPanel],
  ['mes', 'Mes', vistaMes],
  ['cartera', 'Cartera', vistaCartera],
  ['metas', 'Metas', vistaMetas],
  ['herramientas', 'Herramientas', vistaHerramientas],
  ['analisis', 'Análisis', basicas.analisis],
  ['descubrimientos', '🔭 Descubrimientos', basicas.descubrimientos],
  ['conocimiento', 'Conocimiento', vistaConocimiento],
  ['rex', '🦖 Rex', vistaRex],
  ['tuano', '✦ Tu año', vistaTuAnio],
];
const OCULTAS = { muestrario };
const SIN_LATERAL = new Set(['rex', 'tuano']);
let menuAbierto = false;

function vistaDesdeHash() {
  const h = location.hash.replace(/^#/, '');
  return PESTANAS.some((p) => p[0] === h) || OCULTAS[h] ? h : 'panel';
}

function pestanas() {
  return html`<div class="tabs" role="tablist" aria-label="Secciones">${PESTANAS.map(([id, titulo]) => html`<button type="button" role="tab" id="pestana-${id}" aria-selected="${estado.vista === id ? 'true' : 'false'}" aria-controls="contenido" tabindex="${estado.vista === id ? '0' : '-1'}" data-accion="vista" data-vista="${id}">${titulo}</button>`)}</div>`;
}

function contenido() {
  if (estado.cargando) return html`<div class="carga mut">Cargando tu carpeta…</div>`;
  if (!estado.modelo) return html`<div class="carga mut">No se pudieron cargar los datos.</div>`;
  const pestana = PESTANAS.find((p) => p[0] === estado.vista);
  const principal = pestana ? pestana[2](estado) : OCULTAS[estado.vista](estado);
  if (SIN_LATERAL.has(estado.vista)) return principal;
  return html`<div class="rejilla"><div>${principal}</div><aside class="lateral" aria-label="Pendientes y Rex">${cajaPendientes(estado)}</aside></div>`;
}

export function render() {
  const t0 = performance.now();
  const activo = document.activeElement;
  const cursor = activo && typeof activo.selectionStart === 'number' ? activo.selectionStart : null;
  const clave = activo?.id || (activo?.dataset?.accion ? `${activo.dataset.accion}|${activo.dataset.vista ?? activo.dataset.destino ?? activo.dataset.modo ?? ''}` : null);
  const marco = document.getElementById('marco');
  pintar(
    marco,
    html`${cabecera(estado, { menuAbierto })}${bandas(estado)}${pestanas()}
      <main id="contenido" role="tabpanel" aria-labelledby="pestana-${estado.vista}">${contenido()}</main>
      ${barraR1()}`,
  );
  if (clave && !hayModal()) {
    const [acc, dato] = clave.split('|');
    const el = dato !== undefined ? marco.querySelector(`[data-accion="${acc}"][data-vista="${dato}"], [data-accion="${acc}"][data-destino="${dato}"], [data-accion="${acc}"][data-modo="${dato}"], [data-accion="${acc}"]`) : document.getElementById(clave);
    el?.focus({ preventScroll: true });
    if (el && cursor !== null && el.setSelectionRange && el.id === activo.id) el.setSelectionRange(cursor, cursor);
  }
  repintarModal();
  const ms = Math.round(performance.now() - t0);
  estado.tiempos.render = ms;
  marco.dataset.renderMs = String(ms);
  marco.dataset.vista = estado.vista;
}

// ---------- acciones ----------
accion('vista', (el) => {
  menuAbierto = false;
  if (location.hash === `#${el.dataset.vista}`) render();
  else location.hash = el.dataset.vista;
});
accion('gestion', () => {
  menuAbierto = !menuAbierto;
  render();
  if (menuAbierto) document.querySelector('.menu-gestion button')?.focus();
});
accion('gestion-entrada', (el) => {
  menuAbierto = false;
  render();
  const id = el.dataset.entrada;
  if (id === 'ajustes') return abrirAjustes(estado);
  if (id === 'seguridad') return abrirR1();
  if (id === 'papelera') return abrirPapelera(cargar);
  if (id === 'activos') return abrirActivosObjetivo();
  if (id === 'metas' || id === 'conocimiento') {
    location.hash = id;
    return;
  }
  abrirEntrada(id, estado.modelo);
});
accion('abrir-ajustes', () => estado.servidor && estado.modelo && abrirAjustes(estado));
accion('abrir-r1', () => abrirR1());
accion('reintentar', () => cargar());
accion('tomar-control', async () => {
  if (!(await confirmar('El otro equipo pasará a solo lectura. Si estaba editando, podría perder ese cambio. ¿Tomas el control?', { si: 'Tomar el control' }))) return;
  try {
    await pedir('POST', '/api/candado/tomar', {});
    await cargar();
    toast('Has tomado el control');
  } catch (e) {
    toast(e.message, { tipo: 'error' });
  }
});
accion('conflictos', () =>
  abrir({
    titulo: 'Conflictos de sincronización',
    cuerpo: html`<div class="mut" style="font-size:11px;margin:6px 0">El servicio de sincronización dejó otra versión de estos ficheros. No se mezclan con tus datos hasta que elijas.</div>${estado.servidor.conflictos.map((c) => html`<div class="pd" style="grid-template-columns:1fr"><span><b style="font-weight:500">${c.base}</b> ↔ ${c.ruta}<div class="mut" style="font-size:10.5px">${c.descripcion}</div></span></div>`)}<div class="mut" style="font-size:10.5px;margin-top:8px">Resolver (quedarte con una, fusionar por entidades o editar a mano) llega en la fase F12.</div>`,
  }),
);
accion('pendiente', (el) => {
  const d = el.dataset.destino;
  const vistas = { mes: 'mes', descubrimientos: 'descubrimientos', predicciones: 'conocimiento', contexto: 'conocimiento', pausas: 'rex' };
  if (d === 'recurrentes') return abrirRecurrentes(estado);
  if (d === 'cierre') return abrirCierre(estado);
  if (d === 'valores') return abrirValores(estado);
  if (d === 'pausas') ponerModo('pausa');
  if (vistas[d]) location.hash = vistas[d];
  else abrirDestino(d, estado);
});
accion('explicame', (el) => {
  ponerExplicame({ cifra: el.dataset.cifra, valor: el.dataset.valor, detalle: el.dataset.detalle });
  if (location.hash === '#rex') render();
  else location.hash = 'rex';
});
accion('explicame-quitar', () => {
  quitarExplicame();
  render();
});
accion('rex-modo', (el) => {
  ponerModo(el.dataset.modo);
  render();
});
accion('rex-estado', (el) => {
  ponerRex(el.dataset.estado);
  render();
});
accion('demo-toast', () => toast('Anotado en mes/2026-11.md'));
accion('demo-toast-deshacer', () => toast('«Concierto» borrado', { deshacer: () => toast('Deshecho') }));
accion('demo-error', () => toast('No se pudo guardar: el fichero solo está en la nube', { tipo: 'error' }));
accion('demo-modal', () => abrir({ titulo: 'Modal de ejemplo', cuerpo: html`<p style="font-size:12px">Esc, clic fuera o × lo cierran. El foco vuelve a donde estaba.</p><input class="inp" aria-label="campo de ejemplo" placeholder="campo">` }));
accion('demo-confirmar', async () => toast((await confirmar('¿Seguro?')) ? 'Sí' : 'No'));

// ---------- teclado ----------
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && menuAbierto && !hayModal()) {
    menuAbierto = false;
    render();
    document.querySelector('[data-accion="gestion"]')?.focus();
  }
  const pestana = ev.target.closest?.('[role=tab]');
  if (pestana && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) {
    const lista = [...pestana.parentElement.querySelectorAll('[role=tab]')];
    const i = lista.indexOf(pestana);
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? lista.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + lista.length) % lista.length;
    ev.preventDefault();
    lista[j].focus();
    lista[j].click();
  }
});
document.addEventListener('click', (ev) => {
  if (menuAbierto && !ev.target.closest('.gestion')) {
    menuAbierto = false;
    render();
  }
});
document.addEventListener('finhub:toast', (ev) => {
  if (ev.detail?.tipo === 'error') ponerRex('preocupado', 4000);
});
window.addEventListener('error', (ev) => toast(`Algo ha fallado en la página: ${ev.message}`, { tipo: 'error' }));
window.addEventListener('unhandledrejection', (ev) => toast(`Algo ha fallado: ${ev.reason?.message ?? ev.reason}`, { tipo: 'error' }));

// ---------- arranque ----------
window.addEventListener('hashchange', () => {
  estado.vista = vistaDesdeHash();
  render();
});
estado.vista = vistaDesdeHash();
delegar(document.getElementById('app'));
iniciarMes({ estado, render });
registrarAccionesMes();
iniciarCartera({ estado, render });
registrarAccionesCartera();
iniciarMetas({ estado, render });
registrarAccionesMetas();
iniciarHerramientas({ estado, render });
registrarAccionesHerramientas();
registrarAccionesTuAnio(() => estado);
iniciarConocimiento({ estado, render });
registrarAccionesConocimiento();
iniciarEditores(() => estado);
registrarEditores();
document.getElementById('app').addEventListener('dblclick', (ev) => enDobleClic(ev));
alCambiar(render);
render();
arrancarAnimacion();
cargar().then(sincronizar);
