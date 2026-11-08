// QA4 · Fechas: los cálculos dan lo mismo con TZ=UTC, Europe/Madrid y America/Los_Angeles, también los días de cambio de hora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');
const { NODE_TEST_CONTEXT, ...ENV } = process.env;
const ZONAS = ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Pacific/Auckland'];

test('huella de los cálculos idéntica en todas las zonas', () => {
  const huellas = ZONAS.map((TZ) => {
    const r = spawnSync(process.execPath, [join(import.meta.dirname, 'huella.mjs')], { env: { ...ENV, TZ }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  });
  assert.equal(new Set(huellas).size, 1, `${ZONAS.map((z, i) => `${z}: ${huellas[i]}`).join('\n')}`);
});

test('las baterías de cálculos pasan en todas las zonas', () => {
  const ficheros = ['test/oraculos/dorados.test.js', 'test/oraculos/diferencial.test.js', 'test/core/fechas.test.js', 'test/core/mes-calculos.test.js', 'test/core/cartera.test.js', 'test/core/metas.test.js', 'test/core/herramientas.test.js', 'test/core/resumen.test.js'];
  for (const TZ of ['UTC', 'America/Los_Angeles']) {
    const r = spawnSync(process.execPath, ['--test', ...ficheros], { cwd: RAIZ, env: { ...ENV, TZ, NODE_V8_COVERAGE: '' }, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, `${TZ}:\n${r.stdout.split('\n').filter((l) => /^✖|fail /.test(l)).slice(0, 20).join('\n')}`);
  }
});
