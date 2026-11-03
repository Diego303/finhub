// Validaciones compartidas por varios formatos.
import { normalizar } from '../ids.js';

/** Marca como error (excluido) cada entidad cuyo `campo` repite uno anterior (sin distinguir mayúsculas). */
export function sinDuplicados(nodos, campo, aviso, que = 'id') {
  const vistos = new Set();
  for (const n of nodos) {
    if (n.k !== 'item') continue;
    const v = n.valor[campo];
    if (v === null || v === undefined) continue;
    const k = normalizar(v);
    if (vistos.has(k)) aviso(n, `${que} repetido «${v}»: esta línea no se usa`, 'error');
    else vistos.add(k);
  }
}

export const nodosItems = (sec) => (sec?.nodos ?? []).filter((n) => n.k === 'item');
export const bloquesDoc = (doc) => doc.secciones.filter((s) => s.clase === 'bloque');

/** Bloques con id repetido: el segundo se marca como error. */
export function bloquesSinDuplicados(doc, aviso, que = 'id') {
  const vistos = new Set();
  for (const s of bloquesDoc(doc)) {
    const k = normalizar(s.id);
    if (vistos.has(k)) {
      aviso({ linea: s.linea }, `${que} repetido «${s.id}»: este bloque no se usa`, 'error');
      s.excluido = true;
    } else vistos.add(k);
  }
}

/** Valor de un campo kv de un bloque. */
export const campoBloque = (sec, clave) => sec.nodos.find((n) => n.k === 'kv' && n.clave === clave && n.valor !== undefined)?.valor;
