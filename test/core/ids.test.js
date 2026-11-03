import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../../src/core/ids.js';
import { crearPrng } from '../../src/core/prng.js';

test('slugs estables (§2.5)', () => {
  assert.equal(I.slug('Hucha Japón'), 'hucha-japon');
  assert.equal(I.slug('  Ocio y planes!! '), 'ocio-y-planes');
  assert.equal(I.slug('Ñandú'), 'nandu');
  assert.equal(I.slug('¿?'), 'x');
  assert.ok(I.slug('a'.repeat(30) + ' ' + 'b'.repeat(30)).length <= 40);
  assert.equal(I.slugUnico('Ocio', ['ocio', 'ocio-2']), 'ocio-3');
  assert.equal(I.slugUnico('Ocio', new Set(['OCIO'])), 'ocio-2', 'sin distinguir mayúsculas (D: no las distingue)');
  assert.ok(I.esSlug('rv-desarrollados'));
  assert.equal(I.esSlug('Rv'), false);
  assert.equal(I.esSlug('a--b'), false);
});

test('correlativos e ids de notas', () => {
  assert.equal(I.siguienteCorrelativo('OP', ['OP-0041', 'OP-0042', 'X-9999']), 'OP-0043');
  assert.equal(I.siguienteCorrelativo('PR', []), 'PR-0001');
  assert.equal(I.siguienteCorrelativo('D', ['D-007'], 3), 'D-008');
  assert.equal(I.idNotaMundo('2026-11-03', ['M-261103-01']), 'M-261103-02');
  assert.equal(I.idNotaMundo('2027-11-03', ['M-261103-01']), 'M-271103-01', 'el año evita choques entre años');
  for (const id of ['B-0001', 'DT-0004', 'M-261103-01', 'IND-0031', 'D-007', 'N-0001']) assert.ok(I.RE_ID_NOTA.test(id), id);
});

test('ids cortos de movimiento: 4 caracteres, únicos y deterministas con semilla', () => {
  const a = crearPrng('ids');
  const b = crearPrng('ids');
  const usados = [];
  for (let i = 0; i < 500; i++) {
    const id = I.idCorto(usados, a);
    assert.match(id, /^[a-z0-9]{4}$/);
    assert.ok(!usados.includes(id));
    usados.push(id);
  }
  const otra = [];
  for (let i = 0; i < 500; i++) otra.push(I.idCorto(otra, b));
  assert.deepEqual(otra, usados);
});

test('ISIN con dígito de control (§8.3, §9.25)', () => {
  for (const i of ['US0378331005', 'IE00BYX5NX33', 'IE0031786696', 'IE00B42W4L06', 'IE00B53SZB19', 'LU0389811885', 'ie00byx5nx33']) assert.ok(I.validarIsin(i), i);
  for (const i of ['IE00BYX5NX34', 'US0378331006', 'XX', 'IE00BYX5NX3', '120378331005', '']) assert.equal(I.validarIsin(i), false, i);
});
