// «Pendientes hoy» (maqueta: pend()) y la mini tarjeta de Rex. Los cálculos: /core/resumen.js.
import { html } from '../esc.js';
import { pendientes } from '/core/resumen.js';
import { textoCorto, sumarDias, DIAS_SEMANA, diaSemana } from '/core/fechas.js';
import { recurrentesDelMes } from '/core/recurrentes.js';
import { formatearEuros } from '/core/dinero.js';
import { rex } from './rex-sprite.js';
import { abrir } from './modal.js';

export function cajaPendientes(estado) {
  const p = pendientes(estado.modelo, estado.ahora, { contexto: estado.servidor?.contexto ?? [] });
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

/** Modales de los destinos que aún no tienen su pantalla: muestran los datos reales y dicen cuándo llegan. */
export function abrirDestino(destino, estado) {
  const m = estado.modelo;
  const hoy = estado.ahora.fecha;
  if (destino === 'pulso') {
    const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i - 13));
    const porDia = Object.fromEntries(m.mundo.map((d) => [d.fecha, d.notas.length]));
    return abrir({
      titulo: 'Pulso de noticias',
      cuerpo: html`<div class="lab" style="margin-top:10px">¿De qué día?</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${dias.map((f) => html`<div style="text-align:center;padding:5px 0;border-radius:6px;border:.5px solid ${f === hoy ? 'var(--text-primary)' : 'var(--border)'};${porDia[f] ? '' : 'background:var(--bg-warning)'}"><div style="font-size:10px">${DIAS_SEMANA[diaSemana(f)].slice(0, 3)} ${+f.slice(8)}</div><div class="mut" style="font-size:10px">${porDia[f] ? `${porDia[f]} not.` : 'sin pulso'}</div></div>`)}</div>
        <div style="background:var(--surface-1);border-radius:8px;padding:8px 10px;font-size:10.5px;margin-top:10px" class="mut">🔒 Trabajo aislado <b style="font-weight:500;color:var(--text-primary)">pulso</b>: con internet · <b style="font-weight:500;color:var(--text-primary)">sin acceso</b> a tus gastos ni a tu cartera · solo escribe en conocimiento/mundo/</div>
        <div class="entre" style="margin-top:12px"><span class="mut" style="font-size:10.5px">El pulso con Claude llega en la fase F10.</span><button type="button" class="pri" disabled>Hacer pulso</button></div>`,
    });
  }
  if (destino === 'recurrentes') {
    const p = pendientes(m, estado.ahora);
    const mes = m.mes(p.mes);
    const lista = recurrentesDelMes(m.recurrentes, p.mes, { inicio: m.ajustes.mes_inicio_dia });
    return abrir({
      titulo: `Recurrentes del mes`,
      cuerpo: html`<div class="mut" style="font-size:11px;margin:6px 0 8px">Se proponen cada mes desde tu plantilla de recurrentes. Confirmar, cambiar el importe o saltarlo llega en la fase F4.</div>
        ${lista.map(({ rec, fecha }) => {
          const marca = mes?.marcas[rec.id];
          return html`<div class="pd" style="grid-template-columns:16px 1fr auto auto"><div class="cb ${marca ? 'ok' : ''}" aria-hidden="true">${marca ? '✓' : ''}</div><span>${rec.concepto} <span class="mut">· ${textoCorto(fecha)}</span></span><span class="mut">${formatearEuros(rec.importe, 2)}</span><span class="mut" style="font-size:10.5px">${marca ?? 'pendiente'}</span></div>`;
        })}`,
    });
  }
  const textos = {
    valores: ['Actualizar el valor de tu cartera', 'F5', `Última foto: ${m.fotos.at(-1)?.fecha ?? '—'} · ${m.fotos.at(-1)?.filas.length ?? 0} activos. Escribirlos a mano o pedir precios (solo ISIN) a Claude.`],
    datos: ['Datos de mercado', 'F9', `${m.series.length} series en conocimiento/datos/series/. Se crean y actualizan en tu máquina con el trabajo «datos», con tu luz verde.`],
    cierre: ['Cerrar el mes', 'F4', 'Revisión de movimientos, recurrentes, valor de la cartera y saldos; foto del mes y una lección opcional.'],
  };
  const t = textos[destino];
  if (t) abrir({ titulo: t[0], cuerpo: html`<p style="font-size:12px;margin:10px 0 4px">${t[2]}</p><p class="mut" style="font-size:11px;margin:0">Llega en la fase ${t[1]}.</p>` });
}
