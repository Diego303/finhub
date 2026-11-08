// Pestaña Panel (§5, maqueta: panel()): resumen al abrir, 4 KPI con «?», línea de tiempo con hitos, flujo
// del mes, último pulso, metas y la tarjeta de Tu año. Cálculos: /core/panel.js (por código, sin IA).
import { html } from '../esc.js';
import { rex } from '../componentes/rex-sprite.js';
import { graficoLineaTiempo } from '../graficos/linea-tiempo.js';
import { resumenAlAbrir, kpisPanel, lineaDeTiempo, flujoDelMes, ultimoPulso } from '/core/panel.js';
import { progresoMetas } from '/core/metas.js';
import { formatearEuros, formatearPct } from '/core/dinero.js';
import { tituloMes, textoCorto } from '/core/fechas.js';

const eur = (c) => formatearEuros(c, 0);
const pct = (t) => (t === null || t === undefined ? '—' : formatearPct(Math.round(t * 10000)));
const EP = { hecho: ['h', 'hecho'], consenso: ['c', 'consenso'], opinión: ['o', 'opinión'], especulación: ['e', 'especulación'] };

let cache = { modelo: null, clave: null, valor: null };
function datos(estado) {
  const m = estado.modelo;
  const clave = `${estado.ahora.fecha} ${estado.ahora.hora.slice(0, 2)} ${(estado.servidor?.contexto ?? []).length}`;
  if (cache.modelo !== m || cache.clave !== clave) {
    const hoy = estado.ahora.fecha;
    cache = { modelo: m, clave, valor: { resumen: resumenAlAbrir(m, estado.ahora, { contexto: estado.servidor?.contexto ?? [] }), kpis: kpisPanel(m, hoy), linea: lineaDeTiempo(m, hoy), flujo: flujoDelMes(m, hoy), pulso: ultimoPulso(m), metas: progresoMetas(m, hoy).filter((x) => x.estado === 'activa' || x.estado === 'cumplida') } };
  }
  return cache.valor;
}

/** Botón «?» Explícame: abre Rex con el contexto de esta cifra. */
const ex = (cifra, valor, detalle = '') => html`<button type="button" class="ex" data-accion="explicame" data-cifra="${cifra}" data-valor="${valor}" data-detalle="${detalle}" aria-label="Explícame: ${cifra}">?</button>`;

