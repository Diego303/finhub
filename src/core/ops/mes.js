// Operaciones del mes (§2.5, §4.1): movimientos, recurrentes del mes, presupuestos del mes,
// cerrar, reabrir, mes financiero y recálculo de las fotos de cierre.
// ctx: {ajustes: {mes_inicio_dia}, prng, rutas}
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, buscarItem, validarEntidad, validarKv, nodoItem, lineaDe } from './comun.js';
import { movimiento } from '../formato/mes.js';
import { fijarCabecera, fijarKv, cabeceras, items, valores, bloques, asegurarSeccion } from '../formato/motor.js';
import { periodoMes, mesFinanciero } from '../fechas.js';
import { fotoCierre } from '../patrimonio.js';
import { totales } from '../mes.js';
import { recurrentesDelMes } from '../recurrentes.js';
import { fechaCobro } from '../recurrentes.js';

export { fechaCobro };
import { idCorto } from '../ids.js';

const rutaMes = (mes) => `mes/${mes}.md`;
const diaInicio = (ctx) => ctx.ajustes?.mes_inicio_dia ?? 1;

function abrirMes(tx, mes, { crear = false, dia = diaInicio(tx.ctx) } = {}) {
  const ruta = rutaMes(mes);
  const nuevo = !tx.existe(ruta);
  if (nuevo && !crear) throw new ErrorOp('no_existe', `no hay movimientos de ${mes}`);
  const doc = tx.doc(ruta, { crear, ctxFormato: { diaInicio: dia } });
  if (nuevo) {
    fijarCabecera(doc, 'periodo', periodoMes(mes, dia));
    fijarCabecera(doc, 'estado', { estado: 'abierto', fecha: null });
    asegurarSeccion(doc, 'Movimientos');
  }
  return { doc, ruta };
}

/** Un mes cerrado se edita solo con confirmación, y queda marcado (§2.5). */
function permitirEdicion(doc, mes, confirmar) {
  const estado = cabeceras(doc).estado?.estado;
  if (estado !== 'cerrado') return;
  if (!confirmar) throw new ErrorOp('mes_cerrado', 'Este mes está cerrado: ¿lo editas igualmente?', { mes });
  fijarKv(doc, 'Cierre', 'editado_tras_cierre', true);
}

const RE_RUTA_MES = /^mes\/(\d{4}-\d{2})\.md$/;

/** Todos los meses (en el estado actual de la transacción) → [{mes, ruta, doc}] ordenados. */
export function todosLosMeses(tx) {
  return tx.rutas('mes/').map((r) => RE_RUTA_MES.exec(r)).filter(Boolean).map((m) => ({ mes: m[1], ruta: m[0], doc: tx.doc(m[0]) }));
}

/** Datos para la foto de cierre: cuentas, todos los movimientos, fotos de valor y activos archivados. */
function datosFoto(tx) {
  const meses = todosLosMeses(tx);
  const cuentas = tx.existe('cuentas.md') ? items(tx.doc('cuentas.md')) : [];
  const fotos = tx.rutas('cartera/valores/').map((r) => ({ fecha: r.slice(16, 26), filas: items(tx.doc(r)) }));
  const activos = tx.existe('cartera/activos.md') ? bloques(tx.doc('cartera/activos.md')) : [];
  const operaciones = tx.existe('cartera/operaciones.md') ? items(tx.doc('cartera/operaciones.md')) : [];
  return { meses, cuentas, fotos, activos, operaciones, movimientos: meses.flatMap((m) => items(m.doc, 'Movimientos')) };
}

/**
 * Recalcula la foto (saldos, cartera, patrimonio) de los meses CERRADOS desde `desde` (§2.5: al editar
 * un mes cerrado se recalcula su foto y se propagan los saldos a los siguientes). Solo toca lo que cambia.
 */
