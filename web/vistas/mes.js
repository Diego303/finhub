// Pestaña Mes (§5, maqueta: mes()): anotar, movimientos con edición en línea, mapa del dinero,
// presupuestos, media, saldos, recurrentes del mes y cierre editable. Los cálculos: /core/mes.js y /core/patrimonio.js.
import { html } from '../esc.js';
import { accion, cambio, formulario, entrada } from '../acciones.js';
import { op } from '../api.js';
import { abrir, cerrar, confirmar } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { graficoSankey } from '../graficos/sankey.js';
import { abrirOperacion } from './cartera.js';
import { totales, presupuestos, mediaCerrados, variacionPb, datosSankey, sumarTotales, naturalezaDe, indexar } from '/core/mes.js';
import { saldos, cuentaPorDefecto } from '/core/patrimonio.js';
import { recurrentesDelMes, fechaCobro } from '/core/recurrentes.js';
import { tituloMes, mesFinanciero, periodoMes, sumarMesesMes, textoCorto, partes } from '/core/fechas.js';
import { parseImporte, formatearEuros, formatearPct, formatearImporte } from '/core/dinero.js';
import { NATURALEZAS } from '/core/formato/catalogos.js';

export const NAT = { ingreso: ['ingreso', 'var(--t-verde)'], consumo: ['consumo', 'var(--text-secondary)'], inversion: ['inversión', 'var(--t-violeta)'], ahorro: ['ahorro', 'var(--t-azul)'], traspaso: ['traspaso', 'var(--text-secondary)'] };
const eur = (c, d = 0) => formatearEuros(c, d);

const ui = { mes: null, etiqueta: null, busqueda: '', orden: 'fecha', sankey: 'mes', edicion: null, borrador: {}, presEdit: null, editarCerrado: new Set() };
let contexto = null; // {estado, render}
export function iniciarMes(ctx) {
  contexto = ctx;
}
const est = () => contexto.estado;
const repintar = () => contexto.render();

export function mesActual(estado) {
  return ui.mes ?? mesFinanciero(estado.ahora.fecha, estado.modelo.ajustes.mes_inicio_dia);
}

/** Todo lo que la vista necesita, calculado por código. */
export function datosMes(estado, id = mesActual(estado)) {
  const m = estado.modelo;
  const inicio = m.ajustes.mes_inicio_dia;
  const d = m.mes(id);
  const periodo = d?.periodo ?? periodoMes(id, inicio);
  const movimientos = d?.movimientos ?? [];
  const tot = totales(movimientos, m.grupos);
  const mesesTot = m.meses.map((x) => ({ mes: x, estado: m.mes(x).estado.estado, totales: totales(m.mes(x).movimientos, m.grupos) }));
  const todos = m.meses.flatMap((x) => m.mes(x).movimientos);
  const recs = recurrentesDelMes(m.recurrentes, id, { inicio });
  const marcas = d?.marcas ?? {};
  return {
    id,
    d,
    ruta: `mes/${id}.md`,
    estadoMes: d?.estado ?? { estado: 'abierto', fecha: null },
    periodo,
    movimientos,
    tot,
    pres: presupuestos(tot, m.grupos, d?.presupuestos ?? {}),
    media: mediaCerrados(mesesTot, id),
    mesesTot,
    saldos: saldos(m.cuentas, todos, periodo.hasta),
    recs,
    marcas,
    resueltos: recs.filter((r) => marcas[r.rec.id]).length,
  };
}

/**
 * Operación sobre un mes. Si la web ya sabe que está cerrado, pregunta ANTES de enviar (§2.5);
 * el servidor sigue protegiendo (409 «mes_cerrado») si el estado cambió entretanto.
 */
async function opMes(estado, nombre, args, extra = {}) {
  const id = args.mes ?? mesActual(estado);
  let confirmarCerrado = ui.editarCerrado.has(id);
  if (!confirmarCerrado && estado.modelo.mes(id)?.estado.estado === 'cerrado') {
    if (!(await confirmar('Este mes está cerrado: ¿lo editas igualmente?', { si: 'Editar igualmente' }))) return null;
    confirmarCerrado = true;
  }
  return op(nombre, { ...args, ...(confirmarCerrado ? { confirmarCerrado } : {}) }, extra);
}

