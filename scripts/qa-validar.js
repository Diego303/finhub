#!/usr/bin/env node
// QA9 · Valida una carpeta de datos sin tocarla: la COPIA a un temporal y trabaja solo sobre la copia. Nunca escribe en la
// original (lo comprueba al final, por hash). No lee ~/.config/finhub/config.json: la ruta se da siempre a mano.
// Uso: pnpm qa:validar -- --datos <ruta> [--json]
// Informa: ficheros que no se pueden leer o solo en la nube, ida y vuelta, líneas no reconocidas, ids huérfanos, conflictos de
// sincronización, saldos que no cuadran con los cierres, operaciones sin valor y notas caducadas.
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { aRutaWsl } from '../src/server/rutas.js';
import { Almacen } from '../src/server/almacen.js';
import { leer, detectar } from '../src/core/formato/index.js';
import { serializar, cabeceras, valores } from '../src/core/formato/motor.js';
import { construirModelo } from '../src/core/modelo.js';
import { indiceNotas, caducada } from '../src/core/conocimiento.js';
import { fotoCierre } from '../src/core/patrimonio.js';
import { formatearImporte } from '../src/core/dinero.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Lista {rel: {tam, mtimeMs, hash | error}} de la carpeta, sin seguir enlaces y sin .finhub/. Solo lee. */
async function inventario(raiz) {
  const out = new Map();
  const visitar = async (abs, rel) => {
    for (const e of await fsp.readdir(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (r !== '.finhub') await visitar(join(abs, e.name), r);
      } else if (e.isFile()) {
        const st = await fsp.stat(join(abs, e.name));
        let hash = null;
        let error = null;
        try {
          hash = sha(await fsp.readFile(join(abs, e.name)));
        } catch (err) {
          error = err.code ?? err.message;
        }
        out.set(r, { tam: st.size, mtimeMs: st.mtimeMs, hash, error });
      }
    }
  };
  await visitar(raiz, '');
  return out;
}

