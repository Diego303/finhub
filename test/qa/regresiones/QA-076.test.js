// QA-076 (medio, decidido por ti): con Claude real, «precios» devolvió para IE00B4L5Y983 el valor liquidativo en USD (140,99), y la app no podía
// usarlo: el fondo lo tienes en EUR (Xetra, 127,3 €). Ahora el trabajo recibe también la divisa del activo, que no es un dato privado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { ficherosEjemplo, modeloDe } from '../ayuda-claude.js';

test('el servidor manda la divisa de cada activo (EUR si no tiene) y nada más', () => {
  const modelo = { activos: [{ id: 'a', titulo: 'Fondo A', campos: { isin: 'IE00B4L5Y983', divisa: 'EUR', unidades: 3 } }, { id: 'b', titulo: 'Fondo B', campos: { isin: 'IE00BYX5NX33' } }] };
  const p = ServicioClaude.prototype.parametros.call({}, 'precios', {}, modelo);
  assert.deepEqual(p.activos, [{ isin: 'IE00B4L5Y983', nombre: 'Fondo A', divisa: 'EUR' }, { isin: 'IE00BYX5NX33', nombre: 'Fondo B', divisa: 'EUR' }]);
});

test('el prompt pide el precio en esa divisa', () => {
  const t = trabajo('precios');
  const e = t.entrada(modeloDe(ficherosEjemplo()), { activos: [{ isin: 'IE00B4L5Y983', nombre: 'Fondo A', divisa: 'EUR' }] });
  assert.match(e.bloques[0].contenido, /IE00B4L5Y983 · Fondo A · en EUR/);
  assert.match(e.tarea, /en la divisa indicada/);
  assert.match(t.recibe, /divisa/);
});
