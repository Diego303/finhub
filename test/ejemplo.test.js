// La carpeta ejemplo/: determinista, al día con el generador, válida, sin datos personales y coherente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { generar, comprobar } from '../scripts/generar-ejemplo.js';
import { leer } from '../src/core/formato/index.js';
import { items, valores, cabeceras } from '../src/core/formato/motor.js';

const raiz = join(import.meta.dirname, '..', 'ejemplo');
const listar = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(dir, e.name)) : [join(dir, e.name)]));
const mapa = generar();

test('el generador es determinista (misma semilla, mismos bytes)', () => {
  const otro = generar();
  assert.deepEqual([...otro.keys()], [...mapa.keys()]);
  for (const [r, t] of mapa) assert.equal(otro.get(r), t, r);
});

test('ejemplo/ en disco está al día con el generador', () => {
  const enDisco = listar(raiz).map((f) => relative(raiz, f).replaceAll('\\', '/')).filter((r) => r !== '.gitkeep').sort();
  assert.deepEqual(enDisco, [...mapa.keys()].sort(), 'mismos ficheros (ejecuta node scripts/generar-ejemplo.js)');
  for (const [r, t] of mapa) assert.equal(readFileSync(join(raiz, r), 'utf8'), t, `${r} distinto`);
});

test('todos los ficheros se leen sin errores y ya están en canónico', () => {
  assert.deepEqual(comprobar(mapa), []);
  assert.ok(mapa.size >= 120);
  const tipos = new Set([...mapa.keys()].map((r) => leer(r, mapa.get(r))?.tipo).filter(Boolean));
  assert.equal(tipos.size, 31, `cubre los 31 formatos: ${[...tipos].join(', ')}`);
});

test('sin datos personales: ni el nombre del usuario, ni emails, ni IBAN; series marcadas como sintéticas', () => {
  for (const [r, t] of mapa) {
    assert.doesNotMatch(t, /diego/i, r);
    assert.doesNotMatch(t, /\bES\d{22}\b/, r);
    assert.doesNotMatch(t, /@(?!\d{4}-\d{2})[\w-]+\.\w+/, r);
    if (r.startsWith('conocimiento/datos/series/')) assert.match(t, /^sintetica: sí$/m, r);
  }
});

test('coherencia: los saldos del cierre son los del saldo inicial más los movimientos', () => {
  const cuentasDoc = leer('cuentas.md', mapa.get('cuentas.md'));
  const saldo = Object.fromEntries(items(cuentasDoc).map((c) => [c.id, c.saldo_inicial?.importe ?? 0]));
  const meses = [...mapa.keys()].filter((r) => r.startsWith('mes/')).sort();
  assert.equal(meses.length, 12);
  for (const r of meses) {
    const d = leer(r, mapa.get(r));
    for (const m of items(d, 'Movimientos')) {
      saldo[m.cuenta] += m.importe;
      if (m.a) saldo[m.a] -= m.importe;
    }
    const cierre = valores(d, 'Cierre');
    if (cabeceras(d).estado.estado === 'cerrado') {
      for (const [c, v] of Object.entries(cierre.saldos)) assert.equal(v, saldo[c], `${r}: saldo de ${c}`);
      assert.equal(cierre.patrimonio, Object.values(cierre.saldos).reduce((a, b) => a + b, 0) + cierre.cartera, `${r}: patrimonio`);
    }
  }
});

test('coherencia: cada operación con «mov:» apunta a un movimiento con su «op:», y la cartera cuadra con la foto de fin de mes', () => {
  const ops = items(leer('cartera/operaciones.md', mapa.get('cartera/operaciones.md')));
  const conMov = ops.filter((o) => o.mov);
  assert.ok(conMov.length >= 11);
  for (const o of conMov) {
    const [mes, id] = o.mov.split('/');
    const m = items(leer(`mes/${mes}.md`, mapa.get(`mes/${mes}.md`)), 'Movimientos').find((x) => x.id === id);
    assert.ok(m, `${o.id} → ${o.mov} existe`);
    assert.equal(m.op, o.id);
  }
  const fotoOct = items(leer('cartera/valores/2026-10-31.md', mapa.get('cartera/valores/2026-10-31.md')));
  const cierreOct = valores(leer('mes/2026-10.md', mapa.get('mes/2026-10.md')), 'Cierre');
  assert.equal(fotoOct.reduce((a, v) => a + v.valor, 0), cierreOct.cartera);
});
