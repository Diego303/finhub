// Operaciones de Conocimiento (§2.5, §5 Conocimiento): notas (crear, editar, mover; borrar = bloque.borrar),
// fuentes, familias, mezclas, mezcla activa, predicciones (crear, resolver a mano y automáticamente) e
// importar la Base del repo. Todas con su inversa exacta (motor) y la papelera.
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, buscarBloque, nodoItem, validarEntidad } from './comun.js';
import { slug, slugUnico, siguienteCorrelativo, normalizar } from '../ids.js';
import { bloques, items, cabeceras, fijarCabecera, anadirBloque } from '../formato/motor.js';
import { FUENTES_FIJAS } from '../formato/conocimiento.js';
import { leer } from '../formato/index.js';
import { esFecha } from '../fechas.js';
import { resolverPrediccion, fuenteDeRuta, esFuentePrivada } from '../conocimiento.js';

const FUENTES = 'conocimiento/_fuentes.md';
const FAMILIAS = 'conocimiento/_familias.md';
const MEZCLAS = 'conocimiento/_mezclas.md';
const PREDICCIONES = 'conocimiento/predicciones.md';
const FAMILIAS_FIJAS = ['fija', 'mias'];
const SIN_MANUAL = ['mundo', 'datos']; // las escriben los trabajos (pulso, datos)

/** Rutas de ficheros de notas de la carpeta. */
const rutasNotas = (tx) => tx.rutas('conocimiento/').filter((r) => !/\/_[^/]+\.md$/.test(r) && !r.startsWith('conocimiento/datos/series/') && !r.startsWith('conocimiento/descubrimientos/') && r !== PREDICCIONES && !/\/semana-/.test(r));

/** Todos los ids de nota de la carpeta (para correlativos y para no repetir). */
function idsNotas(tx) {
  const ids = new Set();
  for (const r of rutasNotas(tx)) {
    const d = tx.doc(r);
    if (d.tipo === 'notas') for (const b of bloques(d, { incluirExcluidos: true })) ids.add(b.id);
  }
  return ids;
}

function fuente(tx, id) {
  const f = items(tx.doc(FUENTES)).find((x) => x.id === id);
  if (!f) throw new ErrorOp('no_existe', `no existe la fuente «${id}»`);
  return f;
}

/** Fichero nuevo para una nota: conocimiento/<fuente>/<fecha>-<slug>.md (único). */
function ficheroNuevo(tx, fuenteId, fecha, titulo, nombreFuente) {
  const base = `conocimiento/${fuenteId}/${fecha}-${slug(titulo)}`;
  let ruta = `${base}.md`;
  for (let n = 2; tx.existe(ruta); n++) ruta = `${base}-${n}.md`;
  const doc = tx.doc(ruta, { crear: true });
  doc.titulo = `${nombreFuente} · ${titulo}`;
  fijarCabecera(doc, 'fuente', fuenteId);
  fijarCabecera(doc, 'fecha', fecha);
  return { ruta, doc };
}

const camposValidos = (doc, campos) => {
  const especKv = doc.spec.bloques.campos;
  const out = {};
  for (const [k, v] of Object.entries(campos)) {
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    const texto = especKv.fmtValor(k, v);
    const r = especKv.parseLinea(`${k}: ${texto}`);
    if (!r || r.valor === undefined) throw new ErrorOp('invalida', `«${k}» no es válido: ${r?.aviso ?? ''}`);
    out[k] = r.valor;
  }
  return out;
};

