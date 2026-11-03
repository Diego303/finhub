import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aRutaWsl, aRutaWindows, dentroDe, rutaSegura, carpetasLocales } from '../../src/server/rutas.js';

const o = { home: '/home/alex', cwd: '/home/alex/proyecto' };

test('rutas de Windows y de WSL (§2.6), con espacios y tildes', () => {
  assert.equal(aRutaWsl('D:\\GoogleDrive\\FINANZAS', o), '/mnt/d/GoogleDrive/FINANZAS');
  assert.equal(aRutaWsl('d:/GoogleDrive/FINANZAS/', o), '/mnt/d/GoogleDrive/FINANZAS');
  assert.equal(aRutaWsl('"C:\\Users\\Alex\\Mi unidad\\Finanzas ñandú"', o), '/mnt/c/Users/Alex/Mi unidad/Finanzas ñandú');
  assert.equal(aRutaWsl('C:\\', o), '/mnt/c');
  assert.equal(aRutaWsl('D:\\a\\..\\b', o), '/mnt/d/b');
  assert.equal(aRutaWsl('\\\\wsl.localhost\\Ubuntu-22.04\\home\\alex\\FINANZAS', o), '/home/alex/FINANZAS');
  assert.equal(aRutaWsl('\\\\wsl$\\Ubuntu\\tmp\\x', o), '/tmp/x');
  assert.equal(aRutaWsl('/mnt/d/Datos con espacios/', o), '/mnt/d/Datos con espacios');
  assert.equal(aRutaWsl('~/FINANZAS', o), '/home/alex/FINANZAS');
  assert.equal(aRutaWsl('datos', o), '/home/alex/proyecto/datos');
  assert.throws(() => aRutaWsl('', o), /vacía/);
  assert.throws(() => aRutaWsl('\\\\servidor\\compartida', o), /red/);
  assert.equal(aRutaWindows('/mnt/d/GoogleDrive/FINANZAS'), 'D:\\GoogleDrive\\FINANZAS');
  assert.equal(aRutaWindows('/home/alex/x', { distro: 'Ubuntu' }), '\\\\wsl.localhost\\Ubuntu\\home\\alex\\x');
  assert.equal(aRutaWsl(aRutaWindows('/mnt/c/Mi carpeta/ñ'), o), '/mnt/c/Mi carpeta/ñ', 'ida y vuelta');
});

test('dentroDe y rutaSegura: ninguna ruta sale de la carpeta (§2.2)', () => {
  assert.ok(dentroDe('/a/b/c', '/a/b'));
  assert.ok(dentroDe('/a/b', '/a/b'));
  assert.equal(dentroDe('/a/bc', '/a/b'), false);
  assert.equal(rutaSegura('/datos', 'mes/2026-11.md'), '/datos/mes/2026-11.md');
  for (const mala of ['../x.md', 'mes/../../x', '/etc/passwd', 'mes\\x.md', 'a//b', './a', '', 'a/./b', 'x\0y']) assert.throws(() => rutaSegura('/datos', mala), /no permitida/, mala);
});

test('carpetas locales (XDG) fuera de la carpeta de datos', () => {
  assert.deepEqual(carpetasLocales({ HOME: '/home/alex' }), { config: '/home/alex/.config/finhub', cache: '/home/alex/.cache/finhub', datos: '/home/alex/.local/share/finhub' });
  assert.equal(carpetasLocales({ HOME: '/h', XDG_CONFIG_HOME: '/x' }).config, '/x/finhub');
});
