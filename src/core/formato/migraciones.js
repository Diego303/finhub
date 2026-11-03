// Migraciones de esquema (§2.5): cada fichero lleva «esquema: N» y se migra solo hasta el actual.
// El servidor hace la copia previa (F2); aquí solo se transforma texto → texto, de forma pura.
import { dividirLineas } from './lineas.js';
import { ESQUEMA_ACTUAL } from './motor.js';

/**
 * Registro: { [tipo]: { [desde]: (texto) => texto } } (la función migra de `desde` a `desde + 1`).
 * Con el esquema 1 aún no hay migraciones; el mecanismo está probado con un registro de prueba.
 */
export const MIGRACIONES = {};

/** Lee la versión de esquema de un texto sin parsearlo entero. `null` si no la declara. */
export function leerEsquema(texto) {
  for (const l of dividirLineas(texto).slice(0, 12)) {
    const m = /^esquema:\s*(\d+)\s*(?:#.*)?$/.exec(l);
    if (m) return +m[1];
    if (l.startsWith('## ') || l.startsWith('- ')) break;
  }
  return null;
}

/**
 * Migra un texto hasta `actual`. Devuelve {texto, de, a, migrado, error?}.
 * - Sin «esquema:» se asume 1 (los ficheros escritos a mano antes de existir el campo).
 * - Si el esquema es mayor que el actual, no se toca (el motor lo abre en solo lectura).
 * - Si falta un paso intermedio, error y texto intacto.
 */
export function migrar(texto, tipo, { registro = MIGRACIONES, actual = ESQUEMA_ACTUAL } = {}) {
  const declarado = leerEsquema(texto);
  const de = declarado ?? 1;
  if (de >= actual) return { texto, de, a: de, migrado: false };
  // sin «esquema:», se escribe el 1 que se asume, tras el título, para que los pasos lo actualicen
  let t = declarado === null ? texto.replace(/^((?:\uFEFF)?# [^\n]*\n)?/, (m) => `${m}esquema: 1\n`) : texto;
  for (let v = de; v < actual; v++) {
    const paso = registro[tipo]?.[v];
    if (!paso) return { texto, de, a: de, migrado: false, error: `no hay migración de ${tipo} del esquema ${v} al ${v + 1}` };
    t = paso(t);
    const nuevo = leerEsquema(t);
    if (nuevo !== v + 1) return { texto, de, a: de, migrado: false, error: `la migración de ${tipo} ${v}→${v + 1} no actualizó «esquema:»` };
  }
  return { texto: t, de, a: actual, migrado: true };
}
