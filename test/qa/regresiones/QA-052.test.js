// QA-052: no se podían dejar vacíos los sectores del mapa de efectos ni los filtros de Descubrimientos («lista vacía»). Ahora una
// lista vacía se puede escribir («- descubrir_filtros:»), y vacía significa vacía, no la de serie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { leer } from '../../../src/core/formato/index.js';
import { valores, serializar } from '../../../src/core/formato/motor.js';
import { ajustesEfectivos } from '../../../src/core/formato/config.js';

test('vaciar las listas: se guarda, vuelve igual y no reaparecen las de serie', () => {
  const fs = new Map([['ajustes.md', '# Ajustes\nesquema: 1\n']]);
  const r = aplicarOp((x) => fs.get(x) ?? null, 'descubrir.listas', { sectores: [], filtros: [] }, { rutas: ['ajustes.md'], ajustes: {} });
  const t = r.escribir['ajustes.md'];
  const d = leer('ajustes.md', t);
  assert.deepEqual(d.avisos, []);
  assert.equal(serializar(d), t);
  const a = ajustesEfectivos(valores(d));
  assert.deepEqual(a.descubrir_filtros, []);
  assert.deepEqual(a.sectores_efectos, []);
  assert.ok(ajustesEfectivos({}).descubrir_filtros.length > 0, 'sin la clave, las de serie');
});
