// Tokenizador de líneas de los Markdown de finhub (docs/FORMATOS.md §1).

/** Texto → líneas: acepta BOM y CRLF; quita la línea vacía final que deja el último "\n". */
export function dividirLineas(texto) {
  let s = String(texto);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const lineas = s.split(/\r?\n/).map((l) => l.replace(/\r$/, ''));
  if (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
  return lineas.map((l) => l.normalize('NFC'));
}

/** Separa el comentario final: 2+ espacios, "#" y un espacio (o fin). Respeta "\#". */
export function separarComentario(linea) {
  const m = /^(.*?\S)(\s{2,})#(?: (.*))?$/.exec(linea);
  if (!m || m[1].endsWith('\\')) return { contenido: linea.replace(/\s+$/, ''), comentario: null };
  return { contenido: m[1], comentario: { relleno: m[2].length, texto: m[3] ?? '' } };
}

export function anadirComentario(linea, comentario) {
  if (!comentario) return linea;
  return linea + ' '.repeat(Math.max(2, comentario.relleno)) + '#' + (comentario.texto ? ' ' + comentario.texto : '');
}

/** Parte "a | b \| c | d" en celdas, respetando "\|". Devuelve las celdas sin desescapar. */
export function partirCeldas(cuerpo) {
  const celdas = [];
  let actual = '';
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (c === '\\' && (cuerpo[i + 1] === '|' || cuerpo[i + 1] === '#' || cuerpo[i + 1] === '\\')) {
      actual += c + cuerpo[i + 1];
      i++;
    } else if (c === '|') {
      celdas.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

export const desescapar = (s) => s.replace(/\\([|#\\])/g, '$1');

/** Escapa un texto libre para meterlo en una celda: "|" siempre; "#" tras un espacio; "\" antes de ellos. */
export function escaparCelda(s) {
  return String(s)
    .replace(/\\(?=[|#\\])/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/(^|\s)#/g, '$1\\#');
}

/** Valor de un campo de bloque o cabecera: no se parte en celdas, solo se protege el comentario. */
export const escaparValor = (s) => String(s).replace(/\\(?=[\\#])/g, '\\\\').replace(/(\s{2,})#/g, (m, sp) => sp + '\\#');
/** Inverso de escaparValor. */
export const desescaparValor = (s) => String(s).replace(/\\([\\#])/g, '$1');

export const RE_BANDERA = /^[\p{Ll}_][\p{Ll}\d_]*$/u;
export const RE_ETIQUETAS = /^#[^\s#|]+(\s+#[^\s#|]+)*$/u;
