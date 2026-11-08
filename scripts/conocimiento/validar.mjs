#!/usr/bin/env node
// Validador PROVISIONAL de la semilla (pasada 3 del protocolo; maestro §8.3). Manda el del repo
// (`pnpm conocimiento:validar`, P1): este solo sirve para trabajar en el entorno externo.
//
// Uso: node scripts/conocimiento/validar.mjs [--solo <fichero.md>[,<fichero.md>…]] [--json <salida.json>] [--hoy AAAA-MM-DD]
//   · sin --solo, valida toda semilla/base/ y semilla/mundo/;
//   · con --solo, informa solo de esos ficheros, pero ids, hash y duplicados se miran contra toda la semilla;
//   · código de salida 1 si hay algún error. Cada fallo lleva nota, regla y como mucho 12 palabras.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { notas as formatoNotas } from '../../src/core/formato/conocimiento.js';
import { bloques } from '../../src/core/formato/motor.js';
import { RE_ID_NOTA } from '../../src/core/ids.js';
import { esFecha, sumarDias, diasEntre, ultimoDia } from '../../src/core/fechas.js';
import { normalizar } from '../../src/core/ids.js';
import { revisarUrl, dominiosPermitidos, senalesInyeccion } from '../../.claude/hooks/guardia.mjs';
import * as C from './config.mjs';
import { jaccard, urlDe, cortoUrl, enCache, textoCache, copiaEn, cifrasAusentes } from './comprobar.mjs';

const RAIZ = resolve(import.meta.dirname, '..', '..');
/** Modo sin caché (--sin-cache o CONOCIMIENTO_SIN_CACHE=1): solo para el entorno externo sin descargas. */
let SIN_CACHE = process.env.CONOCIMIENTO_SIN_CACHE === '1';
export const fijarSinCache = (v) => (SIN_CACHE = !!v);
const corto = (s, n = 12) => String(s ?? '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');

/** Partes de `origen`: «Medio · título o apartado · https://… (consultado AAAA-MM-DD)», separadas por « · y · ». */
const RE_PARTE_ORIGEN = /^(.+?) · (.+) · (\S+) \(consultado (\d{4}-\d{2}-\d{2})\)$/;
export function partesOrigen(origen) {
  return String(origen ?? '').split(' · y · ').map((t) => {
    const m = RE_PARTE_ORIGEN.exec(t.trim());
    return m ? { ok: true, medio: m[1], apartado: m[2], url: m[3], consultado: m[4] } : { ok: false, texto: t.trim() };
  });
}

/** Lee todos los ficheros de la semilla. → [{ruta, carpeta, fichero, texto, doc, notas:[…]}] */
export function leerSemilla(raiz = RAIZ) {
  const out = [];
  for (const carpeta of ['base', 'mundo']) {
    const dir = join(raiz, 'semilla', carpeta);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const texto = readFileSync(join(dir, f), 'utf8');
      const ctx = carpeta === 'mundo' ? { fuente: 'mundo', fecha: f.replace(/\.md$/, '') } : { fuente: 'base' };
      const doc = formatoNotas.parsear(texto, ctx);
      const bs = bloques(doc, { incluirExcluidos: true });
      // orden de las claves tal como están escritas, y líneas del cuerpo
      const secs = doc.secciones.filter((s) => s.clase === 'bloque');
      const notas = bs.map((b, i) => ({
        ...b,
        claves: secs[i].nodos.filter((n) => n.k === 'kv').map((n) => n.clave),
        crudos: Object.fromEntries(secs[i].nodos.filter((n) => n.k === 'kv').map((n) => [n.clave, n.texto])),
        lineasTexto: b.cuerpo.split('\n').filter((l) => l.trim() !== '').length,
        carpeta,
        fichero: f,
      }));
      out.push({ ruta: `semilla/${carpeta}/${f}`, carpeta, fichero: f, texto, doc, notas });
    }
  }
  return out;
}

