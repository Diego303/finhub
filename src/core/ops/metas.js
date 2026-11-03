// Operaciones de metas, hitos y diario de decisiones (§2.5, §5 Metas). Editar o borrar una meta usa
// bloque.editar / bloque.borrar; editar o borrar un hito, lista.editar / lista.borrar; borrar una decisión,
// fichero.borrar (todas con su inversa exacta y la papelera).
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, nodoItem, validarEntidad, validarKv, buscarBloque } from './comun.js';
import { slug, slugUnico, siguienteCorrelativo } from '../ids.js';
import { bloques, items, fijarCabecera, fijarTexto } from '../formato/motor.js';
import { esFecha, sumarDias, esHora } from '../fechas.js';
import { ESTADOS_META, SECCIONES_DECISION, ESTADOS_DECISION } from '../formato/metas.js';

const METAS = 'metas.md';
const HITOS = 'hitos.md';

registrar({
  /** {titulo, campos} → {id} · el id sale del título (único). */
  'meta.crear'(tx, { titulo, campos = {} }) {
    if (!String(titulo ?? '').trim()) throw new ErrorOp('invalida', 'la meta necesita un nombre');
    if (!(campos.objetivo > 0)) throw new ErrorOp('invalida', 'el objetivo debe ser un importe positivo');
    const doc = tx.existe(METAS) ? tx.doc(METAS) : null;
    const id = slugUnico(titulo, doc ? bloques(doc, { incluirExcluidos: true }).map((b) => b.id) : []);
    tx.sub('bloque.crear', { ruta: METAS, id, titulo: String(titulo).trim(), campos: { ...campos, estado: campos.estado ?? { estado: 'activa', fecha: null } } });
    return { id };
  },

  /**
   * {id, estado} · pausar, reanudar (activa), cumplir (con la fecha de hoy) o archivar.
   * → {celebrar} si se cumple (Rex lo celebra).
   */
  'meta.estado'(tx, { id, estado }) {
    if (!ESTADOS_META.includes(estado)) throw new ErrorOp('invalida', `estado de meta desconocido «${estado}»`);
    const doc = tx.doc(METAS);
    const { sec } = buscarBloque(doc, id, 'la meta');
    const actual = sec.nodos.find((n) => n.k === 'kv' && n.clave === 'estado')?.valor?.estado ?? 'activa';
    if (actual === estado) throw new ErrorOp('invalida', `la meta ya está ${estado}`);
    const valor = { estado, fecha: estado === 'cumplida' ? tx.ctx.hoy ?? null : null };
    tx.sub('bloque.editar', { ruta: METAS, id, campos: { estado: valor } });
    return { celebrar: estado === 'cumplida' };
  },

  /** {fecha, texto, tipo: mío|mundo, nota?} → {id: H-NNNN} */
  'hito.crear'(tx, { fecha, texto, tipo = 'mío', nota = null }) {
    const doc = tx.doc(HITOS, { crear: true });
    const id = siguienteCorrelativo('H', items(doc, null, { incluirExcluidos: true }).map((h) => h.id), 4);
    const valor = validarEntidad(doc.spec.preambulo, { id, fecha, texto: String(texto ?? '').trim(), tipo, ...(nota ? { nota } : {}) }, 'el hito');
    if (!valor.texto) throw new ErrorOp('invalida', 'el hito necesita un texto');
    const sec = seccionDe(doc, null, { crear: true });
    // en orden de fecha (los iguales, al final de su día)
    const i = sec.nodos.findIndex((n) => n.k === 'item' && n.valor.fecha > valor.fecha);
    if (i < 0) sec.nodos.push(nodoItem(valor));
    else sec.nodos.splice(i, 0, nodoItem(valor));
    tx.tocar(HITOS);
    return { id };
  },

  /**
   * {titulo, fecha, estado?, revisar?, vuelve?, origen?, secciones: {Qué, Por qué, Alternativas…}} → {ruta}
   * Una pausa de 48 h sin «vuelve» vuelve dentro de 48 h desde ahora.
   */
  'decision.crear'(tx, { titulo, fecha, estado = 'decidida', revisar = null, vuelve = null, origen = null, secciones = {} }) {
    if (!String(titulo ?? '').trim()) throw new ErrorOp('invalida', 'la decisión necesita un título');
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    const existentes = (tx.ctx.rutas ?? []).filter((r) => r.startsWith('decisiones/'));
    const base = slug(titulo);
    let ruta = `decisiones/${fecha}-${base}.md`;
    for (let n = 2; existentes.includes(ruta) || tx.existe(ruta); n++) ruta = `decisiones/${fecha}-${base}-${n}.md`;
    const doc = tx.doc(ruta, { crear: true });
    doc.titulo = String(titulo).trim();
    if (estado === 'pausa-48h' && !vuelve) {
      const hora = esHora(tx.ctx.hora) ? tx.ctx.hora : '09:00';
      vuelve = { fecha: sumarDias(tx.ctx.hoy ?? fecha, 2), hora };
    }
    aplicarCabeceras(doc, { fecha, estado, revisar, vuelve, origen });
    aplicarSecciones(doc, secciones);
    tx.tocar(ruta);
    return { ruta };
  },

  /** {ruta, titulo?, cabeceras?: {clave: valor | null}, secciones?: {nombre: texto | null}} */
  'decision.editar'(tx, { ruta, titulo, cabeceras = {}, secciones = {} }) {
    if (!/^decisiones\/[^/]+\.md$/.test(ruta ?? '')) throw new ErrorOp('invalida', 'decisión no válida');
    const doc = tx.doc(ruta);
    if (titulo !== undefined) {
      if (!String(titulo).trim() || /\n/.test(titulo)) throw new ErrorOp('invalida', 'título no válido');
      doc.titulo = String(titulo).trim();
    }
    if ('fecha' in cabeceras && !cabeceras.fecha) throw new ErrorOp('invalida', 'la decisión necesita fecha');
    aplicarCabeceras(doc, cabeceras);
    aplicarSecciones(doc, secciones);
    tx.tocar(ruta);
  },
});

