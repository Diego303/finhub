// Indicador de guardado (arriba a la derecha): si tus ficheros Markdown están guardados, guardándose, si algo
// no se pudo guardar, si no hay conexión o si estás en solo lectura; y lo que llega de fuera (otro equipo, una
// edición a mano). Cada cambio se escribe al momento en tu carpeta (temporal + fsync + renombrar): «guardado»
// quiere decir que ya está en el disco. La subida a la nube la hace tu servicio de sincronización.
import { html, pintar } from '../esc.js';
import { abrir, repintarModal } from './modal.js';
import { horaLocal } from '/core/fechas.js';

// Peticiones que escriben en tu carpeta (todas pasan por api.pedir)
export const ESCRITURAS = new Set(['/api/ops', '/api/deshacer', '/api/papelera/restaurar', '/api/conflicto/resolver', '/api/carpeta/cambiar', '/api/contexto/procesado']);
const MINIMO_MS = 350; // «guardando…» se ve al menos esto (sin parpadeos)
const MAX_HISTORIAL = 30;

const g = { enCurso: new Map(), ultimo: null, error: null, externo: null, historial: [], reciente: false };
let est = null;
let tReciente = null;
let tExterno = null;
let n = 0;
const hora = () => horaLocal() + new Date().toTimeString().slice(5, 8);
const QUE = { '/api/ops': 'cambio', '/api/deshacer': 'deshacer', '/api/papelera/restaurar': 'restaurar de la papelera', '/api/conflicto/resolver': 'resolver un conflicto', '/api/carpeta/cambiar': 'cambiar de carpeta', '/api/contexto/procesado': 'archivar un texto de CONTEXTO' };

function anotar(e) {
  g.historial.unshift(e);
  g.historial.length = Math.min(g.historial.length, MAX_HISTORIAL);
}

/** Empieza una escritura. → id para terminarla. */
export function empezarGuardado(ruta, que = null) {
  const id = ++n;
  g.enCurso.set(id, { desde: Date.now(), que: que ?? QUE[ruta] ?? 'cambio' });
  actualizar();
  return id;
}

/**
 * Termina una escritura. ok: {ficheros: [rutas]} · error: {estado, mensaje}. Un error 4xx (no válido, conflicto
 * de versión, solo lectura) no ha escrito nada: tus ficheros siguen guardados como estaban.
 */
export function terminarGuardado(id, { ficheros = null, error = null } = {}) {
  const e = g.enCurso.get(id);
  if (!e) return;
  // se anota al momento (el aviso de la operación le pondrá nombre); solo el cambio visual espera un poco
  if (error) {
    const noEscrito = error.estado >= 400 && error.estado < 500;
    anotar({ cuando: hora(), tipo: noEscrito ? 'rechazado' : 'error', que: e.que, mensaje: error.mensaje, ficheros: [] });
    if (!noEscrito) g.error = { cuando: hora(), mensaje: error.mensaje, que: e.que };
  } else {
    const lista = ficheros ?? [];
    g.ultimo = { cuando: hora(), que: e.que, ficheros: lista };
    g.error = null;
    anotar({ cuando: g.ultimo.cuando, tipo: lista.length ? 'guardado' : 'sin-cambios', que: e.que, ficheros: lista });
  }
  const fin = () => {
    g.enCurso.delete(id);
    if (!error) {
      g.reciente = true;
      clearTimeout(tReciente);
      tReciente = setTimeout(() => {
        g.reciente = false;
        actualizar();
      }, 2500);
    }
    actualizar();
  };
  const espera = MINIMO_MS - (Date.now() - e.desde);
  if (espera > 0) setTimeout(fin, espera);
  else fin();
}

/** Pone un nombre legible al último guardado (el texto del aviso: «Anotado en mes/2026-11.md»). */
export function describirUltimo(texto) {
  const h = g.historial.find((x) => x.tipo === 'guardado' || x.tipo === 'sin-cambios');
  if (h) h.que = texto;
  if (g.ultimo) g.ultimo.que = texto;
  repintarModal();
}