/** Evidencias: todas las líneas de docs/conocimiento/evidencias/*.jsonl. → {porNota: Map, errores: []} */
export function leerEvidencias(raiz = RAIZ) {
  const dir = join(raiz, 'docs', 'conocimiento', 'evidencias');
  const porNota = new Map();
  const errores = [];
  if (!existsSync(dir)) return { porNota, errores };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) {
    readFileSync(join(dir, f), 'utf8').split('\n').forEach((l, i) => {
      if (!l.trim()) return;
      let e;
      try {
        e = JSON.parse(l);
      } catch {
        errores.push({ fichero: f, linea: i + 1, detalle: 'línea JSON no válida' });
        return;
      }
      e._donde = `${f}:${i + 1}`;
      if (!porNota.has(e.nota)) porNota.set(e.nota, []);
      porNota.get(e.nota).push(e);
    });
  }
  return { porNota, errores };
}

const CAMPOS_EVIDENCIA = ['nota', 'afirmacion', 'cifras', 'url', 'medio', 'publicada', 'consultada', 'apartado', 'pagina', 'p1', 'p2'];
const veredictoOk = (p) => p && p.veredicto === 'confirmada' && typeof p.por === 'string' && esFecha(p.fecha);

/** Valida la semilla. → {fallos: [{nivel, regla, ruta, nota, detalle}], resumen} */
export function validar({ raiz = RAIZ, solo = null, hoy = new Date().toISOString().slice(0, 10), paginas } = {}) {
  const ficheros = leerSemilla(raiz);
  const { porNota: evid, errores: errEvid } = leerEvidencias(raiz);
  const lista = dominiosPermitidos();
  const fallos = [];
  const informar = (r) => !solo || solo.some((s) => r === s || r.endsWith(`/${s}`) || basename(r) === s);
  const mal = (ruta, nota, regla, detalle, nivel = 'error') => {
    if (informar(ruta)) fallos.push({ nivel, regla, ruta, nota, detalle: corto(detalle, 20) });
  };
  for (const e of errEvid) fallos.push({ nivel: 'error', regla: 'evidencias.json', ruta: `docs/conocimiento/evidencias/${e.fichero}`, nota: null, detalle: `línea ${e.linea}: ${e.detalle}` });

  const todas = ficheros.flatMap((f) => f.notas.map((n) => ({ ...n, ruta: f.ruta })));
  // ---------- ficheros ----------
  for (const f of ficheros) {
    for (const a of f.doc.avisos) mal(f.ruta, null, 'formato.parser', `línea ${a.linea}: ${a.mensaje}`);
    if (f.doc.esquemaAusente) mal(f.ruta, null, 'formato.cabecera', 'falta «esquema: 1»');
    const lineas = f.texto.split('\n');
    if (lineas[1] !== 'esquema: 1') mal(f.ruta, null, 'formato.cabecera', 'la segunda línea debe ser «esquema: 1»');
    if (f.texto.includes('\r') || f.texto.startsWith('﻿') || !f.texto.endsWith('\n')) mal(f.ruta, null, 'formato.cabecera', 'UTF-8 sin BOM, «\\n» y salto final');
    if (f.texto !== f.texto.normalize('NFC')) mal(f.ruta, null, 'formato.cabecera', 'texto no normalizado a NFC');
    const cab = Object.fromEntries(f.doc.secciones[0].nodos.filter((n) => n.k === 'cab').map((n) => [n.clave, n.valor]));
    if (f.carpeta === 'base') {
      const def = C.FICHEROS_BASE[f.fichero];
      if (!def) mal(f.ruta, null, 'formato.fichero', 'fichero de la Base que no está en config.mjs (área sin bloque de ids)');
      else if (def.titulo !== 'actual' && f.doc.titulo !== def.titulo) mal(f.ruta, null, 'formato.cabecera', `el título debe ser «# ${def.titulo}»`);
      if (!f.doc.titulo.startsWith('Base · ')) mal(f.ruta, null, 'formato.cabecera', 'el título debe empezar por «# Base · »');
      if (cab.fuente !== 'base') mal(f.ruta, null, 'formato.cabecera', 'falta «fuente: base»');
    } else {
      const fecha = f.fichero.replace(/\.md$/, '');
      if (!esFecha(fecha)) mal(f.ruta, null, 'formato.fichero', 'el fichero de Mundo debe llamarse AAAA-MM-DD.md');
      if (f.doc.titulo !== `Mundo ${fecha}`) mal(f.ruta, null, 'formato.cabecera', `el título debe ser «# Mundo ${fecha}»`);
      if (cab.fuente !== 'mundo' || cab.fecha !== fecha) mal(f.ruta, null, 'formato.cabecera', '«fuente: mundo» y «fecha:» del fichero');
      if (cab.pulsos) mal(f.ruta, null, 'formato.cabecera', 'la semilla no lleva «pulsos:» (no la trajo un pulso)');
      if (fecha > hoy) mal(f.ruta, null, 'fecha.futura', `fichero de un día que aún no ha llegado (${fecha})`);
    }
  }

  // ---------- ids, hash y duplicados en toda la semilla ----------
  const porId = new Map();
  for (const n of todas) {
    const k = n.id.toUpperCase();
    if (porId.has(k)) mal(n.ruta, n.id, 'id.repetido', `también en ${porId.get(k)}`);
    else porId.set(k, n.ruta);
  }
  const porHash = new Map();
  const porUrlMundo = new Map();
  const mundo = todas.filter((n) => n.carpeta === 'mundo');
  for (const n of mundo) {
    if (n.campos.hash) {
      if (porHash.has(n.campos.hash)) mal(n.ruta, n.id, 'hash.repetido', `mismo hash que ${porHash.get(n.campos.hash)}`);
      else porHash.set(n.campos.hash, n.id);
    }
    const u = urlDe(n.campos.origen);
    if (u) {
      if (porUrlMundo.has(u)) mal(n.ruta, n.id, 'duplicado.url', `una URL, una nota: ya la usa ${porUrlMundo.get(u)}`);
      else porUrlMundo.set(u, n.id);
    }
  }
  for (let i = 0; i < mundo.length; i++)
    for (let j = i + 1; j < mundo.length; j++) {
      const a = mundo[i];
      const b = mundo[j];
      if (a.campos.fecha && b.campos.fecha && Math.abs(diasEntre(a.campos.fecha, b.campos.fecha)) <= 1 && jaccard(a.titulo, b.titulo) >= 0.6) mal(b.ruta, b.id, 'duplicado.titulo', `título casi igual (Jaccard ${jaccard(a.titulo, b.titulo).toFixed(2)}) a ${a.id}, a ±1 día`);
    }
  const base = todas.filter((n) => n.carpeta === 'base');
  for (let i = 0; i < base.length; i++)
    for (let j = i + 1; j < base.length; j++) {
      const s = jaccard(base[i].titulo, base[j].titulo);
      if (s >= 0.6) mal(base[j].ruta, base[j].id, 'duplicado.titulo', `título casi igual (Jaccard ${s.toFixed(2)}) a ${base[i].id}`);
      else if (s >= 0.4) mal(base[j].ruta, base[j].id, 'duplicado.posible', `título parecido (Jaccard ${s.toFixed(2)}) a ${base[i].id}: revisar`, 'aviso');
    }

  // ---------- cada nota ----------
  for (const n of todas) {
    const { campos: c, crudos } = n;
    const esBase = n.carpeta === 'base';
    const ruta = n.ruta;
    // id
    if (!RE_ID_NOTA.test(n.id)) mal(ruta, n.id, 'id.forma', 'id fuera del patrón de la app');
    if (esBase) {
      const def = C.FICHEROS_BASE[n.fichero];
      if (def && !def.re.test(n.id)) mal(ruta, n.id, 'id.bloque', `id fuera del bloque de ${n.fichero}`);
    } else {
      const f = n.fichero.replace(/\.md$/, '');
      const re = new RegExp(`^MR-${f.slice(2, 4)}${f.slice(5, 7)}${f.slice(8, 10)}-(0[1-9]|[1-9]\\d)$`);
      if (!re.test(n.id)) mal(ruta, n.id, 'id.bloque', `en ${n.fichero} los ids son MR-${f.slice(2, 4)}${f.slice(5, 7)}${f.slice(8, 10)}-NN (01–99)`);
    }
    if (/[\r\n]/.test(n.titulo) || n.titulo.trim().length < 8) mal(ruta, n.id, 'titulo', 'título vacío o demasiado corto');
    // campos: presencia, orden y valores
    const orden = esBase ? C.ORDEN_BASE : C.ORDEN_MUNDO;
    for (const k of C.OBLIGATORIOS) if (c[k] === undefined) mal(ruta, n.id, 'campos.falta', `falta «${k}:» o su valor no es válido`);
    for (const k of n.claves) if (!orden.includes(k)) mal(ruta, n.id, 'campos.prohibido', `«${k}:» no va en ${esBase ? 'la Base' : 'Mundo'} de la semilla`);
    const pos = n.claves.filter((k) => orden.includes(k)).map((k) => orden.indexOf(k));
    if (pos.some((p, i) => i && p < pos[i - 1])) mal(ruta, n.id, 'campos.orden', `orden esperado: ${orden.filter((k) => n.claves.includes(k)).join(', ')}`);
    if (new Set(n.claves).size !== n.claves.length) mal(ruta, n.id, 'campos.repetido', 'una clave aparece dos veces');
    if (c.editada !== false) mal(ruta, n.id, 'campos.editada', '«editada: no»');
    if (c.fuente !== n.carpeta) mal(ruta, n.id, 'campos.fuente', `«fuente: ${n.carpeta}»`);
    if (esBase && c.tipo && !['hecho', 'dato', 'consenso'].includes(c.tipo)) mal(ruta, n.id, 'tipo.base', `la Base solo admite hecho, dato y consenso (tiene ${c.tipo})`);
    // fecha
    if (c.fecha && c.fecha > hoy) mal(ruta, n.id, 'fecha.futura', `fecha ${c.fecha} posterior a hoy`);
    if (!esBase && c.fecha && c.fecha !== n.fichero.replace(/\.md$/, '')) mal(ruta, n.id, 'fecha.mundo', 'la fecha de la nota debe ser la del fichero');
    if (esBase && n.fichero === 'historia.md' && c.fecha) {
      const aa = n.id.slice(3, 5);
      if (c.fecha.slice(2, 4) !== aa) mal(ruta, n.id, 'fecha.historia', `la nota es del año 20${aa} y su fecha es ${c.fecha}`, 'aviso');
    }
    // temas
    const temas = c.temas ?? [];
    if (temas.length < 1 || temas.length > C.TEMAS_MAX) mal(ruta, n.id, 'temas.numero', `entre 1 y ${C.TEMAS_MAX} temas (tiene ${temas.length})`);
    const fuera = temas.filter((t) => !C.TEMAS.has(t));
    if (fuera.length) mal(ruta, n.id, 'temas.taxonomia', `fuera de la taxonomía: ${fuera.join(', ')}`);
    if (new Set(temas).size !== temas.length) mal(ruta, n.id, 'temas.repetido', 'un tema repetido');
    if (esBase && n.fichero === 'historia.md' && !temas.includes('historia-anual')) mal(ruta, n.id, 'temas.historia', 'la historia anual lleva el tema «historia-anual»');
    if (esBase && temas.some((t) => ['retrospectivo', 'resumen-mensual', 'resumen-anual'].includes(t))) mal(ruta, n.id, 'temas.base', 'retrospectivo y resúmenes son temas de Mundo');
    if (!esBase && !temas.includes('retrospectivo')) mal(ruta, n.id, 'temas.retrospectivo', 'toda nota MR- lleva el tema «retrospectivo»');
    // texto
    if (n.lineasTexto < C.LINEAS_MIN || n.lineasTexto > C.LINEAS_MAX) mal(ruta, n.id, 'texto.lineas', `de ${C.LINEAS_MIN} a ${C.LINEAS_MAX} líneas de texto (tiene ${n.lineasTexto})`);
    if (/^#{1,6}\s/m.test(n.cuerpo)) mal(ruta, n.id, 'texto.formato', 'el texto no puede tener líneas de título');
    const inj = senalesInyeccion(`${n.titulo}\n${n.cuerpo}\n${c.origen ?? ''}`);
    if (inj.length) mal(ruta, n.id, 'seguridad.inyeccion', `texto que parece una orden: ${corto(inj[0])}`);
    // vocabulario
    const plano = normalizar(`${n.titulo} ${n.cuerpo}`);
    for (const [re, que] of C.VOCABULARIO) {
      const m = re.exec(plano);
      // «no está garantizada», «sin rentabilidad garantizada»: negarlo es justo lo contrario de prometerlo
      if (m && que.includes('garantizado') && C.RE_NEGACION.test(m[0] + ' ' + plano.slice(Math.max(0, m.index - 25), m.index))) continue;
      if (m) mal(ruta, n.id, 'vocabulario', `${que}: «…${corto(plano.slice(Math.max(0, m.index - 30), m.index + 40), 12)}…»`);
    }
    for (const [re, que] of C.VOCABULARIO_AVISO) if (re.test(plano)) mal(ruta, n.id, 'vocabulario.revisar', `${que}: revisar que no recomiende`, 'aviso');
    // origen
    const partes = partesOrigen(crudos.origen ?? c.origen);
    if (!c.origen) mal(ruta, n.id, 'origen.formato', 'falta «origen»');
    else
      for (const p of partes) {
        if (!p.ok) {
          mal(ruta, n.id, 'origen.formato', `«Medio · apartado · URL (consultado AAAA-MM-DD)»: ${corto(p.texto)}`);
          continue;
        }
        if (!p.url.startsWith('https://')) mal(ruta, n.id, 'origen.https', `URL sin https: ${p.url}`);
        const m = revisarUrl(p.url, lista);
        // la guardia también rechaza rutas largas legítimas («trozo largo aleatorio»): regla aparte, porque se
        // arregla en la guardia (decisión del usuario), no en la nota
        if (m && p.url.startsWith('https://')) mal(ruta, n.id, m.includes('trozo largo') ? 'origen.guardia-url' : 'origen.dominio', m.includes('trozo largo') ? `la guardia no deja abrir esta URL (trozo largo): ${new URL(p.url).hostname}` : m.split('. Si es')[0]);
        if (!esFecha(p.consultado)) mal(ruta, n.id, 'origen.consultado', `fecha de consulta no válida: ${p.consultado}`);
        else if (p.consultado > hoy) mal(ruta, n.id, 'origen.consultado', `consulta en el futuro: ${p.consultado}`);
        else if (esBase && c.fecha && c.fecha > p.consultado) mal(ruta, n.id, 'origen.consultado', `la fecha de la nota (${c.fecha}) es posterior a la consulta`);
      }
    // normativa
    const normativa = temas.some((t) => C.TEMAS_NORMATIVA.has(t)) || temas.some((t) => /fiscal|impuesto|irpf/.test(t)) || c.verificar !== undefined || C.RE_TEXTO_NORMATIVA.test(n.cuerpo);
    if (esBase && normativa) {
      if (!c.verificar) mal(ruta, n.id, 'normativa.verificar', 'normativa sin «verificar: AAAA»');
      else {
        if (c.verificar < +hoy.slice(0, 4)) mal(ruta, n.id, 'normativa.verificar', `verificada para ${c.verificar}: hay que reverificarla`);
        if (c.caduca !== `${c.verificar}-12-31`) mal(ruta, n.id, 'normativa.caduca', `normativa: «caduca: ${c.verificar}-12-31»${c.caduca ? ` (tiene ${c.caduca})` : ''}`);
      }
      if (!C.RE_BOE.test(`${n.cuerpo} ${c.origen ?? ''}`)) mal(ruta, n.id, 'normativa.boe', 'normativa sin la norma «BOE-A-…»');
    }
    if (esBase && !normativa && C.RE_TEXTO_REGULACION.test(`${n.titulo} ${n.cuerpo}`)) mal(ruta, n.id, 'normativa.revisar', 'cita normas sin «verificar»: decidir si es normativa', 'aviso');
    if (esBase && !normativa && c.caduca) mal(ruta, n.id, 'caduca.base', 'en la Base solo la normativa lleva «caduca»');
    // Mundo
    if (!esBase) {
      const resumen = temas.includes('resumen-mensual') || temas.includes('resumen-anual');
      if (c.fecha && c.tipo) {
        const esperado = sumarDias(c.fecha, resumen ? C.CADUCA_RESUMEN : C.CADUCA_DIAS[c.tipo]);
        if (c.caduca !== esperado) mal(ruta, n.id, 'caduca.tipo', `«caduca: ${esperado}» (${resumen ? 'resumen' : c.tipo})${c.caduca ? `, tiene ${c.caduca}` : ''}`);
      }
      if (temas.includes('resumen-mensual') && c.fecha && c.fecha !== ultimoDia(c.fecha.slice(0, 7))) mal(ruta, n.id, 'resumen.fecha', 'el resumen mensual se fecha el último día del mes');
      if (temas.includes('resumen-anual') && c.fecha && c.fecha.slice(5) !== '12-31') mal(ruta, n.id, 'resumen.fecha', 'el resumen anual se fecha el 31 de diciembre');
      if (crudos.efectos !== undefined && c.efectos === undefined) mal(ruta, n.id, 'efectos', '«efectos» mal escrito (sector:▲, sector:▼, sector:•)');
      const sec = Object.keys(c.efectos ?? {}).filter((s) => !C.SECTORES.has(s));
      if (sec.length) mal(ruta, n.id, 'efectos', `sectores fuera de la lista: ${sec.join(', ')}`);
      const u = urlDe(c.origen);
      if (!c.hash) mal(ruta, n.id, 'hash', 'falta «hash»');
      else if (u && c.hash !== cortoUrl(u)) mal(ruta, n.id, 'hash', `el hash de la URL es ${cortoUrl(u)}`);
    } else if (c.hash || c.postura || c.efectos) mal(ruta, n.id, 'campos.prohibido', 'la Base no lleva hash, postura ni efectos');

    // ---------- evidencias, copia, cifras y retrospectiva ----------
    const ev = evid.get(n.id) ?? [];
    if (!ev.length) {
      mal(ruta, n.id, 'evidencias.falta', 'sin evidencias (pasadas 1 y 2)');
      continue;
    }
    const urlsOrigen = partes.filter((p) => p.ok).map((p) => p.url);
    for (const u of urlsOrigen) if (!ev.some((e) => e.url === u)) mal(ruta, n.id, 'evidencias.url', `fuente de «origen» sin evidencia: ${u}`);
    const textos = [];
    let sinCache = false;
    for (const e of ev) {
      const faltan = CAMPOS_EVIDENCIA.filter((k) => !(k in e));
      if (faltan.length) mal(ruta, n.id, 'evidencias.campos', `${e._donde}: faltan ${faltan.join(', ')}`);
      if (!urlsOrigen.includes(e.url)) mal(ruta, n.id, 'evidencias.url', `${e._donde}: URL que no está en «origen»`);
      if (!Array.isArray(e.cifras)) mal(ruta, n.id, 'evidencias.campos', `${e._donde}: «cifras» debe ser una lista`);
      if (!veredictoOk(e.p1)) mal(ruta, n.id, 'evidencias.p1', `${e._donde}: pasada 1 no confirmada`);
      if (!veredictoOk(e.p2)) mal(ruta, n.id, 'evidencias.p2', `${e._donde}: pasada 2 no confirmada`);
      if (e.p1?.por && e.p2?.por && e.p1.por === e.p2.por) mal(ruta, n.id, 'evidencias.p2', `${e._donde}: la pasada 2 la hace un verificador distinto del autor`);
      if (!esFecha(e.consultada)) mal(ruta, n.id, 'evidencias.campos', `${e._donde}: «consultada» no válida`);
      if (e.publicada !== null && !esFecha(e.publicada)) mal(ruta, n.id, 'evidencias.campos', `${e._donde}: «publicada» no válida`);
      if (!esBase) {
        if (!esFecha(e.publicada)) mal(ruta, n.id, 'retro.d1', `${e._donde}: en retrospectiva la fecha de publicación es obligatoria`);
        else if (c.fecha && e.publicada > sumarDias(c.fecha, 1)) mal(ruta, n.id, 'retro.d1', `${e._donde}: fuente publicada el ${e.publicada}, después de D+1`);
      }
      if (e.pagina === null && SIN_CACHE) {
        // entorno sin descargas (INCIDENCIAS 2026-11-08): la copia y las cifras las confirma el verificador, nota a nota
        if (e.p2?.cifras !== 'confirmadas' || e.p2?.parafrasis !== 'correcta') mal(ruta, n.id, 'evidencias.sin-cache', `${e._donde}: sin caché, la pasada 2 debe confirmar «cifras» y «parafrasis»`);
        else sinCache = true;
      } else if (!enCache(e.pagina, paginas)) mal(ruta, n.id, 'evidencias.cache', `${e._donde}: la página no está en la caché`);
      else textos.push(textoCache(e.pagina, paginas) ?? '');
      for (const x of e.cifras ?? []) if (typeof x !== 'string' || !x.trim()) mal(ruta, n.id, 'evidencias.campos', `${e._donde}: cifra vacía`);
    }
    const textoNota = `${n.titulo}\n${n.cuerpo}`;
    if (!textos.length && sinCache) {
      mal(ruta, n.id, 'copia.por-agente', 'copia y cifras comprobadas por el verificador (sin caché)', 'aviso');
      continue;
    }
    if (!textos.length) {
      mal(ruta, n.id, 'copia.sin-cache', 'no se puede comprobar la copia: ninguna fuente en caché');
      mal(ruta, n.id, 'cifras.sin-cache', 'no se pueden comprobar las cifras: ninguna fuente en caché');
      continue;
    }
    for (const t of textos) {
      const frag = copiaEn(n.cuerpo, t);
      if (frag) {
        mal(ruta, n.id, 'copia', `8+ palabras seguidas iguales a la fuente: «${frag}»`);
        break;
      }
    }
    const faltan = cifrasAusentes(textoNota, textos);
    if (faltan.length) mal(ruta, n.id, 'cifras', `números que no están en sus fuentes: ${faltan.slice(0, 8).join(', ')}`);
  }

  const errores = fallos.filter((f) => f.nivel === 'error');
  const porRegla = {};
  for (const f of fallos) porRegla[`${f.nivel === 'error' ? '✗' : '⚠'} ${f.regla}`] = (porRegla[`${f.nivel === 'error' ? '✗' : '⚠'} ${f.regla}`] ?? 0) + 1;
  const notasInformadas = todas.filter((n) => informar(n.ruta));
  const conError = new Set(errores.map((f) => f.nota).filter(Boolean));
  return {
    fallos,
    resumen: {
      hoy,
      ficheros: ficheros.filter((f) => informar(f.ruta)).length,
      notas: notasInformadas.length,
      notas_sin_errores: notasInformadas.filter((n) => !conError.has(n.id)).length,
      errores: errores.length,
      avisos: fallos.length - errores.length,
      por_regla: Object.fromEntries(Object.entries(porRegla).sort((a, b) => b[1] - a[1])),
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const val = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const solo = val('--solo')?.split(',') ?? null;
  if (args.includes('--sin-cache')) fijarSinCache(true);
  const hoy = val('--hoy') ?? undefined;
  const r = validar({ solo, hoy });
  const salida = val('--json');
  if (salida) {
    const destino = resolve(RAIZ, salida);
    if (!(destino.startsWith(join(RAIZ, '.cache') + '/') || destino.startsWith('/tmp/'))) {
      process.stderr.write('--json solo escribe en .cache/ o /tmp/\n');
      process.exit(2);
    }
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, JSON.stringify(r, null, 1));
  }
  const { resumen: s } = r;
  console.log(`Validador provisional · ${s.hoy} · ${s.ficheros} ficheros · ${s.notas} notas · ${s.notas_sin_errores} sin errores · ${s.errores} errores · ${s.avisos} avisos`);
  for (const [k, v] of Object.entries(s.por_regla)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  process.exit(s.errores ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
