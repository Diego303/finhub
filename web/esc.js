// El ÚNICO sitio de la web que inserta HTML (§2.2; scripts/check.js lo vigila).
// Todo texto de usuario o de Claude pasa por esc(). Las plantillas html`` escapan cada valor
// interpolado salvo que ya sea un fragmento seguro creado por otra plantilla html``.

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escapa texto para meterlo en HTML (contenido o atributo entre comillas). */
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => MAPA[c]);

class Seguro {
  constructor(texto) {
    this.texto = texto;
  }
  toString() {
    return this.texto;
  }
}

function valor(v) {
  if (v instanceof Seguro) return v.texto;
  if (Array.isArray(v)) return v.map(valor).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

/** Plantilla segura: html`<b>${texto}</b>`. */
export function html(partes, ...valores) {
  let s = partes[0];
  for (let i = 0; i < valores.length; i++) s += valor(valores[i]) + partes[i + 1];
  return new Seguro(s);
}

export const esSeguro = (v) => v instanceof Seguro;

/** Une fragmentos seguros. */
export const unir = (lista, sep = '') => new Seguro(lista.map(valor).join(valor(sep)));

/** URL para href: solo http(s) o rutas internas; cualquier otra cosa (javascript:, data:…) → '#'. */
export function enlace(url) {
  const u = String(url ?? '').trim();
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(u) ? u : '#';
}

/** Pinta un fragmento seguro en un elemento. Un texto suelto se escapa siempre. */
export function pintar(el, contenido) {
  el.innerHTML = contenido instanceof Seguro ? contenido.texto : esc(contenido);
}
