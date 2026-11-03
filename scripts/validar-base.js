#!/usr/bin/env node
// Valida las notas de la Base (semilla/base/*.md, §7.1): formato de finhub sin avisos, ids únicos, solo hechos,
// datos y consenso, fuente con URL, fecha, cuerpo de 2–6 líneas, «verificar: AAAA» en fiscalidad y sin
// datos personales. Uso: node scripts/validar-base.js [ficheros…]   (sin argumentos: toda semilla/base/)
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { leer } from '../src/core/formato/index.js';
import { bloques, cabeceras } from '../src/core/formato/motor.js';

const raiz = join(import.meta.dirname, '..');
const dir = join(raiz, 'semilla', 'base');

/** → {notas, errores: [texto], porFichero: {nombre: n}} */
export function validarBase(ficheros = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => join(dir, f))) {
  const errores = [];
  const ids = new Map();
  const porFichero = {};
  let notas = 0;
  for (const ruta of ficheros) {
    const nombre = basename(ruta);
    const texto = readFileSync(ruta, 'utf8');
    const doc = leer(`conocimiento/base/${nombre}`, texto);
    const e = (m) => errores.push(`${nombre}: ${m}`);
    if (!doc || doc.tipo !== 'notas') {
      e('no se reconoce como fichero de notas');
      continue;
    }
    for (const a of doc.avisos) e(`línea ${a.linea?.linea ?? a.linea ?? '?'}: ${a.mensaje}`);
    if (cabeceras(doc).fuente !== 'base') e('falta la cabecera «fuente: base»');
    if (/\b[A-Z]{2}\d{2}[\s\d]{12,}/.test(texto)) e('parece contener un IBAN');
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(texto)) e('contiene un correo electrónico');
    const bs = bloques(doc, { incluirExcluidos: true });
    porFichero[nombre] = bs.length;
    for (const b of bs) {
      notas++;
      const n = (m) => e(`${b.id}: ${m}`);
      if (!/^B-\d{4}$/.test(b.id)) n('el id debe ser B-NNNN');
      if (ids.has(b.id)) n(`id repetido (también en ${ids.get(b.id)})`);
      ids.set(b.id, nombre);
      const c = b.campos;
      if (!['hecho', 'consenso', 'dato'].includes(c.tipo)) n(`tipo «${c.tipo}»: la Base solo admite hecho, consenso o dato`);
      if (c.fuente !== 'base') n('fuente: base');
      if (!c.fecha) n('falta «fecha»');
      if (c.editada !== false) n('falta «editada: no»');
      if (!/https:\/\/\S+/.test(c.origen ?? '')) n('«origen» debe llevar el nombre de la fuente y su URL https');
      if (!c.temas?.length) n('faltan «temas»');
      const lineas = b.cuerpo.split('\n').filter((l) => l.trim());
      if (lineas.length < 1 || lineas.length > 6) n(`el cuerpo debe tener de 1 a 6 líneas (tiene ${lineas.length})`);
      const largo = b.cuerpo.length;
      if (largo < 120 || largo > 900) n(`el cuerpo debe tener entre 120 y 900 caracteres (tiene ${largo})`);
      if (/["“”]/.test(b.cuerpo)) n('sin citas textuales entre comillas: parafrasea');
      const fiscal = (c.temas ?? []).some((t) => /fiscal|impuesto|irpf|pensiones|traspaso/.test(t));
      if (fiscal && !c.verificar) n('nota de fiscalidad sin «verificar: AAAA»');
    }
  }
  return { notas, errores, porFichero };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const r = validarBase(args.length ? args.map((a) => resolve(a)) : undefined);
  for (const [f, n] of Object.entries(r.porFichero)) console.log(`${f}: ${n} notas`);
  if (r.errores.length) {
    console.error(r.errores.map((x) => `✗ ${x}`).join('\n'));
    console.error(`\n${r.errores.length} problema(s) en ${r.notas} notas`);
    process.exit(1);
  }
  console.log(`✓ ${r.notas} notas válidas`);
}
