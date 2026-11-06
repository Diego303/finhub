// Operaciones genéricas: entidades de lista, bloques "## id · título", ajustes, ficheros y papelera.
// Las específicas de cada dominio (mes, cartera…) se apoyan en estas o en las mismas ayudas.
import { registrar, ErrorOp } from './motor.js';
import { CLAVE_LISTA, specItems, seccionDe, buscarItem, existeItem, validarEntidad, validarKv, nodoItem, lineaDe, buscarBloque, textoBloque } from './comun.js';
import { detectar, leer as leerFormato } from '../formato/index.js';
import { fijarKv } from '../formato/motor.js';
import { recalcularCierres } from './mes.js';
import { parseHumor, parseAccesorios } from '../rex.js';
import { parseCrisis } from '../herramientas.js';
import { parseSupuestos } from '../proyeccion.js';
import { parsePatronesConflicto } from '../formato/config.js';
import { esFuentePrivada } from '../conocimiento.js';

// Ajustes de texto con su propia gramática: se comprueban al guardarlos desde Ajustes.
const GRAMATICAS = { rex_humor: parseHumor, accesorios: parseAccesorios, crisis_periodos: parseCrisis, proyeccion_manual: parseSupuestos, conflictos: parsePatronesConflicto };

// Editar cuentas.md (p. ej. un saldo inicial) cambia los saldos: se recalculan las fotos de los meses cerrados.
const tocarLista = (tx, ruta) => {
  tx.tocar(ruta);
  if (ruta === 'cuentas.md' && tx.ctx.rutas) tx.alFinal('cierres-cuentas', () => recalcularCierres(tx));
};

function claveDe(doc) {
  const c = CLAVE_LISTA[doc.tipo];
  if (!c) throw new ErrorOp('invalida', `«${doc.tipo}» no admite operaciones de lista`);
  return c;
}

