// Motor de formatos: lee y escribe los Markdown de finhub según una especificación declarativa.
// Garantías (§3.1, §2.5): ida y vuelta estable, líneas desconocidas o inválidas conservadas en su sitio,
// versión de esquema, avisos con número de línea. Nada de E/S: recibe y devuelve texto.
import { dividirLineas, separarComentario, anadirComentario, partirCeldas, desescapar, escaparCelda, escaparValor, desescaparValor, RE_BANDERA, RE_ETIQUETAS } from './lineas.js';

export const ESQUEMA_ACTUAL = 1; // por defecto; cada formato puede declarar su propio `esquema`
const RE_KV = /^([\p{Ll}\d_][\p{Ll}\d_-]*):(?:\s+(.*)|\s*)$/u;
const RE_CABECERA = /^([a-z_][a-z0-9_]*):(?:\s+(.*)|\s*)$/;
const RE_BLOQUE = /^(\S+) · (.+)$/;

// ---------- especificaciones ----------

/** Campo con nombre de una entidad de lista o de un kv: c('tipo', T.enumerado(…), {requerida:true}). */
export const c = (nombre, tipo, opciones = {}) => ({ k: 'clave', nombre, tipo, ...opciones });
/** Bandera (presencia = sí): b('colchon'). */
export const b = (nombre) => ({ k: 'bandera', nombre });
/** Texto entre comillas «…» en cualquier posición tras los posicionales (predicciones). */
export const cita = (nombre) => ({ k: 'cita', nombre });
/** Posición de las etiquetas #… en el orden canónico. */
export const ETIQUETAS = { k: 'etiquetas', nombre: 'etiquetas' };
/** Campo posicional: p('id', T.id()) · opciones: {opcional, nulo:'—'}. */
export const p = (nombre, tipo, opciones = {}) => ({ nombre, tipo, ...opciones });

/** Entidad de lista "- a | b | clave: v | bandera | #etiqueta". */
export function entidad({ pos = [], campos = [] }) {
  const porNombre = new Map(campos.filter((x) => x.k !== 'etiquetas').map((x) => [x.nombre, x]));
  const conEtiquetas = campos.some((x) => x.k === 'etiquetas');
  const campoCita = campos.find((x) => x.k === 'cita');
  return {
    clase: 'entidad',
    parse(contenido) {
      const celdas = partirCeldas(contenido);
      const valor = {};
      const extra = [];
      const avisos = [];
      if (conEtiquetas) valor.etiquetas = [];
      for (let i = 0; i < pos.length; i++) {
        const def = pos[i];
        const cel = celdas[i];
        if (cel === undefined || cel === '') {
          if (def.opcional) { valor[def.nombre] = null; continue; }
          return { ok: false, error: `falta «${def.nombre}»` };
        }
        if (def.nulo && cel === def.nulo) { valor[def.nombre] = null; continue; }
        const r = def.tipo.parse(desescapar(cel));
        if (!r.ok) return { ok: false, error: `${def.nombre}: ${r.error}` };
        valor[def.nombre] = r.valor;
      }
      for (const cel of celdas.slice(pos.length)) {
        if (cel === '') { avisos.push('celda vacía (se quita al guardar)'); continue; }
        if (conEtiquetas && RE_ETIQUETAS.test(cel)) {
          for (const t of cel.split(/\s+/)) {
            const e = t.slice(1).normalize('NFC').toLowerCase();
            if (!valor.etiquetas.includes(e)) valor.etiquetas.push(e);
          }
          continue;
        }
        if (campoCita && /^«[^]*»$/.test(cel) && valor[campoCita.nombre] === undefined) {
          valor[campoCita.nombre] = desescapar(cel.slice(1, -1));
          continue;
        }
        const m = RE_KV.exec(cel);
        if (m) {
          const def = porNombre.get(m[1]);
          if (def?.k === 'clave') {
            if (m[1] in valor && valor[m[1]] !== undefined) { avisos.push(`«${m[1]}» repetido: se usa el primero`); extra.push(cel); continue; }
            const r = def.tipo.parse(desescapar(m[2] ?? ''));
            if (r.ok) valor[def.nombre] = r.valor;
            else if (def.requerida) return { ok: false, error: `${def.nombre}: ${r.error}` };
            else { avisos.push(`${def.nombre}: ${r.error}`); extra.push(cel); }
            continue;
          }
          avisos.push(`clave desconocida «${m[1]}» (se conserva)`);
          extra.push(cel);
          continue;
        }
        if (RE_BANDERA.test(cel) && porNombre.get(cel)?.k === 'bandera') { valor[cel] = true; continue; }
        avisos.push(`celda no reconocida «${cel}» (se conserva)`);
        extra.push(cel);
      }
      for (const def of campos) {
        if ((def.k === 'clave' || def.k === 'cita') && def.requerida && valor[def.nombre] === undefined) return { ok: false, error: `falta «${def.nombre}»` };
      }
      return { ok: true, valor, extra, avisos };
    },
    fmt(valor, extra = []) {
      const partes = pos.map((def) => {
        const v = valor[def.nombre];
        if (v === null || v === undefined) return def.nulo ?? '';
        return escaparCelda(def.tipo.fmt(v));
      });
      while (partes.length && partes[partes.length - 1] === '' && pos[partes.length - 1].opcional) partes.pop();
      for (const def of campos) {
        if (def.k === 'clave') {
          const v = valor[def.nombre];
          if (v !== null && v !== undefined) partes.push(`${def.nombre}: ${escaparCelda(def.tipo.fmt(v))}`);
        } else if (def.k === 'bandera') {
          if (valor[def.nombre]) partes.push(def.nombre);
        } else if (def.k === 'cita') {
          if (valor[def.nombre] !== undefined && valor[def.nombre] !== null) partes.push(`«${escaparCelda(valor[def.nombre])}»`);
        } else if (valor.etiquetas?.length) {
          partes.push(valor.etiquetas.map((t) => '#' + t).join(' '));
        }
      }
      return '- ' + [...partes, ...extra].join(' | ');
    },
  };
}

