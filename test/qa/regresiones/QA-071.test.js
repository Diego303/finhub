// QA-071 (medio): con datos reales, de 4 series pedidas volvió 1 y el trabajo acabó «ok» sin decir nada: las otras 3 desaparecían de la pantalla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServicioClaude } from '../../../src/server/claude.js';

test('la propuesta dice qué series pedidas no han vuelto', () => {
  const pedidas = ['a', 'b', 'c'].map((id) => ({ id, que: id, unidad: 'indice', metodo: 'm' }));
  const r = ServicioClaude.prototype.propuesta.call({}, 'datos', { estado: 'ok', json: { series: [{ id: 'a', origen: 'https://x', filas: [{ mes: '2026-01', valor: 1 }] }] } }, { series: pedidas }, { series: [], serie: () => [] });
  assert.deepEqual(r.faltan, ['b', 'c']);
});
