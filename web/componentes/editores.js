// Editores de Gestión de F4 (§2.5, §14.4): cuentas, grupos y naturaleza, etiquetas, presupuestos y recurrentes.
// Todo con operaciones (deshacer de 10 s y papelera); los modales se repintan solos con los datos nuevos.
import { html } from '../esc.js';
import { accion, cambio, formulario } from '../acciones.js';
import { op } from '../api.js';
import { abrir, cerrar, confirmar, elegir } from './modal.js';
import { toast } from './toast.js';
import { slugUnico } from '/core/ids.js';
import { parseImporte, formatearImporte, formatearEuros } from '/core/dinero.js';
import { esFecha, mesFinanciero } from '/core/fechas.js';
import { TIPOS_CUENTA, NATURALEZAS, FRECUENCIAS } from '/core/formato/catalogos.js';
import { NAT } from '../vistas/mes.js';

let est = () => null;
const ed = { borrarGrupo: null, rec: null };
export const iniciarEditores = (fn) => (est = fn);
const m = () => est().modelo;
const usosDe = (campo, valor) => m().meses.flatMap((x) => m().mes(x).movimientos).filter((mv) => (Array.isArray(mv[campo]) ? mv[campo].includes(valor) : mv[campo] === valor)).length;
const TIPO = { corriente: 'corriente', ahorro: 'ahorro', inversion: 'inversión', efectivo: 'efectivo', deuda: 'deuda' };
const CADA = { mes: 'cada mes', bimestre: 'cada 2 meses', trimestre: 'cada 3 meses', semestre: 'cada 6 meses', año: 'cada año' };

// ---------- cuentas ----------
function cuerpoCuentas() {
  const lista = m().cuentas;
  return html`<div class="mut" style="font-size:11px;margin:6px 0">Los cambios se guardan al salir de cada campo. Una cuenta con movimientos no se borra: se archiva.</div>
    <table class="tb"><thead><tr><th>nombre</th><th>tipo</th><th>colchón</th><th class="n">saldo inicial · desde</th><th></th></tr></thead><tbody>
    ${lista.map((c) => html`<tr style="${c.archivada ? 'opacity:.55' : ''}">
      <td><label class="sr-only" for="cu-n-${c.id}">Nombre de ${c.nombre}</label><input class="inp" id="cu-n-${c.id}" value="${c.nombre}" data-cambio="cuenta-campo" data-id="${c.id}" data-campo="nombre" style="width:130px"></td>
      <td><label class="sr-only" for="cu-t-${c.id}">Tipo</label><select class="inp" id="cu-t-${c.id}" data-cambio="cuenta-campo" data-id="${c.id}" data-campo="tipo">${TIPOS_CUENTA.map((t) => html`<option value="${t}" ${(c.tipo ?? 'corriente') === t ? 'selected' : ''}>${TIPO[t]}</option>`)}</select></td>
      <td><input type="checkbox" id="cu-c-${c.id}" aria-label="Cuenta de colchón" ${c.colchon ? 'checked' : ''} data-cambio="cuenta-campo" data-id="${c.id}" data-campo="colchon"></td>
      <td class="n"><label class="sr-only" for="cu-s-${c.id}">Saldo inicial</label><input class="inp" id="cu-s-${c.id}" value="${c.saldo_inicial ? formatearImporte(c.saldo_inicial.importe) : ''}" style="width:80px;text-align:right" data-cambio="cuenta-saldo" data-id="${c.id}"> <label class="sr-only" for="cu-f-${c.id}">Fecha del saldo inicial</label><input class="inp" id="cu-f-${c.id}" value="${c.saldo_inicial?.fecha ?? ''}" placeholder="AAAA-MM-DD" style="width:86px" data-cambio="cuenta-saldo" data-id="${c.id}"></td>
      <td style="white-space:nowrap"><button type="button" class="go" data-accion="cuenta-archivar" data-id="${c.id}">${c.archivada ? 'activar' : 'archivar'}</button> <button type="button" class="go" data-accion="cuenta-borrar" data-id="${c.id}" aria-label="Borrar ${c.nombre}">🗑</button></td></tr>`)}
    </tbody></table>
    <form class="fila" data-form="cuenta-nueva" style="margin-top:8px"><label class="sr-only" for="cu-nueva">Nombre de la nueva cuenta</label><input class="inp" id="cu-nueva" name="nombre" placeholder="nueva cuenta" style="flex:1"><select class="inp" name="tipo" aria-label="Tipo">${TIPOS_CUENTA.map((t) => html`<option value="${t}">${TIPO[t]}</option>`)}</select><button type="submit" class="pri">Añadir</button></form>`;
}

