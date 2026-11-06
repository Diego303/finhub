// Esquemas de salida de los trabajos (§8.3), sin dependencias. Un esquema es un objeto pequeño:
//   {t: 'objeto', props: {…}, req: [...]}  (las claves no declaradas se RECHAZAN: nada fuera del contrato)
//   {t: 'lista', de: esquema, max?, min?} · {t: 'texto', max?, min?} · {t: 'entero', min?, max?} · {t: 'numero', min?, max?}
//   {t: 'fecha'} · {t: 'mes'} · {t: 'url'} · {t: 'bool'} · {t: 'enum', v: [...]} · {t: 'mapa', de: esquema, claves?: esquema}
import { esFecha, esMes } from '../core/fechas.js';

const tipoDe = (x) => (Array.isArray(x) ? 'lista' : x === null ? 'null' : typeof x);

/** Valida `valor` contra `esq`. → lista de errores «ruta: motivo» (vacía = válido). */
export function validar(valor, esq, ruta = '$') {
  const e = [];
  const mal = (m) => e.push(`${ruta}: ${m}`);
  if (esq.opcional && (valor === undefined || valor === null)) return e;
  switch (esq.t) {
    case 'objeto': {
      if (tipoDe(valor) !== 'object') return [`${ruta}: debe ser un objeto`];
      for (const k of esq.req ?? []) if (valor[k] === undefined || valor[k] === null) mal(`falta «${k}»`);
      for (const [k, v] of Object.entries(valor)) {
        if (!Object.hasOwn(esq.props, k)) mal(`clave no permitida «${k}»`); // «in» aceptaría constructor, __proto__…
        else e.push(...validar(v, esq.props[k], `${ruta}.${k}`));
      }
      break;
    }
    case 'lista':
      if (!Array.isArray(valor)) return [`${ruta}: debe ser una lista`];
      if (esq.max !== undefined && valor.length > esq.max) mal(`como mucho ${esq.max} elementos`);
      if (esq.min !== undefined && valor.length < esq.min) mal(`al menos ${esq.min} elementos`);
      valor.forEach((x, i) => e.push(...validar(x, esq.de, `${ruta}[${i}]`)));
      break;
    case 'mapa':
      if (tipoDe(valor) !== 'object') return [`${ruta}: debe ser un objeto`];
      for (const [k, v] of Object.entries(valor)) {
        if (esq.claves) e.push(...validar(k, esq.claves, `${ruta}{${k}}`));
        e.push(...validar(v, esq.de, `${ruta}.${k}`));
      }
      break;
    case 'texto':
      if (typeof valor !== 'string') return [`${ruta}: debe ser texto`];
      if (esq.min !== undefined && valor.trim().length < esq.min) mal('texto vacío o demasiado corto');
      if (esq.max !== undefined && valor.length > esq.max) mal(`texto de más de ${esq.max} caracteres`);
      if (esq.patron && !esq.patron.test(valor)) mal(`«${valor}» no tiene la forma esperada`);
      break;
    case 'entero':
    case 'numero':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return [`${ruta}: debe ser un número`];
      if (esq.t === 'entero' && !Number.isInteger(valor)) mal('debe ser entero');
      if (esq.min !== undefined && valor < esq.min) mal(`menor que ${esq.min}`);
      if (esq.max !== undefined && valor > esq.max) mal(`mayor que ${esq.max}`);
      break;
    case 'bool':
      if (typeof valor !== 'boolean') mal('debe ser true o false');
      break;
    case 'fecha':
      if (!esFecha(valor)) mal(`«${valor}» no es una fecha AAAA-MM-DD`);
      break;
    case 'mes':
      if (!esMes(valor)) mal(`«${valor}» no es un mes AAAA-MM`);
      break;
    case 'url':
      if (typeof valor !== 'string' || !/^https?:\/\/[^\s<>"]+$/.test(valor)) mal(`«${valor}» no es una URL`);
      break;
    case 'enum':
      if (!esq.v.includes(valor)) mal(`«${valor}» no es uno de ${esq.v.join(', ')}`);
      break;
    default:
      throw new Error(`tipo de esquema desconocido «${esq.t}»`);
  }
  return e;
}

/**
 * Extrae el ÚLTIMO bloque ```json del texto (§8.2) y lo parsea.
 * → {json, texto (lo que queda para mostrar), error}
 */
export function extraerJson(texto) {
  const t = String(texto ?? '');
  const re = /```json\s*\n([\s\S]*?)\n?```/g;
  let m;
  let ultimo = null;
  while ((m = re.exec(t))) ultimo = m;
  if (!ultimo) return { json: null, texto: t.trim(), error: 'la salida no trae un bloque ```json' };
  try {
    return { json: JSON.parse(ultimo[1]), texto: (t.slice(0, ultimo.index) + t.slice(ultimo.index + ultimo[0].length)).trim(), error: null };
  } catch (e) {
    return { json: null, texto: t.trim(), error: `el bloque JSON no se puede leer: ${e.message}` };
  }
}

/** Describe un esquema en una línea para el prompt («formato de salida»). */
export function describir(esq) {
  switch (esq.t) {
    case 'objeto':
      return `{${Object.entries(esq.props).map(([k, v]) => `"${k}"${(esq.req ?? []).includes(k) ? '' : '?'}: ${describir(v)}`).join(', ')}}`;
    case 'lista':
      return `[${describir(esq.de)}${esq.max ? `, máx. ${esq.max}` : ''}]`;
    case 'mapa':
      return `{<clave>: ${describir(esq.de)}}`;
    case 'enum':
      return esq.v.map((x) => JSON.stringify(x)).join('|');
    case 'texto':
      return esq.ayuda ? `texto (${esq.ayuda})` : 'texto';
    case 'entero':
      return `entero${esq.min !== undefined ? ` ${esq.min}–${esq.max ?? '∞'}` : ''}`;
    case 'numero':
      return esq.ayuda ? `número (${esq.ayuda})` : 'número';
    case 'fecha':
      return 'fecha AAAA-MM-DD';
    case 'mes':
      return 'mes AAAA-MM';
    default:
      return esq.t;
  }
}