export function recalcularCierres(tx, desde = '0000-00') {
  const d = datosFoto(tx);
  for (const { mes, ruta, doc } of d.meses) {
    if (mes < desde || cabeceras(doc).estado?.estado !== 'cerrado') continue;
    const hasta = cabeceras(doc).periodo?.hasta ?? periodoMes(mes, diaInicio(tx.ctx)).hasta;
    const foto = fotoCierre({ ...d, hasta });
    const actual = valores(doc, 'Cierre');
    let cambia = false;
    for (const k of ['saldos', 'cartera', 'patrimonio']) {
      if (JSON.stringify(actual[k]) !== JSON.stringify(foto[k])) {
        fijarKv(doc, 'Cierre', k, foto[k]);
        cambia = true;
      }
    }
    if (cambia) tx.tocar(ruta);
  }
}

/** Pide recalcular las fotos desde `mes` al final de la operación (una sola vez, desde el mes más antiguo). */
function recalcularAlFinal(tx, mes) {
  tx.minRecalculo = tx.minRecalculo && tx.minRecalculo < mes ? tx.minRecalculo : mes;
  tx.alFinal('cierres', () => recalcularCierres(tx, tx.minRecalculo));
}

/** Da id a los movimientos que no lo tienen (o lo tienen repetido) al guardar ese mes. */
function asegurarIds(doc, prng) {
  if (!prng) throw new Error('falta ctx.prng para generar ids');
  const sec = seccionDe(doc, 'Movimientos');
  const usados = new Set();
  for (const n of sec?.nodos ?? []) {
    if (n.k !== 'item') continue;
    if (!n.valor.id || n.idRepetido || usados.has(n.valor.id)) {
      n.valor.id = idCorto([...usados, ...sec.nodos.filter((x) => x.k === 'item').map((x) => x.valor.id)], prng);
      delete n.idRepetido;
    }
    usados.add(n.valor.id);
  }
}

function insertarOrdenado(sec, nodo) {
  let pos = sec.nodos.length;
  for (let i = sec.nodos.length - 1; i >= 0; i--) {
    const n = sec.nodos[i];
    if (n.k === 'item') {
      pos = n.valor.fecha <= nodo.valor.fecha ? i + 1 : i;
      if (n.valor.fecha <= nodo.valor.fecha) break;
    }
  }
  sec.nodos.splice(pos, 0, nodo);
}

function validarMov(valor, que) {
  const v = validarEntidad(movimiento, { etiquetas: [], ...valor, id: valor.id ?? 'zzzz' }, que);
  if (!valor.id) delete v.id;
  return v;
}

function guardar(tx, doc, ruta) {
  asegurarIds(doc, tx.ctx.prng);
  tx.tocar(ruta);
  const m = RE_RUTA_MES.exec(ruta);
  if (m && tx.ctx.rutas) recalcularAlFinal(tx, m[1]);
}

