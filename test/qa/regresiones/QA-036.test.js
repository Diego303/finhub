// QA-036 (pérdida de datos, S21): la fusión de un conflicto era por líneas: si los dos lados tenían el mismo movimiento
// (mismo id) con un cambio, la rechazaba entera en vez de deduplicar por id; §2.6 pide «unión deduplicada por id o hash».
// Ningún movimiento distinto se pierde; del que está en los dos lados se queda el tuyo y se avisa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionar, diferencias } from '../../../src/server/conflictos.js';
import { leer } from '../../../src/core/formato/index.js';
import { items, bloques } from '../../../src/core/formato/motor.js';

const CAB = '# Noviembre de 2026\nesquema: 1\nperiodo: 2026-11-01 → 2026-11-30\nestado: abierto\n## Movimientos\n';
const M = (id, c, i = '-1,00') => `- 2026-11-03 | ${c} | ${i} | ocio | cuenta: banco | id: ${id}\n`;

test('mes: movimientos distintos en los dos lados, y uno repetido: la unión, sin perder ninguno', () => {
  const tuya = `${CAB}${M('aaaa', 'Solo tuyo')}${M('cccc', 'En los dos, tu versión')}${M('dddd', 'Igual')}`;
  const otra = `${CAB}${M('bbbb', 'Solo del otro')}${M('cccc', 'En los dos, la otra', '-2,00')}${M('dddd', 'Igual')}${M('eeee', 'Otro más del otro')}`;
  const f = fusionar('mes/2026-11.md', tuya, otra);
  const movs = items(leer('mes/2026-11.md', f.texto), 'Movimientos');
  assert.deepEqual(movs.map((x) => x.id).sort(), ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee']);
  assert.equal(movs.find((x) => x.id === 'cccc').concepto, 'En los dos, tu versión');
  assert.equal(f.ignoradas.length, 1);
  assert.match(f.ignoradas[0], /En los dos, la otra/);
  assert.equal(leer('mes/2026-11.md', f.texto).avisos.filter((a) => a.nivel === 'error').length, 0);
});

test('notas: mismo id con otro título: se queda el tuyo; las distintas se unen', () => {
  const C = '# Notas\nesquema: 1\n';
  const B = (id, t, c = 'Cuerpo') => `## ${id} · ${t}\n- tipo: hecho\n- fecha: 2026-11-03\n\n${c}\n`;
  const ruta = 'conocimiento/pizarra/2026-11-03-x.md';
  const f = fusionar(ruta, `${C}${B('P-0001', 'Tu título')}${B('P-0002', 'Solo tuya')}`, `${C}${B('P-0001', 'Otro título')}${B('P-0003', 'Solo de la otra')}`);
  const bs = bloques(leer(ruta, f.texto));
  assert.deepEqual(bs.map((b) => b.id).sort(), ['P-0001', 'P-0002', 'P-0003']);
  assert.equal(bs.find((b) => b.id === 'P-0001').titulo, 'Tu título');
  assert.ok(f.ignoradas.some((l) => /Otro título/.test(l)));
});

test('catálogo: la misma cuenta, renombrada en un lado: se queda la tuya; la otra se avisa', () => {
  const C = '# Cuentas\nesquema: 1\n';
  const f = fusionar('cuentas.md', `${C}- banco | Banco | tipo: corriente\n`, `${C}- banco | Banco nuevo | tipo: corriente\n- caja | Caja | tipo: efectivo\n`);
  assert.deepEqual(items(leer('cuentas.md', f.texto)).map((c) => c.nombre), ['Banco', 'Caja']);
  assert.match(f.ignoradas.join(), /Banco nuevo/);
});

test('las diferencias se dan por entidad', () => {
  assert.equal(diferencias(`${CAB}${M('aaaa', 'x')}`, `${CAB}${M('aaaa', 'x')}${M('bbbb', 'y')}`)[0].soloOtra.length, 1);
});
