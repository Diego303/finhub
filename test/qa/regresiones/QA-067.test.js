// QA-067 (cifras, alto): el INE cambió el IPC a base 2025 y su serie de base 2021 termina en 2025-12. El manifiesto seguía pidiendo la base 2021,
// y pegar las dos da una caída falsa del 15,9 % en enero de 2026, que pasaba el control del 40 % y falseaba todo lo que se descuenta «en € de hoy».
// Valores reales del INE: IPC251852 (2025-12) 119,942; IPC290751 (2026-01) 100,836.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifiesto, revisarFilas } from '../../../src/core/datos.js';
import { ServicioClaude } from '../../../src/server/claude.js';
import { RAIZ } from '../entorno.js';

const OPC = { id: 'ipc-espana', mesActual: '2026-11' };
const manifiesto = () => parseManifiesto(readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8'));

test('el manifiesto pide la serie vigente del INE y una sola base', () => {
  const ipc = manifiesto().find((s) => s.id === 'ipc-espana');
  assert.match(ipc.proxy, /IPC290751/);
  assert.doesNotMatch(ipc.proxy, /base 2021/);
  assert.match(ipc.metodo, /una sola base/);
  const codigos = { 'ipc-vivienda': 'IPC290763', 'ipc-alimentos': 'IPC290755', 'ipc-transporte': 'IPC290775', 'ipc-ocio-cultura': 'IPC290787', 'ipc-salud': 'IPC290771', 'ipc-ensenanza': 'IPC290791' };
  for (const [id, cod] of Object.entries(codigos)) assert.match(manifiesto().find((s) => s.id === id).proxy, new RegExp(`${id} ${cod}`));
});

test('un cambio de base en una serie que ya tienes se descarta, también los meses siguientes', () => {
  const tienes = [{ mes: '2025-12', valor: 119.942 }];
  const r = revisarFilas(tienes, [{ mes: '2026-01', valor: 100.836 }, { mes: '2026-02', valor: 101.2 }, { mes: '2026-03', valor: 101.9 }, { mes: '2026-04', valor: 102.4 }, { mes: '2026-05', valor: 102.8 }], OPC);
  assert.deepEqual(r.filas, [], 'ni el primero ni los que vienen después del hueco');
  assert.ok(r.avisos.some((a) => /cambio de base/.test(a)), JSON.stringify(r.avisos));
});

test('dos bases pegadas en una misma tanda: se queda la primera parte y se avisa', () => {
  const r = revisarFilas([], [{ mes: '2025-11', valor: 119.532 }, { mes: '2025-12', valor: 119.942 }, { mes: '2026-01', valor: 100.836 }, { mes: '2026-02', valor: 101.2 }], OPC);
  assert.deepEqual(r.filas.map((f) => f.mes), ['2025-11', '2025-12']);
  assert.ok(r.avisos.some((a) => /cambio de base/.test(a)));
});

test('los meses reales más bruscos del IPC se aceptan', () => {
  // la mayor variación mensual real entre 2002 y 2026 es del 9,7 % (vivienda en 2022-03, salud en 2012-07)
  const r = revisarFilas([{ mes: '2022-02', valor: 100 }], [{ mes: '2022-03', valor: 109.7 }], { id: 'ipc-vivienda', mesActual: '2026-11' });
  assert.equal(r.filas.length, 1, JSON.stringify(r.avisos));
});

test('el resto de series sigue con el límite del 40 %, y tras un salto tampoco cuela lo que sigue roto', () => {
  assert.equal(revisarFilas([{ mes: '2022-02', valor: 100 }], [{ mes: '2022-03', valor: 130 }], { id: 'msci-world-nr-eur', mesActual: '2026-11' }).filas.length, 1);
  const r = revisarFilas([{ mes: '2022-02', valor: 100 }], [{ mes: '2022-03', valor: 16 }, { mes: '2022-04', valor: 16 }, { mes: '2022-05', valor: 16 }, { mes: '2022-06', valor: 16 }], { id: 'msci-world-nr-eur', mesActual: '2026-11' });
  assert.deepEqual(r.filas, []);
});

test('el servidor aplica ese control al revisar lo que propone Claude', () => {
  const r = ServicioClaude.prototype.propuesta.call({}, 'datos', { estado: 'ok', json: { series: [{ id: 'ipc-espana', origen: 'https://x', filas: [{ mes: '2026-01', valor: 100.836 }] }] } }, { series: [{ id: 'ipc-espana', que: 'IPC', unidad: 'indice', metodo: 'm' }] }, { series: [{ id: 'ipc-espana' }], serie: () => [{ mes: '2025-12', valor: 119.942 }] });
  assert.deepEqual(r.series[0].filas, []);
});
