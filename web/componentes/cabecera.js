// Cabecera (§5 Global): ☁ ruta de la carpeta con su estado · indicador de guardado · fecha · Gestión ▾.
// Y las bandas de aviso.
import { html } from '../esc.js';
import { textoLargo } from '/core/fechas.js';
import { menuGestion } from './gestion.js';
import { indicadorGuardado } from './guardado.js';

/** Estado de la carpeta en una frase corta, como «· sincronizada · al día». */
export function estadoCarpeta(srv) {
  if (!srv) return { texto: 'conectando…', aviso: false };
  if (srv.carpeta.ejemplo) return { texto: 'ejemplo · datos inventados', aviso: false };
  if (srv.soloLectura) return { texto: 'solo lectura', aviso: true };
  if (srv.conflictos.length) return { texto: `⚠ ${srv.conflictos.length} conflicto${srv.conflictos.length > 1 ? 's' : ''}`, aviso: true };
  if (srv.nube.length) return { texto: '⚠ ficheros solo en la nube', aviso: true };
  const sincronizada = /googledrive|google drive|onedrive|dropbox|mi unidad|my drive/i.test(srv.carpeta.rutaWindows);
  return { texto: `${sincronizada ? 'sincronizada · ' : ''}al día`, aviso: false };
}

export function cabecera(estado, { menuAbierto }) {
  const srv = estado.servidor;
  const ec = estadoCarpeta(srv);
  return html`<div class="cabecera">
    <button type="button" class="ruta ck" data-accion="abrir-ajustes" title="Cambiar carpeta de datos">finhub · ☁ <span>${srv?.carpeta.rutaWindows ?? ''}</span> <span class="mut estado-carpeta ${ec.aviso ? 'aviso' : ''}" style="font-size:10.5px">· ${ec.texto}</span></button>
    <span class="fila" style="gap:10px">${indicadorGuardado(estado)}<span class="mut">${textoLargo(estado.ahora.fecha)}</span>
      <span class="gestion"><button type="button" data-accion="gestion" aria-haspopup="menu" aria-expanded="${menuAbierto ? 'true' : 'false'}">Gestión ▾</button>${menuAbierto ? menuGestion() : ''}</span>
    </span>
  </div>`;
}

/** Bandas de aviso bajo la cabecera: conexión, solo lectura, nube y conflictos (§2.6, §14.17). */
export function bandas(estado) {
  const srv = estado.servidor;
  const lista = [];
  if (estado.error) lista.push(html`<div class="banda error" role="alert">${estado.error}<button type="button" data-accion="reintentar" style="color:inherit;border-color:currentColor">reintentar</button></div>`);
  if (!srv) return lista;
  if (srv.soloLectura) lista.push(html`<div class="banda aviso" role="status">🔒 ${srv.candado.aviso ?? 'Solo lectura'} · ves los datos pero no puedes cambiarlos <span class="fila" style="margin-left:auto"><span class="chip on">Solo lectura</span><button type="button" class="go" data-accion="tomar-control">Tomar el control</button></span></div>`);
  if (srv.nube.length) lista.push(html`<div class="banda aviso" role="status">☁ Algunos ficheros solo están en la nube o no se pueden leer ahora (${srv.nube.map((n) => n.ruta).join(', ')}): marca la carpeta como «Mantener siempre en este dispositivo». No se modifican hasta poder leerlos.</div>`);
  for (const c of srv.conflictos) lista.push(html`<div class="banda aviso" role="status">⚠ Conflicto en <b style="font-weight:500">${c.base}</b>: hay otra versión, «${c.ruta}» (${c.descripcion}). <button type="button" class="go" data-accion="conflictos" style="margin-left:auto">ver</button></div>`);
  return lista;
}
