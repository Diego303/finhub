// Tipos de valor de los ficheros: cada uno sabe leer (parse) y escribir en canónico (fmt).
// parse(texto) → {ok:true, valor} | {ok:false, error}. fmt(valor) → texto canónico.
import * as D from '../dinero.js';
import * as F from '../fechas.js';
import { normalizar, esSlug } from '../ids.js';

const ok = (valor) => ({ ok: true, valor });
const mal = (error) => ({ ok: false, error });
const tipo = (nombre, parse, fmt) => ({ nombre, parse: (s) => parse(String(s ?? '').trim()), fmt });

export const texto = ({ vacio = false } = {}) =>
  tipo('texto', (s) => (s === '' && !vacio ? mal('falta el texto') : ok(s)), (v) => v);

/** Slug: tolera mayúsculas y tildes (se normalizan), no espacios. */
export const id = () =>
  tipo('id', (s) => {
    const n = normalizar(s);
    return esSlug(n) ? ok(n) : mal(`«${s}» no es un id válido (minúsculas, números y guiones)`);
  }, (v) => v);

/** Código con prefijo en mayúsculas: OP-0042, PR-0019, D-007, H-0001, M-261103-01… */
export const codigo = (re = /^[A-Z]{1,4}-\d{2,6}(-\d{2})?$/) =>
  tipo('codigo', (s) => (re.test(s.toUpperCase()) ? ok(s.toUpperCase()) : mal(`«${s}» no es un código válido`)), (v) => v);

/** Enumerado tolerante a tildes y mayúsculas; escribe la forma canónica de la lista. */
export function enumerado(valores) {
  const mapa = new Map(valores.map((v) => [normalizar(v), v]));
  return tipo('enumerado', (s) => (mapa.has(normalizar(s)) ? ok(mapa.get(normalizar(s))) : mal(`«${s}» no es uno de: ${valores.join(', ')}`)), (v) => v);
}

export const entero = ({ min = -Infinity, max = Infinity } = {}) =>
  tipo('entero', (s) => {
    if (!/^-?\d+$/.test(s)) return mal(`«${s}» no es un número entero`);
    const n = +s;
    return n < min || n > max ? mal(`${n} está fuera de ${min}–${max}`) : ok(n);
  }, (v) => String(v));

export const bool = () =>
  tipo('bool', (s) => {
    const n = normalizar(s);
    if (n === 'si') return ok(true);
    if (n === 'no') return ok(false);
    return mal(`«${s}» debe ser sí o no`);
  }, (v) => (v ? 'sí' : 'no'));

export const importe = () => tipo('importe', D.parseImporte, D.formatearImporte);
export const porcentaje = () => tipo('porcentaje', D.parsePorcentaje, D.formatearPorcentaje);
export const decimal = (escala = 6) => tipo('decimal', (s) => D.parseDecimal(s, escala), (v) => D.formatearDecimal(v, escala));
export const fecha = () => tipo('fecha', (s) => (F.esFecha(s) ? ok(s) : mal(`«${s}» no es una fecha que exista (AAAA-MM-DD)`)), (v) => v);
export const mes = () => tipo('mes', (s) => (F.esMes(s) ? ok(s) : mal(`«${s}» no es un mes (AAAA-MM)`)), (v) => v);
export const hora = () => tipo('hora', (s) => (F.esHora(s) ? ok(s) : mal(`«${s}» no es una hora (HH:MM)`)), (v) => v);

/** "a, b, c" con elementos de otro tipo. */
export const lista = (elem = texto(), { vacia = false } = {}) =>
  tipo('lista', (s) => {
    // la coma seguida de dígito es decimal ("@postura<=-0,3"), no separador
    const trozos = s.split(/,(?!\d)/).map((x) => x.trim()).filter(Boolean);
    if (!trozos.length) return vacia ? ok([]) : mal('lista vacía');
    const valores = [];
    for (const t of trozos) {
      const r = elem.parse(t);
      if (!r.ok) return r;
      valores.push(r.valor);
    }
    return ok(valores);
  }, (v) => v.map(elem.fmt).join(', '));

/** "180d", "12m", "2a" → {n, unidad, dias}. */
export const duracion = () =>
  tipo('duracion', (s) => {
    const m = /^(\d+)\s*([dma])$/.exec(normalizar(s));
    if (!m) return mal(`«${s}» no es una duración (180d, 12m, 2a)`);
    const n = +m[1];
    return ok({ n, unidad: m[2], dias: n * { d: 1, m: 30, a: 365 }[m[2]] });
  }, (v) => `${v.n}${v.unidad}`);

/** "3.000,00 @2026-01-01" */
export const importeConFecha = () =>
  tipo('importeConFecha', (s) => {
    const m = /^(.+?)\s*@\s*(\S+)$/.exec(s);
    if (!m) return mal(`«${s}» debe ser «importe @AAAA-MM-DD»`);
    const i = D.parseImporte(m[1]);
    if (!i.ok) return i;
    return F.esFecha(m[2]) ? ok({ importe: i.valor, fecha: m[2] }) : mal(`«${m[2]}» no es una fecha que exista`);
  }, (v) => `${D.formatearImporte(v.importe)} @${v.fecha}`);

/** "2026-11-01 → 2026-11-30" (acepta "->"). */
export const periodo = () =>
  tipo('periodo', (s) => {
    const m = /^(\S+)\s*(?:→|->)\s*(\S+)$/.exec(s);
    if (!m || !F.esFecha(m[1]) || !F.esFecha(m[2]) || m[1] > m[2]) return mal(`«${s}» no es un periodo «AAAA-MM-DD → AAAA-MM-DD»`);
    return ok({ desde: m[1], hasta: m[2] });
  }, (v) => `${v.desde} → ${v.hasta}`);

