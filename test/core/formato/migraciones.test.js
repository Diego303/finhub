import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrar, leerEsquema } from '../../../src/core/formato/migraciones.js';

// Registro de prueba: cuentas v1 → v2 renombra «colchon» a «reserva», v2 → v3 añade una cabecera.
const registro = {
  cuentas: {
    1: (t) => t.replace(/^esquema: 1$/m, 'esquema: 2').replace(/\| colchon\b/g, '| reserva'),
    2: (t) => t.replace(/^esquema: 2$/m, 'esquema: 3\nmigrado: sí'),
  },
  roto: { 1: (t) => t },
};
const v1 = '# Cuentas\nesquema: 1\n- remunerada | R | tipo: ahorro | colchon\n';

test('leerEsquema encuentra la versión o devuelve null', () => {
  assert.equal(leerEsquema(v1), 1);
  assert.equal(leerEsquema('# X\nesquema: 7   # comentario\n'), 7);
  assert.equal(leerEsquema('# X\n- a\nesquema: 2\n'), null, 'solo en la cabecera');
  assert.equal(leerEsquema('# X\n'), null);
});

test('migra paso a paso hasta el actual', () => {
  const r = migrar(v1, 'cuentas', { registro, actual: 3 });
  assert.deepEqual([r.de, r.a, r.migrado], [1, 3, true]);
  assert.equal(r.texto, '# Cuentas\nesquema: 3\nmigrado: sí\n- remunerada | R | tipo: ahorro | reserva\n');
});

test('sin «esquema:» se asume 1; al día o más nuevo no se toca', () => {
  const sin = migrar('# Cuentas\n- a | A | tipo: ahorro | colchon\n', 'cuentas', { registro, actual: 2 });
  assert.equal(sin.texto, '# Cuentas\nesquema: 2\n- a | A | tipo: ahorro | reserva\n', 'se asume 1 y se migra');
  const aldia = migrar(v1, 'cuentas', { registro, actual: 1 });
  assert.equal(aldia.migrado, false);
  assert.equal(aldia.texto, v1);
  const nuevo = migrar('# Cuentas\nesquema: 5\n', 'cuentas', { registro, actual: 3 });
  assert.equal(nuevo.migrado, false);
  assert.equal(nuevo.a, 5);
});

test('falta un paso o el paso no actualiza la versión → error y texto intacto', () => {
  const falta = migrar(v1, 'grupos', { registro, actual: 2 });
  assert.match(falta.error, /no hay migración de grupos del esquema 1 al 2/);
  assert.equal(falta.texto, v1);
  const roto = migrar(v1, 'roto', { registro, actual: 2 });
  assert.match(roto.error, /no actualizó «esquema:»/);
  assert.equal(roto.texto, v1);
});

test('con el esquema 1 actual no hay nada que migrar', () => {
  assert.equal(migrar(v1, 'cuentas').migrado, false);
});
