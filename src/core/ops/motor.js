// Motor de operaciones (§2): funciones puras sobre los TEXTOS de los ficheros.
//   aplicarOp(leer, nombre, args, ctx) → {escribir: {ruta: texto|null}, inversa, papelera, avisos, resultado}
// · `leer(ruta)` devuelve el texto actual o null si no existe (lo da el servidor; aquí no hay E/S).
// · La inversa restaura exactamente el contenido anterior de cada fichero tocado; el servidor solo la
//   aplica si esos ficheros siguen como los dejó la operación (deshacer byte a byte, §11).
// · Una operación nunca escribe en un fichero en solo lectura (esquema más nuevo) ni en uno ilegible.
import { leer as leerFormato, detectar } from '../formato/index.js';
import { serializar } from '../formato/motor.js';

export class ErrorOp extends Error {
  /** codigo: 'desconocida' | 'invalida' | 'no_existe' | 'solo_lectura' | 'mes_cerrado' | 'conflicto' */
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.codigo = codigo;
    Object.assign(this, extra);
  }
}

const REGISTRO = new Map();

/** Registra operaciones: { 'mov.crear': (tx, args, ctx) => resultado } */
export function registrar(ops) {
  for (const [nombre, fn] of Object.entries(ops)) {
    if (REGISTRO.has(nombre)) throw new Error(`operación duplicada: ${nombre}`);
    REGISTRO.set(nombre, fn);
  }
}
export const operaciones = () => [...REGISTRO.keys()].sort();

/**
 * Transacción sobre los ficheros: abre documentos (una vez cada uno), anota cambios y papelera.
 * Las operaciones solo usan esta interfaz.
 */
function crearTx(leer, ctx) {
  const docs = new Map(); // ruta → {doc, original}
  const escribir = new Map(); // ruta → texto | null
  const papelera = [];
  const avisos = [];
  const finales = new Map();
  const tx = {
    ctx: ctx ?? {},
    /** Documento parseado de una ruta; `crear` da uno vacío si no existe. */
    doc(ruta, { crear = false, ctxFormato = {} } = {}) {
      if (docs.has(ruta)) return docs.get(ruta).doc;
      const original = leer(ruta);
      const d = detectar(ruta);
      if (!d) throw new ErrorOp('invalida', `«${ruta}» no es un fichero de datos de finhub`);
      let doc;
      if (original === null || original === undefined) {
        if (!crear) throw new ErrorOp('no_existe', `no existe «${ruta}»`);
        doc = d.formato.nuevo({ ...d.ctx, ...ctxFormato });
      } else {
        doc = leerFormato(ruta, original, { ...ctx.formato, ...ctxFormato });
        if (doc.soloLectura) throw new ErrorOp('solo_lectura', `«${ruta}» es de una versión más nueva de finhub: no se modifica`);
      }
      docs.set(ruta, { doc, original: original ?? null });
      return doc;
    },
    existe: (ruta) => (docs.has(ruta) ? !docs.get(ruta).borrado && (docs.get(ruta).doc !== null || docs.get(ruta).texto !== null || docs.get(ruta).original !== null) : leer(ruta) !== null && leer(ruta) !== undefined),
    /** Rutas de datos existentes con un prefijo (ctx.rutas + las creadas en esta operación − las borradas). */
    rutas(prefijo = '') {
      const todas = new Set([...(ctx.rutas ?? []), ...docs.keys()]);
      return [...todas].filter((r) => r.startsWith(prefijo) && tx.existe(r)).sort();
    },
    texto: (ruta) => leer(ruta),
    /** Marca un documento como modificado (se serializa al final). */
    tocar(ruta) {
      if (!docs.has(ruta)) throw new Error(`tocar sin abrir: ${ruta}`);
      escribir.set(ruta, undefined);
    },
    /** Borra el fichero entero (el servidor lo manda a la papelera con `papelera`). */
    borrarFichero(ruta, que) {
      const original = leer(ruta);
      if (original === null || original === undefined) throw new ErrorOp('no_existe', `no existe «${ruta}»`);
      if (!docs.has(ruta)) docs.set(ruta, { doc: null, original });
      docs.get(ruta).borrado = true;
      escribir.set(ruta, null);
      papelera.push({ que, ruta, tipo: 'fichero', contenido: original });
    },
    /** Escribe un fichero completo (texto ya serializado), p. ej. al restaurar. */
    escribirTexto(ruta, texto) {
      if (!docs.has(ruta)) docs.set(ruta, { doc: null, original: leer(ruta) ?? null });
      const e = docs.get(ruta);
      e.borrado = texto === null;
      e.texto = texto;
      escribir.set(ruta, texto);
    },
    aPapelera: (entrada) => papelera.push(entrada),
    aviso: (m) => avisos.push(m),
    /** Tarea que se ejecuta una vez al final de la operación (la última registrada con esa clave). */
    alFinal: (clave, fn) => finales.set(clave, fn),
    /** Ejecuta otra operación registrada dentro de ESTA transacción (mismos documentos). */
    sub(nombre, args) {
      const fn = REGISTRO.get(nombre);
      if (!fn) throw new ErrorOp('invalida', `operación desconocida «${nombre}»`);
      return fn(tx, args ?? {}, tx.ctx) ?? null;
    },
  };
  return { tx, docs, escribir, papelera, avisos, finales };
}

/** Aplica una operación. Puro: mismo (textos, args, ctx) → mismo resultado. */
export function aplicarOp(leer, nombre, args = {}, ctx = {}) {
  const fn = REGISTRO.get(nombre);
  if (!fn) throw new ErrorOp('desconocida', `operación desconocida «${nombre}»`);
  const { tx, docs, escribir, papelera, avisos, finales } = crearTx(leer, ctx);
  const resultado = fn(tx, args ?? {}, ctx) ?? null;
  for (const f of finales.values()) f();
  const salida = {};
  const anterior = {};
  for (const ruta of escribir.keys()) {
    const e = docs.get(ruta);
    const nuevo = e.borrado ? null : e.texto ?? serializar(e.doc);
    if (nuevo === e.original) continue; // nunca reescribir si no cambió (§2.6)
    salida[ruta] = nuevo;
    anterior[ruta] = e.original;
  }
  return {
    escribir: salida,
    inversa: Object.keys(salida).length ? { op: 'ficheros.restaurar', args: { ficheros: anterior }, esperado: salida } : null,
    papelera,
    avisos,
    resultado,
  };
}

// La inversa genérica: vuelve a poner el contenido exacto anterior (o borra si no existía).
registrar({
  'ficheros.restaurar'(tx, { ficheros }) {
    for (const [ruta, texto] of Object.entries(ficheros ?? {})) {
      if (texto !== null || tx.existe(ruta)) tx.escribirTexto(ruta, texto);
    }
  },
});
