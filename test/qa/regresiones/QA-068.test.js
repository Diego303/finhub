// QA-068 (cifras, alto): una serie guardada va en base 100 (o en una base anterior), pero al actualizarla Claude solo sabía el último mes, no el valor.
// Tenía que adivinar la escala: 774,21 de base 100 frente a 127,3 € de cierre. Si las dos escalas se parecen, nada lo detecta. Ahora recibe el último valor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';

test('al actualizar una serie, el prompt lleva su último valor y pide seguir en esa escala', () => {
  const e = trabajo('datos').entrada(modeloDe(ficherosEjemplo()), { series: [{ id: 'msci-world-nr-eur', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: '2026-10', ultimoValor: 774.21 }], hoy: HOY });
  const u = e.bloques[0].contenido;
  assert.match(u, /tienes hasta 2026-10/);
  assert.match(u, /774\.21/);
  assert.match(u, /misma escala/);
  assert.match(e.tarea, /misma escala/);
});

test('el servidor le pasa el último valor de la serie', () => {
  const yo = { manifiesto: () => [{ id: 'msci-world-nr-eur', que: 'x', unidad: 'indice', proxy: 'p', metodo: 'm' }] };
  const [s] = ServicioClaude.prototype.estadoDatos.call(yo, { series: [{ id: 'msci-world-nr-eur', sintetica: false, actualizado: 'h' }], serie: () => [{ mes: '2026-09', valor: 770.93 }, { mes: '2026-10', valor: 774.21 }] });
  assert.equal(s.ultimo, '2026-10');
  assert.equal(s.ultimoValor, 774.21);
});
