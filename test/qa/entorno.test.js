// QA0: el propio andamio. La trampa de rutas salta de verdad en cada función, el entorno es de temporales,
// el servidor de prueba arranca y se para (solo su pid) y los tests no usan el HOME ni el claude reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { tmpdir, homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { probandoLaTrampa } from './trampa-rutas.js';
import { crearEntorno, arrancarServidor, pedir } from './entorno.js';

const FUERA = '/var/finhub-qa-no-debe-existir/x.md';

test('trampa de rutas: atrapa cada forma de escribir fuera de los temporales', async () => {
  await probandoLaTrampa(async () => {
    const asinc = [() => fsp.writeFile(FUERA, 'x'), () => fsp.appendFile(FUERA, 'x'), () => fsp.mkdir(FUERA), () => fsp.rm(FUERA), () => fsp.rmdir(FUERA), () => fsp.unlink(FUERA), () => fsp.rename(join(tmpdir(), 'a'), FUERA), () => fsp.rename(FUERA, join(tmpdir(), 'a')), () => fsp.copyFile(join(tmpdir(), 'a'), FUERA), () => fsp.cp(join(tmpdir(), 'a'), FUERA), () => fsp.mkdtemp(FUERA), () => fsp.symlink('a', FUERA), () => fsp.truncate(FUERA), () => fsp.chmod(FUERA, 0o600), () => fsp.utimes(FUERA, 1, 1), () => fsp.open(FUERA, 'w'), () => fsp.open(FUERA, 'a+')];
    for (const f of asinc) await assert.rejects(async () => f(), { code: 'EFINHUBTRAMPA' }, f.toString());
    const sinc = [() => fs.writeFileSync(FUERA, 'x'), () => fs.appendFileSync(FUERA, 'x'), () => fs.mkdirSync(FUERA), () => fs.rmSync(FUERA), () => fs.unlinkSync(FUERA), () => fs.renameSync(FUERA, join(tmpdir(), 'a')), () => fs.copyFileSync(join(tmpdir(), 'a'), FUERA), () => fs.openSync(FUERA, 'w'), () => fs.openSync(FUERA, fs.constants.O_WRONLY), () => fs.createWriteStream(FUERA)];
    for (const f of sinc) assert.throws(f, { code: 'EFINHUBTRAMPA' }, f.toString());
    assert.throws(() => fs.writeFile(FUERA, 'x', () => {}), { code: 'EFINHUBTRAMPA' });
    // leer fuera sí se puede; escribir en un temporal también
    await assert.rejects(fsp.open(FUERA, 'r'), { code: 'ENOENT' });
    const d = await fsp.mkdtemp(join(tmpdir(), 'finhub-test-trampa-'));
    await fsp.writeFile(join(d, 'ok.md'), 'ok');
    await fsp.rm(d, { recursive: true });
  });
});

test('los tests corren aislados: HOME temporal, XDG temporal y un claude que no es el real', () => {
  const real = userInfo().homedir;
  assert.notEqual(homedir(), real, 'HOME no es el tuyo');
  assert.ok(homedir().startsWith(tmpdir()), homedir());
  for (const k of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) assert.ok(process.env[k]?.startsWith(tmpdir()), k);
  assert.match(fs.readFileSync(process.env.PATH.split(':')[0] + '/claude', 'utf8'), /FINHUB_SHIM/, 'el primer claude del PATH es el falso que da la alarma');
});

test('entorno: copia ejemplo/ a un temporal, arranca un servidor real y se para solo su pid', async () => {
  const ent = await crearEntorno({ nombre: 'andamio' });
  try {
    assert.ok(ent.datos.startsWith(tmpdir()));
    assert.ok(fs.existsSync(join(ent.datos, 'ajustes.md')));
    const s = await arrancarServidor(ent);
    assert.notEqual(s.puerto, 4747);
    const salud = await pedir(s, 'GET', '/api/salud');
    assert.deepEqual([salud.estado, salud.json.pid, salud.json.carpeta], [200, s.pid, ent.datos]);
    assert.equal((await s.parar()).codigo, 0);
    assert.throws(() => process.kill(s.pid, 0), 'el proceso ya no existe');
  } finally {
    await ent.limpiar();
  }
});
