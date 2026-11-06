// QA-031: una operación con argumentos de otro tipo reventaba con TypeError/RangeError: la web veía «Error interno
// del servidor» (500) en vez de un error claro de datos no válidos. Nada se escribía, pero el error no decía nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp, operaciones } from '../../../src/core/ops/index.js';
import { ErrorAlmacen } from '../../../src/server/almacen.js';
import { generar } from '../../../scripts/generar-ejemplo.js';

const BASE = generar();

test('argumentos de otro tipo → ErrorOp «invalida» con el nombre de la operación, sin detalles internos', () => {
  for (const [op, args] of [['rec.confirmarTodos', {}], ['rec.confirmarTodos', { mes: [1] }], ['objetivo.fijar', { pesos: -1 }]]) {
    assert.throws(() => aplicarOp((r) => BASE.get(r) ?? null, op, args, { rutas: [...BASE.keys()] }), (e) => e instanceof ErrorOp && e.codigo === 'invalida' && e.message.includes(op) && !/filter|undefined|function/.test(e.message), op);
  }
  assert.ok(operaciones().length > 50);
});

test('un fichero que no se puede leer sigue siendo su propio error (503), no «datos no válidos»', () => {
  const leer = () => {
    throw new ErrorAlmacen('nube', 'solo en la nube');
  };
  assert.throws(() => aplicarOp(leer, 'hito.crear', { fecha: '2026-11-06', texto: 'x' }, { rutas: [] }), (e) => e instanceof ErrorAlmacen);
});
