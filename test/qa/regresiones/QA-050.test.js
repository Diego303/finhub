// QA-050: reabrir un mes borraba su lección junto con la foto; pasados los 10 s del deshacer ya no se podía recuperar (§1.6 y
// «nada se borra sin deshacer o papelera»). También borraba lo que hubieras escrito a mano en esa sección.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { leer } from '../../../src/core/formato/index.js';
import { valores, cabeceras, serializar } from '../../../src/core/formato/motor.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

function mundo() {
  const fs = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
  const op = (n, a) => {
    const r = aplicarOp((x) => fs.get(x) ?? null, n, a, { ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng: crearPrng(9), hoy: '2026-11-03', rutas: [...fs.keys()] });
    for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
  };
  return { fs, op };
}
const R = 'mes/2026-11.md';
const cierre = (m) => valores(leer(R, m.fs.get(R)), 'Cierre');

test('reabrir conserva la lección y quita la foto; volver a cerrar la mantiene, salvo que la cambies o la vacíes', () => {
  const m = mundo();
  m.op('mes.cerrar', { mes: '2026-11', leccion: 'menos cenas fuera' });
  m.op('mes.reabrir', { mes: '2026-11' });
  const c = cierre(m);
  assert.equal(c.leccion, 'menos cenas fuera');
  for (const k of ['saldos', 'cartera', 'patrimonio', 'fecha']) assert.equal(c[k], undefined, k);
  assert.equal(cabeceras(leer(R, m.fs.get(R))).estado.estado, 'reabierto');
  assert.deepEqual(leer(R, m.fs.get(R)).avisos.filter((a) => a.nivel === 'error'), []);
  assert.equal(serializar(leer(R, m.fs.get(R))), m.fs.get(R), 'canónico');
  m.op('mes.cerrar', { mes: '2026-11' });
  assert.equal(cierre(m).leccion, 'menos cenas fuera', 'sin decir nada, se mantiene');
  assert.ok(cierre(m).saldos, 'con foto nueva');
  m.op('mes.reabrir', { mes: '2026-11' });
  m.op('mes.cerrar', { mes: '2026-11', leccion: 'otra' });
  assert.equal(cierre(m).leccion, 'otra');
  m.op('mes.reabrir', { mes: '2026-11' });
  m.op('mes.cerrar', { mes: '2026-11', leccion: '' });
  assert.equal(cierre(m).leccion ?? '', '', 'la puedes vaciar');
});

test('sin lección, reabrir quita la sección; lo escrito a mano en ella se queda', () => {
  const m = mundo();
  m.op('mes.cerrar', { mes: '2026-11' });
  m.op('mes.reabrir', { mes: '2026-11' });
  assert.ok(!leer(R, m.fs.get(R)).secciones.some((s) => s.nombre === 'Cierre'));
  m.op('mes.cerrar', { mes: '2026-11' });
  m.fs.set(R, `${m.fs.get(R).trimEnd()}\nnota escrita a mano\n`);
  m.op('mes.reabrir', { mes: '2026-11' });
  assert.match(m.fs.get(R), /nota escrita a mano/);
});
