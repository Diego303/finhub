// QA-077 (alto): con Claude real, pedir msci-world y sp500 al día no trajo la historia de 2000 a 2009 de QA-075: la tarea pedía «las filas que faltan
// hasta el último mes» y Claude, con razón, no hizo nada. Ahora la historia se pide aparte, con una casilla, para no gastar más en cada actualización.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';

const S = { id: 'msci-world-nr-eur', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: '2026-10', ultimoValor: 774.21, primero: '2009-10', primeroValor: 100 };
const entrada = (historia) => trabajo('datos').entrada(modeloDe(ficherosEjemplo()), { series: [S, { ...S, id: 'bce-deposito', unidad: 'porcentaje' }], hoy: HOY, historia });

test('con la casilla, se pide la historia aproximada desde 2000-01 de cada índice que empiece después', () => {
  const e = entrada(true);
  const [indice, tipo] = e.bloques[0].contenido.split('\n');
  assert.match(indice, /historia: añade meses aproximados desde 2000-01 hasta 2009-09/);
  assert.doesNotMatch(tipo, /historia:/, 'un tipo de interés no se aproxima');
  assert.match(e.tarea, /aproximacion/);
});

test('sin la casilla, la tarea de cada mes no cambia ni gasta en buscar historia', () => {
  const e = entrada(false);
  assert.doesNotMatch(e.bloques[0].contenido, /historia:/);
  assert.doesNotMatch(e.tarea, /aproximacion/);
});

test('el servidor pasa la casilla, y solo si es true', () => {
  const yo = { estadoDatos: () => [{ ...S, sintetica: false }] };
  assert.equal(ServicioClaude.prototype.parametros.call(yo, 'datos', { ids: [S.id], historia: true }, {}).historia, true);
  assert.equal(ServicioClaude.prototype.parametros.call(yo, 'datos', { ids: [S.id], historia: 'sí' }, {}).historia, false);
});
