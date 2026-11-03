// Test de humo del esqueleto: estructura, package.json y CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));

test('package.json: módulo ES, pnpm, node>=20 y sin dependencias de runtime', () => {
  assert.equal(pkg.type, 'module');
  assert.match(pkg.packageManager, /^pnpm@/);
  assert.equal(pkg.engines.node, '>=20');
  assert.equal(pkg.bin.finhub, 'bin/finhub.js');
  assert.equal(pkg.dependencies, undefined);
});

test('existen las carpetas del plan §2.1', () => {
  for (const d of ['bin', 'src/core/formato', 'src/core/ops', 'src/server', 'src/claude/trabajos', 'web/vistas', 'semilla/base', 'ejemplo', 'test/r1', 'docs/maquetas']) {
    assert.ok(existsSync(join(raiz, d)), `falta ${d}`);
  }
});

test('la CLI muestra la ayuda en español y rechaza comandos desconocidos', () => {
  const ayuda = spawnSync(process.execPath, [join(raiz, 'bin/finhub.js'), '--help'], { encoding: 'utf8' });
  assert.equal(ayuda.status, 0);
  assert.match(ayuda.stdout, /finhub carpeta \[ruta\]/);
  const mal = spawnSync(process.execPath, [join(raiz, 'bin/finhub.js'), 'compra'], { encoding: 'utf8' });
  assert.equal(mal.status, 2);
  assert.match(mal.stderr, /Comando desconocido/);
});

test('la zona horaria de los tests es fija (casos de cambio de hora, §9.21)', () => {
  assert.ok(process.env.TZ, 'scripts/test.js fija TZ');
});