// ---------- grupos ----------
function cuerpoGrupos() {
  const lista = m().grupos;
  return html`<div class="mut" style="font-size:11px;margin:6px 0 8px">La naturaleza se aplica sola al anotar con ese grupo. Puedes cambiarla en cada movimiento.</div>
    ${lista.map((g) => html`<div class="pd" style="grid-template-columns:1fr auto auto;align-items:center">
      <span><label class="sr-only" for="gr-n-${g.id}">Nombre del grupo</label><input class="inp" id="gr-n-${g.id}" value="${g.nombre}" data-cambio="grupo-nombre" data-id="${g.id}" style="width:150px"> <span class="dim" style="font-size:10px">${usosDe('grupo', g.id)} mov.</span></span>
      <span role="group" aria-label="Naturaleza de ${g.nombre}">${NATURALEZAS.map((k) => html`<button type="button" class="chip ${g.naturaleza === k ? 'on' : ''}" data-accion="grupo-naturaleza" data-id="${g.id}" data-valor="${k}" aria-pressed="${g.naturaleza === k}">${NAT[k][0]}</button>`)}</span>
      <button type="button" class="go" data-accion="grupo-borrar" data-id="${g.id}" aria-label="Borrar ${g.nombre}">🗑</button></div>
      ${ed.borrarGrupo === g.id ? html`<form class="banda aviso" data-form="grupo-borrar" style="margin:4px 0"><input type="hidden" name="id" value="${g.id}">Borrar «${g.nombre}» (${usosDe('grupo', g.id)} movimientos): pasarlos a <select class="inp" name="destino" aria-label="Grupo destino"><option value="">— dejarlos sin grupo</option>${lista.filter((x) => x.id !== g.id).map((x) => html`<option value="${x.id}">${x.nombre}</option>`)}</select><button type="submit" class="go pri">borrar</button><button type="button" class="go" data-accion="grupo-borrar-cancelar">cancelar</button></form>` : ''}`)}
    <form class="fila" data-form="grupo-nuevo" style="margin-top:8px"><label class="sr-only" for="gr-nuevo">Nombre del nuevo grupo</label><input class="inp" id="gr-nuevo" name="nombre" placeholder="nuevo grupo" style="flex:1"><select class="inp" name="naturaleza" aria-label="Naturaleza">${NATURALEZAS.map((k) => html`<option value="${k}" ${k === 'consumo' ? 'selected' : ''}>${NAT[k][0]}</option>`)}</select><button type="submit" class="pri">Añadir</button></form>`;
}

// ---------- etiquetas ----------
function cuerpoEtiquetas() {
  const definidas = new Map(m().etiquetas.map((e) => [e.id, e]));
  const usadas = new Set(m().meses.flatMap((x) => m().mes(x).movimientos.flatMap((mv) => mv.etiquetas)));
  const todas = [...new Set([...definidas.keys(), ...usadas])].sort();
  return html`<div class="mut" style="font-size:11px;margin:6px 0">Renombrar o borrar una etiqueta la cambia en todos tus movimientos y recurrentes.</div>
    <table class="tb"><thead><tr><th>etiqueta</th><th class="n">usos</th><th>descripción</th><th>renombrar</th><th></th></tr></thead><tbody>
    ${todas.map((t, i) => html`<tr><td>#${t}</td><td class="n mut">${usosDe('etiquetas', t)}</td>
      <td><label class="sr-only" for="et-d-${i}">Descripción</label><input class="inp" id="et-d-${i}" value="${definidas.get(t)?.descripcion ?? ''}" data-cambio="etiqueta-desc" data-id="${t}" style="width:100%"></td>
      <td><form class="fila" data-form="etiqueta-renombrar" style="gap:4px"><input type="hidden" name="de" value="${t}"><label class="sr-only" for="et-r-${i}">Nuevo nombre</label><input class="inp" id="et-r-${i}" name="a" placeholder="nuevo nombre" style="width:90px"><button type="submit" class="go">ok</button></form></td>
      <td><button type="button" class="go" data-accion="etiqueta-borrar" data-id="${t}" aria-label="Borrar #${t}">🗑</button></td></tr>`)}
    </tbody></table>
    <form class="fila" data-form="etiqueta-nueva" style="margin-top:8px"><label class="sr-only" for="et-nueva">Nueva etiqueta</label><input class="inp" id="et-nueva" name="id" placeholder="#nueva" style="width:110px"><input class="inp" name="descripcion" placeholder="descripción (opcional)" aria-label="Descripción" style="flex:1"><button type="submit" class="pri">Añadir</button></form>`;
}

