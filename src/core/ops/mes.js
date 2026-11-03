// Operaciones del mes (§2.5, §4.1): movimientos, recurrentes del mes y presupuestos del mes.
// ctx: {ajustes: {mes_inicio_dia}, prng} · el recálculo de la foto de cierre llega en F4.
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, buscarItem, validarEntidad, validarKv, nodoItem, lineaDe } from './comun.js';
import { movimiento } from '../formato/mes.js';
import { fijarCabecera, fijarKv, cabeceras, items, asegurarSeccion } from '../formato/motor.js';
import { periodoMes, mesFinanciero } from '../fechas.js';
import { fechaCobro } from '../recurrentes.js';

export { fechaCobro };
import { idCorto } from '../ids.js';

const rutaMes = (mes) => `mes/${mes}.md`;
const diaInicio = (ctx) => ctx.ajustes?.mes_inicio_dia ?? 1;

function abrirMes(tx, mes, { crear = false } = {}) {
  const ruta = rutaMes(mes);
  const nuevo = !tx.existe(ruta);
  if (nuevo && !crear) throw new ErrorOp('no_existe', `no hay movimientos de ${mes}`);
  const doc = tx.doc(ruta, { crear, ctxFormato: { diaInicio: diaInicio(tx.ctx) } });
  if (nuevo) {
    fijarCabecera(doc, 'periodo', periodoMes(mes, diaInicio(tx.ctx)));
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
});
