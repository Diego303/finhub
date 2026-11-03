// CLI de punta a punta (§2.3), con XDG aislado y carpetas temporales.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { entornoAislado, borrarTemporal, temporal } from './server/ayudas.js';

const BIN = join(import.meta.dirname, '..', 'bin', 'finhub.js');
const limpiar = [];
let env;
after(async () => {
  if (env) {
    const s = await fsp.readFile(join(env.XDG_CACHE_HOME, 'finhub', 'servidor.json'), 'utf8').then(JSON.parse, () => null);
    if (s) try { process.kill(s.pid, 'SIGTERM'); } catch { /* ya parado */ }
  }
  for (const d of limpiar) await borrarTemporal(d);
});
const finhub = (...args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8', timeout: 30000 });
  return { codigo: r.status, salida: r.stdout + r.stderr };
};

test('ayuda y comandos desconocidos', () => {
  const a = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
  assert.equal(a.status, 0);
  assert.match(a.stdout, /finhub carpeta \[ruta\]/);
  assert.match(a.stdout, /--ejemplo/);
  const m = spawnSync(process.execPath, [BIN, 'compra'], { encoding: 'utf8' });
  assert.equal(m.status, 2);
  assert.match(m.stdout, /Comando desconocido: «compra»/);
  assert.equal(spawnSync(process.execPath, [BIN, '--opcion-rara'], { encoding: 'utf8' }).status, 2);
});

test('carpeta, start en segundo plano, status, start de nuevo, stop', async () => {
  const aislado = await entornoAislado();
  env = aislado.env;
  limpiar.push(aislado.base);
  const base = await temporal('cli');
  limpiar.push(base);
  assert.match(finhub('carpeta').salida, /aún no hay carpeta/);
  assert.match(finhub('start', '--silencioso').salida, /Aún no has elegido carpeta/);
  const ruta = join(base, 'Mis finanzas ñ');
  const c = finhub('carpeta', ruta);
  assert.equal(c.codigo, 0, c.salida);
  assert.match(c.salida, /✓ carpeta de datos: .*Mis finanzas ñ \(crear\)/);
  assert.equal(await fsp.readFile(join(ruta, 'ajustes.md'), 'utf8'), '# Ajustes\nesquema: 1\n');
  assert.match(finhub('carpeta').salida, /Mis finanzas ñ/);
  const sinModo = finhub('carpeta', join(base, 'otra'));
  assert.equal(sinModo.codigo, 2);
  assert.match(sinModo.salida, /--mover, --copiar o --usar/);
  assert.match(finhub('carpeta', join(ruta, 'dentro'), '--copiar').salida, /dentro de la carpeta actual/);
  const s = finhub('start', '--silencioso', '--puerto', '0');
  assert.equal(s.codigo, 0, s.salida);
  assert.match(s.salida, /finhub en http:\/\/127\.0\.0\.1:\d+\//);
  const st = finhub('status');
  assert.equal(st.codigo, 0);
  assert.match(st.salida, /finhub en marcha en/);
  assert.match(st.salida, /Mis finanzas ñ/);
  assert.match(finhub('start', '--silencioso').salida, /ya está en marcha/);
  const copia = join(base, 'copia');
  const cc = finhub('carpeta', copia, '--copiar');
  assert.equal(cc.codigo, 0, cc.salida);
  assert.match(finhub('status').salida, /copia/, 'el servidor en marcha cambió de carpeta sin reiniciarse');
  const p = finhub('stop');
  assert.equal(p.codigo, 0);
  assert.match(p.salida, /finhub parado/);
  assert.equal(finhub('status').codigo, 3);
  assert.match(finhub('stop').salida, /no está en marcha/);
  await assert.rejects(fsp.stat(join(copia, '.finhub/abierto.lock')), 'al parar suelta el candado');
});

test('--ejemplo: copia temporal que se borra al parar; nunca la carpeta configurada', async () => {
  const aislado = await entornoAislado();
  env = aislado.env;
  limpiar.push(aislado.base);
  const antes = (await fsp.readdir(tmpdir())).filter((n) => n.startsWith('finhub-ejemplo-'));
  const s = finhub('--ejemplo', '--silencioso', '--puerto', '0');
  assert.equal(s.codigo, 0, s.salida);
  assert.match(s.salida, /ejemplo temporal, se borra al parar/);
  const nuevas = (await fsp.readdir(tmpdir())).filter((n) => n.startsWith('finhub-ejemplo-') && !antes.includes(n));
  assert.equal(nuevas.length, 1);
  assert.ok(await fsp.stat(join(tmpdir(), nuevas[0], 'mes', '2026-11.md')));
  assert.equal(await fsp.readFile(join(env.XDG_CONFIG_HOME, 'finhub', 'config.json'), 'utf8').catch(() => null), null, 'no toca la configuración');
  assert.equal(finhub('stop').codigo, 0);
  await assert.rejects(fsp.stat(join(tmpdir(), nuevas[0])), 'la copia temporal se borró');
});