// ---------- presupuestos ----------
function cuerpoPresupuestos() {
  const consumo = m().grupos.filter((g) => g.naturaleza === 'consumo' && !g.archivado);
  return html`<div class="mut" style="font-size:11px;margin:6px 0">Presupuesto mensual de cada grupo de consumo. Para cambiarlo solo en un mes, hazlo desde la barra de presupuestos de la pestaña Mes. Déjalo vacío para no tener presupuesto.</div>
    ${consumo.map((g) => html`<div class="entre" style="font-size:11.5px;padding:4px 0;border-bottom:.5px solid var(--border)"><span>${g.nombre}</span><span><label class="sr-only" for="pr-${g.id}">Presupuesto de ${g.nombre}</label><input class="inp" id="pr-${g.id}" value="${g.presupuesto !== undefined ? formatearImporte(g.presupuesto) : ''}" style="width:90px;text-align:right" data-cambio="presupuesto-grupo" data-id="${g.id}"> €/mes</span></div>`)}
    <div class="mut" style="font-size:11px;margin-top:8px">Total: ${formatearEuros(consumo.reduce((a, g) => a + (g.presupuesto ?? 0), 0))}/mes</div>`;
}

// ---------- recurrentes ----------
function formRecurrente(r) {
  const gr = m().grupos.filter((g) => !g.archivado);
  const nuevo = !r;
  const v = r ?? { cada: 'mes', dia: { dia: 1, mes: null }, importe: 0, etiquetas: [] };
  return html`<form class="box" data-form="recurrente" style="margin:8px 0;font-size:11.5px;line-height:2.1"><input type="hidden" name="id" value="${r?.id ?? ''}">
    <b style="font-weight:500">${nuevo ? 'Nuevo recurrente' : `Editar «${r.concepto}»`}</b><br>
    <label>concepto <input class="inp" name="concepto" id="rc-concepto" value="${v.concepto ?? ''}" style="width:180px" autofocus></label>
    <label>importe <input class="inp" name="importe" value="${r ? formatearImporte(v.importe) : ''}" placeholder="-12,50" style="width:80px;text-align:right"></label>
    <label>grupo <select class="inp" name="grupo">${gr.map((g) => html`<option value="${g.id}" ${g.id === v.grupo ? 'selected' : ''}>${g.nombre}</option>`)}</select></label>
    <label>cuenta <select class="inp" name="cuenta"><option value="">—</option>${m().cuentas.filter((c) => !c.archivada).map((c) => html`<option value="${c.id}" ${c.id === v.cuenta ? 'selected' : ''}>${c.nombre}</option>`)}</select></label><br>
    <label>cada <select class="inp" name="cada">${FRECUENCIAS.map((f) => html`<option value="${f}" ${f === v.cada ? 'selected' : ''}>${CADA[f]}</option>`)}</select></label>
    <label>día <input class="inp" name="dia" value="${v.dia.mes ? `${v.dia.dia}-${String(v.dia.mes).padStart(2, '0')}` : v.dia.dia}" placeholder="5 o 14-11" style="width:60px" title="Día del mes (5) o, si es anual, día-mes (14-11)"></label>
    <label>desde <input class="inp" name="desde" value="${v.desde ?? ''}" placeholder="AAAA-MM" style="width:70px" title="Obligatorio para cada 2, 3 o 6 meses"></label>
    <label>etiquetas <input class="inp" name="etiquetas" value="${(v.etiquetas ?? []).map((t) => '#' + t).join(' ')}" style="width:110px"></label>
    <div class="fila" style="justify-content:flex-end"><button type="button" class="go" data-accion="rec-form-cancelar">cancelar</button><button type="submit" class="pri">${nuevo ? 'Añadir' : 'Guardar'}</button></div></form>`;
}

