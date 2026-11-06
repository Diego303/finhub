// QA-042 (pérdida de lo escrito): cualquier recarga de datos (otra pestaña, una edición a mano, lo que trae el servicio de
// sincronización) repintaba el modal abierto y se perdía lo que estabas escribiendo en su formulario.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { crearEntorno, esperar } from '../qa/entorno.js';

let navegador;
let ent;
let app;
let p;
before(async () => {
  navegador = await chromium.launch();
  ent = await crearEntorno({ nombre: 'formularios' });
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, sondeoMs: 100, barridoMs: 300 }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 900 } });
  await p.goto(`${app.url}#conocimiento`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'conocimiento' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  await ent?.limpiar();
});

async function cambioExterno() {
  const h = join(ent.datos, 'hitos.md');
  await fsp.writeFile(h, `${await fsp.readFile(h, 'utf8')}- H-${Math.floor(1000 + Math.random() * 8000)} | 2026-11-06 | mío | de fuera\n`);
  const vs = app.almacen.version;
  for (let i = 0; i < 80 && app.almacen.version === vs; i++) await esperar(30);
  await esperar(300);
}

test('un cambio de fuera no borra lo que escribes en un modal; el resto del modal sí se actualiza', async () => {
  await p.click('[data-accion=nota-form]');
  const dialogo = '[role=dialog]';
  await p.fill(`${dialogo} [name=titulo]`, 'Lo que estaba escribiendo');
  await p.fill(`${dialogo} [name=cuerpo]`, 'Un texto largo a medias');
  await cambioExterno();
  assert.equal(await p.inputValue(`${dialogo} [name=titulo]`), 'Lo que estaba escribiendo');
  assert.equal(await p.inputValue(`${dialogo} [name=cuerpo]`), 'Un texto largo a medias');
  await p.keyboard.press('Escape');
});

test('un desplegable elegido tampoco se pierde; al volver a abrir, el formulario está limpio', async () => {
  await p.click('[data-accion=nota-form]');
  const dialogo = '[role=dialog]';
  await p.selectOption(`${dialogo} [name=tipo]`, 'opinión');
  await cambioExterno();
  assert.equal(await p.inputValue(`${dialogo} [name=tipo]`), 'opinión');
  await p.keyboard.press('Escape');
  await p.click('[data-accion=nota-form]');
  assert.notEqual(await p.inputValue(`${dialogo} [name=titulo]`), 'Lo que estaba escribiendo');
  await p.keyboard.press('Escape');
});

test('al enviar, lo enviado no vuelve: el formulario de Gestión queda limpio tras guardar', async () => {
  await p.click('[data-accion=gestion]');
  await p.click('[data-entrada=grupos]');
  await p.fill('#gr-nuevo', 'Grupo que escribo');
  await cambioExterno();
  assert.equal(await p.inputValue('#gr-nuevo'), 'Grupo que escribo');
  await p.press('#gr-nuevo', 'Enter');
  for (let i = 0; i < 100 && !(await fsp.readFile(join(ent.datos, 'grupos.md'), 'utf8')).includes('Grupo que escribo'); i++) await esperar(50);
  assert.match(await fsp.readFile(join(ent.datos, 'grupos.md'), 'utf8'), /Grupo que escribo/);
  await esperar(300);
  assert.equal(await p.inputValue('#gr-nuevo'), '');
  await p.keyboard.press('Escape');
});

// QA-056: entre pulsar y soltar el ratón (un clic humano dura unos 100 ms), una recarga sustituía el botón: el navegador ya no
// veía un clic sobre él y el clic se perdía sin avisar. El repintado espera a que sueltes.
test('un clic no se pierde si los datos se recargan mientras tienes el botón pulsado', async () => {
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel');
  const caja = await p.locator('[data-accion=abrir-r1]').first().boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  await cambioExterno();
  await p.mouse.up();
  await p.waitForSelector('[role=dialog]', { timeout: 2000 });
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role=dialog]', { state: 'detached' });
  // y el repintado aplazado llega al soltar
  const antes = await p.evaluate(() => document.querySelector('#marco').dataset.renderMs);
  assert.ok(antes !== undefined);
  const r = join(ent.datos, 'ajustes.md');
  await fsp.writeFile(r, (await fsp.readFile(r, 'utf8')).replace(/^- nombre: .*$/m, '- nombre: Tras soltar'));
  await p.waitForFunction(() => document.querySelector('#contenido').textContent.includes('Tras soltar'), null, { timeout: 5000 });
});