function aplicarCabeceras(doc, cabeceras) {
  const especKv = doc.spec.cabeceras;
  for (const [clave, valor] of Object.entries(cabeceras)) {
    if (!especKv.defs[clave]) throw new ErrorOp('invalida', `cabecera desconocida «${clave}»`);
    if (clave === 'estado' && valor !== null && !ESTADOS_DECISION.includes(valor)) throw new ErrorOp('invalida', `estado desconocido «${valor}»`);
    if (valor === null || valor === undefined || valor === '') {
      const pre = doc.secciones[0];
      pre.nodos = pre.nodos.filter((n) => !(n.k === 'cab' && n.clave === clave));
    } else fijarCabecera(doc, clave, validarKv(especKv, clave, valor, clave));
  }
}

function aplicarSecciones(doc, secciones) {
  for (const [nombre, texto] of Object.entries(secciones)) {
    if (!SECCIONES_DECISION.includes(nombre)) throw new ErrorOp('invalida', `sección desconocida «${nombre}»`);
    const limpio = String(texto ?? '').replace(/\r\n?/g, '\n').trim();
    if (/^#/m.test(limpio)) throw new ErrorOp('invalida', `«${nombre}»: una línea no puede empezar por «#»`);
    if (!limpio) doc.secciones = doc.secciones.filter((s) => s.nombre !== nombre);
    else fijarTexto(doc, nombre, limpio);
  }
  // las secciones conocidas, en su orden; las libres, detrás
  const pos = (s) => (s.clase === 'preambulo' ? -1 : SECCIONES_DECISION.includes(s.nombre) ? SECCIONES_DECISION.indexOf(s.nombre) : 99);
  doc.secciones = [...doc.secciones].sort((a, b) => pos(a) - pos(b));
}