function cuerpoRecurrentes() {
  const lista = m().recurrentes;
  const g = new Map(m().grupos.map((x) => [x.id, x.nombre]));
  return html`<div class="mut" style="font-size:11px;margin:6px 0">La plantilla que se propone cada mes. Frecuencias mensual, bimestral, trimestral, semestral y anual. Se pueden pausar.</div>
    ${ed.rec ? formRecurrente(ed.rec === 'nuevo' ? null : lista.find((r) => r.id === ed.rec)) : html`<button type="button" class="pri" data-accion="rec-form" data-id="nuevo">+ nuevo recurrente</button>`}
    <table class="tb" style="margin-top:6px"><thead><tr><th>recurrente</th><th>grupo</th><th>cada</th><th class="n">importe</th><th></th></tr></thead><tbody>
    ${lista.map((r) => html`<tr style="${r.pausado ? 'opacity:.55' : ''}"><td>${r.concepto}${r.pausado ? ' · pausado' : ''}${r.uso?.estado === 'no' ? html` <span style="color:var(--text-warning);font-size:10px">no lo usas</span>` : ''}</td><td class="mut">${g.get(r.grupo) ?? r.grupo}</td><td class="mut">${CADA[r.cada]} · ${r.dia.mes ? `${r.dia.dia}-${String(r.dia.mes).padStart(2, '0')}` : `día ${r.dia.dia}`}</td><td class="n">${formatearEuros(r.importe, 2)}</td>
      <td style="white-space:nowrap"><button type="button" class="go" data-accion="rec-form" data-id="${r.id}" aria-label="Editar ${r.concepto}">✎</button> <button type="button" class="go" data-accion="rec-pausa" data-id="${r.id}">${r.pausado ? 'reanudar' : 'pausar'}</button> <button type="button" class="go" data-accion="rec-borrar" data-id="${r.id}" aria-label="Borrar ${r.concepto}">🗑</button></td></tr>`)}
    </tbody></table>`;
}

export const EDITORES = { cuentas: ['Cuentas', cuerpoCuentas], grupos: ['Grupos y naturaleza', cuerpoGrupos], etiquetas: ['Etiquetas', cuerpoEtiquetas], presupuestos: ['Presupuestos', cuerpoPresupuestos], recurrentes: ['Recurrentes', cuerpoRecurrentes] };

export function abrirEditor(id) {
  const [titulo, cuerpo] = EDITORES[id];
  ed.borrarGrupo = null;
  ed.rec = null;
  abrir({ titulo, cuerpo, ancho: true });
}

