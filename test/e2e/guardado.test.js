// Indicador de guardado (arriba a la derecha): todo guardado → guardando… → guardado HH:MM con los ficheros;
// un cambio rechazado no escribe nada; un fallo de red se ve como «no se guardó» hasta el siguiente guardado;
// los cambios de fuera se avisan; sin servidor, «sin conexión». Carpeta temporal de ejemplo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, EJEMPLO } from '../server/ayudas.js';

let navegador = null;
let app;
let p;
let raiz;
const limpiar = [];
const errores = [];

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 150, barridoMs: 600 }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const estadoInd = () => p.getAttribute('[data-accion=abrir-guardado]', 'data-estado-guardado');
const textoInd = () => p.textContent('[data-accion=abrir-guardado]');
const op = (nombre, args) => p.evaluate(async ([n, a]) => (await import('/api.js')).op(n, a, { mensaje: `prueba ${n}` }), [nombre, args]);

test('todo guardado → guardando… → guardado con hora y ficheros; el detalle lo cuenta', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  assert.equal(await estadoInd(), 'guardado');
  assert.match(await textoInd(), /todo guardado/);
  const promesa = op('ajustes.textos', { valores: { nombre: 'Zoe' } });
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'guardando');
  await promesa;
  await p.waitForFunction(() => /guardado \d\d:\d\d/.test(document.querySelector('[data-accion=abrir-guardado]')?.textContent ?? ''));
  assert.match(await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8'), /^- nombre: Zoe$/m, 'ya está en el disco');
  assert.match(await p.getAttribute('[data-accion=abrir-guardado]', 'title'), /ajustes\.md/);
  await p.click('[data-accion=abrir-guardado]');
  await p.waitForSelector('[role=dialog] [data-historial-guardado]');
  const detalle = await p.textContent('[role=dialog]');
  assert.match(detalle, /prueba ajustes\.textos/);
  assert.match(detalle, /ajustes\.md/);
  assert.match(detalle, /nunca queda a medias/);
  await p.keyboard.press('Escape');
});

test('rechazado (no válido): no se escribe nada y sigue «guardado»; fallo de red: «no se guardó» hasta el siguiente', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const antes = await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8');
  await op('ajustes.textos', { valores: { rex_humor: 'siempre feliz' } });
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'guardado');
  assert.equal(await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8'), antes);
  // sin red solo para /api/ops
  await p.route('**/api/ops', (r) => r.abort());
  await op('ajustes.textos', { valores: { nombre: 'Ana' } });
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'error');
  assert.match(await textoInd(), /no se guardó/);
  assert.equal(await p.getAttribute('[data-accion=abrir-guardado]', 'class'), 'guardado mal');
  assert.match(await p.textContent('#anuncio-guardado'), /no se pudo guardar/, 'anunciado a lectores de pantalla');
  await p.unroute('**/api/ops');
  await op('ajustes.textos', { valores: { nombre: 'Ana' } });
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'guardado');
  assert.match(await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8'), /^- nombre: Ana$/m);
});

test('cambio de fuera (otro equipo o a mano): «actualizado» con el fichero; sin servidor: «sin conexión»', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await fsp.writeFile(join(raiz, 'etiquetas.md'), `${EJEMPLO.get('etiquetas.md')}- nueva | Etiqueta escrita a mano\n`);
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'externo', null, { timeout: 8000 });
  assert.match(await p.getAttribute('[data-accion=abrir-guardado]', 'title'), /etiquetas\.md/);
  await p.route('**/api/**', (r) => r.abort());
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado === 'sin-conexion', null, { timeout: 8000 });
  await p.unroute('**/api/**');
  await p.click('[data-accion=reintentar]');
  await p.waitForFunction(() => document.querySelector('[data-accion=abrir-guardado]')?.dataset.estadoGuardado !== 'sin-conexion', null, { timeout: 8000 });
  assert.deepEqual(errores, []);
});
