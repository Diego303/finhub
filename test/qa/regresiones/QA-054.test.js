// QA-054: §4.4 dice «primer año en que p50 lo SUPERA»; igualar el objetivo contaba como alcanzarlo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libertadFinanciera } from '../../../src/core/proyeccion.js';

test('igualar no es superar', () => {
  const p = { anios: [0, 1, 2], p50: [10, 20, 21] };
  assert.equal(libertadFinanciera(p, 1, 20).anio, 2);
  assert.equal(libertadFinanciera(p, 1, 19).anio, 1);
  const lejos = libertadFinanciera(p, 1, 21);
  assert.deepEqual([lejos.anio, lejos.masDe], [null, 2]);
});