export function vistaPanel(estado) {
  const d = datos(estado);
  const k = d.kpis;
  const r = d.resumen;
  const mesAct = tituloMes(d.flujo.mes).split(' ')[0];
  const colchonPct = k.colchon.metaMeses && k.colchon.meses !== null ? Math.min(100, (k.colchon.meses / k.colchon.metaMeses) * 100) : null;
  const tasaMes = k.tasa.mesPb === null ? 'no concluyente' : formatearPct(k.tasa.mesPb, 0).replace(/^\+/, '');
  return html`<div class="box" style="display:flex;gap:12px;align-items:center;margin-bottom:8px">${rex(54, 46, estado.rex)}<div style="font-size:11.5px;line-height:1.7" id="resumen-al-abrir"><b style="font-weight:500">${r.saludo}${r.nombre ? `, ${r.nombre}` : ''}.</b> ${r.pendientes.length ? `${r.pendientes.length === 1 ? 'Te queda 1 pendiente' : `Te quedan ${r.pendientes.length} pendientes`}: ${r.pendientes.map((p) => p.toLowerCase()).join(', ')}.` : 'Todo al día. 👌'}<br>
      ${r.ayer.consumo ? html`Ayer gastaste <b style="font-weight:500">${eur(r.ayer.consumo)}</b> (${r.ayer.conceptos.slice(0, 2).join(', ')}${r.ayer.conceptos.length > 2 ? '…' : ''})` : 'Ayer no anotaste gastos'} · ${r.tasaPb === null ? 'este mes aún no hay entradas' : `llevas ${Math.round(r.tasaPb / 100)} % de ahorro este mes`}.<br>
      ${r.meta ? html`Meta más cercana: <b style="font-weight:500">${r.meta.titulo}</b>, te faltan ${eur(r.meta.falta)}.` : 'Sin metas activas pendientes.'} <span class="mut" style="font-size:10.5px">· resumen hecho por código, sin IA</span></div></div>
    <div class="kpis">
      <div class="box"><div class="lab">Patrimonio neto ${ex('patrimonio neto', eur(k.patrimonio.valor), `cartera ${eur(k.patrimonio.cartera)} + cuentas`)}</div><div class="k">${eur(k.patrimonio.valor)}</div><div style="font-size:11px;color:${(k.patrimonio.variacionPb ?? 0) >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}">${k.patrimonio.variacionPb === null ? '' : `${formatearPct(k.patrimonio.variacionPb)} este mes`}</div></div>
      <div class="box"><div class="lab">Colchón ${ex('colchón', eur(k.colchon.total), k.colchon.meses === null ? '' : `${k.colchon.meses.toFixed(1).replace('.', ',')} meses de gastos`)}</div><div class="k">${eur(k.colchon.total)}</div><div class="mut" style="font-size:11px">${k.colchon.meses === null ? 'sin meses cerrados para medir' : `${k.colchon.meses.toFixed(1).replace('.', ',')} meses de gastos`}${k.colchon.metaMeses ? ` · meta ${Math.round(k.colchon.metaMeses)}` : ''}</div>${colchonPct !== null ? html`<div class="bar" style="margin-top:5px"><i style="width:${colchonPct}%;background:#378ADD"></i></div>` : ''}</div>
      <div class="box"><div class="lab">Tasa de ahorro · ${mesAct.slice(0, 3).toLowerCase()} ${ex('tasa de ahorro', tasaMes, k.tasa.media12Pb === null ? '' : `media ${k.tasa.meses} meses: ${Math.round(k.tasa.media12Pb / 100)} %`)}</div><div class="k" style="color:${k.tasa.mesPb === null ? 'var(--text-muted)' : 'var(--t-verde)'}">${tasaMes}</div><div class="mut" style="font-size:11px">${k.tasa.media12Pb === null ? 'sin meses cerrados' : `media ${k.tasa.meses < 12 ? `${k.tasa.meses} m` : '12 m'}: ${Math.round(k.tasa.media12Pb / 100)} %`}</div></div>
      <div class="box"><div class="lab">Cartera · 12 m ${ex('rentabilidad TWR de la cartera', k.cartera ? pct(k.cartera.twr) : '—', k.cartera?.desde ? `desde ${textoCorto(k.cartera.desde)} ${k.cartera.desde.slice(0, 4)}` : '')}</div><div class="k">${k.cartera ? pct(k.cartera.twr) : '—'}</div><div class="mut" style="font-size:11px">${k.cartera ? `índice propio ${pct(k.cartera.propio)}${k.cartera.aprox ? ' · aprox.' : ''}` : 'sin fotos de valor'}</div></div></div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <div class="box"><div class="entre"><span class="lab" style="margin:0">Tu patrimonio y lo que pasó · 12 meses</span><span class="fila mut" style="font-size:10.5px"><span><span style="color:var(--t-verde)">●</span> tus hitos <span>○</span> mundo (contexto, no causa)</span><button type="button" class="go" data-accion="hito-form" data-id="">+ hito</button></span></div>
        ${graficoLineaTiempo(d.linea)}
        <div class="mut" style="font-size:11px">Has puesto ${eur(d.linea.puestoTotal)} en 12 meses (lo que entró menos lo que gastaste); ${d.linea.mercado >= 0 ? 'el mercado ha añadido' : 'el mercado ha restado'} ${eur(Math.abs(d.linea.mercado))} <span style="color:var(--t-naranja)">▒</span>. Clic en un hito para editarlo.</div></div>
      <div class="box"><div class="lab">${tituloMes(d.flujo.mes)} · a dónde va tu dinero</div>${cajaFlujo(d.flujo)}</div></div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <div class="box">${cajaPulso(d.pulso)}</div>
      <div class="box"><div class="lab">Metas</div>${d.metas.length ? d.metas.map((x) => html`<div style="margin-bottom:7px"><div class="entre" style="font-size:11.5px"><span>${x.titulo}${x.estado === 'cumplida' ? ' ✓' : ''}</span><span>${Math.min(100, Math.floor(x.pb / 100))} %</span></div><div class="bar" style="height:6px"><i style="width:${Math.min(100, x.pb / 100)}%;background:${x.estado === 'cumplida' ? '#7F77DD' : '#1D9E75'}"></i></div></div>`) : html`<div class="mut" style="font-size:11px">Sin metas: créalas en la pestaña Metas.</div>`}
        <button type="button" class="ck tarjeta-ano" data-accion="vista" data-vista="tuano" style="margin-top:10px;width:100%;text-align:left;padding:8px 10px;border-radius:8px;border:0;background:linear-gradient(90deg,#D85A3022,#7F77DD22);font-size:11.5px">✦ <b style="font-weight:500">Tu ${estado.ahora.fecha.slice(0, 4)} en finanzas</b> · verlo →</button></div></div>`;
}