// ---------- acciones ----------
const parsearDia = (t) => {
  const s = String(t).trim();
  let mm = /^(\d{1,2})$/.exec(s);
  if (mm) return { dia: +mm[1], mes: null };
  mm = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  return mm ? { dia: +mm[1], mes: +mm[2] } : null;
};
const etiquetas = (t) => [...new Set([...String(t ?? '').matchAll(/#?([^\s#,|]+)/gu)].map((x) => x[1].toLowerCase()))];

export function registrarEditores() {
  cambio('cuenta-campo', (el) => {
    const v = el.type === 'checkbox' ? el.checked || null : el.value.trim();
    if (el.dataset.campo === 'nombre' && !v) return toast('El nombre no puede quedar vacío', { tipo: 'error' });
    op('lista.editar', { ruta: 'cuentas.md', clave: el.dataset.id, cambios: { [el.dataset.campo]: v } }, { mensaje: 'Cuenta guardada' });
  });
  cambio('cuenta-saldo', (el) => {
    const id = el.dataset.id;
    const imp = document.getElementById(`cu-s-${id}`).value.trim();
    const fecha = document.getElementById(`cu-f-${id}`).value.trim();
    if (!imp && !fecha) return op('lista.editar', { ruta: 'cuentas.md', clave: id, cambios: { saldo_inicial: null } }, { mensaje: 'Saldo inicial quitado' });
    if (!imp || !fecha) return;
    const r = parseImporte(imp);
    if (!r.ok || !esFecha(fecha)) return toast('Saldo inicial: importe y fecha AAAA-MM-DD', { tipo: 'error' });
    op('lista.editar', { ruta: 'cuentas.md', clave: id, cambios: { saldo_inicial: { importe: r.valor, fecha } } }, { mensaje: 'Saldo inicial guardado: se recalculan los cierres' });
  });
  accion('cuenta-archivar', (el) => {
    const c = m().cuentas.find((x) => x.id === el.dataset.id);
    op('lista.editar', { ruta: 'cuentas.md', clave: c.id, cambios: { archivada: c.archivada ? null : true } }, { mensaje: c.archivada ? 'Cuenta activada' : 'Cuenta archivada' });
  });
  accion('cuenta-borrar', async (el) => {
    const id = el.dataset.id;
    const usos = usosDe('cuenta', id) + usosDe('a', id);
    if (usos) return toast(`La cuenta tiene ${usos} movimientos: archívala en lugar de borrarla`, { tipo: 'error' });
    if (await confirmar(`¿Borrar la cuenta? Irá a la papelera 30 días.`, { si: 'Borrar' })) op('lista.borrar', { ruta: 'cuentas.md', clave: id }, { mensaje: 'Cuenta en la papelera' });
  });
  formulario('cuenta-nueva', (f, d) => {
    if (!d.nombre.trim()) return toast('Escribe el nombre', { tipo: 'error' });
    op('lista.crear', { ruta: 'cuentas.md', valor: { id: slugUnico(d.nombre, m().cuentas.map((c) => c.id)), nombre: d.nombre.trim(), tipo: d.tipo } }, { mensaje: 'Cuenta creada' });
  });

  cambio('grupo-nombre', (el) => {
    if (!el.value.trim()) return toast('El nombre no puede quedar vacío', { tipo: 'error' });
    op('lista.editar', { ruta: 'grupos.md', clave: el.dataset.id, cambios: { nombre: el.value.trim() } }, { mensaje: 'Grupo renombrado (el id no cambia: nada se rompe)' });
  });
  accion('grupo-naturaleza', async (el) => {
    const g = m().grupos.find((x) => x.id === el.dataset.id);
    if (g.naturaleza === el.dataset.valor) return;
    const usos = usosDe('grupo', g.id);
    let aplicar = false;
    if (usos) {
      const r = await elegir(`«${g.nombre}» tiene ${usos} movimientos anotados. ¿Les aplico también la nueva naturaleza (${NAT[el.dataset.valor][0]})?`, [['si', 'Sí, a todos'], ['no', 'No, solo a los nuevos']], { titulo: 'Cambiar la naturaleza' });
      if (r === null) return;
      aplicar = r === 'si';
    }
    await op('grupo.cambiarNaturaleza', { id: g.id, naturaleza: el.dataset.valor, aplicarAMovimientos: aplicar }, { mensaje: `«${g.nombre}» ahora es ${NAT[el.dataset.valor][0]}` });
    abrirEditor('grupos');
  });
  accion('grupo-borrar', (el) => {
    ed.borrarGrupo = el.dataset.id;
    abrir({ titulo: 'Grupos y naturaleza', cuerpo: cuerpoGrupos, ancho: true });
  });
  accion('grupo-borrar-cancelar', () => {
    ed.borrarGrupo = null;
    abrir({ titulo: 'Grupos y naturaleza', cuerpo: cuerpoGrupos, ancho: true });
  });
  formulario('grupo-borrar', async (f, d) => {
    ed.borrarGrupo = null;
    await op('grupo.borrar', { id: d.id, destino: d.destino || null }, { mensaje: 'Grupo en la papelera' });
  });
  formulario('grupo-nuevo', (f, d) => {
    if (!d.nombre.trim()) return toast('Escribe el nombre', { tipo: 'error' });
    op('lista.crear', { ruta: 'grupos.md', valor: { id: slugUnico(d.nombre, m().grupos.map((g) => g.id)), nombre: d.nombre.trim(), naturaleza: d.naturaleza } }, { mensaje: 'Grupo creado' });
  });

  cambio('etiqueta-desc', (el) => {
    const id = el.dataset.id;
    const existe = m().etiquetas.some((e) => e.id === id);
    if (existe) op('lista.editar', { ruta: 'etiquetas.md', clave: id, cambios: { descripcion: el.value.trim() || null } }, { mensaje: 'Descripción guardada' });
    else op('lista.crear', { ruta: 'etiquetas.md', valor: { id, descripcion: el.value.trim() || null } }, { mensaje: 'Descripción guardada' });
  });
  formulario('etiqueta-renombrar', (f, d) => {
    if (!d.a.trim()) return;
    op('etiqueta.renombrar', { de: d.de, a: d.a }, { mensaje: `#${d.de} → #${d.a.replace(/^#/, '').toLowerCase()} en todos tus movimientos` });
  });
  accion('etiqueta-borrar', async (el) => {
    if (await confirmar(`¿Quitar #${el.dataset.id} de todos tus movimientos y recurrentes?`, { si: 'Quitar' })) op('etiqueta.borrar', { id: el.dataset.id }, { mensaje: `#${el.dataset.id} quitada` });
  });
  formulario('etiqueta-nueva', (f, d) => {
    const id = d.id.replace(/^#/, '').trim().toLowerCase();
    if (!/^[^\s#|]+$/u.test(id)) return toast('Una etiqueta es una sola palabra', { tipo: 'error' });
    op('lista.crear', { ruta: 'etiquetas.md', valor: { id, descripcion: d.descripcion.trim() || null } }, { mensaje: `#${id} creada` });
  });

  cambio('presupuesto-grupo', (el) => {
    const t = el.value.trim();
    if (!t) return op('lista.editar', { ruta: 'grupos.md', clave: el.dataset.id, cambios: { presupuesto: null } }, { mensaje: 'Presupuesto quitado' });
    const r = parseImporte(t);
    if (!r.ok || r.valor < 0) return toast('Presupuesto no válido', { tipo: 'error' });
    op('lista.editar', { ruta: 'grupos.md', clave: el.dataset.id, cambios: { presupuesto: r.valor } }, { mensaje: 'Presupuesto guardado' });
  });

  accion('rec-form', (el) => {
    ed.rec = el.dataset.id;
    abrir({ titulo: 'Recurrentes', cuerpo: cuerpoRecurrentes, ancho: true });
  });
  accion('rec-form-cancelar', () => {
    ed.rec = null;
    abrir({ titulo: 'Recurrentes', cuerpo: cuerpoRecurrentes, ancho: true });
  });
  accion('rec-pausa', (el) => {
    const r = m().recurrentes.find((x) => x.id === el.dataset.id);
    op('rec.pausar', { id: r.id, pausado: !r.pausado || null }, { mensaje: r.pausado ? 'Recurrente reanudado' : 'Recurrente pausado' });
  });
  accion('rec-borrar', async (el) => {
    if (await confirmar('¿Borrar el recurrente? Los movimientos ya anotados se quedan. Irá a la papelera 30 días.', { si: 'Borrar' })) op('lista.borrar', { ruta: 'recurrentes.md', clave: el.dataset.id }, { mensaje: 'Recurrente en la papelera' });
  });
  formulario('recurrente', async (f, d) => {
    const imp = parseImporte(d.importe);
    const dia = parsearDia(d.dia);
    if (!d.concepto.trim()) return toast('Escribe el concepto', { tipo: 'error' });
    if (!imp.ok || imp.valor === 0) return toast('Importe no válido', { tipo: 'error' });
    if (!dia) return toast('Día: un número (5) o día-mes para los anuales (14-11)', { tipo: 'error' });
    const valor = { concepto: d.concepto.trim(), importe: imp.valor, grupo: d.grupo, cuenta: d.cuenta || null, cada: d.cada, dia, desde: d.desde.trim() || null, etiquetas: etiquetas(d.etiquetas) };
    if (!d.id) {
      const id = slugUnico(valor.concepto, m().recurrentes.map((r) => r.id));
      const r = await op('lista.crear', { ruta: 'recurrentes.md', valor: { id, ...Object.fromEntries(Object.entries(valor).filter(([, v]) => v !== null)) } }, { mensaje: 'Recurrente creado' });
      if (r) ed.rec = null;
      return;
    }
    const aplicar = await elegir('¿Solo a partir del mes que viene o también este mes?', [['siguiente', 'Desde el mes que viene'], ['esteMes', 'También este mes']], { titulo: 'Editar recurrente' });
    if (aplicar === null) return abrir({ titulo: 'Recurrentes', cuerpo: cuerpoRecurrentes, ancho: true });
    const mes = mesFinanciero(est().ahora.fecha, m().ajustes.mes_inicio_dia);
    const r = await op('rec.editar', { id: d.id, cambios: valor, aplicar, mes }, { mensaje: aplicar === 'esteMes' ? 'Recurrente guardado (también este mes)' : 'Recurrente guardado desde el mes que viene' });
    if (r) ed.rec = null;
    abrir({ titulo: 'Recurrentes', cuerpo: cuerpoRecurrentes, ancho: true });
  });
}
