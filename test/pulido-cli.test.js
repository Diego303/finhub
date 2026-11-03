// F12 en la CLI: arranque con Windows (siempre en un directorio temporal, nunca en tu carpeta Inicio),
// carpetas sugeridas la primera vez (solo sugiere, no crea) e iconos de la app instalable.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { arranque, scriptVbs, MARCA } from '../src/cli/arranque.js';
import { sugerirCarpetas, main } from '../src/cli/index.js';
import { icono } from '../scripts/generar-iconos.js';
import { temporal, borrarTemporal } from './server/ayudas.js';

const limpiar = [];
after(async () => {
  for (const d of limpiar) await borrarTemporal(d);
});

test('arranque con Windows: activar crea un único finhub.vbs marcado; desactivar solo borra el nuestro', async () => {
  const dir = await temporal('inicio');
  limpiar.push(dir);
  const env = { ...process.env, FINHUB_STARTUP_DIR: dir, WSL_DISTRO_NAME: 'Ubuntu-Prueba' };
  const salida = [];
  const out = (m) => salida.push(m);
  assert.equal(await arranque('estado', { out, env }), 0);
  assert.match(salida.pop(), /no arranca/);
  assert.equal(await arranque('activar', { out, env, node: '/usr/bin/node', finhub: '/home/x/finhub/bin/finhub.js' }), 0);
  const t = await fsp.readFile(join(dir, 'finhub.vbs'), 'utf8');
  assert.ok(t.startsWith(MARCA));
  assert.match(t, /wsl\.exe -d Ubuntu-Prueba -- ""\/usr\/bin\/node"" ""\/home\/x\/finhub\/bin\/finhub\.js"" --primer-plano --silencioso", 0, False/);
  assert.deepEqual(await fsp.readdir(dir), ['finhub.vbs'], 'un solo fichero');
  assert.equal(await arranque('desactivar', { out, env }), 0);
  assert.deepEqual(await fsp.readdir(dir), []);
  // un finhub.vbs que no es nuestro no se pisa ni se borra
  await fsp.writeFile(join(dir, 'finhub.vbs'), "' otro programa\n");
  assert.equal(await arranque('activar', { out, env }), 1);
  assert.equal(await arranque('desactivar', { out, env }), 0);
  assert.equal(await fsp.readFile(join(dir, 'finhub.vbs'), 'utf8'), "' otro programa\n");
  assert.equal(await arranque('otra-cosa', { out, env }), 2);
  // por la CLI
  const s2 = [];
  await fsp.rm(join(dir, 'finhub.vbs'));
  assert.equal(await main(['arranque', 'activar'], { out: (m) => s2.push(m), env }), 0);
  assert.match(s2.join(), /arrancará con Windows/);
  assert.match(scriptVbs({ distro: 'D', node: 'n"x', finhub: 'f' }), /n""x/, 'comillas escapadas');
});

test('primera vez: sugiere Google Drive u OneDrive si existen, y si no ~/FINANZAS (sin crear nada)', () => {
  const vistas = [];
  const existe = (p) => (vistas.push(p), p === '/mnt/d/GoogleDrive' || p === '/mnt/c/Users/Alex/OneDrive');
  const s = sugerirCarpetas({ USER: 'alex', HOME: '/home/alex' }, existe);
  assert.deepEqual(s, ['D:\\GoogleDrive\\FINANZAS', 'C:\\Users\\Alex\\OneDrive\\FINANZAS', '/home/alex/FINANZAS']);
  assert.deepEqual(sugerirCarpetas({ USER: 'alex', HOME: '/home/alex' }, () => false), ['/home/alex/FINANZAS']);
  assert.ok(vistas.every((p) => /^\/mnt\/[a-z]\/(GoogleDrive|Google Drive|Users\/[^/]+\/OneDrive)$/.test(p)), 'solo comprueba si existen esas carpetas');
});

test('app instalable: manifiesto, iconos PNG válidos (192 y 512) y service worker sin caché', () => {
  const m = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'web', 'manifest.webmanifest'), 'utf8'));
  assert.deepEqual([m.name, m.start_url, m.display], ['finhub', '/', 'standalone']);
  for (const lado of [192, 512]) {
    const png = readFileSync(join(import.meta.dirname, '..', 'web', `icono-${lado}.png`));
    assert.deepEqual(png, icono(lado), `icono-${lado}.png al día (node scripts/generar-iconos.js)`);
    assert.equal(png.readUInt32BE(16), lado);
    assert.equal(png.readUInt32BE(20), lado);
    const idat = png.indexOf('IDAT');
    assert.equal(inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4))).length, lado * (lado * 4 + 1));
    assert.ok(m.icons.some((i) => i.src === `/icono-${lado}.png`));
  }
  const sw = readFileSync(join(import.meta.dirname, '..', 'web', 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /caches\.|cache\.put|indexedDB/, 'no guarda nada de tus datos en el navegador');
});