registrar({
  /** {fuente, titulo, fecha, campos: {tipo, temas, activos, postura, caduca, origen, verificar}, cuerpo} → {id, ruta} */
  'nota.crear'(tx, { fuente: fuenteId, titulo, fecha, campos = {}, cuerpo = '' }) {
    if (SIN_MANUAL.includes(fuenteId)) throw new ErrorOp('invalida', `las notas de «${fuenteId}» las crean sus trabajos`);
    const f = fuente(tx, fuenteId);
    if (!String(titulo ?? '').trim() || /\n/.test(titulo)) throw new ErrorOp('invalida', 'la nota necesita un título de una línea');
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (!String(cuerpo).trim()) throw new ErrorOp('invalida', 'la nota necesita texto');
    if (/^#/m.test(cuerpo)) throw new ErrorOp('invalida', 'una línea del texto no puede empezar por «#»');
    const prefijo = f.prefijo ?? normalizar(f.id).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
    const id = siguienteCorrelativo(prefijo, [...idsNotas(tx)], 4);
    const { ruta, doc } = ficheroNuevo(tx, fuenteId, fecha, titulo.trim(), f.nombre);
    anadirBloque(doc, { id, titulo: titulo.trim(), campos: camposValidos(doc, { editada: false, ...campos, fecha, fuente: fuenteId }), cuerpo: String(cuerpo).trim() });
    tx.tocar(ruta);
    return { id, ruta };
  },

  /** {ruta, id, titulo?, campos? (null quita), cuerpo?} · marca «editada: sí» (no se pisa al reingerir, §9.11). */
  'nota.editar'(tx, { ruta, id, titulo, campos = {}, cuerpo }) {
    if (cuerpo !== undefined && /^#/m.test(cuerpo)) throw new ErrorOp('invalida', 'una línea del texto no puede empezar por «#»');
    tx.sub('bloque.editar', { ruta, id, titulo, campos: { ...campos, editada: true }, cuerpo: cuerpo === undefined ? undefined : String(cuerpo).trim() });
  },

  /** {ruta, id, fuente} · la nota pasa a un fichero propio de la otra fuente; el id no cambia. */
  'nota.mover'(tx, { ruta, id, fuente: destino }) {
    if (SIN_MANUAL.includes(destino)) throw new ErrorOp('invalida', `no se pueden mover notas a «${destino}»`);
    const f = fuente(tx, destino);
    const origen = tx.doc(ruta);
    const { sec, indice } = buscarBloque(origen, id, 'la nota');
    const actual = sec.nodos.find((n) => n.k === 'kv' && n.clave === 'fuente')?.valor ?? cabeceras(origen).fuente ?? fuenteDeRuta(ruta);
    if (actual === destino) throw new ErrorOp('invalida', 'la nota ya es de esa fuente');
    // R1 (§0.3.7): sacar una nota de una fuente privada a otra que no lo es la blanquearía (llegaría a internet)
    const fichas = items(tx.doc(FUENTES));
    const privadaOrigen = esFuentePrivada(fichas.find((x) => x.id === actual) ?? { id: actual });
    if (privadaOrigen && !esFuentePrivada(f)) throw new ErrorOp('invalida', `«${actual}» es privada y «${destino}» no: esta nota llegaría a los trabajos con internet (regla R1). Si quieres hacerla pública, escríbela de nuevo en esa fuente.`);
    const b = bloques(origen).find((x) => x.id === id);
    const { ruta: nueva, doc } = ficheroNuevo(tx, destino, b.campos.fecha ?? cabeceras(origen).fecha ?? tx.ctx.hoy, b.titulo, f.nombre);
    anadirBloque(doc, { id, titulo: b.titulo, campos: { ...b.campos, fuente: destino }, cuerpo: b.cuerpo });
    tx.tocar(nueva);
    origen.secciones.splice(indice, 1);
    if (!bloques(origen, { incluirExcluidos: true }).length) tx.borrarFichero(ruta, `${ruta} (vacío tras mover ${id})`);
    else tx.tocar(ruta);
    return { ruta: nueva };
  },

  /** {nombre, familia, caducidad?, privada?} → {id, prefijo} */
  'fuente.crear'(tx, { nombre, familia, caducidad = null, privada = false }) {
    const doc = tx.doc(FUENTES, { crear: true });
    const lista = items(doc, null, { incluirExcluidos: true });
    if (!String(nombre ?? '').trim()) throw new ErrorOp('invalida', 'la fuente necesita un nombre');
    if (!items(tx.doc(FAMILIAS)).some((f) => f.id === familia)) throw new ErrorOp('invalida', `no existe la familia «${familia}»`);
    const id = slugUnico(nombre, lista.map((f) => f.id));
    const usados = new Set(lista.map((f) => f.prefijo));
    const iniciales = normalizar(nombre).split(/[^a-z0-9]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '');
    let prefijo = (iniciales.length >= 2 ? iniciales : normalizar(nombre).replace(/[^a-z]/g, '').toUpperCase()).slice(0, 3) || 'F';
    for (let i = 0; usados.has(prefijo); i++) prefijo = `${prefijo.slice(0, 3)}${String.fromCharCode(65 + (i % 26))}`.slice(0, 4);
    const valor = validarEntidad(doc.spec.preambulo, { id, nombre: String(nombre).trim(), familia, prefijo, privada: familia === 'mias' ? true : !!privada, ...(caducidad ? { caducidad } : {}), activa_por_defecto: false }, 'la fuente');
    seccionDe(doc, null, { crear: true }).nodos.push(nodoItem(valor));
    tx.tocar(FUENTES);
    return { id, prefijo };
  },

  /** {id} · la fuente y sus ficheros de notas van a la papelera; las fijas no se borran. */
  'fuente.borrar'(tx, { id }) {
    if (FUENTES_FIJAS.includes(id)) throw new ErrorOp('invalida', `«${id}» es una fuente fija: no se borra`);
    const f = fuente(tx, id);
    for (const r of tx.rutas(`conocimiento/${id}/`)) tx.borrarFichero(r, `${r} (fuente «${f.nombre}»)`);
    tx.sub('lista.borrar', { ruta: FUENTES, clave: id, que: `fuente «${f.nombre}»` });
    const usada = items(tx.doc(MEZCLAS)).filter((m) => m.miembros.includes(id)).map((m) => m.nombre);
    if (usada.length) tx.aviso(`la usan las mezclas ${usada.map((x) => `«${x}»`).join(', ')}: límpialas`);
  },

  /** {id, destino} · sus fuentes pasan a `destino`; las familias fijas no se borran. */
  'familia.borrar'(tx, { id, destino }) {
    if (FAMILIAS_FIJAS.includes(id)) throw new ErrorOp('invalida', `«${id}» es una familia fija: no se borra`);
    if (id === destino || !items(tx.doc(FAMILIAS)).some((f) => f.id === destino)) throw new ErrorOp('invalida', 'elige otra familia de destino');
    for (const f of items(tx.doc(FUENTES)).filter((x) => x.familia === id)) tx.sub('lista.editar', { ruta: FUENTES, clave: f.id, cambios: { familia: destino } });
    tx.sub('lista.borrar', { ruta: FAMILIAS, clave: id, que: `familia «${id}»` });
  },

  /** {nombre, miembros: [ids y selectores]} → {id} */
  'mezcla.crear'(tx, { nombre, miembros }) {
    const doc = tx.doc(MEZCLAS, { crear: true });
    if (!String(nombre ?? '').trim()) throw new ErrorOp('invalida', 'la mezcla necesita un nombre');
    if (!miembros?.length) throw new ErrorOp('invalida', 'la mezcla está vacía');
    const id = slugUnico(nombre, items(doc, null, { incluirExcluidos: true }).map((m) => m.id));
    const valor = validarEntidad(doc.spec.preambulo, { id, nombre: String(nombre).trim(), miembros }, 'la mezcla');
    seccionDe(doc, null, { crear: true }).nodos.push(nodoItem(valor));
    tx.tocar(MEZCLAS);
    return { id };
  },

  /** {id} · quita de la mezcla las fuentes que ya no existen (§9.10); si se queda vacía, va a la papelera. */
  'mezcla.limpiar'(tx, { id }) {
    const existen = new Set(items(tx.doc(FUENTES)).map((f) => f.id));
    const m = items(tx.doc(MEZCLAS)).find((x) => x.id === id);
    if (!m) throw new ErrorOp('no_existe', `no existe la mezcla «${id}»`);
    const miembros = m.miembros.filter((x) => typeof x !== 'string' || existen.has(x));
    if (miembros.length === m.miembros.length) throw new ErrorOp('invalida', 'la mezcla no tiene fuentes borradas');
    if (!miembros.length) {
      tx.sub('lista.borrar', { ruta: MEZCLAS, clave: id, que: `mezcla «${m.nombre}» (se quedó vacía)` });
      return { quitadas: m.miembros.length, borrada: true };
    }
    tx.sub('lista.editar', { ruta: MEZCLAS, clave: id, cambios: { miembros } });
    return { quitadas: m.miembros.length - miembros.length, borrada: false };
  },

  /** {ids} · tu mezcla activa: esas fuentes con «activa_por_defecto: sí» y las demás con «no». */
  'fuentes.activas'(tx, { ids = [] }) {
    const doc = tx.doc(FUENTES);
    const quiero = new Set(ids);
    let cambios = 0;
    for (const n of seccionDe(doc, null).nodos) {
      if (n.k !== 'item' || n.excluido) continue;
      const si = quiero.has(n.valor.id);
      if (!!n.valor.activa_por_defecto !== si) {
        n.valor = { ...n.valor, activa_por_defecto: si };
        cambios++;
      }
    }
    if (cambios) tx.tocar(FUENTES);
    return { cambios };
  },

  /** {fuente, texto, medir?, nota?} → {id: PR-NNNN} */
  'prediccion.crear'(tx, { fuente: f, texto, medir = null, nota = null }) {
    const doc = tx.doc(PREDICCIONES, { crear: true });
    if (!String(texto ?? '').trim()) throw new ErrorOp('invalida', 'la predicción necesita un texto');
    const id = siguienteCorrelativo('PR', items(doc, null, { incluirExcluidos: true }).map((p) => p.id), 4);
    const valor = validarEntidad(doc.spec.preambulo, { id, fuente: f, texto: String(texto).trim(), ...(medir ? { medir: String(medir).trim() } : {}), ...(nota ? { nota } : {}), estado: 'pendiente' }, 'la predicción');
    seccionDe(doc, null, { crear: true }).nodos.push(nodoItem(valor));
    tx.tocar(PREDICCIONES);
    return { id };
  },

  /** {id, estado: acertada|fallida|no-medible|pendiente, valor?, resuelta?} · resolución manual (✓ ✗ «no medible»). */
  'prediccion.resolver'(tx, { id, estado, valor = null, resuelta = null }) {
    if (!['acertada', 'fallida', 'no-medible', 'pendiente'].includes(estado)) throw new ErrorOp('invalida', `estado «${estado}» no válido`);
    const fecha = estado === 'pendiente' ? null : resuelta ?? tx.ctx.hoy;
    tx.sub('lista.editar', { ruta: PREDICCIONES, clave: id, cambios: { estado, resuelta: fecha, valor: estado === 'pendiente' ? null : valor } });
  },

  /** {} · resuelve las pendientes que ya se pueden medir con las series de Datos o la cartera (§4.7). */
  'predicciones.resolverAuto'(tx) {
    const hoy = tx.ctx.hoy;
    if (!tx.existe(PREDICCIONES)) return { resueltas: [] };
    const series = new Map();
    for (const r of tx.rutas('conocimiento/datos/series/')) {
      const d = tx.doc(r);
      const id = cabeceras(d).id ?? r.slice(26, -3);
      series.set(id, items(d, 'Filas').map((f) => ({ mes: f.mes, valor: f.valor / 1e6 })));
    }
    const cartera = {
      activos: tx.existe('cartera/activos.md') ? bloques(tx.doc('cartera/activos.md')) : [],
      operaciones: tx.existe('cartera/operaciones.md') ? items(tx.doc('cartera/operaciones.md')) : [],
      fotos: tx.rutas('cartera/valores/').map((r) => ({ fecha: r.slice(16, 26), filas: items(tx.doc(r)) })),
    };
    const resueltas = [];
    for (const p of items(tx.doc(PREDICCIONES))) {
      if (p.estado !== 'pendiente' || !p.medir) continue;
      const r = resolverPrediccion(p, { series: (id) => series.get(id) ?? null, cartera, hoy });
      if (!r) continue;
      tx.sub('prediccion.resolver', { id: p.id, estado: r.estado, valor: Math.round(r.valor * 1e6), resuelta: r.resuelta });
      resueltas.push({ id: p.id, ...r });
    }
    return { resueltas };
  },

  /**
   * {series: [{id, titulo, unidad, divisa?, fuente, metodo, filas: [{mes, valor}]}]} · guarda las filas que
   * propuso el trabajo «datos» y que tú confirmaste. Nunca mezcla datos reales con una serie sintética.
   */
  'datos.aplicar'(tx, { series = [] }) {
    const escritas = [];
    for (const s of series) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id ?? '')) throw new ErrorOp('invalida', `id de serie no válido «${s.id}»`);
      const ruta = `conocimiento/datos/series/${s.id}.md`;
      const existe = tx.existe(ruta);
      const doc = tx.doc(ruta, { crear: true });
      const cab = cabeceras(doc);
      if (existe && cab.sintetica) throw new ErrorOp('invalida', `«${s.id}» es una serie sintética de ejemplo: no se completa con datos reales`);
      if (!existe) {
        doc.titulo = `Serie · ${s.titulo ?? s.id}`;
        for (const [k, v] of [['id', s.id], ['unidad', s.unidad ?? 'indice'], ['frecuencia', 'mensual'], ['divisa', s.divisa ?? null], ['fuente', s.fuente], ['metodo', s.metodo], ['sintetica', false]]) if (v !== null && v !== undefined) fijarCabecera(doc, k, v);
      }
      const sec = seccionDe(doc, 'Filas', { crear: true });
      const ultimo = items(doc, 'Filas').at(-1)?.mes ?? null;
      let n = 0;
      for (const f of [...s.filas].sort((a, b) => (a.mes < b.mes ? -1 : 1))) {
        if (ultimo && f.mes <= ultimo) continue;
        const valor = validarEntidad(doc.spec.secciones.Filas.items, { mes: f.mes, valor: Math.round(f.valor * 1e6) }, `la fila ${f.mes} de ${s.id}`);
        sec.nodos.push(nodoItem(valor));
        n++;
      }
      if (!n) continue;
      fijarCabecera(doc, 'actualizado', tx.ctx.hoy);
      if (existe && s.fuente) fijarCabecera(doc, 'fuente', s.fuente);
      tx.tocar(ruta);
      escritas.push({ id: s.id, filas: n });
    }
    if (!escritas.length) throw new ErrorOp('invalida', 'no hay filas nuevas que guardar');
    return { series: escritas };
  },

  /**
   * {ficheros: {nombre: texto}} · trae a conocimiento/base/ las notas de la Base del repo que aún no están
   * en la carpeta (por id). Las que ya tienes (editadas o no) no se tocan. → {importadas, ficheros}
   */
  'base.importar'(tx, { ficheros = {} }) {
    const tienes = idsNotas(tx);
    let importadas = 0;
    const tocados = [];
    for (const [nombre, texto] of Object.entries(ficheros)) {
      if (!/^[a-z0-9-]+\.md$/.test(nombre)) throw new ErrorOp('invalida', `nombre de fichero no válido «${nombre}»`);
      const ruta = `conocimiento/base/${nombre}`;
      const semilla = leer(ruta, String(texto));
      if (!semilla || semilla.tipo !== 'notas') throw new ErrorOp('invalida', `«${nombre}» no es un fichero de notas`);
      const nuevas = bloques(semilla).filter((b) => !tienes.has(b.id));
      if (!nuevas.length) continue;
      const doc = tx.doc(ruta, { crear: true });
      if (!tx.texto(ruta)) {
        doc.titulo = semilla.titulo;
        fijarCabecera(doc, 'fuente', 'base');
      }
      for (const b of nuevas) {
        anadirBloque(doc, { id: b.id, titulo: b.titulo, campos: b.campos, cuerpo: b.cuerpo });
        tienes.add(b.id);
        importadas++;
      }
      tx.tocar(ruta);
      tocados.push(ruta);
    }
    return { importadas, ficheros: tocados };
  },
});