/**
 * Lista de "- clave: valor". `claves`: {nombre: tipo | [tipo, opciones]}. `libre`: tipo de valor para
 * claves no listadas (p. ej. presupuestos por id de grupo); si no hay, se conservan con aviso.
 */
export function kv({ claves = {}, libre = null, claveLibre = null } = {}) {
  const defs = Object.fromEntries(Object.entries(claves).map(([k, v]) => [k, Array.isArray(v) ? { tipo: v[0], ...v[1] } : { tipo: v }]));
  return {
    clase: 'kv',
    defs,
    parseLinea(contenido) {
      const m = RE_KV.exec(contenido);
      if (!m) return null;
      const clave = m[1];
      const texto = desescaparValor(m[2] ?? '');
      const def = defs[clave] ?? (libre && (!claveLibre || claveLibre.parse(clave).ok) ? { tipo: libre } : null);
      if (!def) return { clave, texto, valor: undefined, aviso: `clave desconocida «${clave}» (se conserva)` };
      const r = def.tipo.parse(texto);
      return r.ok ? { clave, texto, valor: r.valor } : { clave, texto, valor: undefined, aviso: `${clave}: ${r.error}`, error: !!def.requerida };
    },
    fmtValor(clave, valor) {
      const def = defs[clave] ?? (libre ? { tipo: libre } : null);
      return def ? def.tipo.fmt(valor) : String(valor);
    },
  };
}

/** Define un formato de fichero. Ver docs/FORMATOS.md. */
export function definirFormato(spec) {
  const s = {
    titulo: spec.tipo,
    cabeceras: null,
    preambulo: null,
    secciones: {},
    seccionesLibres: 'aviso', // 'aviso' | 'texto'
    bloques: null, // {campos: kv | null, cuerpo: true}
    validar: null,
    ...spec,
  };
  return {
    tipo: s.tipo,
    spec: s,
    parsear: (texto, ctx = {}) => parsear(s, texto, ctx),
    serializar: (doc) => serializar(doc),
    nuevo: (ctx = {}) => nuevoDoc(s, ctx),
  };
}

// ---------- lectura ----------

function nuevoDoc(spec, ctx = {}) {
  const titulo = typeof spec.titulo === 'function' ? spec.titulo(ctx) : spec.titulo;
  return { tipo: spec.tipo, spec, titulo, esquema: spec.esquema ?? ESQUEMA_ACTUAL, secciones: [{ clase: 'preambulo', nodos: [] }], avisos: [], soloLectura: false };
}

function specItems(spec, sec) {
  if (sec.clase === 'preambulo') return spec.preambulo;
  if (sec.clase === 'bloque') return spec.bloques?.campos ?? null;
  return spec.secciones[sec.nombre]?.items ?? null;
}