export async function validar(original) {
  const inv = await inventario(original);
  const copia = await fsp.mkdtemp(join(tmpdir(), 'finhub-qa-validar-'));
  const informe = { carpeta: original, ficheros: inv.size, sinLeer: [], idaYVuelta: [], lineas: [], huerfanos: [], conflictos: [], cierres: [], sinValor: [], caducadas: [], originalIntacta: null };
  try {
    for (const [rel, f] of inv) {
      if (f.error || (f.tam === 0 && detectar(rel))) {
        informe.sinLeer.push({ ruta: rel, motivo: f.error ?? '0 bytes: solo en la nube o vacío' });
        if (f.error) continue;
      }
      const destino = join(copia, rel);
      await fsp.mkdir(join(destino, '..'), { recursive: true });
      await fsp.copyFile(join(original, rel), destino);
    }
    const a = await new Almacen({ raiz: copia, reintentos: [] }).cargar({ limpiar: false });
    informe.conflictos = a.otros.conflictos.map((c) => ({ ruta: c.ruta, base: c.base, patron: c.patron }));
    const ficheros = {};
    for (const e of a.textos()) {
      if (!e.legible) continue;
      ficheros[e.ruta] = { texto: e.texto, version: e.version };
      const doc = leer(e.ruta, e.texto);
      const s1 = serializar(doc);
      const s2 = serializar(leer(e.ruta, s1));
      if (s1 !== s2) informe.idaYVuelta.push({ ruta: e.ruta, problema: 'serializar no es estable' });
      else if (s1 !== e.texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').normalize('NFC')) informe.idaYVuelta.push({ ruta: e.ruta, problema: 'no es canónico: se normalizará al guardarlo' });
      for (const x of doc.avisos) informe.lineas.push({ ruta: e.ruta, linea: x.linea, nivel: x.nivel, mensaje: x.mensaje });
    }
    const M = construirModelo(ficheros);
    const hoy = new Date().toISOString().slice(0, 10);
    const G = new Set(M.grupos.map((g) => g.id));
    const C = new Set(M.cuentas.map((c) => c.id));
    const movs = M.meses.flatMap((m) => M.mes(m).movimientos.map((x) => ({ ...x, mesFichero: m })));
    for (const m of movs) {
      if (m.grupo && !G.has(m.grupo)) informe.huerfanos.push({ que: 'grupo', id: m.grupo, en: `mes/${m.mesFichero}.md · ${m.id}` });
      for (const k of ['cuenta', 'a']) if (m[k] && !C.has(m[k])) informe.huerfanos.push({ que: 'cuenta', id: m[k], en: `mes/${m.mesFichero}.md · ${m.id}` });
    }
    const A = new Set(M.activos.map((x) => x.id));
    for (const o of M.operaciones) for (const id of [o.activo?.activo, o.activo?.origen, o.activo?.destino].filter(Boolean)) if (!A.has(id)) informe.huerfanos.push({ que: 'activo', id, en: `cartera/operaciones.md · ${o.id}` });
    for (const f of M.fotos) for (const fila of f.filas) if (!A.has(fila.activo)) informe.huerfanos.push({ que: 'activo', id: fila.activo, en: `cartera/valores/${f.fecha}.md` });
    // saldos que no cuadran con los cierres
    for (const mes of M.meses) {
      const ruta = `mes/${mes}.md`;
      if (!ficheros[ruta]) continue;
      const doc = leer(ruta, ficheros[ruta].texto);
      if (cabeceras(doc).estado?.estado !== 'cerrado') continue;
      const guardado = valores(doc, 'Cierre');
      const hasta = cabeceras(doc).periodo?.hasta ?? guardado.fecha;
      if (!hasta || !guardado.saldos) continue;
      const foto = fotoCierre({ cuentas: M.cuentas, movimientos: movs, fotos: M.fotos, hasta, activos: M.activos, operaciones: M.operaciones });
      const dif = [];
      const porId = (v) => (Array.isArray(v) ? Object.fromEntries(v.map((x) => [x.cuenta ?? x.id, x.importe ?? x.valor])) : v ?? {});
      const a1 = porId(guardado.saldos);
      const b1 = porId(foto.saldos);
      for (const id of new Set([...Object.keys(a1), ...Object.keys(b1)])) if (a1[id] !== b1[id]) dif.push(`${id}: guardado ${a1[id] === undefined ? '—' : formatearImporte(a1[id])}, calculado ${b1[id] === undefined ? '—' : formatearImporte(b1[id])}`);
      if (dif.length) informe.cierres.push({ mes, diferencias: dif });
    }
    // operaciones sin valor
    const conFoto = new Set(M.fotos.flatMap((f) => f.filas.map((x) => x.activo)));
    for (const id of new Set(M.operaciones.flatMap((o) => [o.activo?.activo, o.activo?.destino].filter(Boolean)))) if (!conFoto.has(id)) informe.sinValor.push(id);
    // notas caducadas
    for (const n of indiceNotas(M)) if (caducada(n, hoy, M.fuentes, M.familias)) informe.caducadas.push({ id: n.id, ruta: n.ruta, fuente: n.fuente });
  } finally {
    if (!copia.startsWith(join(tmpdir(), 'finhub-qa-validar-'))) throw new Error(`no es la copia de la validación: ${copia}`);
    await fsp.rm(copia, { recursive: true, force: true });
  }
  // la original, exactamente igual
  const despues = await inventario(original);
  const cambios = [...new Set([...inv.keys(), ...despues.keys()])].filter((r) => inv.get(r)?.hash !== despues.get(r)?.hash || inv.get(r)?.mtimeMs !== despues.get(r)?.mtimeMs);
  informe.originalIntacta = cambios.length === 0;
  informe.cambiosDuranteLaValidacion = cambios;
  return informe;
}

function imprimir(r) {
  const n = (t, l) => console.log(`${l.length ? '⚠' : '✓'} ${t}: ${l.length}`);
  console.log(`Carpeta: ${r.carpeta} · ${r.ficheros} ficheros (trabajando solo sobre una copia temporal)`);
  n('sin poder leer o solo en la nube', r.sinLeer);
  for (const x of r.sinLeer.slice(0, 50)) console.log(`   ${x.ruta}: ${x.motivo}`);
  n('conflictos de sincronización', r.conflictos);
  for (const x of r.conflictos.slice(0, 50)) console.log(`   ${x.ruta} → ${x.base}`);
  n('ida y vuelta', r.idaYVuelta);
  for (const x of r.idaYVuelta.slice(0, 50)) console.log(`   ${x.ruta}: ${x.problema}`);
  n('líneas no reconocidas o con aviso', r.lineas);
  for (const x of r.lineas.slice(0, 100)) console.log(`   ${x.ruta}:${x.linea} [${x.nivel}] ${x.mensaje}`);
  n('ids huérfanos', r.huerfanos);
  for (const x of r.huerfanos.slice(0, 100)) console.log(`   ${x.que} «${x.id}» en ${x.en}`);
  n('cierres que no cuadran', r.cierres);
  for (const x of r.cierres) console.log(`   ${x.mes}: ${x.diferencias.join(' · ')}`);
  n('activos con operaciones y sin valor', r.sinValor);
  if (r.sinValor.length) console.log(`   ${r.sinValor.join(', ')}`);
  n('notas caducadas', r.caducadas);
  console.log(r.originalIntacta ? '✓ la carpeta original no ha cambiado (comprobado por hash y fecha)' : `✗ la carpeta original cambió durante la validación: ${r.cambiosDuranteLaValidacion.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { datos: { type: 'string' }, json: { type: 'boolean' } }, allowPositionals: true });
  if (!values.datos) {
    console.error('Uso: pnpm qa:validar -- --datos <ruta de una carpeta de datos>');
    process.exit(2);
  }
  const ruta = aRutaWsl(values.datos);
  const st = await fsp.stat(ruta).catch(() => null);
  if (!st?.isDirectory()) {
    console.error(`no es una carpeta: ${ruta}`);
    process.exit(2);
  }
  const r = await validar(ruta);
  if (values.json) console.log(JSON.stringify(r, null, 1));
  else imprimir(r);
  process.exit(r.originalIntacta ? 0 : 1);
}
