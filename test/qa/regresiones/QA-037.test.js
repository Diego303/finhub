// QA-037: §2.6 pide el aviso «⚠ Conflicto en mes/2026-11.md» en Pendientes y en Ajustes; en Pendientes no salía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendientes } from '../../../src/core/resumen.js';
import { construirModelo } from '../../../src/core/modelo.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

test('un conflicto aparece en Pendientes y lleva a resolverlo; sin conflictos, no', () => {
  const m = construirModelo(Object.fromEntries([...generar()].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
  const ahora = { fecha: '2026-11-03', hora: '10:00' };
  const sin = pendientes(m, ahora);
  assert.ok(!sin.elementos.some((e) => e.id.startsWith('conflicto')));
  const con = pendientes(m, ahora, { conflictos: [{ ruta: 'mes/2026-11-PORTATIL.md', base: 'mes/2026-11.md' }] });
  const e = con.elementos.find((x) => x.id.startsWith('conflicto'));
  assert.equal(e.titulo, '⚠ Conflicto en mes/2026-11.md');
  assert.equal(e.hecho, false);
  assert.deepEqual(e.accion, { texto: 'Resolver', destino: 'conflictos' });
  assert.equal(con.total, sin.total, 'no cuenta en el x/4');
  assert.equal(con.elementos[0], e, 'lo primero');
});