function parsear(spec, texto, ctx) {
  const doc = nuevoDoc(spec, ctx);
  const lineas = dividirLineas(texto);
  const aviso = (linea, mensaje, nivel = 'aviso') => doc.avisos.push({ linea, nivel, mensaje });
  let i = 0;
  if (lineas[0]?.startsWith('# ')) {
    doc.titulo = lineas[0].slice(2).trim();
    i = 1;
  } else aviso(1, 'falta el título «# …» en la primera línea (se añade al guardar)');

  let esquemaVisto = false;
  let sec = doc.secciones[0];
  let enCabecera = true;
  for (; i < lineas.length; i++) {
    const n = i + 1;
    const linea = lineas[i];
    if (linea.startsWith('## ')) {
      enCabecera = false;
      sec = abrirSeccion(spec, doc, linea.slice(3).trim(), n, aviso);
      continue;
    }
    if (sec.clase === 'bloque' && sec.enCuerpo) { sec.nodos.push({ k: 'cuerpo', texto: linea }); continue; }
    if (sec.clase === 'texto') { sec.nodos.push({ k: 'cuerpo', texto: linea }); continue; }

    const { contenido, comentario } = separarComentario(linea);
    if (enCabecera && sec.clase === 'preambulo' && RE_CABECERA.test(contenido)) {
      const m = RE_CABECERA.exec(contenido);
      if (m[1] === 'esquema' && !esquemaVisto) {
        esquemaVisto = true;
        if (/^\d+$/.test(m[2] ?? '')) doc.esquema = +m[2];
        else aviso(n, `esquema no válido «${m[2] ?? ''}»; se asume ${spec.esquema ?? ESQUEMA_ACTUAL}`);
        doc.comentarioEsquema = comentario;
        continue;
      }
      sec.nodos.push(nodoKv('cab', spec.cabeceras, contenido, comentario, linea, n, aviso));
      continue;
    }
    if (contenido.startsWith('- ') || contenido === '-') {
      enCabecera = false;
      const cuerpo = contenido.slice(2);
      if (sec.clase === 'bloque' && spec.bloques?.campos && RE_KV.test(cuerpo)) {
        sec.nodos.push(nodoKv('kv', spec.bloques.campos, cuerpo, comentario, linea, n, aviso));
        continue;
      }
      if (sec.clase === 'bloque') { sec.enCuerpo = true; sec.nodos.push({ k: 'cuerpo', texto: linea }); continue; }
      const it = specItems(spec, sec);
      if (!it) {
        sec.nodos.push({ k: 'raw', texto: linea, linea: n });
        if (!sec.desconocida) aviso(n, 'línea no reconocida (se conserva)');
        continue;
      }
      if (it.clase === 'kv') { sec.nodos.push(nodoKv('kv', it, cuerpo, comentario, linea, n, aviso)); continue; }
      const r = it.parse(cuerpo);
      if (!r.ok) {
        sec.nodos.push({ k: 'raw', texto: linea, linea: n, motivo: r.error });
        aviso(n, r.error, 'error');
        continue;
      }
      for (const a of r.avisos) aviso(n, a);
      sec.nodos.push({ k: 'item', valor: r.valor, extra: r.extra, comentario, linea: n });
      continue;
    }
    enCabecera = enCabecera && linea.trim() === '';
    if (sec.clase === 'bloque' && spec.bloques?.cuerpo !== false && (linea.trim() !== '' || sec.nodos.length)) {
      sec.enCuerpo = true;
      sec.nodos.push({ k: 'cuerpo', texto: linea });
      continue;
    }
    sec.nodos.push({ k: 'raw', texto: linea, linea: n });
    if (linea.trim() !== '' && !sec.desconocida) aviso(n, 'línea no reconocida (se conserva)');
  }
  for (const [clave, def] of Object.entries(spec.cabeceras?.defs ?? {})) {
    if (def.requerida && !doc.secciones[0].nodos.some((x) => x.k === 'cab' && x.clave === clave)) aviso(1, `falta la cabecera «${clave}:»`, 'error');
  }
  const actual = spec.esquema ?? ESQUEMA_ACTUAL;
  if (!esquemaVisto) {
    doc.esquemaAusente = true;
    aviso(1, `falta «esquema: N»; se asume ${actual} y se escribe al guardar`);
  }
  if (doc.esquema > actual) {
    doc.soloLectura = true;
    aviso(1, `este fichero es de una versión más nueva de finhub (esquema ${doc.esquema}); se abre en solo lectura`, 'error');
  }
  spec.validar?.(doc, (nodo, mensaje, nivel = 'aviso') => {
    doc.avisos.push({ linea: nodo?.linea ?? 0, nivel, mensaje });
    if (nivel === 'error' && nodo) nodo.excluido = true;
  }, ctx);
  doc.avisos.sort((a, b) => a.linea - b.linea);
  return doc;
}

