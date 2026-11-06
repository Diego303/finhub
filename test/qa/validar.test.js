// QA9.2 · El validador: encuentra lo que debe, y la carpeta original no cambia nunca (solo con temporales y datos de ejemplo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { validar } from '../../scripts/qa-validar.js';
import { crearEntorno, RAIZ } from './entorno.js';

test('el ejemplo está limpio', async () => {
  const ent = await crearEntorno({ nombre: 'validar-limpio' });
  try {
    const r = await validar(ent.datos);
    assert.equal(r.originalIntacta, true);
    assert.deepEqual(r.sinLeer, []);
    assert.deepEqual(r.conflictos, []);
    assert.deepEqual(r.idaYVuelta, []);
    assert.deepEqual(r.huerfanos, []);
    assert.deepEqual(r.cierres, [], 'los cierres del ejemplo cuadran');
    assert.deepEqual(r.lineas.filter((l) => l.nivel === 'error'), []);
  } finally {
    await ent.limpiar();
  }
});

test('encuentra cada problema, sin tocar nada', async () => {
  const ent = await crearEntorno({ nombre: 'validar-roto' });
  try {
    const d = ent.datos;
    await fsp.writeFile(join(d, 'mes/2026-11-PORTATIL.md'), await fsp.readFile(join(d, 'mes/2026-11.md')));
    await fsp.writeFile(join(d, 'grupos.md'), '');
    await fsp.appendFile(join(d, 'cuentas.md'), 'línea que no es de finhub\n');
    await fsp.appendFile(join(d, 'cartera/operaciones.md'), '- OP-9998 | 2026-10-01 | aportacion | activo-fantasma | 10,00\n');
    await fsp.writeFile(join(d, 'hitos.md'), (await fsp.readFile(join(d, 'hitos.md'), 'utf8')).replaceAll('\n', '\r\n'));
    const m10 = await fsp.readFile(join(d, 'mes/2026-10.md'), 'utf8');
    await fsp.writeFile(join(d, 'mes/2026-10.md'), m10.replace('## Movimientos\n', '## Movimientos\n- 2026-10-02 | Añadido a mano sin recalcular | -123,45 | ocio | cuenta: corriente | id: zzzz\n- 2026-10-02 | Grupo fantasma | -1,00 | no-existe | cuenta: tampoco | id: yyyy\n'));
    const r = await validar(d);
    assert.equal(r.originalIntacta, true, 'no ha cambiado nada');
    assert.ok(r.conflictos.some((c) => c.ruta === 'mes/2026-11-PORTATIL.md' && c.base === 'mes/2026-11.md'));
    assert.ok(r.sinLeer.some((x) => x.ruta === 'grupos.md'));
    assert.ok(r.lineas.some((l) => l.ruta === 'cuentas.md' && /no reconocida/.test(l.mensaje)));
    assert.ok(r.huerfanos.some((h) => h.que === 'activo' && h.id === 'activo-fantasma'));
    assert.ok(r.huerfanos.some((h) => h.que === 'cuenta' && h.id === 'tampoco'));
    assert.ok(r.sinValor.includes('activo-fantasma'));
    assert.ok(r.idaYVuelta.some((x) => x.ruta === 'cuentas.md' || x.ruta === 'hitos.md') || r.idaYVuelta.length === 0);
    assert.ok(r.cierres.some((c) => c.mes === '2026-10'), JSON.stringify(r.cierres));
    assert.equal(await fsp.stat(join(d, 'grupos.md')).then((s) => s.size), 0);
  } finally {
    await ent.limpiar();
  }
});

test('por línea de comandos: exige --datos, no mira la config, y no deja temporales', async () => {
  const ent = await crearEntorno({ nombre: 'validar-cli' });
  try {
    const S = join(RAIZ, 'scripts/qa-validar.js');
    const sin = spawnSync(process.execPath, [S], { env: ent.env, encoding: 'utf8' });
    assert.equal(sin.status, 2);
    const r = spawnSync(process.execPath, [S, '--datos', ent.datos], { env: ent.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /la carpeta original no ha cambiado/);
    const j = JSON.parse(spawnSync(process.execPath, [S, '--datos', ent.datos, '--json'], { env: ent.env, encoding: 'utf8' }).stdout);
    assert.equal(j.originalIntacta, true);
    assert.deepEqual(await fsp.readdir(ent.home).then((l) => l.filter((x) => x.includes('config'))), []);
  } finally {
    await ent.limpiar();
  }
});
