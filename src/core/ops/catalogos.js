// Operaciones de catálogos que tocan varios ficheros (§2.5, docs/OPERACIONES.md):
// recurrentes (editar este mes o desde el siguiente, pausar), grupos (naturaleza, borrar con reasignación),
// etiquetas (renombrar y borrar en todos los movimientos) y cuentas (ajustar saldo).
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, buscarItem, validarEntidad, existeItem } from './comun.js';
import { todosLosMeses, recalcularCierres } from './mes.js';
import { items, cabeceras, fijarKv } from '../formato/motor.js';
import { recurrentes as fRecurrentes } from '../formato/catalogos.js';
import { saldos } from '../patrimonio.js';
import { mesFinanciero } from '../fechas.js';

/** Recorre los movimientos de todos los meses; `fn(valor) → true` si lo cambió. */
function cadaMovimiento(tx, fn) {
  const tocados = [];
  for (const { ruta, doc } of todosLosMeses(tx)) {
    let cambio = false;
    for (const n of seccionDe(doc, 'Movimientos')?.nodos ?? []) if (n.k === 'item' && fn(n.valor)) cambio = true;
    if (cambio) {
      tx.tocar(ruta);
      tocados.push(ruta);
    }
  }
  return tocados;
}

const sub = (tx, nombre, args) => tx.sub(nombre, args);

