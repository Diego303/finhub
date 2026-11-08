// Envenena los datos del ejemplo: pone un texto hostil en cada campo de texto libre de cada fichero.
// Los campos libres se descubren probando: un campo que admite una frase normal es texto.
import { leer } from '../../src/core/formato/index.js';
import { serializar } from '../../src/core/formato/motor.js';

const PRUEBA = 'Texto de prueba';

export function huecos(doc) {
  const out = [];
  const de = (obj, k) => out.push({ get: () => obj[k], set: (v) => (obj[k] = v) });
  for (const s of doc.secciones) {
    if (s.clase === 'bloque') de(s, 'titulo');
    for (const n of s.nodos) {
      if (n.k === 'item') for (const k of Object.keys(n.valor)) if (typeof n.valor[k] === 'string') de(n.valor, k);
      if ((n.k === 'kv' || n.k === 'cab') && typeof n.valor === 'string') de(n, 'valor');
    }
  }
  return out;
}

const errores = (d) => d.avisos.filter((a) => a.nivel === 'error').length;

/** Índices de los huecos de un fichero que admiten texto libre. */
export function camposLibres(ruta, texto) {
  const libres = [];
  const total = huecos(leer(ruta, texto)).length;
  for (let i = 0; i < total; i++) {
    const d = leer(ruta, texto);
    huecos(d)[i].set(PRUEBA);
    const d2 = leer(ruta, serializar(d));
    if (huecos(d2)[i]?.get() === PRUEBA && errores(d2) === errores(d)) libres.push(i);
  }
  return libres;
}

/** Copia del mapa ruta → texto con `elegir(i)` en cada campo libre (y en cada línea de texto libre). */
export function envenenar(mapa, elegir) {
  const out = new Map();
  let n = 0;
  for (const [ruta, texto] of mapa) {
    const d = ruta.endsWith('.md') ? leer(ruta, texto) : null;
    if (!d) {
      out.set(ruta, texto);
      continue;
    }
    const hs = huecos(d);
    for (const i of camposLibres(ruta, texto)) hs[i].set(elegir(n++));
    for (const s of d.secciones) {
      for (const nodo of s.nodos) if (nodo.k === 'cuerpo' && nodo.texto.trim() && !nodo.texto.startsWith('## ')) nodo.texto = elegir(n++);
    }
    out.set(ruta, serializar(d));
  }
  return out;
}
