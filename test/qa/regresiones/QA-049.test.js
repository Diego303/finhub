// QA-049 (R1): quitar «privada» a una fuente con notas, o sacarla de la familia «mias», las hacía públicas de golpe: la misma
// fuga que QA-018 por otro camino, hacia los trabajos con internet. Con notas dentro, se rechaza; vacía, se puede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { leer } from '../../../src/core/formato/index.js';
import { items } from '../../../src/core/formato/motor.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

function mundo() {
  const fs = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
  const op = (n, a) => {
    const r = aplicarOp((x) => fs.get(x) ?? null, n, a, { ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng: crearPrng(9), hoy: '2026-11-03', rutas: [...fs.keys()] });
    for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
    return r;
  };
  return { fs, op };
}
const R = 'conocimiento/_fuentes.md';

test('con notas dentro no deja de ser privada; sin notas, sí; y hacerla privada siempre se puede', () => {
  const m = mundo();
  const familia = items(leer('conocimiento/_familias.md', m.fs.get('conocimiento/_familias.md')))[0].id;
  const { id } = m.op('fuente.crear', { nombre: 'Mi diario', familia, privada: true }).resultado;
  m.op('lista.editar', { ruta: R, clave: id, cambios: { privada: null } });
  assert.ok(!items(leer(R, m.fs.get(R))).find((f) => f.id === id).privada, 'vacía: sí');
  m.op('lista.editar', { ruta: R, clave: id, cambios: { privada: true } });
  m.op('nota.crear', { fuente: id, titulo: 'Algo mío', fecha: '2026-11-03', campos: { tipo: 'hecho' }, cuerpo: 'Secreto' });
  const antes = [...m.fs];
  for (const cambios of [{ privada: null }, { privada: false }]) assert.throws(() => m.op('lista.editar', { ruta: R, clave: id, cambios }), (e) => e instanceof ErrorOp && /R1/.test(e.message));
  assert.deepEqual([...m.fs], antes);
  m.op('lista.editar', { ruta: R, clave: id, cambios: { nombre: 'Otro nombre' } });
  assert.ok(items(leer(R, m.fs.get(R))).find((f) => f.id === id).privada, 'renombrar no le quita nada');
});

test('tampoco saliendo de la familia «mias»', () => {
  const m = mundo();
  const otra = items(leer('conocimiento/_familias.md', m.fs.get('conocimiento/_familias.md'))).find((f) => f.id !== 'mias').id;
  // escrita a mano, sin «privada»: solo la familia la hace privada
  const id = 'en-mias';
  m.fs.set(R, `${m.fs.get(R).trimEnd()}\n- ${id} | En mias | familia: mias | prefijo: EMX\n`);
  m.fs.set(`conocimiento/${id}/2026-11-03-x.md`, '# Notas\nesquema: 1\n## EMX-0001 · Algo mío\n- tipo: hecho\n- fecha: 2026-11-03\n\nSecreto\n');
  assert.throws(() => m.op('lista.editar', { ruta: R, clave: id, cambios: { familia: otra } }), (e) => e instanceof ErrorOp && /R1/.test(e.message));
});