/** Cambios que llegan de fuera (otro equipo, la sincronización, una edición a mano). */
export function cambioExterno(rutas) {
  const lista = rutas.filter((r) => r !== '(otros)');
  if (!lista.length) return;
  g.externo = { cuando: hora(), ficheros: lista };
  anotar({ cuando: g.externo.cuando, tipo: 'externo', que: 'cambio de fuera (otro equipo o edición a mano)', ficheros: lista });
  clearTimeout(tExterno);
  tExterno = setTimeout(() => {
    g.externo = null;
    actualizar();
  }, 5000);
  actualizar();
}

/** Estado para pintar: {clase, icono, texto, detalle, estado} (de lo más importante a lo menos). */
export function estadoGuardado(estado = est) {
  const srv = estado?.servidor;
  if (estado?.error && !srv) return { estado: 'conectando', clase: 'mut', icono: '…', texto: 'conectando', detalle: 'Buscando el servidor de finhub.' };
  if (estado?.error) return { estado: 'sin-conexion', clase: 'mal', icono: '⚠', texto: 'sin conexión', detalle: 'No hay conexión con el servidor de finhub: lo que hagas ahora no se guardará. ¿Sigue en marcha? (finhub status)' };
  if (g.enCurso.size) return { estado: 'guardando', clase: 'curso', icono: '', texto: g.enCurso.size > 1 ? `guardando ${g.enCurso.size} cambios…` : 'guardando…', detalle: `Escribiendo en tu carpeta: ${[...g.enCurso.values()].map((e) => e.que).join(', ')}.` };
  if (g.error) return { estado: 'error', clase: 'mal', icono: '⚠', texto: 'no se guardó', detalle: `A las ${g.error.cuando} no se pudo guardar (${g.error.que}): ${g.error.mensaje}. Tus ficheros siguen como estaban antes de ese cambio.` };
  if (srv?.soloLectura) return { estado: 'solo-lectura', clase: 'aviso', icono: '🔒', texto: 'solo lectura', detalle: `${srv.candado?.aviso ?? 'Abierto en otro equipo'}: puedes ver tus datos, pero no se guarda nada hasta que tomes el control.` };
  if (srv?.nube?.length) return { estado: 'nube', clase: 'aviso', icono: '⚠', texto: 'ficheros sin leer', detalle: `No se pueden leer ahora (¿solo en la nube?): ${srv.nube.map((x) => x.ruta).join(', ')}. No se sobrescriben hasta poder leerlos; lo demás se guarda con normalidad.` };
  if (g.externo) return { estado: 'externo', clase: 'info', icono: '↻', texto: 'actualizado', detalle: `Han cambiado fuera de finhub (otro equipo o una edición a mano) y ya lo estás viendo: ${g.externo.ficheros.join(', ')}.` };
  if (g.ultimo) return { estado: 'guardado', clase: g.reciente ? 'ok reciente' : 'ok', icono: '✓', texto: `guardado ${g.ultimo.cuando.slice(0, 5)}`, detalle: `Todo guardado en tu carpeta. Último cambio a las ${g.ultimo.cuando}${g.ultimo.ficheros.length ? `: ${g.ultimo.ficheros.join(', ')}` : ''}.` };
  return { estado: 'guardado', clase: 'ok', icono: '✓', texto: 'todo guardado', detalle: 'Todo está guardado en tu carpeta: cada cambio se escribe al momento.' };
}

function contenido() {
  const s = estadoGuardado();
  return html`<button type="button" class="guardado ${s.clase}" data-accion="abrir-guardado" data-estado-guardado="${s.estado}" title="${s.detalle}" aria-label="Estado de guardado: ${s.texto}. ${s.detalle} Pulsa para ver el detalle.">${s.estado === 'guardando' ? html`<span class="spinner pequeno" aria-hidden="true"></span>` : html`<span aria-hidden="true">${s.icono}</span>`}<span>${s.texto}</span></button>`;
}

