// QA-064 (funcionalidad rota con Claude real): el tipo de depósito del BCE fue negativo entre 2014 y 2022, pero el esquema de «datos» exigía
// valores ≥ 0: todo el resultado iba a cuarentena, también las demás series pedidas a la vez. Un tipo puede ser negativo; un índice, no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar } from '../../../src/claude/validar.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';

const D = trabajo('datos');
const serie = (id, valor) => ({ id, filas: [{ mes: '2020-01', valor }], origen: 'https://x.example/a' });
const params = { series: [{ id: 'bce-deposito', unidad: 'porcentaje' }, { id: 'msci-world-nr-eur', unidad: 'indice' }, { id: 'eurusd', unidad: 'tipo-cambio' }] };

test('un porcentaje negativo vale; un índice o un tipo de cambio negativos, no', () => {
  const ok = { series: [serie('bce-deposito', -0.5)] };
  assert.deepEqual(validar(ok, D.esquema), []);
  assert.deepEqual(D.comprobar(ok, { params }), []);
  for (const id of ['msci-world-nr-eur', 'eurusd']) {
    const mal = { series: [serie(id, -1)] };
    assert.deepEqual(validar(mal, D.esquema), []);
    assert.match(D.comprobar(mal, { params }).join(), new RegExp(`${id}.*negativo`));
  }
});
