// Operaciones de la cartera (§2.5, §5 Cartera, §14.5): operaciones con enlace al movimiento, fotos de valor,
// objetivo, borradores (Generar cartera base) y su aceptación. Los activos y clases usan bloque.*/lista.*.
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, buscarItem, validarEntidad, nodoItem } from './comun.js';
import { siguienteCorrelativo } from '../ids.js';
import { items, bloques, fijarCabecera, cabeceras } from '../formato/motor.js';
import { esFecha } from '../fechas.js';
import { recalcularCierres } from './mes.js';

// Cambiar operaciones o fotos de valor cambia la cartera de los meses cerrados: se recalculan sus fotos.
const recalcular = (tx) => tx.ctx.rutas && tx.alFinal('cierres-cartera', () => recalcularCierres(tx));

const OPS = 'cartera/operaciones.md';

function enlazarMovimiento(tx, { mes, id }, opId, confirmarCerrado) {
  const ruta = `mes/${mes}.md`;
  const doc = tx.doc(ruta);
  const { nodo } = buscarItem(doc, 'Movimientos', 'id', id, 'el movimiento');
  if (cabeceras(doc).estado?.estado === 'cerrado' && !confirmarCerrado) throw new ErrorOp('mes_cerrado', 'Este mes está cerrado: ¿lo editas igualmente?', { mes });
  nodo.valor = { ...nodo.valor, op: opId };
  tx.tocar(ruta);
}

