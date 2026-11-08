// QA-029 (S24, §2.5): el deshacer dura 10 s. El servidor guardaba la inversa sin caducidad, de modo que un POST tardío
// (o una pestaña dormida) deshacía una operación de hace horas. Hay 5 s de gracia por el viaje de ida y vuelta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deshacer, DURACION_MS, GRACIA_MS, MAX_POR_SESION } from '../../../src/server/deshacer.js';

const ENTRADA = { op: 'x', inversa: { op: 'ficheros.restaurar', args: {} }, esperado: {} };

test('dentro de plazo sí; pasado el plazo, no', () => {
  let t = 1000;
  const d = new Deshacer({ ahora: () => t });
  const a = d.guardar('s', ENTRADA);
  t += DURACION_MS + GRACIA_MS;
  assert.equal(d.tomar('s', a).id, a, 'en el borde');
  const b = d.guardar('s', ENTRADA);
  t += DURACION_MS + GRACIA_MS + 1;
  assert.equal(d.tomar('s', b), null);
  assert.equal(d.tomar('s'), null, 'tampoco la última');
});

test('se guardan como mucho 30 por sesión y las sesiones no se mezclan', () => {
  let t = 1000;
  const d = new Deshacer({ ahora: () => t });
  const ids = Array.from({ length: 35 }, () => d.guardar('s', ENTRADA));
  assert.equal(d.sesiones.get('s').length, MAX_POR_SESION);
  assert.equal(d.tomar('s', ids[0]), null);
  assert.equal(d.tomar('otra', ids[34]), null);
  assert.equal(d.tomar('s', ids[34]).id, ids[34]);
});
