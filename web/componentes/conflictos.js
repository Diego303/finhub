// Conflictos de sincronización (§2.6, §9.23, §14.17): cada copia en conflicto con sus diferencias por entidad
// (tu versión frente a la otra) y cuatro salidas: quedarte con la tuya, con la otra, fusionar por entidades
// o arreglarlo a mano. Lo descartado va a la papelera y se puede restaurar.
import { html } from '../esc.js';
import { accion } from '../acciones.js';
import { abrir, cerrar, confirmar, repintarModal } from './modal.js';
import { obtener, pedir } from '../api.js';
import { toast } from './toast.js';

const cf = { ruta: null, detalle: null, error: null, ocupado: false };
let est = null;

function cuerpo() {
  const lista = est.servidor?.conflictos ?? [];
  if (!lista.length) return html`<div class="mut" style="font-size:11.5px;margin-top:8px">No hay conflictos de sincronización. ✓</div>`;
  const d = cf.detalle;
  return html`<div class="mut" style="font-size:11px;margin:6px 0">El servicio de sincronización dejó otra versión de estos ficheros (dos equipos guardaron a la vez). No se mezclan con tus datos hasta que elijas. Lo que descartes va a la papelera 30 días.</div>
    <div role="list">${lista.map((c) => html`<div role="listitem" class="pd" style="grid-template-columns:1fr auto"><span><b style="font-weight:500">${c.base}</b> ↔ ${c.ruta}<div class="mut" style="font-size:10.5px">${c.descripcion}</div></span><button type="button" class="go ${cf.ruta === c.ruta ? 'pri' : ''}" data-accion="cf-ver" data-ruta="${c.ruta}" aria-expanded="${cf.ruta === c.ruta ? 'true' : 'false'}">ver diferencias</button></div>`)}</div>
    ${cf.error ? html`<div class="banda aviso" style="margin-top:8px">${cf.error}</div>` : ''}
    ${d ? html`<div style="margin-top:10px" data-conflicto>${d.diferencias.length ? d.diferencias.map((x) => html`<div class="lab" style="margin-top:8px">${x.seccion}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10.5px"><div><div class="mut">solo en tu versión (${d.base})</div>${x.soloTuya.length ? x.soloTuya.map((l) => html`<div style="background:var(--surface-1);padding:2px 4px;border-radius:4px;margin:2px 0;white-space:pre-wrap">${l}</div>`) : html`<div class="mut">—</div>`}</div><div><div class="mut">solo en la otra</div>${x.soloOtra.length ? x.soloOtra.map((l) => html`<div style="background:var(--bg-warning);padding:2px 4px;border-radius:4px;margin:2px 0;white-space:pre-wrap">${l}</div>`) : html`<div class="mut">—</div>`}</div></div>`) : html`<div class="mut" style="font-size:11px">Las dos versiones tienen las mismas entidades (solo cambian espacios u orden).</div>`}
      ${d.fusion.ok ? (d.fusion.ignoradas.length ? html`<div class="mut" style="font-size:10.5px;margin-top:6px">Al fusionar, en ${d.fusion.ignoradas.length} valor(es) distinto(s) se queda el tuyo: ${d.fusion.ignoradas.slice(0, 3).join(' · ')}</div>` : '') : html`<div class="mut" style="font-size:10.5px;margin-top:6px">No se puede fusionar solo: ${d.fusion.error}</div>`}
      <div class="fila" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button type="button" class="go" data-accion="cf-resolver" data-modo="tuya" ${cf.ocupado ? 'disabled' : ''}>quedarme con la mía</button><button type="button" class="go" data-accion="cf-resolver" data-modo="otra" ${cf.ocupado ? 'disabled' : ''}>quedarme con la otra</button><button type="button" class="go pri" data-accion="cf-resolver" data-modo="fusionar" ${d.fusion.ok && !cf.ocupado ? '' : 'disabled'}>fusionar por entidades</button><button type="button" class="go" data-accion="cf-resolver" data-modo="hecho" ${cf.ocupado ? 'disabled' : ''}>ya lo he arreglado a mano</button></div>
      <div class="mut" style="font-size:10px;margin-top:4px">A mano: abre los dos ficheros en tu editor, pasa a ${d.base} lo que quieras conservar y pulsa «ya lo he arreglado a mano» (la copia en conflicto irá a la papelera).</div></div>` : ''}`;
}

export function abrirConflictos(estado) {
  est = estado;
  Object.assign(cf, { ruta: null, detalle: null, error: null });
  abrir({ titulo: 'Conflictos de sincronización', cuerpo, ancho: true });
}

export function registrarConflictos(estado, recargar) {
  est = estado;
  accion('conflictos', () => abrirConflictos(estado));
  accion('cf-ver', async (el) => {
    cf.ruta = el.dataset.ruta;
    cf.error = null;
    try {
      cf.detalle = await obtener(`/api/conflicto?ruta=${encodeURIComponent(cf.ruta)}`);
    } catch (e) {
      cf.detalle = null;
      cf.error = e.message;
    }
    repintarModal();
  });
  accion('cf-resolver', async (el) => {
    const modo = el.dataset.modo;
    const textos = { tuya: `¿Te quedas con tu versión de ${cf.detalle.base}? La otra va a la papelera.`, otra: `¿Te quedas con la otra versión? La tuya de ${cf.detalle.base} va a la papelera.`, fusionar: `¿Fusionar? Se añaden a ${cf.detalle.base} las entidades que solo están en la otra; las dos versiones originales quedan en la papelera.`, hecho: `¿Ya pasaste a ${cf.detalle.base} lo que querías? La copia en conflicto irá a la papelera.` };
    if (!(await confirmar(textos[modo], { si: 'Sí' }))) return;
    cf.ocupado = true;
    repintarModal();
    try {
      await pedir('POST', '/api/conflicto/resolver', { ruta: cf.ruta, modo });
      await recargar();
      toast(`Conflicto de ${cf.detalle.base} resuelto · lo descartado está en la papelera`);
      Object.assign(cf, { ruta: null, detalle: null });
      if (!(est.servidor?.conflictos ?? []).length) cerrar();
      else repintarModal();
    } catch (e) {
      cf.error = e.message;
      repintarModal();
    } finally {
      cf.ocupado = false;
    }
  });
}