registrar({
  /** {op: {fecha, tipo, activo, importe, participaciones?, nota?}, mov?: {mes, id}} → {id} */
  'operacion.crear'(tx, { op, mov = null, confirmarCerrado = false }) {
    recalcular(tx);
    const doc = tx.doc(OPS, { crear: true });
    const ids = items(doc, null, { incluirExcluidos: true }).map((o) => o.id);
    const id = siguienteCorrelativo('OP', ids, 4);
    const valor = validarEntidad(doc.spec.preambulo, { ...op, id, ...(mov ? { mov: `${mov.mes}/${mov.id}` } : {}) }, 'la operación');
    if (valor.tipo === 'traspaso' && !valor.activo.destino) throw new ErrorOp('invalida', 'un traspaso necesita origen y destino');
    if (valor.tipo !== 'traspaso' && valor.activo.destino) throw new ErrorOp('invalida', 'solo los traspasos llevan origen → destino');
    if (valor.activo.origen && valor.activo.origen === valor.activo.destino) throw new ErrorOp('invalida', 'el origen y el destino del traspaso son el mismo');
    const activosDoc = tx.existe('cartera/activos.md') ? tx.doc('cartera/activos.md') : null;
    const conocidos = new Set(activosDoc ? bloques(activosDoc).map((b) => b.id) : []);
    for (const a of [valor.activo.activo, valor.activo.origen, valor.activo.destino].filter(Boolean)) if (!conocidos.has(a)) tx.aviso(`«${a}» no está en tus activos: añádelo en Gestión → Activos y objetivo`);
    seccionDe(doc, null, { crear: true }).nodos.push(nodoItem(valor));
    tx.tocar(OPS);
    if (mov) enlazarMovimiento(tx, mov, id, confirmarCerrado);
    return { id };
  },

  /** {id, cambios} · el id no cambia. */
  'operacion.editar'(tx, { id, cambios = {} }) {
    recalcular(tx);
    const doc = tx.doc(OPS);
    const { nodo } = buscarItem(doc, null, 'id', id, 'la operación');
    if ('id' in cambios && cambios.id !== id) throw new ErrorOp('invalida', 'el id de una operación no cambia');
    const nuevo = { ...nodo.valor };
    for (const [k, v] of Object.entries(cambios)) (v === null ? delete nuevo[k] : (nuevo[k] = v));
    nodo.valor = validarEntidad(doc.spec.preambulo, nuevo, `la operación ${id}`);
    tx.tocar(OPS);
  },

  /** {id} → a la papelera (y quita el «op:» del movimiento enlazado si lo hay). */
  'operacion.borrar'(tx, { id }) {
    recalcular(tx);
    const doc = tx.doc(OPS);
    const { nodo } = buscarItem(doc, null, 'id', id, 'la operación');
    tx.sub('lista.borrar', { ruta: OPS, clave: id, que: `${id} · ${nodo.valor.tipo} ${nodo.valor.fecha}` });
    if (nodo.valor.mov) {
      const [mes, mid] = nodo.valor.mov.split('/');
      const ruta = `mes/${mes}.md`;
      if (tx.existe(ruta)) {
        const m = seccionDe(tx.doc(ruta), 'Movimientos')?.nodos.find((n) => n.k === 'item' && n.valor.id === mid && n.valor.op === id);
        if (m) {
          delete m.valor.op;
          tx.tocar(ruta);
        }
      }
    }
  },

  /** {fecha, filas: [{activo, valor, origen}]} · foto de valor del día (sustituye las filas de esos activos). */
  'valores.guardar'(tx, { fecha, filas = [] }) {
    recalcular(tx);
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (!filas.length) throw new ErrorOp('invalida', 'no hay valores que guardar');
    const ruta = `cartera/valores/${fecha}.md`;
    const doc = tx.doc(ruta, { crear: true, ctxFormato: { fecha } });
    const sec = seccionDe(doc, null);
    for (const f of filas) {
      const valor = validarEntidad(doc.spec.preambulo, { origen: 'manual', ...f }, `el valor de «${f.activo}»`);
      if (valor.valor < 0) throw new ErrorOp('invalida', `el valor de «${f.activo}» no puede ser negativo`);
      const i = sec.nodos.findIndex((n) => n.k === 'item' && n.valor.activo === valor.activo);
      if (i >= 0) sec.nodos[i] = { ...sec.nodos[i], valor };
      else sec.nodos.push(nodoItem(valor));
    }
    tx.tocar(ruta);
    return { ruta };
  },

  /** {pesos: [{activo, peso (pb), minimo?}], redondeo?, umbral?} · los pesos deben sumar 100 %. */
  'objetivo.fijar'(tx, { pesos, redondeo, umbral }) {
    const doc = tx.doc('cartera/objetivo.md', { crear: true });
    if (pesos) {
      const vals = pesos.filter((p) => p.peso > 0).map((p) => validarEntidad(doc.spec.preambulo, p, `el peso de «${p.activo}»`));
      const suma = vals.reduce((s, v) => s + v.peso, 0);
      if (suma !== 10000) throw new ErrorOp('invalida', `los pesos suman ${suma / 100} %, no 100 %`);
      if (new Set(vals.map((v) => v.activo)).size !== vals.length) throw new ErrorOp('invalida', 'un activo aparece dos veces en el objetivo');
      const sec = seccionDe(doc, null);
      sec.nodos = [...sec.nodos.filter((n) => n.k !== 'item'), ...vals.map(nodoItem)];
    }
    if (redondeo !== undefined) fijarCabecera(doc, 'redondeo', redondeo);
    if (umbral !== undefined) fijarCabecera(doc, 'umbral_desviacion', umbral);
    tx.tocar('cartera/objetivo.md');
  },

  /** {plantilla: {perfil, titulo, filas: [{id, nombre, peso, clase?, isin?, ter?, tipo?, indice?}]}, fecha} → {ruta} */
  'borrador.crear'(tx, { plantilla, fecha }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    const perfil = plantilla?.perfil ?? 'personalizada';
    let ruta = `cartera/borradores/${fecha}-${perfil}.md`;
    for (let n = 2; tx.existe(ruta); n++) ruta = `cartera/borradores/${fecha}-${perfil}-${n}.md`;
    const doc = tx.doc(ruta, { crear: true });
    doc.titulo = `Borrador · ${plantilla?.titulo ?? perfil}`;
    for (const [k, v] of [['fecha', fecha], ['perfil', perfil], ['origen', `plantilla ${perfil}`], ['estado', 'borrador'], ['revisado_claude', 'no']]) fijarCabecera(doc, k, v);
    const sec = seccionDe(doc, null);
    for (const f of plantilla?.filas ?? []) sec.nodos.push(nodoItem(validarEntidad(doc.spec.preambulo, f, `la fila «${f.id}»`)));
    const suma = (plantilla?.filas ?? []).reduce((s, f) => s + f.peso, 0);
    if (suma !== 10000) throw new ErrorOp('invalida', `los pesos de la plantilla suman ${suma / 100} %, no 100 %`);
    tx.tocar(ruta);
    return { ruta };
  },

  /**
   * {ruta} · acepta un borrador: crea los activos que no existen (con su clase, ISIN, TER…), fija el objetivo
   * con sus pesos y lo marca «aceptado». Tu cartera actual (operaciones y valores) no se toca.
   */
  'borrador.aceptar'(tx, { ruta }) {
    if (!/^cartera\/borradores\/[^/]+\.md$/.test(ruta ?? '')) throw new ErrorOp('invalida', 'borrador no válido');
    const doc = tx.doc(ruta);
    if (cabeceras(doc).estado === 'aceptado') throw new ErrorOp('invalida', 'ese borrador ya está aceptado');
    const filas = items(doc);
    const activos = tx.existe('cartera/activos.md') ? bloques(tx.doc('cartera/activos.md')) : [];
    const ids = activos.map((a) => a.id);
    const creados = [];
    for (const f of filas) {
      if (ids.includes(f.id)) continue;
      const campos = { isin: f.isin ?? null, tipo: f.tipo ?? 'fondo', clase: f.clase ?? null, divisa: 'EUR', ter: f.ter ?? null, indice: f.indice ?? null };
      tx.sub('bloque.crear', { ruta: 'cartera/activos.md', id: f.id, titulo: f.nombre, campos });
      creados.push(f.id);
    }
    tx.sub('objetivo.fijar', { pesos: filas.map((f) => ({ activo: f.id, peso: f.peso })) });
    fijarCabecera(doc, 'estado', 'aceptado');
    tx.tocar(ruta);
    return { creados };
  },
});