// ---------- vista ----------
export function vistaMes(estado) {
  const m = estado.modelo;
  const x = datosMes(estado);
  const inicio = m.ajustes.mes_inicio_dia;
  const cerrado = x.estadoMes.estado === 'cerrado';
  return html`
    <div class="entre" style="margin-bottom:8px">
      <span class="fila"><button type="button" data-accion="mes-mover" data-paso="-1" aria-label="Mes anterior">‹</button> <b style="font-weight:500;font-size:13px" id="titulo-mes">${tituloMes(x.id)}</b> <button type="button" data-accion="mes-mover" data-paso="1" aria-label="Mes siguiente">›</button>
        <span class="mut" style="font-size:10.5px">${inicio === 1 ? 'mes natural · o «del 25 al 24» en Ajustes' : `del ${textoCorto(x.periodo.desde)} al ${textoCorto(x.periodo.hasta)} (mes financiero)`}</span>
        ${x.id !== mesFinanciero(estado.ahora.fecha, inicio) ? html`<button type="button" class="go" data-accion="mes-hoy">ir a hoy</button>` : ''}</span>
      <span class="fila"><button type="button" data-accion="mes-recurrentes">Recurrentes ${x.resueltos}/${x.recs.length}</button>${cerrado ? '' : html`<button type="button" data-accion="mes-cerrar">Cerrar mes</button>`}</span>
    </div>
    ${cerrado ? bandaCerrado(x) : x.estadoMes.estado === 'reabierto' ? html`<div class="banda aviso">Mes reabierto: cuando termines, vuelve a cerrarlo para guardar su foto.</div>` : ''}
    ${barraAnotar(estado, x)}
    <div class="kpis cinco" style="margin-top:8px">${[['Entradas', x.tot.entradas, 'var(--t-verde)'], ['Consumo', x.tot.consumo, 'var(--text-secondary)'], ['Invertido', x.tot.invertido, 'var(--t-violeta)'], ['Ahorro y metas', x.tot.ahorrado, 'var(--t-azul)']].map((k) => html`<div class="box"><div class="lab">${k[0]}</div><div class="k" style="font-size:17px;color:${k[2]}">${eur(k[1])}</div></div>`)}
      <div class="box"><div class="lab">Tasa de ahorro</div><div class="k" style="font-size:17px">${x.tot.tasaPb === null ? html`<span style="font-size:12px">no concluyente</span>` : formatearPct(x.tot.tasaPb, 0).replace('+', '')}</div>${x.tot.tasaPb === null ? html`<div class="mut" style="font-size:10px">sin entradas este mes</div>` : ''}</div></div>
    ${mapaDinero(estado, x)}
    <div class="grid2" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr)">
      ${tablaMovimientos(estado, x)}
      <div>${cajaPresupuestos(x)}${cajaSaldos(estado, x)}</div>
    </div>`;
}

function bandaCerrado(x) {
  const editando = ui.editarCerrado.has(x.id);
  return html`<div class="banda aviso" role="status">🔒 ${tituloMes(x.id)} está cerrado (el ${textoCorto(x.estadoMes.fecha)})${x.d?.cierre.editado_tras_cierre ? ' · editado tras cierre' : ''}. ${editando ? 'Estás editándolo: cada cambio recalcula su foto y los saldos de los meses siguientes.' : 'Puedes editarlo igualmente o reabrirlo.'}
    <span class="fila" style="margin-left:auto">${editando ? html`<button type="button" class="go" data-accion="mes-editar-cerrado" data-valor="no">terminar de editar</button>` : html`<button type="button" class="go" data-accion="mes-editar-cerrado" data-valor="si">Editar</button>`}<button type="button" class="go" data-accion="mes-reabrir">Reabrir</button></span></div>`;
}

function gruposOrdenados(m) {
  return [...m.grupos].filter((g) => !g.archivado).sort((a, b) => NATURALEZAS.indexOf(a.naturaleza) - NATURALEZAS.indexOf(b.naturaleza));
}

function barraAnotar(estado, x) {
  const m = estado.modelo;
  const hoy = estado.ahora.fecha;
  const diaDef = hoy >= x.periodo.desde && hoy <= x.periodo.hasta ? partes(hoy).d : partes(x.periodo.hasta).d;
  const grupos = gruposOrdenados(m);
  const grupo = ui.borrador.grupo ?? grupos.find((g) => g.naturaleza === 'consumo')?.id ?? grupos[0]?.id;
  const nat = m.grupos.find((g) => g.id === grupo)?.naturaleza;
  const cuentas = m.cuentas.filter((c) => !c.archivada);
  return html`<form class="box fila" data-form="anotar" style="gap:6px" aria-label="Anotar un movimiento">
    <span class="lab" style="margin:0">Anotar</span>
    <label class="sr-only" for="anotar-dia">Día</label><input class="inp" id="anotar-dia" name="dia" value="${ui.borrador.dia ?? diaDef}" style="width:34px" inputmode="numeric" data-entrada-texto="borrador">
    <label class="sr-only" for="anotar-concepto">Concepto</label><input class="inp" id="anotar-concepto" name="concepto" placeholder="concepto" value="${ui.borrador.concepto ?? ''}" style="flex:1;min-width:120px" data-entrada-texto="borrador">
    <label class="sr-only" for="anotar-importe">Importe</label><input class="inp" id="anotar-importe" name="importe" placeholder="12,50" value="${ui.borrador.importe ?? ''}" style="width:70px;text-align:right" inputmode="decimal" data-entrada-texto="borrador" title="Sin signo: gasto si el grupo es de consumo, inversión o ahorro; entrada si es de ingreso">
    <label class="sr-only" for="anotar-grupo">Grupo</label><select class="inp" id="anotar-grupo" name="grupo" data-cambio="anotar-grupo">${grupos.map((g) => html`<option value="${g.id}" ${g.id === grupo ? 'selected' : ''}>${g.nombre}</option>`)}</select>
    <span id="anotar-naturaleza" class="chip" style="color:${NAT[nat]?.[1] ?? 'inherit'};border-color:${NAT[nat]?.[1] ?? 'var(--border-strong)'}">${NAT[nat]?.[0] ?? '—'}</span>
    ${nat === 'traspaso' ? html`<label class="sr-only" for="anotar-compensa">Devolución de (compensa el consumo de)</label><select class="inp" id="anotar-compensa" name="compensa" title="Una devolución resta del consumo de ese grupo; no es un ingreso"><option value="">no compensa</option>${m.grupos.filter((g) => g.naturaleza === 'consumo').map((g) => html`<option value="${g.id}" ${ui.borrador.compensa === g.id ? 'selected' : ''}>compensa ${g.nombre}</option>`)}</select>
      <label class="sr-only" for="anotar-a">A la cuenta</label><select class="inp" id="anotar-a" name="a" title="Traspaso entre tus cuentas"><option value="">sin traspaso</option>${cuentas.map((c) => html`<option value="${c.id}">→ ${c.nombre}</option>`)}</select>` : ''}
    <label class="sr-only" for="anotar-cuenta">Cuenta</label><select class="inp" id="anotar-cuenta" name="cuenta">${cuentas.map((c) => html`<option value="${c.id}" ${c.id === (ui.borrador.cuenta ?? cuentaPorDefecto(m.cuentas)) ? 'selected' : ''}>${c.nombre}</option>`)}</select>
    <label class="sr-only" for="anotar-etiquetas">Etiquetas</label><input class="inp" id="anotar-etiquetas" name="etiquetas" placeholder="#etiquetas" value="${ui.borrador.etiquetas ?? ''}" style="width:90px" data-entrada-texto="borrador">
    <button type="submit" class="pri">Añadir</button>
    <input type="hidden" name="mes" value="${x.id}">
  </form>`;
}

