// Ayudas para las operaciones: localizar entidades y bloques, validar valores con su formato.
import { ErrorOp } from './motor.js';
import { serializar } from '../formato/motor.js';
import { anadirComentario } from '../formato/lineas.js';

/** Clave estable de cada fichero de lista (la que no cambia al renombrar). */
export const CLAVE_LISTA = {
  cuentas: 'id', grupos: 'id', etiquetas: 'id', recurrentes: 'id', hitos: 'id', operaciones: 'id', objetivo: 'activo',
  clases: 'id', valores: 'activo', plantilla: 'id', borrador: 'id', familias: 'id', fuentes: 'id', mezclas: 'id', predicciones: 'id',
};

/** Spec de los ítems de una sección (null = preámbulo). */
export function specItems(doc, seccion) {
  return seccion ? doc.spec.secciones[seccion]?.items : doc.spec.preambulo;
}

export function seccionDe(doc, seccion, { crear = false } = {}) {
  let s = seccion ? doc.secciones.find((x) => x.nombre === seccion) : doc.secciones[0];
  if (!s && crear) {
    s = { clase: 'seccion', nombre: seccion, nodos: [] };
    doc.secciones.push(s);
  }
  return s;
}

/** Localiza una entidad viva por su clave. → {sec, nodo, indice} o lanza no_existe. */
export function buscarItem(doc, seccion, campo, valor, que = 'entidad') {
  const sec = seccionDe(doc, seccion);
  const indice = sec ? sec.nodos.findIndex((n) => n.k === 'item' && !n.excluido && String(n.valor[campo]).toLowerCase() === String(valor).toLowerCase()) : -1;
  if (indice < 0) throw new ErrorOp('no_existe', `no existe ${que} «${valor}»`);
  return { sec, nodo: sec.nodos[indice], indice };
}

export const existeItem = (doc, seccion, campo, valor) =>
  (seccionDe(doc, seccion)?.nodos ?? []).some((n) => n.k === 'item' && !n.excluido && String(n.valor[campo]).toLowerCase() === String(valor).toLowerCase());

/**
 * Comprueba un valor contra la especificación de su línea: lo escribe y lo vuelve a leer.
 * Devuelve el valor canónico (tal y como quedará en el fichero) o lanza «invalida» con el motivo.
 */
export function validarEntidad(spec, valor, que = 'el dato') {
  let linea;
  try {
    linea = spec.fmt(valor, []);
  } catch (e) {
    throw new ErrorOp('invalida', `${que} no es válido: ${e.message}`);
  }
  if (/\n/.test(linea)) throw new ErrorOp('invalida', `${que} no puede tener saltos de línea`);
  const r = spec.parse(linea.slice(2));
  if (!r.ok) throw new ErrorOp('invalida', `${que} no es válido: ${r.error}`);
  if (r.avisos.length || r.extra.length) throw new ErrorOp('invalida', `${que} no es válido: ${r.avisos.join('; ')}`);
  return r.valor;
}

/** Igual para un valor de campo «clave: valor». */
export function validarKv(especKv, clave, valor, que = clave) {
  let texto;
  try {
    texto = especKv.fmtValor(clave, valor);
  } catch (e) {
    throw new ErrorOp('invalida', `${que} no es válido: ${e.message}`);
  }
  if (/\n/.test(texto)) throw new ErrorOp('invalida', `${que} no puede tener saltos de línea`);
  const r = especKv.parseLinea(`${clave}: ${texto}`);
  if (!r || r.valor === undefined) throw new ErrorOp('invalida', `${que} no es válido: ${r?.aviso ?? 'formato desconocido'}`);
  return r.valor;
}

export const nodoItem = (valor) => ({ k: 'item', valor, extra: [], comentario: null });

/** Texto de una línea tal y como está en el fichero (para la papelera). */
export function lineaDe(doc, seccion, nodo) {
  return anadirComentario(specItems(doc, seccion).fmt(nodo.valor, nodo.extra), nodo.comentario);
}

/** Bloques "## id · título". */
export function buscarBloque(doc, id, que = 'bloque') {
  const indice = doc.secciones.findIndex((s) => s.clase === 'bloque' && !s.excluido && s.id.toLowerCase() === String(id).toLowerCase());
  if (indice < 0) throw new ErrorOp('no_existe', `no existe ${que} «${id}»`);
  return { sec: doc.secciones[indice], indice };
}

/** Texto completo de un bloque (cabecera + campos + cuerpo) para la papelera. */
export function textoBloque(doc, sec) {
  const solo = { ...doc, titulo: '-', secciones: [{ clase: 'preambulo', nodos: [] }, sec] };
  return serializar(solo).split('\n').slice(2).join('\n').replace(/\n$/, '');
}