registrar({
  /** {ruta, valor, seccion?} */
  'lista.crear'(tx, { ruta, valor, seccion = null }) {
    const doc = tx.doc(ruta, { crear: true });
    const clave = claveDe(doc);
    const spec = specItems(doc, seccion);
    if (!spec || spec.clase !== 'entidad') throw new ErrorOp('invalida', `«${ruta}» no tiene una lista en esa sección`);
    const canon = validarEntidad(spec, valor, 'la entrada');
    if (existeItem(doc, seccion, clave, canon[clave])) throw new ErrorOp('invalida', `ya existe «${canon[clave]}» en ${ruta}`);
    seccionDe(doc, seccion, { crear: true }).nodos.push(nodoItem(canon));
    tocarLista(tx, ruta);
    return { [clave]: canon[clave] };
  },

  /** {ruta, clave, cambios, seccion?} · la clave estable no cambia (§2.5). */
  'lista.editar'(tx, { ruta, clave: valorClave, cambios = {}, seccion = null }) {
    const doc = tx.doc(ruta);
    const clave = claveDe(doc);
    const { nodo } = buscarItem(doc, seccion, clave, valorClave);
    if (clave in cambios && String(cambios[clave]).toLowerCase() !== String(nodo.valor[clave]).toLowerCase()) {
      throw new ErrorOp('invalida', `el identificador «${nodo.valor[clave]}» no cambia: renombra el nombre, no el id`);
    }
    const nuevo = { ...nodo.valor };
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === undefined) delete nuevo[k];
      else nuevo[k] = v;
    }
    // R1 (§0.3.7): una fuente privada con notas no puede dejar de serlo: las blanquearía hacia los trabajos con internet
    if (ruta === 'conocimiento/_fuentes.md' && esFuentePrivada(nodo.valor) && !esFuentePrivada(nuevo) && tx.rutas(`conocimiento/${nodo.valor.id}/`).length) {
      throw new ErrorOp('invalida', `«${nodo.valor.nombre}» es privada y tiene notas: si deja de serlo, llegarían a los trabajos con internet (regla R1). Si quieres publicar una nota, copia su texto en una fuente pública.`);
    }
    nodo.valor = validarEntidad(specItems(doc, seccion), nuevo, `«${valorClave}»`);
    tocarLista(tx, ruta);
  },

  /** {ruta, clave, seccion?, que?} → a la papelera */
  'lista.borrar'(tx, { ruta, clave: valorClave, seccion = null, que = null }) {
    const doc = tx.doc(ruta);
    const clave = claveDe(doc);
    const { sec, nodo, indice } = buscarItem(doc, seccion, clave, valorClave);
    tx.aPapelera({ que: que ?? `${valorClave} (${ruta})`, ruta, tipo: 'entidad', seccion, indice, contenido: lineaDe(doc, seccion, nodo) });
    sec.nodos.splice(indice, 1);
    tocarLista(tx, ruta);
  },

  /** {ruta, id, titulo, campos, cuerpo?} */
  'bloque.crear'(tx, { ruta, id, titulo, campos = {}, cuerpo = '' }) {
    const doc = tx.doc(ruta, { crear: true });
    if (!doc.spec.bloques) throw new ErrorOp('invalida', `«${ruta}» no tiene bloques`);
    validarCabeceraBloque(id, titulo);
    if (doc.secciones.some((s) => s.clase === 'bloque' && !s.excluido && s.id.toLowerCase() === String(id).toLowerCase())) throw new ErrorOp('invalida', `ya existe «${id}» en ${ruta}`);
    const sec = { clase: 'bloque', id, titulo, nodos: [] };
    rellenarBloque(doc, sec, campos, cuerpo);
    doc.secciones.push(sec);
    tx.tocar(ruta);
    return { id };
  },

  /** {ruta, id, titulo?, campos? (null borra un campo), cuerpo?} */
  'bloque.editar'(tx, { ruta, id, titulo, campos = {}, cuerpo }) {
    const doc = tx.doc(ruta);
    const { sec } = buscarBloque(doc, id);
    if (titulo !== undefined) {
      validarCabeceraBloque(sec.id, titulo);
      sec.titulo = titulo;
    }
    const actuales = Object.fromEntries(sec.nodos.filter((n) => n.k === 'kv').map((n) => [n.clave, n.valor !== undefined ? n.valor : { __texto: n.texto }]));
    const cuerpoActual = sec.nodos.filter((n) => n.k === 'cuerpo').map((n) => n.texto).join('\n');
    const nuevos = { ...actuales };
    for (const [k, v] of Object.entries(campos)) {
      if (v === null) delete nuevos[k];
      else nuevos[k] = v;
    }
    sec.nodos = [];
    sec.enCuerpo = false;
    rellenarBloque(doc, sec, nuevos, cuerpo ?? cuerpoActual);
    tx.tocar(ruta);
  },

  /** {ruta, id, que?} → a la papelera */
  'bloque.borrar'(tx, { ruta, id, que = null }) {
    const doc = tx.doc(ruta);
    const { sec, indice } = buscarBloque(doc, id);
    const bloquesAntes = doc.secciones.slice(0, indice).filter((s) => s.clase === 'bloque').length;
    tx.aPapelera({ que: que ?? `${id} (${ruta})`, ruta, tipo: 'bloque', indice: bloquesAntes, contenido: textoBloque(doc, sec) });
    doc.secciones.splice(indice, 1);
    tx.tocar(ruta);
  },

  /** {clave, valor} en ajustes.md */
  'ajustes.fijar'(tx, { clave, valor }) {
    const doc = tx.doc('ajustes.md', { crear: true });
    const especKv = doc.spec.preambulo;
    if (!especKv.defs[clave]) throw new ErrorOp('invalida', `ajuste desconocido «${clave}»`);
    fijarKv(doc, null, clave, validarKv(especKv, clave, valor));
    tx.tocar('ajustes.md');
  },

  /**
   * {valores: {clave: texto}} · varios ajustes escritos como en el fichero (un solo deshacer). Texto vacío =
   * se quita la clave y vuelve el valor por defecto. Cada texto se valida con el propio formato.
   */
  'ajustes.textos'(tx, { valores = {} }) {
    const doc = tx.doc('ajustes.md', { crear: true });
    const especKv = doc.spec.preambulo;
    const errores = [];
    for (const [clave, texto] of Object.entries(valores)) {
      if (!especKv.defs[clave]) throw new ErrorOp('invalida', `ajuste desconocido «${clave}»`);
      const t = String(texto ?? '').replace(/\s*\n\s*/g, ' ').trim();
      if (!t) {
        const pre = doc.secciones[0];
        const i = pre.nodos.findIndex((n) => n.k === 'kv' && n.clave === clave);
        if (i >= 0) pre.nodos.splice(i, 1);
        continue;
      }
      const r = especKv.parseLinea(`${clave}: ${t}`);
      if (!r || r.valor === undefined) {
        errores.push(r?.aviso ?? `${clave}: no válido`);
        continue;
      }
      const g = GRAMATICAS[clave]?.(r.valor);
      if (g?.error) {
        errores.push(`${clave}: ${g.error}`);
        continue;
      }
      fijarKv(doc, null, clave, r.valor);
    }
    if (errores.length) throw new ErrorOp('invalida', errores.join(' · '));
    tx.tocar('ajustes.md');
  },

  /** {ruta: roles/<id>.md | tareas/<id>.md, texto} · tu versión de un rol o una tarea (validada por su formato). */
  'texto.guardar'(tx, { ruta, texto }) {
    if (!/^(roles|tareas)\/[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(ruta ?? '')) throw new ErrorOp('invalida', 'solo se editan aquí roles/ y tareas/');
    const t = `${String(texto ?? '').replace(/\r\n/g, '\n').trimEnd()}\n`;
    const d = leerFormato(ruta, t);
    const errores = d?.avisos.filter((a) => a.nivel === 'error') ?? [];
    if (!d || errores.length) throw new ErrorOp('invalida', errores.map((a) => `línea ${a.linea}: ${a.mensaje}`).join(' · ') || 'no es un rol ni una tarea');
    tx.escribirTexto(ruta, t);
  },

  'ajustes.quitar'(tx, { clave }) {
    const doc = tx.doc('ajustes.md');
    const pre = doc.secciones[0];
    const i = pre.nodos.findIndex((n) => n.k === 'kv' && n.clave === clave);
    if (i < 0) return;
    pre.nodos.splice(i, 1);
    tx.tocar('ajustes.md');
  },

  /** {ruta, que} → el fichero entero a la papelera */
  'fichero.borrar'(tx, { ruta, que = null }) {
    if (!detectar(ruta)) throw new ErrorOp('invalida', `«${ruta}» no es un fichero de datos de finhub`);
    tx.borrarFichero(ruta, que ?? ruta);
  },

  /** {entrada} tal como la guardó la papelera: vuelve a su sitio (o falla si choca). */
  'papelera.restaurar'(tx, { entrada }) {
    const { ruta, tipo, contenido, seccion = null, indice = Infinity } = entrada ?? {};
    if (!ruta || !detectar(ruta)) throw new ErrorOp('invalida', 'entrada de papelera no válida');
    if (tipo === 'fichero') {
      if (tx.existe(ruta)) throw new ErrorOp('conflicto', `ya existe «${ruta}»: renómbralo o bórralo antes de restaurar`);
      tx.escribirTexto(ruta, contenido);
      return;
    }
    const doc = tx.doc(ruta, { crear: true });
    if (tipo === 'entidad') {
      const spec = specItems(doc, seccion);
      const r = spec.parse(contenido.replace(/^- /, '').replace(/\s{2,}#.*$/, ''));
      if (!r.ok) throw new ErrorOp('invalida', `no se puede restaurar: ${r.error}`);
      const clave = CLAVE_LISTA[doc.tipo] ?? (doc.tipo === 'mes' ? 'id' : null);
      if (clave && r.valor[clave] && existeItem(doc, seccion, clave, r.valor[clave])) throw new ErrorOp('conflicto', `ya existe «${r.valor[clave]}» en ${ruta}`);
      const sec = seccionDe(doc, seccion, { crear: true });
      sec.nodos.splice(Math.min(indice, sec.nodos.length), 0, { k: 'item', valor: r.valor, extra: r.extra, comentario: null });
      tx.tocar(ruta);
      return;
    }
    if (tipo === 'bloque') {
      const parcial = leerFormato(ruta, `# x\nesquema: ${doc.esquema}\n${contenido}\n`);
      const nueva = parcial.secciones.find((s) => s.clase === 'bloque');
      if (!nueva) throw new ErrorOp('invalida', 'no se puede restaurar el bloque');
      if (doc.secciones.some((s) => s.clase === 'bloque' && s.id.toLowerCase() === nueva.id.toLowerCase())) throw new ErrorOp('conflicto', `ya existe «${nueva.id}» en ${ruta}`);
      const bloques = doc.secciones.map((s, i) => [s, i]).filter(([s]) => s.clase === 'bloque');
      const pos = indice < bloques.length ? bloques[indice][1] : doc.secciones.length;
      delete nueva.linea;
      doc.secciones.splice(pos, 0, nueva);
      tx.tocar(ruta);
      return;
    }
    throw new ErrorOp('invalida', `tipo de papelera desconocido «${tipo}»`);
  },
});

function validarCabeceraBloque(id, titulo) {
  if (!id || /\s|·/.test(id)) throw new ErrorOp('invalida', `id de bloque no válido «${id}»`);
  if (!titulo || /\n/.test(titulo) || !String(titulo).trim()) throw new ErrorOp('invalida', 'el título no puede estar vacío ni tener saltos de línea');
}

function rellenarBloque(doc, sec, campos, cuerpo) {
  const especKv = doc.spec.bloques.campos;
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === null || valor === undefined) continue;
    if (valor && typeof valor === 'object' && '__texto' in valor) {
      sec.nodos.push({ k: 'kv', clave, valor: undefined, texto: valor.__texto, especKv });
      continue;
    }
    if (!especKv?.defs[clave]) throw new ErrorOp('invalida', `campo desconocido «${clave}»`);
    sec.nodos.push({ k: 'kv', clave, valor: validarKv(especKv, clave, valor), especKv });
  }
  if (cuerpo) {
    const lineas = String(cuerpo).split('\n');
    if (lineas.some((l) => l.startsWith('## '))) throw new ErrorOp('invalida', 'el texto no puede tener líneas que empiecen por «## »');
    if (especKv && /^- [\p{Ll}\d_][\p{Ll}\d_-]*:/u.test(lineas[0])) throw new ErrorOp('invalida', 'la primera línea del texto parece un campo «- clave: valor»');
    for (const t of lineas) sec.nodos.push({ k: 'cuerpo', texto: t });
  }
}
