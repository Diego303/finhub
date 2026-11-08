// «Pendientes hoy» (maqueta: pend()) y la mini tarjeta de Rex. Los cálculos: /core/resumen.js.
import { html } from '../esc.js';
import { pendientes } from '/core/resumen.js';
import { textoCorto } from '/core/fechas.js';
import { rex } from './rex-sprite.js';

export function cajaPendientes(estado) {
  const p = pendientes(estado.modelo, estado.ahora, { contexto: estado.servidor?.contexto ?? [], conflictos: estado.servidor?.conflictos ?? [] });
  const pulsoHecho = p.elementos.find((e) => e.id === 'pulso')?.hecho;
  return html`<section class="box" aria-labelledby="titulo-pendientes">
      <div class="entre"><h2 class="lab" id="titulo-pendientes" style="margin:0;font-weight:400">Pendientes hoy</h2><span class="mut" style="font-size:10.5px" aria-label="${p.hechos} de ${p.total} hechos">${p.hechos} / ${p.total}</span></div>
      ${p.elementos.map(
        (e) => html`<div class="pd"><div class="cb ${e.hecho ? 'ok' : ''}" aria-hidden="true">${e.hecho ? '✓' : ''}</div>
          <div><div style="${e.hecho ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${e.titulo}<span class="sr-only">${e.hecho ? ' (hecho)' : ' (pendiente)'}</span></div><div class="mut" style="font-size:10.5px">${e.detalle}</div></div>
          ${e.accion ? html`<button type="button" class="go ${e.hecho ? '' : 'pri'}" data-accion="pendiente" data-destino="${e.accion.destino}">${e.accion.texto}</button>` : ''}</div>`,
      )}
      <div class="lab" style="margin-top:10px">Próximos</div>
      <div style="font-size:11px;line-height:1.8">${p.proximos.map((x) => html`${textoCorto(x.fecha)} · ${x.destino ? html`<button type="button" class="enlace" data-accion="pendiente" data-destino="${x.destino}">${x.texto}</button>` : x.texto}${x.importe ? html` <b style="font-weight:500">${x.importe}</b>` : ''}<br>`)}</div>
      <div class="mut" style="font-size:10.5px;margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)">Nada se ejecuta solo. Cada botón es tu luz verde.</div>
    </section>
    <button type="button" class="box ck mini-rex" data-accion="vista" data-vista="rex">${rex(46, 40, estado.rex)}<span style="font-size:11px;text-align:left">${pulsoHecho ? '«Pulso hecho. ¿Te lo resumo?»' : '«¿Hacemos el pulso de hoy?»'}<span class="mut" style="font-size:10.5px;display:block">abrir Rex →</span></span></button>`;
}

/** Destino de un pendiente que no tiene modal propio: la pestaña donde se hace. */
export function abrirDestino(destino) {
  const vistas = { valores: 'cartera', datos: 'conocimiento', cierre: 'mes', recurrentes: 'mes', pulso: 'conocimiento' };
  location.hash = vistas[destino] ?? 'panel';
}
