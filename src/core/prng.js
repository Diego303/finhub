// PRNG determinista con semilla (mulberry32). Misma semilla → misma secuencia, en Node y en el navegador.

/** Hash de 32 bits de una cadena (FNV-1a), para sembrar con texto. */
export function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Crea un generador. `semilla` puede ser número o texto. */
export function crearPrng(semilla = 1) {
  let a = (typeof semilla === 'string' ? hashTexto(semilla) : semilla >>> 0) || 0x9e3779b9;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let normalGuardada = null;
  return {
    /** Real en [0, 1). */
    siguiente,
    /** Entero en [min, max] (ambos incluidos). */
    entero: (min, max) => min + Math.floor(siguiente() * (max - min + 1)),
    /** Un elemento al azar del array. */
    elegir: (lista) => lista[Math.floor(siguiente() * lista.length)],
    /** Normal(media, desviación) por Box-Muller. */
    normal(media = 0, desviacion = 1) {
      if (normalGuardada !== null) {
        const z = normalGuardada;
        normalGuardada = null;
        return media + desviacion * z;
      }
      let u = 0;
      while (u === 0) u = siguiente();
      const v = siguiente();
      const r = Math.sqrt(-2 * Math.log(u));
      normalGuardada = r * Math.sin(2 * Math.PI * v);
      return media + desviacion * r * Math.cos(2 * Math.PI * v);
    },
    /** Copia barajada (Fisher-Yates), sin tocar la original. */
    barajar(lista) {
      const c = [...lista];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(siguiente() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    },
  };
}