function abrirSeccion(spec, doc, encabezado, n, aviso) {
  const m = RE_BLOQUE.exec(encabezado);
  let sec;
  if (spec.bloques && m && !spec.secciones[encabezado]) sec = { clase: 'bloque', id: m[1], titulo: m[2], nodos: [], linea: n };
  else if (spec.secciones[encabezado]) sec = { clase: spec.secciones[encabezado].texto ? 'texto' : 'seccion', nombre: encabezado, nodos: [], linea: n };
  else if (spec.seccionesLibres === 'texto') sec = { clase: 'texto', nombre: encabezado, nodos: [], linea: n };
  else {
    sec = { clase: 'seccion', nombre: encabezado, nodos: [], linea: n, desconocida: true };
    aviso(n, `sección desconocida «${encabezado}» (se conserva)`);
  }
  doc.secciones.push(sec);
  return sec;
}

function nodoKv(k, especKv, contenido, comentario, linea, n, aviso) {
  let r = null;
  if (especKv) r = especKv.parseLinea(contenido);
  else {
    const m = RE_KV.exec(contenido);
    if (m) r = { clave: m[1], texto: desescaparValor(m[2] ?? ''), valor: undefined, aviso: `${k === 'cab' ? 'cabecera' : 'clave'} desconocida «${m[1]}» (se conserva)` };
  }
  if (!r) {
    aviso(n, 'línea no reconocida (se conserva)');
    return { k: 'raw', texto: linea, linea: n };
  }
  if (r.aviso) aviso(n, r.aviso, r.error ? 'error' : 'aviso');
  return { k, clave: r.clave, valor: r.valor, texto: r.texto, comentario, linea: n, especKv };
}

// ---------- escritura ----------

/** Un campo de una línea nunca puede abrir otra: colaría filas, bloques o secciones en el fichero (QA-066). */
const unaLinea = (v) => String(v ?? '').replace(/\s*[\r\n\u2028\u2029\u0085]+\s*/g, ' ').trim();

function lineaKv(nodo) {
  const valor = unaLinea(nodo.valor !== undefined && nodo.especKv ? nodo.especKv.fmtValor(nodo.clave, nodo.valor) : nodo.texto);
  const prefijo = nodo.k === 'cab' ? '' : '- ';
  return anadirComentario(`${prefijo}${nodo.clave}:${valor === '' ? '' : ' ' + escaparValor(valor)}`, nodo.comentario);
}

export function serializar(doc) {
  const out = [`# ${unaLinea(doc.titulo)}`, anadirComentario(`esquema: ${doc.esquema ?? doc.spec.esquema ?? ESQUEMA_ACTUAL}`, doc.comentarioEsquema)];
  for (const sec of doc.secciones) {
    if (sec.clase === 'bloque') out.push(`## ${unaLinea(sec.id)} · ${unaLinea(sec.titulo)}`);
    else if (sec.clase !== 'preambulo') out.push(`## ${unaLinea(sec.nombre)}`);
    const it = specItems(doc.spec, sec);
    for (const nodo of sec.nodos) {
      if (nodo.k === 'item') out.push(anadirComentario(it.fmt(nodo.valor, nodo.extra), nodo.comentario));
      else if (nodo.k === 'kv' || nodo.k === 'cab') out.push(lineaKv(nodo));
      else out.push(nodo.texto);
    }
  }
  return out.join('\n') + '\n';
}

// ---------- acceso y construcción ----------

export const seccion = (doc, nombre) => (nombre ? doc.secciones.find((s) => s.nombre === nombre) : doc.secciones[0]);

/** Valores de las entidades de una sección (null = preámbulo), sin las excluidas por error. */
export function items(doc, nombre = null, { incluirExcluidos = false } = {}) {
  const s = seccion(doc, nombre);
  if (!s) return [];
  return s.nodos.filter((x) => x.k === 'item' && (incluirExcluidos || !x.excluido)).map((x) => x.valor);
}

