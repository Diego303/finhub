// QA-033 (cifras): «Editar recurrente → también este mes» sobre un mes cerrado cambiaba el movimiento sin pedir
// confirmación, sin marcar «editado tras cierre» y sin recalcular: el cierre dejaba de cuadrar con sus movimientos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { leer } from '../../../src/core/formato/index.js';
import { items, valores } from '../../../src/core/formato/motor.js';
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

test('también este mes, con el mes cerrado: pide confirmación; al confirmar marca y recalcula', () => {
  const m = mundo();
  const r0 = items(leer('recurrentes.md', m.fs.get('recurrentes.md'))).find((r) => r.cada === 'mes');
  m.op('rec.confirmar', { mes: '2026-12', rec: r0.id });
  m.op('mes.cerrar', { mes: '2026-12' });
  const ruta = 'mes/2026-12.md';
  const foto = valores(leer(ruta, m.fs.get(ruta)), 'Cierre').saldos;
  const antes = [...m.fs];
  const args = { id: r0.id, cambios: { importe: r0.importe - 999 }, aplicar: 'esteMes', mes: '2026-12' };
  assert.throws(() => m.op('rec.editar', args), (e) => e instanceof ErrorOp && e.codigo === 'mes_cerrado' && e.mes === '2026-12');
  assert.deepEqual([...m.fs], antes);
  m.op('rec.editar', { ...args, confirmarCerrado: true });
  const d = leer(ruta, m.fs.get(ruta));
  assert.equal(items(d, 'Movimientos').find((x) => x.rec === r0.id).importe, r0.importe - 999);
  assert.equal(valores(d, 'Cierre').editado_tras_cierre, true);
  assert.notDeepEqual(valores(d, 'Cierre').saldos, foto);
});

test('«desde el mes que viene» no toca nada cerrado y no pregunta', () => {
  const m = mundo();
  const r0 = items(leer('recurrentes.md', m.fs.get('recurrentes.md'))).find((r) => r.cada === 'mes');
  m.op('rec.confirmar', { mes: '2026-12', rec: r0.id });
  m.op('mes.cerrar', { mes: '2026-12' });
  const antes = m.fs.get('mes/2026-12.md');
  m.op('rec.editar', { id: r0.id, cambios: { importe: r0.importe - 999 }, aplicar: 'siguiente', mes: '2026-12' });
  assert.equal(m.fs.get('mes/2026-12.md'), antes);
});