function cajaFlujo(f) {
  if (!f.entradas) return html`<div class="mut" style="font-size:11px">Este mes aún no hay entradas.</div>`;
  return html`<div class="mut" style="font-size:11px">Entradas ${eur(f.entradas)}</div>
    <div style="display:flex;height:14px;border-radius:4px;overflow:hidden;margin:5px 0 8px" role="img" aria-label="${f.partes.map((p) => `${p.nombre} ${eur(p.valor)}`).join(', ')}">${f.partes.map((p) => html`<div style="width:${Math.max(0, p.valor) / f.entradas * 100}%;background:${p.color}"></div>`)}</div>
    ${f.partes.map((p) => html`<div class="entre" style="font-size:11.5px;padding:2px 0"><span><span style="color:${p.color}">■</span> ${p.nombre}</span><span>${eur(p.valor)} <span class="mut">${p.pb === null ? '' : `${Math.round(p.pb / 100)} %`}</span></span></div>`)}
    <div class="mut" style="font-size:10.5px;margin-top:4px">Invertir y ahorrar sale de tu cuenta, pero <b style="font-weight:500;color:var(--text-primary)">no es gasto</b>.</div>`;
}

function cajaPulso(p) {
  if (!p) return html`<div class="lab">Último pulso</div><div class="mut" style="font-size:11px">Aún no hay pulsos: hazlo desde «Pendientes hoy» (Claude busca noticias con tu luz verde).</div>`;
  return html`<div class="entre"><span class="lab" style="margin:0">Último pulso · ${textoCorto(p.fecha)} ${p.pulsos.join(' + ')}</span><span class="mut" style="font-size:10.5px">contexto, no causa</span></div>
    ${p.notas.slice(0, 3).map((n) => {
      const ep = EP[n.campos.tipo];
      return html`<div style="padding:5px 0;border-top:.5px solid var(--border);font-size:11.5px">${ep ? html`<span class="ep ${ep[0]}">${ep[1]}</span> ` : ''}${n.titulo} <span class="cit">[${n.id}]</span>${n.campos.activos?.length ? html`<div class="mut" style="font-size:10.5px">te afecta: ${[].concat(n.campos.activos).join(' · ')}</div>` : ''}</div>`;
    })}
    ${p.notas.length > 3 ? html`<div class="mut" style="font-size:10.5px;margin-top:4px">y ${p.notas.length - 3} más en Conocimiento → Mundo.</div>` : ''}`;
}