/** Valor con una palabra y opcionalmente una fecha/mes detrás: "cerrado 2026-11-30", "cumplida 2026-05-01", "no desde 2026-08". */
export function estadoConFecha(estados, { conFecha = [], fechaOpcional = [], particula = '' } = {}) {
  const e = enumerado(estados);
  return tipo('estado', (s) => {
    const m = new RegExp(`^(\\S+)(?:\\s+${particula ? particula + '\\s+' : ''}(\\d{4}-\\d{2}(?:-\\d{2})?))?$`, 'u').exec(s);
    if (!m) return mal(`«${s}» no es un estado válido`);
    const r = e.parse(m[1]);
    if (!r.ok) return r;
    const f = m[2] ?? null;
    if (f && !(F.esFecha(f) || F.esMes(f))) return mal(`«${f}» no es una fecha válida`);
    if (conFecha.includes(r.valor) && !f && !fechaOpcional.includes(r.valor)) return mal(`«${r.valor}» necesita fecha`);
    if (f && !conFecha.includes(r.valor)) return mal(`«${r.valor}» no lleva fecha`);
    return ok({ estado: r.valor, fecha: f });
  }, (v) => (v.fecha ? `${v.estado} ${particula ? particula + ' ' : ''}${v.fecha}` : v.estado));
}

/** Tramos de impuestos "0-6000:19 | 6000-50000:21 | 300000-:30" → [{desde, hasta|null, pb}] en céntimos. */
export const tramos = () =>
  tipo('tramos', (s) => {
    const res = [];
    for (const t of s.split('|').map((x) => x.trim())) {
      const m = /^(\d+)-(\d*):(.+)$/.exec(t.replace(/\s/g, ''));
      if (!m) return mal(`tramo «${t}» no válido (desde-hasta:porcentaje)`);
      const p = D.parsePorcentaje(m[3]);
      if (!p.ok) return p;
      res.push({ desde: +m[1] * 100, hasta: m[2] === '' ? null : +m[2] * 100, pb: p.valor });
    }
    for (let i = 0; i < res.length; i++) {
      const t = res[i];
      if (t.hasta !== null && t.hasta <= t.desde) return mal('un tramo termina antes de empezar');
      if (i > 0 && res[i - 1].hasta !== t.desde) return mal('los tramos deben ser consecutivos, sin huecos ni solapes');
      if (t.hasta === null && i !== res.length - 1) return mal('solo el último tramo puede no tener límite');
    }
    return res.length ? ok(res) : mal('sin tramos');
  }, (v) => v.map((t) => `${t.desde / 100}-${t.hasta === null ? '' : t.hasta / 100}:${D.formatearPorcentaje(t.pb)}`).join(' | '));

/** "sp500 → msci-world" (origen y destino de un traspaso) o un solo id. */
export const activoOTraspaso = () =>
  tipo('activoOTraspaso', (s) => {
    const partes = s.split(/\s*(?:→|->)\s*/);
    if (partes.length > 2) return mal(`«${s}» no es un activo ni un traspaso`);
    const ids = [];
    for (const p of partes) {
      const r = id().parse(p);
      if (!r.ok) return r;
      ids.push(r.valor);
    }
    return ok(ids.length === 1 ? { activo: ids[0] } : { origen: ids[0], destino: ids[1] });
  }, (v) => (v.activo ? v.activo : `${v.origen} → ${v.destino}`));

/** Referencia a un movimiento: "2026-11/a3f9". */
export const refMovimiento = () =>
  tipo('refMovimiento', (s) => (/^\d{4}-(0[1-9]|1[0-2])\/[a-z0-9]{4}$/.test(s) ? ok(s) : mal(`«${s}» no es una referencia de movimiento (AAAA-MM/xxxx)`)), (v) => v);

/** Día de cobro de un recurrente: "5" (del mes) o "14-11" (día-mes, anual). */
export const diaCobro = () =>
  tipo('diaCobro', (s) => {
    let m = /^(\d{1,2})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 31) return ok({ dia: +m[1], mes: null });
    m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= F.diasDelMes(2024, +m[2])) return ok({ dia: +m[1], mes: +m[2] });
    return mal(`«${s}» no es un día de cobro válido (D o DD-MM)`);
  }, (v) => (v.mes ? `${v.dia}-${String(v.mes).padStart(2, '0')}` : String(v.dia)));

/** Lista "clave:valor" con valores de otro tipo: "utilities:▲, bancos:▼" o "pulso=sonnet, privado=opus". */
export const mapa = (claveT = id(), valorT = texto(), sep = ':') =>
  tipo('mapa', (s) => {
    const res = {};
    for (const t of s.split(',').map((x) => x.trim()).filter(Boolean)) {
      const i = t.indexOf(sep);
      if (i < 1) return mal(`«${t}» debe ser clave${sep}valor`);
      const k = claveT.parse(t.slice(0, i));
      const v = valorT.parse(t.slice(i + 1));
      if (!k.ok) return k;
      if (!v.ok) return v;
      res[k.valor] = v.valor;
    }
    return ok(res);
  }, (v) => Object.entries(v).map(([k, x]) => `${claveT.fmt(k)}${sep}${valorT.fmt(x)}`).join(', '));