/** Objeto clave → valor de una sección kv o de las cabeceras (solo valores válidos). */
export function valores(doc, nombre = null, { cabeceras = false } = {}) {
  const s = seccion(doc, nombre);
  const res = {};
  for (const x of s?.nodos ?? []) if (x.k === (cabeceras ? 'cab' : 'kv') && x.valor !== undefined && !(x.clave in res)) res[x.clave] = x.valor;
  return res;
}
export const cabeceras = (doc) => valores(doc, null, { cabeceras: true });

/** Bloques "## id · título" con sus campos y su cuerpo. */
export function bloques(doc, { incluirExcluidos = false } = {}) {
  return doc.secciones.filter((s) => s.clase === 'bloque' && (incluirExcluidos || !s.excluido)).map((s) => {
    const campos = {};
    for (const x of s.nodos) if (x.k === 'kv' && x.valor !== undefined && !(x.clave in campos)) campos[x.clave] = x.valor;
    const cuerpo = s.nodos.filter((x) => x.k === 'cuerpo').map((x) => x.texto);
    while (cuerpo.length && cuerpo[cuerpo.length - 1].trim() === '') cuerpo.pop();
    while (cuerpo.length && cuerpo[0].trim() === '') cuerpo.shift();
    return { id: s.id, titulo: s.titulo, campos, cuerpo: cuerpo.join('\n'), linea: s.linea };
  });
}

/** Texto de una sección libre ("## Qué", "## Rol"…). */
export function textoSeccion(doc, nombre) {
  const s = seccion(doc, nombre);
  if (!s) return null;
  const l = s.nodos.map((x) => x.texto ?? '');
  while (l.length && l[l.length - 1].trim() === '') l.pop();
  return l.join('\n');
}

export function fijarCabecera(doc, clave, valor) {
  const pre = doc.secciones[0];
  const nodo = pre.nodos.find((x) => x.k === 'cab' && x.clave === clave);
  const especKv = doc.spec.cabeceras;
  if (nodo) Object.assign(nodo, { valor, texto: undefined });
  else {
    const iCab = pre.nodos.reduce((ult, x, i) => (x.k === 'cab' ? i : ult), -1);
    pre.nodos.splice(iCab + 1, 0, { k: 'cab', clave, valor, especKv });
  }
  return doc;
}

export function asegurarSeccion(doc, nombre) {
  let s = seccion(doc, nombre);
  if (!s) {
    s = { clase: doc.spec.secciones[nombre]?.texto ? 'texto' : 'seccion', nombre, nodos: [] };
    doc.secciones.push(s);
  }
  return s;
}

export function anadirItem(doc, nombre, valor) {
  const s = nombre ? asegurarSeccion(doc, nombre) : doc.secciones[0];
  s.nodos.push({ k: 'item', valor, extra: [] });
  return doc;
}

export function fijarKv(doc, nombre, clave, valor) {
  const s = nombre ? asegurarSeccion(doc, nombre) : doc.secciones[0];
  const especKv = nombre ? doc.spec.secciones[nombre]?.items : doc.spec.preambulo;
  const nodo = s.nodos.find((x) => x.k === 'kv' && x.clave === clave);
  if (nodo) Object.assign(nodo, { valor, texto: undefined });
  else s.nodos.push({ k: 'kv', clave, valor, especKv });
  return doc;
}

export function fijarTexto(doc, nombre, texto) {
  const s = asegurarSeccion(doc, nombre);
  s.nodos = String(texto).split('\n').map((t) => ({ k: 'cuerpo', texto: t }));
  return doc;
}

/** Añade un bloque "## id · título" con campos (en el orden dado) y cuerpo. */
export function anadirBloque(doc, { id, titulo, campos = {}, cuerpo = '' }, { alPrincipio = false } = {}) {
  const especKv = doc.spec.bloques?.campos;
  const nodos = Object.entries(campos).filter(([, v]) => v !== undefined && v !== null).map(([clave, valor]) => ({ k: 'kv', clave, valor, especKv }));
  if (cuerpo) for (const t of String(cuerpo).split('\n')) nodos.push({ k: 'cuerpo', texto: t });
  const sec = { clase: 'bloque', id, titulo, nodos };
  if (alPrincipio) {
    const i = doc.secciones.findIndex((s) => s.clase === 'bloque');
    doc.secciones.splice(i < 0 ? doc.secciones.length : i, 0, sec);
  } else doc.secciones.push(sec);
  return doc;
}
