// Gestión ▾ (§5, §14.4): el marco. Cada entrada abre su modal; la edición completa llega en su fase.
import { html } from '../esc.js';
import { abrir } from './modal.js';
import { formatearEuros, formatearPorcentaje } from '/core/dinero.js';

export const ENTRADAS = [
  ['cuentas', 'Cuentas', 'Corriente, remunerada, efectivo… con su saldo', 'F4'],
  ['grupos', 'Grupos y naturaleza', 'Qué es consumo, inversión, ahorro o traspaso', 'F4'],
  ['etiquetas', 'Etiquetas', '#fijo, #social, #meta…', 'F4'],
  ['presupuestos', 'Presupuestos', 'Por grupo y mes', 'F4'],
  ['recurrentes', 'Recurrentes', 'Plantilla que se propone cada mes', 'F4'],
  ['activos', 'Activos y objetivo', 'Posiciones, ISIN, clase y peso objetivo', 'F5'],
  ['metas', 'Metas', 'Importe, fecha y grupo asociado', 'F6'],
  ['conocimiento', 'Grupos de conocimiento', 'Familias, fuentes y mezclas', 'F8'],
  ['roles', 'Roles expertos', 'roles/*.md · cómo piensa Claude en cada tarea', 'F9'],
  ['tareas', 'Tareas', 'tareas/*.md · qué se le pide a Claude', 'F9'],
  ['ajustes', 'Ajustes', 'Carpeta de datos (sincronizada), mes financiero, tema, impuestos…', null],
  ['seguridad', 'Seguridad y registro', 'Regla R1 · trabajos aislados · registro de Claude', null],
  ['papelera', 'Papelera y cuarentena', '30 días para recuperar lo borrado · salidas de Claude rechazadas', null],
];

export function menuGestion() {
  return html`<div class="box menu-gestion" role="menu" aria-label="Gestión">${ENTRADAS.map(([id, titulo, desc]) => html`<button type="button" role="menuitem" data-accion="gestion-entrada" data-entrada="${id}"><div>${titulo}</div><div class="mut" style="font-size:10.5px">${desc}</div></button>`)}</div>`;
}

const tabla = (cabeceras, filas) => html`<table class="tb" style="margin-top:6px"><thead><tr>${cabeceras.map((c) => html`<th class="${c.startsWith('#') ? 'n' : ''}">${c.replace(/^#/, '')}</th>`)}</tr></thead><tbody>${filas.length ? filas.map((f) => html`<tr>${f.map((c, i) => html`<td class="${cabeceras[i].startsWith('#') ? 'n' : ''}">${c}</td>`)}</tr>`) : html`<tr><td colspan="${cabeceras.length}" class="mut">Aún no hay nada.</td></tr>`}</tbody></table>`;

/** Contenido de solo lectura de cada catálogo (los datos reales de la carpeta). */
function vista(id, m) {
  const eur = (c) => (c === undefined || c === null ? '—' : formatearEuros(c, 2));
  switch (id) {
    case 'cuentas':
      return tabla(['id', 'nombre', 'tipo', '#saldo inicial'], m.cuentas.map((c) => [c.id, c.nombre + (c.colchon ? ' · colchón' : '') + (c.archivada ? ' · archivada' : ''), c.tipo ?? 'corriente', c.saldo_inicial ? `${eur(c.saldo_inicial.importe)} @${c.saldo_inicial.fecha}` : '—']));
    case 'grupos':
      return tabla(['grupo', 'naturaleza', '#presupuesto'], m.grupos.map((g) => [g.nombre, g.naturaleza, eur(g.presupuesto)]));
    case 'etiquetas':
      return tabla(['etiqueta', 'descripción'], m.etiquetas.map((e) => [`#${e.id}`, e.descripcion ?? '']));
    case 'presupuestos':
      return tabla(['grupo', '#presupuesto mensual'], m.grupos.filter((g) => g.presupuesto).map((g) => [g.nombre, eur(g.presupuesto)]));
    case 'recurrentes':
      return tabla(['recurrente', 'cada', 'día', '#importe'], m.recurrentes.map((r) => [r.concepto + (r.pausado ? ' · pausado' : ''), r.cada, r.dia.mes ? `${r.dia.dia}-${String(r.dia.mes).padStart(2, '0')}` : r.dia.dia, eur(r.importe)]));
    case 'activos':
      return tabla(['activo', 'ISIN', 'clase', '#objetivo'], m.activos.map((a) => [a.titulo, a.campos.isin ?? '—', a.campos.clase ?? '—', (() => { const o = m.objetivo.find((x) => x.activo === a.id); return o ? `${formatearPorcentaje(o.peso)} %` : '—'; })()]));
    case 'metas':
      return tabla(['meta', 'estado', '#objetivo'], m.metas.map((x) => [x.titulo, x.campos.estado?.estado ?? 'activa', eur(x.campos.objetivo)]));
    case 'conocimiento':
      return html`<div class="mut" style="font-size:11px;margin-top:6px">${m.familias.length} familias · ${m.fuentes.length} fuentes · ${m.mezclas.length} mezclas guardadas · ${m.notas} notas</div>${tabla(['familia', 'fuentes'], m.familias.map((f) => [f.nombre, String(m.fuentes.filter((x) => x.familia === f.id).length)]))}`;
    case 'roles':
      return tabla(['rol', 'trabajo', 'fichero'], m.roles.map((r) => [r.titulo, r.trabajo ?? '—', r.ruta]));
    case 'tareas':
      return tabla(['tarea', 'trabajo', 'fichero'], m.tareas.map((r) => [r.titulo, r.trabajo ?? '—', r.ruta]));
    default:
      return '';
  }
}

export function abrirEntrada(id, modelo) {
  const e = ENTRADAS.find((x) => x[0] === id);
  abrir({
    titulo: e[1],
    cuerpo: html`<div class="mut" style="font-size:11px;margin-top:6px">${e[2]}. Mismo patrón para todo: lista editable en línea, añadir, quitar con deshacer. Todo se guarda en Markdown.</div>
      ${vista(id, modelo)}
      <div class="mut" style="font-size:10.5px;margin-top:8px">La edición desde aquí llega en la fase ${e[3]}. Mientras, puedes editar el Markdown a mano: finhub lo recarga solo.</div>`,
  });
}