function mapaDinero(estado, x) {
  const m = estado.modelo;
  const anio = x.id.slice(0, 4);
  const tot = ui.sankey === 'año' ? sumarTotales(x.mesesTot.filter((t) => t.mes.startsWith(anio)).map((t) => t.totales)) : x.tot;
  const s = datosSankey(tot, m.grupos);
  const vacio = !s.entradas.length && !s.salidas.length;
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Mapa del dinero</span><span>${[['mes', tituloMes(x.id).split(' ')[0].toLowerCase()], ['año', anio]].map(([k, t]) => html`<button type="button" class="chip ${ui.sankey === k ? 'on' : ''}" data-accion="mes-sankey" data-valor="${k}" aria-pressed="${ui.sankey === k ? 'true' : 'false'}">${t}</button>`)}</span></div>
    ${vacio ? html`<div class="mut" style="padding:20px;text-align:center;font-size:11.5px">Sin movimientos todavía.</div>` : graficoSankey({ entradas: s.entradas, salidas: s.salidas, formato: (c) => eur(c) })}
    <div class="mut" style="font-size:10.5px;margin-top:4px">Invertir y ahorrar sale de tu cuenta, pero <b style="font-weight:500;color:var(--text-primary)">no es gasto</b>. Las devoluciones restan del consumo de su grupo, no suman a Entradas.</div></div>`;
}

function filtrar(movs) {
  const q = ui.busqueda.trim().toLowerCase();
  let l = movs.filter((mv) => (!ui.etiqueta || mv.etiquetas.includes(ui.etiqueta)) && (!q || mv.concepto.toLowerCase().includes(q) || String(mv.grupo ?? '').includes(q)));
  if (ui.orden === 'importe') l = [...l].sort((a, b) => a.importe - b.importe);
  if (ui.orden === 'fecha-desc') l = [...l].reverse();
  return l;
}

function tablaMovimientos(estado, x) {
  const m = estado.modelo;
  const porId = indexar(m.grupos);
  const etiquetas = [...new Set(x.movimientos.flatMap((mv) => mv.etiquetas))].sort();
  const lista = filtrar(x.movimientos);
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Movimientos · ${x.movimientos.length} · clic en la naturaleza para cambiarla, doble clic para editar</span>
      <span>${etiquetas.map((t) => html`<button type="button" class="chip ${ui.etiqueta === t ? 'on' : ''}" data-accion="mes-etiqueta" data-valor="${t}" aria-pressed="${ui.etiqueta === t ? 'true' : 'false'}">#${t}</button>`)}</span></div>
    <div class="fila" style="margin-top:6px"><label class="sr-only" for="buscar-mov">Buscar movimientos</label><input class="inp" id="buscar-mov" placeholder="buscar…" value="${ui.busqueda}" style="flex:1" data-entrada-texto="buscar-mov"><label class="sr-only" for="orden-mov">Orden</label><select class="inp" id="orden-mov" data-cambio="orden-mov">${[['fecha', 'por fecha'], ['fecha-desc', 'más recientes'], ['importe', 'por importe']].map(([v, t]) => html`<option value="${v}" ${ui.orden === v ? 'selected' : ''}>${t}</option>`)}</select></div>
    ${x.tot.sinGrupo.length ? html`<div class="banda aviso" style="margin-top:6px">⚠ ${x.tot.sinGrupo.length} movimiento(s) sin grupo (o con un grupo que ya no existe): no entran en los totales. Edítalos para darles grupo.</div>` : ''}
    <form id="form-edicion" data-form="mov-editar"></form>
    <div class="desplazable"><table class="tb" style="margin-top:4px"><thead><tr><th>día</th><th>concepto</th><th>grupo</th><th>naturaleza</th><th class="n">importe</th><th><span class="sr-only">acciones</span></th></tr></thead><tbody>
    ${lista.length ? lista.map((mv) => (ui.edicion === mv.id ? filaEdicion(m, mv) : filaMov(m, porId, mv))) : html`<tr><td colspan="6" class="mut">${x.movimientos.length ? 'Ningún movimiento con ese filtro.' : 'Aún no hay movimientos este mes.'}</td></tr>`}
    </tbody></table></div></div>`;
}

function filaMov(m, porId, mv) {
  const nat = naturalezaDe(mv, porId);
  const g = porId.get(mv.grupo);
  return html`<tr data-fila-mov="${mv.id}">
    <td class="mut">${mv.fecha.slice(8)}</td>
    <td>${mv.concepto} ${mv.etiquetas.map((t) => html`<span class="dim" style="font-size:10px">#${t}</span> `)}${mv.ajuste ? html`<span class="chip">ajuste</span>` : ''}${mv.a ? html`<span class="dim" style="font-size:10px">→ ${m.cuentas.find((c) => c.id === mv.a)?.nombre ?? mv.a}</span>` : ''}${mv.compensa ? html`<span class="dim" style="font-size:10px">compensa ${porId.get(mv.compensa)?.nombre ?? mv.compensa}</span>` : ''}</td>
    <td class="mut">${g ? g.nombre : html`<span style="color:var(--text-warning)">⚠ sin grupo</span>`}</td>
    <td>${nat ? html`<button type="button" class="chip ck" data-accion="mov-naturaleza" data-id="${mv.id}" style="border-color:${NAT[nat][1]};color:${NAT[nat][1]}" title="Cambiar la naturaleza de este movimiento">${NAT[nat][0]}${mv.naturaleza && g && mv.naturaleza !== g.naturaleza ? '*' : ''}</button>` : '—'}</td>
    <td class="n" style="${mv.importe > 0 ? 'color:var(--text-success)' : ''}">${eur(mv.importe, 2)}</td>
    <td class="n acciones" style="white-space:nowrap"><button type="button" class="go" data-accion="mov-editar" data-id="${mv.id}" aria-label="Editar «${mv.concepto}»">✎</button> <button type="button" class="go" data-accion="mov-borrar" data-id="${mv.id}" aria-label="Borrar «${mv.concepto}»">🗑</button></td>
  </tr>`;
}

function filaEdicion(m, mv) {
  const b = ui.borradorEdicion ?? {};
  const v = (k, def) => b[k] ?? def;
  return html`<tr data-fila-mov="${mv.id}" class="editando">
    <td><label class="sr-only" for="ed-fecha">Fecha</label><input class="inp" id="ed-fecha" form="form-edicion" name="fecha" value="${v('fecha', mv.fecha)}" style="width:86px" data-entrada-texto="edicion"></td>
    <td><label class="sr-only" for="ed-concepto">Concepto</label><input class="inp" id="ed-concepto" form="form-edicion" name="concepto" value="${v('concepto', mv.concepto)}" style="width:100%" data-entrada-texto="edicion" autofocus>
      <label class="sr-only" for="ed-etiquetas">Etiquetas</label><input class="inp" id="ed-etiquetas" form="form-edicion" name="etiquetas" value="${v('etiquetas', mv.etiquetas.map((t) => '#' + t).join(' '))}" placeholder="#etiquetas" style="width:100%;margin-top:3px" data-entrada-texto="edicion"></td>
    <td><label class="sr-only" for="ed-grupo">Grupo</label><select class="inp" id="ed-grupo" form="form-edicion" name="grupo"><option value="">— sin grupo</option>${gruposOrdenados(m).map((g) => html`<option value="${g.id}" ${g.id === v('grupo', mv.grupo) ? 'selected' : ''}>${g.nombre}</option>`)}</select>
      <label class="sr-only" for="ed-cuenta">Cuenta</label><select class="inp" id="ed-cuenta" form="form-edicion" name="cuenta" style="margin-top:3px">${m.cuentas.map((c) => html`<option value="${c.id}" ${c.id === v('cuenta', mv.cuenta ?? cuentaPorDefecto(m.cuentas)) ? 'selected' : ''}>${c.nombre}</option>`)}</select></td>
    <td></td>
    <td class="n"><label class="sr-only" for="ed-importe">Importe</label><input class="inp" id="ed-importe" form="form-edicion" name="importe" value="${v('importe', formatearImporte(mv.importe))}" style="width:80px;text-align:right" data-entrada-texto="edicion"></td>
    <td class="n" style="white-space:nowrap"><input type="hidden" form="form-edicion" name="id" value="${mv.id}"><button type="submit" form="form-edicion" class="go pri">guardar</button> <button type="button" class="go" data-accion="mov-cancelar">cancelar</button></td>
  </tr>`;
}

function cajaPresupuestos(x) {
  const color = { verde: '#1D9E75', ambar: '#EF9F27', rojo: '#E24B4A' };
  const media = x.media;
  const desv = media ? x.pres.map((p) => [p.nombre, variacionPb(p.gastado, media.porGrupo.get(p.grupo) ?? 0)]).filter(([, v]) => v !== null).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3) : [];
  return html`<div class="box"><div class="lab">Grupos de consumo · presupuesto</div>
    ${x.pres.length ? x.pres.map((p) => html`<div style="margin-bottom:7px"><div class="entre" style="font-size:11.5px"><span>${p.nombre}</span>
      ${ui.presEdit === p.grupo ? html`<form class="fila" data-form="pres" style="gap:4px"><input type="hidden" name="grupo" value="${p.grupo}"><label class="sr-only" for="pres-${p.grupo}">Presupuesto de ${p.nombre} este mes</label><input class="inp" id="pres-${p.grupo}" name="importe" value="${formatearImporte(p.presupuesto)}" style="width:70px;text-align:right" autofocus><button type="submit" class="go pri">ok</button>${p.delMes ? html`<button type="button" class="go" data-accion="pres-quitar" data-grupo="${p.grupo}">quitar ajuste</button>` : ''}</form>`
      : html`<span>${eur(p.gastado)} <button type="button" class="enlace mut" data-accion="pres-editar" data-grupo="${p.grupo}" title="Cambiar el presupuesto de este mes">/ ${eur(p.presupuesto)}${p.delMes ? ' (este mes)' : ''}</button></span>`}</div>
      <div class="bar" role="img" aria-label="${p.pct === null ? 'sin presupuesto' : `${Math.round(p.pct / 100)} % del presupuesto`}"><i style="width:${Math.min(100, (p.pct ?? 10000) / 100)}%;background:${color[p.color]}"></i></div></div>`) : html`<div class="mut" style="font-size:11px">Sin presupuestos. Ponlos en Gestión → Presupuestos.</div>`}
    <div class="lab" style="margin-top:12px">Este mes contra tu media</div>
    ${media ? html`<div style="font-size:11px;line-height:1.8">Consumo ${eur(x.tot.consumo)} · media ${eur(media.consumo)} ${variacionMarca(variacionPb(x.tot.consumo, media.consumo), true)}<br>${desv.map(([n, v], i) => html`${i ? ' · ' : ''}${n} ${variacionMarca(v, true)}`)}</div><div class="mut" style="font-size:10px">media de ${media.meses.length} mes(es) cerrado(s)</div>` : html`<div class="mut" style="font-size:11px">Aún no hay meses cerrados con los que comparar.</div>`}</div>`;
}

function variacionMarca(pb, gastoMalo) {
  if (pb === null) return '';
  const color = pb === 0 ? 'inherit' : (pb > 0) === gastoMalo ? 'var(--text-warning)' : 'var(--text-success)';
  return html`<span style="color:${color}">${formatearPct(pb, 0)}</span>`;
}

function cajaSaldos(estado, x) {
  const m = estado.modelo;
  return html`<div class="box" style="margin-top:8px"><div class="lab">Saldos a ${textoCorto(x.periodo.hasta)}</div>
    ${m.cuentas.filter((c) => !c.archivada).map((c) => html`<div class="entre" style="font-size:11.5px;padding:2px 0"><span>${c.nombre}${c.colchon ? html` <span class="dim" style="font-size:10px">colchón</span>` : ''}</span><span>${c.tipo === 'deuda' ? html`<span class="mut" style="font-size:10px">debes</span> ${eur(-x.saldos.porCuenta[c.id], 2)}` : eur(x.saldos.porCuenta[c.id], 2)} <button type="button" class="go" data-accion="cuenta-ajustar" data-cuenta="${c.id}" aria-label="Ajustar el saldo de ${c.nombre}">ajustar</button></span></div>`)}
    ${x.saldos.desconocidas.length ? html`<div class="mut" style="font-size:10.5px;color:var(--text-warning)">⚠ movimientos con cuentas que no existen: ${x.saldos.desconocidas.join(', ')}</div>` : ''}</div>`;
}

// ---------- modales: recurrentes del mes y cierre ----------
export function abrirRecurrentes(estado, mes = mesActual(estado)) {
  abrir({
    titulo: `Recurrentes de ${tituloMes(mes).toLowerCase()}`,
    cuerpo: () => {
      const x = datosMes(est(), mes);
      const pendientes = x.recs.filter((r) => !x.marcas[r.rec.id]);
      return html`<div class="mut" style="font-size:11px;margin:6px 0 8px">Se proponen cada mes desde tu plantilla de recurrentes. Confirma, cambia el importe o sáltalo este mes.</div>
        ${x.recs.length ? x.recs.map(({ rec, fecha }) => {
          const marca = x.marcas[rec.id];
          return html`<div class="pd" style="grid-template-columns:16px 1fr auto auto auto;align-items:center"><div class="cb ${marca === 'confirmado' ? 'ok' : ''}" aria-hidden="true">${marca === 'confirmado' ? '✓' : marca === 'saltado' ? '–' : ''}</div>
            <span>${rec.concepto} <span class="mut">· ${textoCorto(fecha)}${marca ? ` · ${marca}` : ''}</span></span>
            ${marca ? html`<span class="mut">${eur(rec.importe, 2)}</span><span></span><button type="button" class="go" data-accion="rec-desmarcar" data-rec="${rec.id}" data-mes="${mes}">desmarcar</button>`
            : html`<label class="sr-only" for="rec-imp-${rec.id}">Importe de ${rec.concepto}</label><input class="inp" id="rec-imp-${rec.id}" value="${formatearImporte(rec.importe)}" style="width:76px;text-align:right"><button type="button" class="go pri" data-accion="rec-confirmar" data-rec="${rec.id}" data-mes="${mes}">confirmar</button><button type="button" class="go" data-accion="rec-saltar" data-rec="${rec.id}" data-mes="${mes}">saltar</button>`}</div>`;
        }) : html`<div class="mut" style="font-size:11px">Este mes no toca ningún recurrente.</div>`}
        <div class="entre" style="margin-top:10px"><span class="mut" style="font-size:10.5px">${x.resueltos} de ${x.recs.length} resueltos</span>${pendientes.length ? html`<button type="button" class="pri" data-accion="rec-todos" data-mes="${mes}">Confirmar todos (${pendientes.length})</button>` : ''}</div>`;
    },
  });
}

export function abrirCierre(estado, mes = mesActual(estado)) {
  const x = datosMes(estado, mes);
  const m = estado.modelo;
  const fotoMes = m.fotos.some((f) => f.fecha >= x.periodo.desde && f.fecha <= x.periodo.hasta);
  const excedidos = x.pres.filter((p) => p.color === 'rojo');
  const check = (ok, t, d) => html`<div class="fila" style="gap:8px"><span class="cb ${ok ? 'ok' : ''}" aria-hidden="true">${ok ? '✓' : ''}</span><span>${t} <span class="mut">· ${d}</span></span></div>`;
  const dialogo = abrir({
    titulo: `Cerrar ${tituloMes(mes).toLowerCase()}`,
    cuerpo: html`<div style="font-size:11.5px;line-height:2;margin-top:8px">
        ${check(!x.tot.sinGrupo.length, 'Movimientos revisados', `${x.movimientos.length} anotados · ${x.tot.sinGrupo.length} sin grupo`)}
        ${check(x.resueltos === x.recs.length, 'Recurrentes confirmados', `${x.resueltos} de ${x.recs.length}`)}
        ${check(fotoMes, 'Valor de la cartera a fin de mes', fotoMes ? 'hay foto de este mes' : 'se usa la última foto (actualízala en Cartera)')}
        ${check(true, 'Saldos de tus cuentas', m.cuentas.filter((c) => !c.archivada).map((c) => `${c.nombre.toLowerCase()} ${eur(x.saldos.porCuenta[c.id])}`).join(' · '))}</div>
      <div class="box" style="margin-top:10px;font-size:11.5px">Tasa de ahorro <b style="font-weight:500">${x.tot.tasaPb === null ? 'no concluyente' : formatearPct(x.tot.tasaPb, 0).replace('+', '')}</b> · consumo ${eur(x.tot.consumo)} · ${excedidos.length ? excedidos.map((p, i) => html`${i ? ', ' : ''}<span style="color:var(--text-warning)">${p.nombre} se pasó ${eur(p.gastado - p.presupuesto)}</span>`) : 'presupuestos cumplidos'}</div>
      <form data-form="cerrar-mes"><input type="hidden" name="mes" value="${mes}">
        <div class="lab" style="margin-top:10px"><label for="leccion">Una lección del mes (opcional)</label></div><input class="inp" id="leccion" name="leccion" style="width:100%;box-sizing:border-box" placeholder="p. ej. las cenas sociales se me van de presupuesto" autofocus>
        <div style="text-align:right;margin-top:12px"><button type="submit" class="pri">Cerrar mes</button></div></form>
      <div class="mut" style="font-size:10.5px">Cerrar guarda una foto (saldos, cartera y patrimonio) y una marca, no un candado: podrás editarlo o reabrirlo.</div>`,
  });
  return dialogo;
}

function abrirAjusteSaldo(estado, cuenta) {
  const m = estado.modelo;
  const c = m.cuentas.find((x) => x.id === cuenta);
  const x = datosMes(estado);
  const fecha = estado.ahora.fecha <= x.periodo.hasta && estado.ahora.fecha >= x.periodo.desde ? estado.ahora.fecha : x.periodo.hasta;
  abrir({
    titulo: `Ajustar saldo · ${c.nombre}`,
    cuerpo: html`<form data-form="ajustar-saldo" style="font-size:11.5px;margin-top:8px;line-height:2.2"><input type="hidden" name="cuenta" value="${cuenta}">
      <label>Saldo real ${c.tipo === 'deuda' ? '(lo que debes)' : 'según tu banco'} <input class="inp" name="saldo" id="saldo-real" style="width:100px;text-align:right" autofocus></label> €
      <label>a fecha <input class="inp" name="fecha" value="${fecha}" style="width:90px"></label>
      <div class="mut" style="font-size:10.5px;line-height:1.5">finhub calcula ${eur(c.tipo === 'deuda' ? -x.saldos.porCuenta[cuenta] : x.saldos.porCuenta[cuenta], 2)} a ${textoCorto(x.periodo.hasta)}. La diferencia se anota como un movimiento «ajuste» (traspaso), que no cuenta como gasto ni ingreso.</div>
      <div style="text-align:right"><button type="submit" class="pri">Ajustar</button></div></form>`,
  });
}

// ---------- acciones ----------
function parseEtiquetas(t) {
  return [...new Set([...String(t ?? '').matchAll(/#?([^\s#,|]+)/gu)].map((m) => m[1].normalize('NFC').toLowerCase()))];
}

/** Importe tecleado → céntimos con el signo de su naturaleza si no se escribió signo. */
export function importeConSigno(texto, naturaleza) {
  const r = parseImporte(texto);
  if (!r.ok) return r;
  const conSigno = /^\s*[+\-−]/.test(texto);
  if (conSigno) return r;
  const gasto = ['consumo', 'inversion', 'ahorro'].includes(naturaleza);
  return { ok: true, valor: gasto ? -Math.abs(r.valor) : Math.abs(r.valor) };
}

export function registrarAccionesMes() {
  accion('mes-mover', (el) => {
    ui.mes = sumarMesesMes(mesActual(est()), Number(el.dataset.paso));
    ui.edicion = null;
    repintar();
  });
  accion('mes-hoy', () => {
    ui.mes = null;
    repintar();
  });
  accion('mes-sankey', (el) => {
    ui.sankey = el.dataset.valor;
    repintar();
  });
  accion('mes-etiqueta', (el) => {
    ui.etiqueta = ui.etiqueta === el.dataset.valor ? null : el.dataset.valor;
    repintar();
  });
  entrada('buscar-mov', (el) => {
    ui.busqueda = el.value;
    repintar();
  });
  cambio('orden-mov', (el) => {
    ui.orden = el.value;
    repintar();
  });
  entrada('borrador', (el) => {
    ui.borrador[el.name] = el.value;
  });
  entrada('edicion', (el) => {
    ui.borradorEdicion = { ...(ui.borradorEdicion ?? {}), [el.name]: el.value };
  });
  cambio('anotar-grupo', (el) => {
    ui.borrador.grupo = el.value;
    repintar(); // la naturaleza sale del grupo; los traspasos muestran «compensa» y «a la cuenta»
  });
  formulario('anotar', async (form, d) => {
    const estado = est();
    const m = estado.modelo;
    const g = m.grupos.find((x) => x.id === d.grupo);
    const dia = Number(d.dia);
    if (!d.concepto.trim()) return toast('Escribe el concepto', { tipo: 'error' });
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return toast('El día debe ser un número del 1 al 31', { tipo: 'error' });
    const imp = importeConSigno(d.importe, g?.naturaleza === 'traspaso' && d.a && !d.compensa ? 'consumo' : g?.naturaleza);
    if (!imp.ok || imp.valor === 0) return toast(imp.ok ? 'El importe no puede ser 0' : `Importe no válido: ${imp.error}`, { tipo: 'error' });
    const fecha = fechaCobro(d.mes, dia, m.ajustes.mes_inicio_dia);
    const mov = { fecha, concepto: d.concepto.trim(), importe: imp.valor, grupo: d.grupo || null, cuenta: d.cuenta || undefined, etiquetas: parseEtiquetas(d.etiquetas), ...(d.compensa ? { compensa: d.compensa } : {}), ...(d.a ? { a: d.a } : {}) };
    if (d.a && d.a === d.cuenta) return toast('La cuenta de destino es la misma que la de origen', { tipo: 'error' });
    const r = await opMes(estado, 'mov.crear', { mov, mes: d.mes }, { mensaje: `Anotado en mes/${mesFinanciero(fecha, m.ajustes.mes_inicio_dia)}.md: ${formatearEuros(imp.valor, 2)} · ${g?.nombre ?? 'sin grupo'}` });
    if (!r) return;
    // se conserva lo que el usuario haya elegido mientras tanto (grupo y cuenta); el resto se vacía
    ui.borrador = { grupo: ui.borrador.grupo ?? d.grupo, cuenta: ui.borrador.cuenta ?? d.cuenta };
    repintar();
    document.getElementById('anotar-concepto')?.focus();
    if (g?.naturaleza === 'inversion' && r.resultado?.id && (await confirmar(`«${mov.concepto}» es una inversión. ¿Registras también la operación en la cartera? Quedarán enlazadas.`, { si: 'Registrar la operación', no: 'Ahora no' }))) {
      abrirOperacion(est(), { prefijo: { fecha, importe: Math.abs(imp.valor), tipo: imp.valor < 0 ? 'aportacion' : 'venta' }, mov: { mes: r.resultado.mes, id: r.resultado.id, concepto: mov.concepto } });
    }
  });
  accion('mov-editar', (el) => {
    ui.edicion = el.dataset.id;
    ui.borradorEdicion = null;
    repintar();
    document.getElementById('ed-concepto')?.focus();
  });
  accion('mov-cancelar', () => {
    ui.edicion = null;
    ui.borradorEdicion = null;
    repintar();
  });
  formulario('mov-editar', async (form, d) => {
    const estado = est();
    const x = datosMes(estado);
    const mv = x.movimientos.find((y) => y.id === d.id);
    const g = estado.modelo.grupos.find((y) => y.id === d.grupo);
    const imp = importeConSigno(d.importe, naturalezaDe({ ...mv, grupo: d.grupo || null }, indexar(estado.modelo.grupos)) ?? g?.naturaleza);
    if (!imp.ok || imp.valor === 0) return toast(imp.ok ? 'El importe no puede ser 0' : `Importe no válido: ${imp.error}`, { tipo: 'error' });
    const cambios = { fecha: d.fecha.trim(), concepto: d.concepto.trim(), importe: imp.valor, grupo: d.grupo || null, cuenta: d.cuenta, etiquetas: parseEtiquetas(d.etiquetas) };
    const r = await opMes(estado, 'mov.editar', { mes: x.id, id: d.id, cambios }, { versiones: { [x.ruta]: estado.modelo.versiones[x.ruta] }, mensaje: 'Movimiento guardado' });
    if (!r) return;
    ui.edicion = null;
    ui.borradorEdicion = null;
    if (r.resultado?.mes && r.resultado.mes !== x.id) toast(`Movido a ${tituloMes(r.resultado.mes)} por su fecha`);
    repintar();
  });
  accion('mov-borrar', async (el) => {
    const estado = est();
    const x = datosMes(estado);
    const mv = x.movimientos.find((y) => y.id === el.dataset.id);
    await opMes(estado, 'mov.borrar', { mes: x.id, id: mv.id }, { versiones: { [x.ruta]: estado.modelo.versiones[x.ruta] }, mensaje: `«${mv.concepto}» borrado` });
  });
  accion('mov-naturaleza', async (el) => {
    const estado = est();
    const x = datosMes(estado);
    const porId = indexar(estado.modelo.grupos);
    const mv = x.movimientos.find((y) => y.id === el.dataset.id);
    const actual = naturalezaDe(mv, porId);
    const siguiente = NATURALEZAS[(NATURALEZAS.indexOf(actual) + 1) % NATURALEZAS.length];
    const delGrupo = porId.get(mv.grupo)?.naturaleza;
    await opMes(estado, 'mov.editar', { mes: x.id, id: mv.id, cambios: { naturaleza: siguiente === delGrupo ? null : siguiente } }, { versiones: { [x.ruta]: estado.modelo.versiones[x.ruta] }, mensaje: `«${mv.concepto}»: ${NAT[siguiente][0]}` });
  });
  accion('pres-editar', (el) => {
    ui.presEdit = el.dataset.grupo;
    repintar();
    document.getElementById(`pres-${el.dataset.grupo}`)?.focus();
  });
  formulario('pres', async (form, d) => {
    const r = parseImporte(d.importe);
    if (!r.ok || r.valor < 0) return toast('Presupuesto no válido', { tipo: 'error' });
    ui.presEdit = null;
    await opMes(est(), 'pres.fijar', { mes: mesActual(est()), grupo: d.grupo, importe: r.valor }, { mensaje: 'Presupuesto de este mes guardado' });
    repintar();
  });
  accion('pres-quitar', async (el) => {
    ui.presEdit = null;
    await opMes(est(), 'pres.fijar', { mes: mesActual(est()), grupo: el.dataset.grupo, importe: null }, { mensaje: 'Vuelve el presupuesto del grupo' });
  });
  accion('mes-recurrentes', () => abrirRecurrentes(est()));
  accion('rec-confirmar', async (el) => {
    const imp = parseImporte(document.getElementById(`rec-imp-${el.dataset.rec}`)?.value ?? '');
    if (!imp.ok) return toast('Importe no válido', { tipo: 'error' });
    await opMes(est(), 'rec.confirmar', { mes: el.dataset.mes, rec: el.dataset.rec, importe: imp.valor }, { mensaje: 'Recurrente anotado' });
  });
  accion('rec-saltar', (el) => opMes(est(), 'rec.saltar', { mes: el.dataset.mes, rec: el.dataset.rec }, { mensaje: 'Saltado este mes' }));
  accion('rec-desmarcar', (el) => opMes(est(), 'rec.desmarcar', { mes: el.dataset.mes, rec: el.dataset.rec }, { mensaje: 'Marca quitada (el movimiento, si lo hay, sigue)' }));
  accion('rec-todos', async (el) => {
    const x = datosMes(est(), el.dataset.mes);
    const importes = {};
    for (const { rec } of x.recs) {
      const inp = document.getElementById(`rec-imp-${rec.id}`);
      if (!inp) continue;
      const r = parseImporte(inp.value);
      if (!r.ok) return toast(`Importe no válido en «${rec.concepto}»`, { tipo: 'error' });
      importes[rec.id] = r.valor;
    }
    const r = await opMes(est(), 'rec.confirmarTodos', { mes: el.dataset.mes, importes }, { mensaje: 'Recurrentes anotados' });
    if (r) cerrar();
  });
  accion('mes-cerrar', () => abrirCierre(est()));
  formulario('cerrar-mes', async (form, d) => {
    const r = await op('mes.cerrar', { mes: d.mes, leccion: d.leccion }, { mensaje: `${tituloMes(d.mes)} cerrado · foto de patrimonio guardada` });
    if (!r) return;
    cerrar();
    ui.editarCerrado.delete(d.mes);
  });
  accion('mes-reabrir', async () => {
    const id = mesActual(est());
    if (!(await confirmar(`¿Reabrir ${tituloMes(id).toLowerCase()}? Se quita su foto; al volver a cerrarlo se hará otra.`, { si: 'Reabrir' }))) return;
    await op('mes.reabrir', { mes: id }, { mensaje: `${tituloMes(id)} reabierto` });
  });
  accion('mes-editar-cerrado', (el) => {
    const id = mesActual(est());
    if (el.dataset.valor === 'si') ui.editarCerrado.add(id);
    else ui.editarCerrado.delete(id);
    repintar();
  });
  accion('cuenta-ajustar', (el) => abrirAjusteSaldo(est(), el.dataset.cuenta));
  formulario('ajustar-saldo', async (form, d) => {
    const r = parseImporte(d.saldo);
    if (!r.ok) return toast('Saldo no válido', { tipo: 'error' });
    const res = await opMes(est(), 'cuenta.ajustarSaldo', { cuenta: d.cuenta, fecha: d.fecha.trim(), saldo: r.valor }, { mensaje: 'Saldo ajustado' });
    if (res) {
      cerrar();
      if (res.resultado?.diferencia === 0) toast('El saldo ya cuadraba: no hace falta ajuste');
    }
  });
}

/** Doble clic en una fila de movimiento → edición en línea. */
export function enDobleClic(ev) {
  const fila = ev.target.closest?.('[data-fila-mov]');
  if (!fila || fila.classList.contains('editando')) return false;
  ui.edicion = fila.dataset.filaMov;
  ui.borradorEdicion = null;
  repintar();
  document.getElementById('ed-concepto')?.focus();
  return true;
}
