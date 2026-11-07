// QA-063 (cifras, alto): con datos reales, el trabajo «datos» pedía solo 36 meses: la proyección remuestreaba 2024–2026, años muy buenos, y daba
// 1.050 € → 15.227 € en 20 años sin aportar. Y la prueba de crisis se quedaba sin datos. Ahora se pide todo el histórico, y si es corto, se avisa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { resumenMetas } from '../../../src/core/metas-resumen.js';
import { construirModelo } from '../../../src/core/modelo.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';
import { RAIZ } from '../entorno.js';

test('una serie nueva pide todo el histórico disponible, no 36 meses', () => {
  const t = trabajo('datos');
  const e = t.entrada(modeloDe(ficherosEjemplo()), { series: [{ id: 'x', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: null }], hoy: HOY });
  const u = e.bloques[0].contenido;
  assert.match(u, /todo el histórico/);
  assert.doesNotMatch(u, /36 meses/);
  assert.match(readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8'), /range=max/);
});

test('con menos de 10 años de histórico, la proyección lo avisa; con más, no', () => {
  const fs = ficherosEjemplo();
  const largo = resumenMetas(modeloDe(fs), HOY);
  assert.ok(!largo.proyeccion.error, largo.proyeccion.error);
  assert.ok(!(largo.avisos ?? []).some((a) => /histórico corto/.test(a)), JSON.stringify(largo.avisos));
  const corto = new Map(fs);
  for (const [r, t] of fs) {
    if (!r.startsWith('conocimiento/datos/series/')) continue;
    const l = t.split('\n');
    const filas = l.filter((x) => /^- \d{4}-\d{2} \|/.test(x));
    const quitar = new Set(filas.slice(0, Math.max(0, filas.length - 36)));
    corto.set(r, l.filter((x) => !quitar.has(x)).join('\n'));
  }
  const M = construirModelo(Object.fromEntries([...corto].map(([k, texto]) => [k, { texto, version: 'v' }])));
  const r = resumenMetas(M, HOY);
  assert.ok(!r.proyeccion.error, r.proyeccion.error);
  assert.ok(r.avisos.some((a) => /histórico corto/.test(a) && /optimista|pesimista/.test(a)), JSON.stringify(r.avisos));
});
