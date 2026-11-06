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

/** Une fragmentos seguros. */
export const unir = (lista, sep = '') => new Seguro(lista.map(valor).join(valor(sep)));

/** URL para href: solo http(s) o rutas internas; cualquier otra cosa (javascript:, data:…) → '#'. */
export function enlace(url) {
  const u = String(url ?? '').trim();
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(u) ? u : '#';
}

/** Pinta un fragmento seguro en un elemento. Un texto suelto se escapa siempre. */
// Reentrada: al sustituir un innerHTML, el elemento con el foco se quita y dispara «blur» (y «change» si
// estaba editado); si su manejador repinta, ese repintado se aplaza a cuando acabe el que está en curso.
let pintando = 0;
export function pintar(el, contenido) {
  if (pintando) return void queueMicrotask(() => pintar(el, contenido));
  pintando++;
  try {
    el.innerHTML = contenido instanceof Seguro ? contenido.texto : esc(contenido);
  } finally {
    pintando--;
  }
}

const CONTROLES = 'input:not([type=hidden]), select, textarea';
export const EN_FORMULARIO = 'form[data-form] input:not([type=hidden]), form[data-form] select, form[data-form] textarea';

function tocado(c) {
  if (c.type === 'checkbox' || c.type === 'radio') return c.checked !== c.defaultChecked;
  if (c.tagName === 'SELECT') {
    const inicial = [...c.options].findIndex((o) => o.defaultSelected);
    return c.selectedIndex !== (inicial < 0 ? 0 : inicial);
  }
  return c.value !== c.defaultValue;
}

/** Identifica un control por su formulario, los datos ocultos de ese formulario (qué registro edita) y su nombre. */
function firma(c) {
  const f = c.form;
  const form = f ? `${f.dataset.form ?? ''}|${[...f.querySelectorAll('input[type=hidden]')].map((h) => `${h.name}=${h.value}`).join('&')}` : '';
  return `${form}|${c.name || c.id}${c.type === 'radio' ? `|${c.value}` : ''}`;
}

/**
 * Repinta `raiz` sin perder lo que estás escribiendo: un cambio de datos (otra pestaña, una edición a mano, la
 * sincronización) no borra un formulario a medias. Solo se conserva lo que has tocado; lo demás se actualiza.
 * Lo de un formulario ya enviado no se conserva: al guardar, queda limpio.
 */
export function conservarEscrito(raiz, selector, repintar) {
  const escrito = new Map();
  for (const c of raiz.querySelectorAll(selector || CONTROLES)) {
    if ((c.name || c.id) && !c.form?.dataset.enviado && tocado(c)) escrito.set(firma(c), c.type === 'checkbox' || c.type === 'radio' ? c.checked : c.value);
  }
  repintar();
  if (!escrito.size) return;
  for (const c of raiz.querySelectorAll(selector || CONTROLES)) {
    const k = firma(c);
    if (!escrito.has(k)) continue;
    if (c.type === 'checkbox' || c.type === 'radio') c.checked = escrito.get(k);
    else c.value = escrito.get(k);
  }
}