registrar({
  /** {mov, confirmarCerrado?} → {mes, id} · va al fichero del mes financiero de su fecha. */
  'mov.crear'(tx, { mov = {}, confirmarCerrado = false }) {
    const valor = validarMov({ ...mov, id: undefined }, 'el movimiento');
    const mes = mesFinanciero(valor.fecha, diaInicio(tx.ctx));
    const { doc, ruta } = abrirMes(tx, mes, { crear: true });
    permitirEdicion(doc, mes, confirmarCerrado);
    const nodo = nodoItem(valor);
    insertarOrdenado(seccionDe(doc, 'Movimientos', { crear: true }), nodo);
    guardar(tx, doc, ruta);
    return { mes, id: nodo.valor.id };
  },

  /** {mes, id, cambios, confirmarCerrado?} · si cambia la fecha a otro mes, se mueve de fichero. */
  'mov.editar'(tx, { mes, id, cambios = {}, confirmarCerrado = false }) {
    const { doc, ruta } = abrirMes(tx, mes);
    const { sec, nodo, indice } = buscarItem(doc, 'Movimientos', 'id', id, 'el movimiento');
    if ('id' in cambios && cambios.id !== id) throw new ErrorOp('invalida', 'el id de un movimiento no cambia');
    permitirEdicion(doc, mes, confirmarCerrado);
    const nuevo = { ...nodo.valor };
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === undefined) delete nuevo[k];
      else nuevo[k] = v;
    }
    if (cambios.grupo === null) nuevo.grupo = null;
    const valor = validarMov(nuevo, 'el movimiento');
    const destino = mesFinanciero(valor.fecha, diaInicio(tx.ctx));
    if (destino === mes) {
      nodo.valor = valor;
      guardar(tx, doc, ruta);
      return { mes, id };
    }
    sec.nodos.splice(indice, 1);
    guardar(tx, doc, ruta);
    const otro = abrirMes(tx, destino, { crear: true });
    permitirEdicion(otro.doc, destino, confirmarCerrado);
    const secOtro = seccionDe(otro.doc, 'Movimientos', { crear: true });
    if (secOtro.nodos.some((n) => n.k === 'item' && n.valor.id === valor.id)) delete valor.id;
    const movido = { ...nodo, valor };
    insertarOrdenado(secOtro, movido);
    guardar(tx, otro.doc, otro.ruta);
    return { mes: destino, id: movido.valor.id };
  },

  /** {mes, id, confirmarCerrado?} → a la papelera */
  'mov.borrar'(tx, { mes, id, confirmarCerrado = false }) {
    const { doc, ruta } = abrirMes(tx, mes);
    const { sec, nodo, indice } = buscarItem(doc, 'Movimientos', 'id', id, 'el movimiento');
    permitirEdicion(doc, mes, confirmarCerrado);
    tx.aPapelera({ que: `${nodo.valor.concepto} (${nodo.valor.fecha})`, ruta, tipo: 'entidad', seccion: 'Movimientos', indice, contenido: lineaDe(doc, 'Movimientos', nodo) });
    sec.nodos.splice(indice, 1);
    guardar(tx, doc, ruta);
  },

  /** {mes, rec, importe?, fecha?, confirmarCerrado?} → crea el movimiento y marca «confirmado». */
  'rec.confirmar'(tx, { mes, rec, importe, fecha, confirmarCerrado = false }) {
    const r = items(tx.doc('recurrentes.md')).find((x) => x.id === rec);
    if (!r) throw new ErrorOp('no_existe', `no existe el recurrente «${rec}»`);
    const { doc, ruta } = abrirMes(tx, mes, { crear: true });
    permitirEdicion(doc, mes, confirmarCerrado);
    const marcas = seccionDe(doc, 'Recurrentes')?.nodos ?? [];
    if (marcas.some((n) => n.k === 'kv' && n.clave === rec && n.valor === 'confirmado')) throw new ErrorOp('invalida', `«${r.concepto}» ya está confirmado en ${mes}`);
    const grupo = tx.existe('grupos.md') ? items(tx.doc('grupos.md')).find((g) => g.id === r.grupo) : null;
    const mov = { fecha: fecha ?? fechaCobro(mes, r.dia.dia, diaInicio(tx.ctx)), concepto: r.concepto, importe: importe ?? r.importe, grupo: r.grupo, cuenta: r.cuenta, rec: r.id, etiquetas: r.etiquetas ?? [] };
    if (grupo?.cuenta && grupo.cuenta !== r.cuenta) mov.a = grupo.cuenta;
    const valor = validarMov(mov, 'el movimiento del recurrente');
    if (mesFinanciero(valor.fecha, diaInicio(tx.ctx)) !== mes) throw new ErrorOp('invalida', `la fecha ${valor.fecha} no es de ${mes}`);
    const nodo = nodoItem(valor);
    insertarOrdenado(seccionDe(doc, 'Movimientos', { crear: true }), nodo);
    fijarKv(doc, 'Recurrentes', rec, 'confirmado');
    guardar(tx, doc, ruta);
    return { mes, id: nodo.valor.id };
  },

  /** {mes, importes: {idRec: céntimos}} → confirma de una vez todos los que tocan y siguen sin marca. */
  'rec.confirmarTodos'(tx, { mes, importes = {}, confirmarCerrado = false }) {
    const recs = recurrentesDelMes(items(tx.doc('recurrentes.md')), mes, { inicio: diaInicio(tx.ctx) });
    const marcas = tx.existe(rutaMes(mes)) ? valores(tx.doc(rutaMes(mes)), 'Recurrentes') : {};
    const ids = [];
    for (const { rec } of recs) {
      if (marcas[rec.id]) continue;
      tx.sub('rec.confirmar', { mes, rec: rec.id, importe: importes[rec.id], confirmarCerrado });
      ids.push(rec.id);
    }
    return { confirmados: ids };
  },

  /** {mes, rec, confirmarCerrado?} → «saltado» este mes */
  'rec.saltar'(tx, { mes, rec, confirmarCerrado = false }) {
    const { doc, ruta } = abrirMes(tx, mes, { crear: true });
    permitirEdicion(doc, mes, confirmarCerrado);
    validarKv(doc.spec.secciones.Recurrentes.items, rec, 'saltado', 'el recurrente');
    fijarKv(doc, 'Recurrentes', rec, 'saltado');
    guardar(tx, doc, ruta);
  },

  /** {mes, rec} → quita la marca (no borra el movimiento) */
  'rec.desmarcar'(tx, { mes, rec, confirmarCerrado = false }) {
    const { doc, ruta } = abrirMes(tx, mes);
    permitirEdicion(doc, mes, confirmarCerrado);
    const sec = seccionDe(doc, 'Recurrentes');
    const i = sec?.nodos.findIndex((n) => n.k === 'kv' && n.clave === rec) ?? -1;
    if (i < 0) return;
    sec.nodos.splice(i, 1);
    guardar(tx, doc, ruta);
  },

  /** {mes, grupo, importe|null} · presupuesto solo de ese mes (null lo quita) */
  'pres.fijar'(tx, { mes, grupo, importe, confirmarCerrado = false }) {
    const { doc, ruta } = abrirMes(tx, mes, { crear: true });
    permitirEdicion(doc, mes, confirmarCerrado);
    const sec = seccionDe(doc, 'Presupuestos', { crear: importe !== null && importe !== undefined });
    if (importe === null || importe === undefined) {
      const i = sec?.nodos.findIndex((n) => n.k === 'kv' && n.clave === grupo) ?? -1;
      if (i >= 0) sec.nodos.splice(i, 1);
    } else fijarKv(doc, 'Presupuestos', grupo, validarKv(doc.spec.secciones.Presupuestos.items, grupo, importe, 'el presupuesto'));
    guardar(tx, doc, ruta);
  },

  /** {mes, leccion?} → cierra el mes con su foto (saldos, cartera, patrimonio). Avisa, no bloquea. */
  'mes.cerrar'(tx, { mes, leccion = '' }) {
    const { doc, ruta } = abrirMes(tx, mes, { crear: true });
    const cab = cabeceras(doc);
    if (cab.estado?.estado === 'cerrado') throw new ErrorOp('invalida', `${mes} ya está cerrado`);
    const hasta = cab.periodo?.hasta ?? periodoMes(mes, diaInicio(tx.ctx)).hasta;
    const d = datosFoto(tx);
    const foto = fotoCierre({ ...d, hasta });
    fijarCabecera(doc, 'estado', { estado: 'cerrado', fecha: hasta });
    const sec = seccionDe(doc, 'Cierre');
    if (sec) sec.nodos = sec.nodos.filter((n) => n.k !== 'kv');
    for (const [k, v] of [['fecha', hasta], ['saldos', foto.saldos], ['cartera', foto.cartera], ['patrimonio', foto.patrimonio], ['leccion', String(leccion ?? '').trim()], ['editado_tras_cierre', false]]) fijarKv(doc, 'Cierre', k, v);
    const grupos = tx.existe('grupos.md') ? items(tx.doc('grupos.md')) : [];
    const t = totales(items(doc, 'Movimientos'), grupos);
    if (t.sinGrupo.length) tx.aviso(`${t.sinGrupo.length} movimiento(s) sin grupo`);
    const recs = tx.existe('recurrentes.md') ? recurrentesDelMes(items(tx.doc('recurrentes.md')), mes, { inicio: diaInicio(tx.ctx) }) : [];
    const marcas = valores(doc, 'Recurrentes');
    const sinConfirmar = recs.filter((r) => !marcas[r.rec.id]).length;
    if (sinConfirmar) tx.aviso(`${sinConfirmar} recurrente(s) sin confirmar ni saltar`);
    if (!d.fotos.some((f) => f.fecha <= hasta && f.fecha >= periodoMes(mes, diaInicio(tx.ctx)).desde)) tx.aviso('no hay valor de la cartera de este mes: se usa la última foto');
    tx.tocar(ruta);
    recalcularAlFinal(tx, mes);
    return { mes, foto };
  },

  /** {mes} → reabre: quita la foto (al volver a cerrar se hace otra). */
  'mes.reabrir'(tx, { mes }) {
    const { doc, ruta } = abrirMes(tx, mes);
    if (cabeceras(doc).estado?.estado !== 'cerrado') throw new ErrorOp('invalida', `${mes} no está cerrado`);
    fijarCabecera(doc, 'estado', { estado: 'reabierto', fecha: null });
    doc.secciones = doc.secciones.filter((s) => s.nombre !== 'Cierre');
    tx.tocar(ruta);
  },

  /**
   * {dia} → cambia el inicio del mes financiero (§4.1, §9.3) y reparte TODOS los movimientos en los
   * ficheros de su nuevo mes. Los meses cerrados afectados quedan «editados tras cierre» con su foto recalculada.
   */
  'mes.cambiarInicio'(tx, { dia }) {
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new ErrorOp('invalida', 'el día de inicio debe estar entre 1 y 28');
    const anterior = diaInicio(tx.ctx);
    if (dia === anterior) return { cambiados: [] };
    const meses = todosLosMeses(tx);
    const nodos = [];
    for (const { doc } of meses) {
      const sec = seccionDe(doc, 'Movimientos');
      if (!sec) continue;
      nodos.push(...sec.nodos.filter((n) => n.k === 'item'));
      sec.nodos = sec.nodos.filter((n) => n.k !== 'item');
    }
    const antes = new Map(meses.map(({ mes, doc }) => [mes, JSON.stringify(items(doc, 'Movimientos'))]));
    for (const n of nodos) {
      const destino = mesFinanciero(n.valor.fecha, dia);
      const { doc } = abrirMes(tx, destino, { crear: true, dia });
      const sec = seccionDe(doc, 'Movimientos', { crear: true });
      if (sec.nodos.some((x) => x.k === 'item' && x.valor.id === n.valor.id)) delete n.valor.id;
      insertarOrdenado(sec, n);
    }
    const cambiados = [];
    for (const { mes, ruta, doc } of todosLosMeses(tx)) {
      fijarCabecera(doc, 'periodo', periodoMes(mes, dia));
      const cambio = antes.get(mes) !== JSON.stringify(items(doc, 'Movimientos'));
      if (cambio && cabeceras(doc).estado?.estado === 'cerrado') {
        fijarKv(doc, 'Cierre', 'editado_tras_cierre', true);
        fijarKv(doc, 'Cierre', 'fecha', periodoMes(mes, dia).hasta);
        fijarCabecera(doc, 'estado', { estado: 'cerrado', fecha: periodoMes(mes, dia).hasta });
        cambiados.push(mes);
      }
      asegurarIds(doc, tx.ctx.prng);
      tx.tocar(ruta);
    }
    const aj = tx.doc('ajustes.md', { crear: true });
    fijarKv(aj, null, 'mes_inicio_dia', dia);
    tx.tocar('ajustes.md');
    tx.ctx = { ...tx.ctx, ajustes: { ...tx.ctx.ajustes, mes_inicio_dia: dia } };
    if (cambiados.length) tx.aviso(`meses cerrados con movimientos repartidos (foto recalculada): ${cambiados.join(', ')}`);
    recalcularCierres(tx);
    return { cambiados };
  },
});