registrar({
  /**
   * {id, cambios, aplicar: 'siguiente' | 'esteMes', mes} · «¿solo a partir del mes que viene o también este mes?»
   * Con «esteMes», el movimiento ya confirmado de ese mes (rec: id) recibe los mismos cambios.
   */
  'rec.editar'(tx, { id, cambios = {}, aplicar = 'siguiente', mes = null, confirmarCerrado = false }) {
    const doc = tx.doc('recurrentes.md');
    const { nodo } = buscarItem(doc, null, 'id', id, 'el recurrente');
    if ('id' in cambios && cambios.id !== id) throw new ErrorOp('invalida', 'el id de un recurrente no cambia');
    const nuevo = { ...nodo.valor };
    for (const [k, v] of Object.entries(cambios)) (v === null ? delete nuevo[k] : (nuevo[k] = v));
    nodo.valor = validarEntidad(fRecurrentes.spec.preambulo, nuevo, `el recurrente «${id}»`);
    tx.tocar('recurrentes.md');
    if (aplicar !== 'esteMes') return { movimientos: 0 };
    const objetivo = mes ?? mesFinanciero(tx.ctx.hoy, tx.ctx.ajustes?.mes_inicio_dia ?? 1);
    const campos = ['concepto', 'importe', 'grupo', 'cuenta', 'etiquetas'].filter((k) => k in cambios);
    let n = 0;
    const tocados = cadaMovimiento(tx, (m) => {
      if (m.rec !== id || mesFinanciero(m.fecha, tx.ctx.ajustes?.mes_inicio_dia ?? 1) !== objetivo) return false;
      for (const k of campos) m[k] = nodo.valor[k];
      n++;
      return true;
    });
    // un mes cerrado no cambia sin preguntar, y queda marcado y con su foto al día (§2.5)
    for (const ruta of tocados) {
      const d = tx.doc(ruta);
      if (cabeceras(d).estado?.estado !== 'cerrado') continue;
      if (!confirmarCerrado) throw new ErrorOp('mes_cerrado', 'Este mes está cerrado: ¿lo editas igualmente?', { mes: objetivo });
      fijarKv(d, 'Cierre', 'editado_tras_cierre', true);
      recalcularCierres(tx, objetivo);
    }
    if (!n) tx.aviso(`este mes aún no había movimiento de «${nodo.valor.concepto}»: el cambio se verá al confirmarlo`);
    return { movimientos: n };
  },

  'rec.pausar'(tx, { id, pausado = true }) {
    const doc = tx.doc('recurrentes.md');
    const { nodo } = buscarItem(doc, null, 'id', id, 'el recurrente');
    nodo.valor = { ...nodo.valor, pausado };
    tx.tocar('recurrentes.md');
  },

  /**
   * {id, naturaleza, aplicarAMovimientos} · si NO se aplica a lo anotado, los movimientos ya anotados
   * de ese grupo que heredaban la naturaleza la conservan explícita («naturaleza: <anterior>»).
   */
  'grupo.cambiarNaturaleza'(tx, { id, naturaleza, aplicarAMovimientos = false }) {
    const doc = tx.doc('grupos.md');
    const { nodo } = buscarItem(doc, null, 'id', id, 'el grupo');
    const anterior = nodo.valor.naturaleza;
    if (anterior === naturaleza) return { movimientos: 0 };
    nodo.valor = validarEntidad(doc.spec.preambulo, { ...nodo.valor, naturaleza }, `el grupo «${id}»`);
    tx.tocar('grupos.md');
    let n = 0;
    cadaMovimiento(tx, (m) => {
      if (m.grupo !== id) return false;
      if (aplicarAMovimientos) {
        if (m.naturaleza === anterior) {
          delete m.naturaleza;
          n++;
          return true;
        }
        return false;
      }
      if (m.naturaleza) return false;
      m.naturaleza = anterior;
      n++;
      return true;
    });
    return { movimientos: n };
  },

  /** {id, destino?} · borra el grupo (a la papelera) y reasigna sus movimientos y recurrentes a `destino`. */
  'grupo.borrar'(tx, { id, destino = null }) {
    const doc = tx.doc('grupos.md');
    buscarItem(doc, null, 'id', id, 'el grupo');
    if (destino && !existeItem(doc, null, 'id', destino)) throw new ErrorOp('no_existe', `no existe el grupo destino «${destino}»`);
    let n = 0;
    if (destino) {
      cadaMovimiento(tx, (m) => {
        let c = false;
        if (m.grupo === id) (m.grupo = destino), (c = true);
        if (m.compensa === id) (m.compensa = destino), (c = true);
        if (c) n++;
        return c;
      });
      if (tx.existe('recurrentes.md')) {
        const r = tx.doc('recurrentes.md');
        for (const x of seccionDe(r, null).nodos) if (x.k === 'item' && x.valor.grupo === id) (x.valor.grupo = destino), tx.tocar('recurrentes.md');
      }
    } else {
      cadaMovimiento(tx, (m) => (m.grupo === id ? (n++, false) : false));
      if (n) tx.aviso(`${n} movimiento(s) quedan «sin grupo» (§9.2): siguen ahí y se pueden reasignar`);
    }
    sub(tx, 'lista.borrar', { ruta: 'grupos.md', clave: id, que: `grupo ${id}` });
    return { movimientos: n };
  },

  /** {de, a} · renombra la etiqueta en etiquetas.md, en todos los movimientos y en los recurrentes. */
  'etiqueta.renombrar'(tx, { de, a }) {
    const origen = String(de ?? '').replace(/^#/, '').toLowerCase();
    const destino = String(a ?? '').replace(/^#/, '').trim().toLowerCase();
    if (!/^[^\s#|]+$/u.test(destino)) throw new ErrorOp('invalida', `«${a}» no es una etiqueta válida (una palabra, sin espacios)`);
    const cambiar = (lista) => {
      const i = lista?.indexOf(origen) ?? -1;
      if (i < 0) return false;
      if (lista.includes(destino)) lista.splice(i, 1);
      else lista[i] = destino; // conserva la posición
      return true;
    };
    const tocados = cadaMovimiento(tx, (m) => cambiar(m.etiquetas));
    if (tx.existe('recurrentes.md')) {
      const r = tx.doc('recurrentes.md');
      for (const x of seccionDe(r, null).nodos) if (x.k === 'item' && cambiar(x.valor.etiquetas)) tx.tocar('recurrentes.md');
    }
    if (tx.existe('etiquetas.md')) {
      const e = tx.doc('etiquetas.md');
      const n = seccionDe(e, null).nodos.find((x) => x.k === 'item' && x.valor.id === origen);
      if (n) {
        if (seccionDe(e, null).nodos.some((x) => x.k === 'item' && x.valor.id === destino)) seccionDe(e, null).nodos.splice(seccionDe(e, null).nodos.indexOf(n), 1);
        else n.valor = { ...n.valor, id: destino };
        tx.tocar('etiquetas.md');
      }
    }
    return { ficheros: tocados.length };
  },

  /** {id} · quita la etiqueta de etiquetas.md (a la papelera), de los movimientos y de los recurrentes. */
  'etiqueta.borrar'(tx, { id }) {
    const t = String(id ?? '').replace(/^#/, '').toLowerCase();
    const quitar = (lista) => {
      if (!lista?.includes(t)) return false;
      lista.splice(lista.indexOf(t), 1);
      return true;
    };
    cadaMovimiento(tx, (m) => quitar(m.etiquetas));
    if (tx.existe('recurrentes.md')) for (const x of seccionDe(tx.doc('recurrentes.md'), null).nodos) if (x.k === 'item' && quitar(x.valor.etiquetas)) tx.tocar('recurrentes.md');
    if (tx.existe('etiquetas.md') && existeItem(tx.doc('etiquetas.md'), null, 'id', t)) sub(tx, 'lista.borrar', { ruta: 'etiquetas.md', clave: t, que: `#${t}` });
  },

  /** {cuenta, fecha, saldo} · «Ajustar saldo»: crea un movimiento «ajuste» (traspaso) por la diferencia. */
  'cuenta.ajustarSaldo'(tx, { cuenta, fecha, saldo, confirmarCerrado = false }) {
    const cuentas = items(tx.doc('cuentas.md'));
    const c = cuentas.find((x) => x.id === cuenta);
    if (!c) throw new ErrorOp('no_existe', `no existe la cuenta «${cuenta}»`);
    if (!Number.isSafeInteger(saldo)) throw new ErrorOp('invalida', 'el saldo debe ser un importe en céntimos');
    const movimientos = todosLosMeses(tx).flatMap((m) => items(m.doc, 'Movimientos'));
    const actual = saldos(cuentas, movimientos, fecha).porCuenta[cuenta];
    const real = c.tipo === 'deuda' ? -saldo : saldo;
    const diferencia = real - actual;
    if (diferencia === 0) return { diferencia: 0 };
    const r = sub(tx, 'mov.crear', { mov: { fecha, concepto: 'Ajuste de saldo', importe: diferencia, grupo: null, naturaleza: 'traspaso', cuenta, ajuste: true }, confirmarCerrado });
    return { diferencia, ...r };
  },
});