/** Para la cabecera: el indicador y su anuncio para lectores de pantalla (solo errores y avisos). */
export function indicadorGuardado(estado) {
  est = estado;
  return html`<span id="indicador-guardado">${contenido()}</span>`;
}

let anunciado = '';
function actualizar() {
  const el = document.getElementById('indicador-guardado');
  if (el) pintar(el, contenido());
  const s = estadoGuardado();
  const anuncio = ['error', 'sin-conexion', 'solo-lectura'].includes(s.estado) ? s.detalle : '';
  const viva = document.getElementById('anuncio-guardado');
  if (viva && anuncio !== anunciado) viva.textContent = anunciado = anuncio;
  repintarModal();
}

function cuerpo() {
  const s = estadoGuardado();
  const srv = est?.servidor;
  const ICONO = { guardado: '✓', 'sin-cambios': '·', error: '⚠', rechazado: '✗', externo: '↻' };
  return html`<div class="banda ${s.clase === 'mal' ? 'error' : s.clase === 'aviso' ? 'aviso' : ''}" style="display:block;margin-top:6px" data-detalle-guardado><b style="font-weight:500">${s.icono} ${s.texto}</b> · ${s.detalle}</div>
    <div class="lab" style="margin-top:10px">Dónde</div>
    <div style="font-size:11.5px">${srv?.carpeta.rutaWindows ?? '—'}${srv?.carpeta.ejemplo ? ' (ejemplo temporal: se borra al parar)' : ''}</div>
    <div class="mut" style="font-size:10.5px;line-height:1.6;margin-top:4px">Cada cambio se escribe al momento en un fichero Markdown de esa carpeta: primero en un temporal, se fuerza a disco y se renombra, así que nunca queda a medias. La subida a la nube la hace tu servicio de sincronización (Google Drive, OneDrive…): finhub no puede ver si ya ha subido. Copia diaria en .finhub/copias (las 14 últimas) y papelera de 30 días.</div>
    ${srv && (srv.conflictos.length || srv.nube.length || srv.soloLectura) ? html`<div class="lab" style="margin-top:10px">Revisa</div><div class="fila" style="gap:6px;flex-wrap:wrap">${srv.conflictos.length ? html`<button type="button" class="go" data-accion="conflictos">${srv.conflictos.length} conflicto(s) de sincronización</button>` : ''}${srv.soloLectura ? html`<button type="button" class="go" data-accion="tomar-control">tomar el control</button>` : ''}${srv.nube.length ? html`<span class="mut" style="font-size:10.5px">${srv.nube.length} fichero(s) sin poder leer</span>` : ''}</div>` : ''}
    <div class="lab" style="margin-top:10px">En esta sesión</div>
    ${g.historial.length ? html`<table class="tb" data-historial-guardado><thead><tr><th scope="col">hora</th><th scope="col">qué</th><th scope="col">ficheros</th></tr></thead><tbody>${g.historial.map((h) => html`<tr><td class="mut" style="white-space:nowrap">${ICONO[h.tipo]} ${h.cuando}</td><td>${h.que}${h.tipo === 'rechazado' ? html` <span class="mut">· no se guardó: ${h.mensaje}</span>` : h.tipo === 'error' ? html` <span style="color:var(--text-danger)">· error: ${h.mensaje}</span>` : h.tipo === 'sin-cambios' ? html` <span class="mut">· sin cambios en los ficheros</span>` : ''}</td><td class="mut" style="font-size:10.5px">${h.ficheros.join(', ') || '—'}</td></tr>`)}</tbody></table>` : html`<div class="mut" style="font-size:11px">Aún no has cambiado nada en esta sesión.</div>`}`;
}

export function abrirGuardado(estado) {
  est = estado;
  abrir({ titulo: 'Estado de guardado', cuerpo, ancho: true });
}

// cerrar la pestaña con un guardado a medias: el navegador pregunta
addEventListener('beforeunload', (ev) => {
  if (!g.enCurso.size) return;
  ev.preventDefault();
  ev.returnValue = '';
});
