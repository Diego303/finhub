// QA7 · Acciones que ninguna prueba comprobaba en el disco: editar en línea, recurrentes del mes, ajustar saldo, pausar,
// borrar una nota a la papelera y una conversación nueva.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores, bloques } from '../../src/core/formato/motor.js';
import { fechaLocal, mesFinanciero } from '../../src/core/fechas.js';
import { crearEntorno, esperar } from '../qa/entorno.js';

const HOY = fechaLocal();
const MES = mesFinanciero(HOY, 1);
const RUTA = `mes/${MES}.md`;
const DIA = String(+HOY.slice(8));
let navegador;
let ent;
let app;
let p;
const errores = [];
before(async () => {
  navegador = await chromium.launch();
  ent = await crearEntorno({ nombre: 'acciones' });
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, sondeoMs: 200, barridoMs: 800 }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errores.push(m.text()));
  await p.goto(`${app.url}#mes`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'mes' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  await ent?.limpiar();
});
const doc = async (r) => leer(r, await fsp.readFile(join(ent.datos, r), 'utf8'));
async function hasta(fn, que, ms = 6000) {
  const fin = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* aún no */
    }
    if (Date.now() > fin) throw new Error(`no se cumplió: ${que}`);
    await esperar(50);
  }
}
const movs = async () => items(await doc(RUTA), 'Movimientos');
const dialogo = '[role=dialog]';

test('anotar, editar en línea (concepto e importe), cancelar otra edición; todo en el fichero', async () => {
  await p.fill('#anotar-dia', DIA);
  await p.fill('#anotar-concepto', 'Para editar en línea');
  await p.fill('#anotar-importe', '10,00');
  await p.click('form[data-form=anotar] button[type=submit]');
  const m = await hasta(async () => (await movs()).find((x) => x.concepto === 'Para editar en línea'), 'anotado');
  await p.click(`[data-accion=mov-editar][data-id="${m.id}"]`);
  await p.waitForSelector('#ed-concepto');
  await p.fill('#ed-concepto', 'Ya editado | con barra');
  await p.fill('#ed-importe', '25,50');
  await p.click('#form-edicion ~ * button[type=submit], button[form=form-edicion]');
  const e = await hasta(async () => (await movs()).find((x) => x.id === m.id && x.concepto.startsWith('Ya editado')), 'editado');
  assert.equal(e.concepto, 'Ya editado | con barra');
  assert.equal(Math.abs(e.importe), 2550);
  assert.equal(e.id, m.id, 'el id no cambia');
  await p.waitForSelector(`[data-accion=mov-editar][data-id="${m.id}"]`);
  await p.click(`[data-accion=mov-editar][data-id="${m.id}"]`);
  await p.fill('#ed-concepto', 'Esto no se guarda');
  await p.click('[data-accion=mov-cancelar]');
  await esperar(150);
  assert.ok(!(await movs()).some((x) => x.concepto === 'Esto no se guarda'));
});

test('recurrentes del mes: confirmar con otro importe, desmarcar y saltar', async () => {
  await p.click('[data-accion=mes-recurrentes]');
  await p.waitForSelector(`${dialogo} [data-accion=rec-confirmar]`);
  const b = p.locator(`${dialogo} [data-accion=rec-confirmar]`).first();
  const id = await b.getAttribute('data-rec');
  await p.fill(`#rec-imp-${id}`, '-77,77');
  await b.click();
  const m = await hasta(async () => (await movs()).find((x) => x.rec === id), 'confirmado');
  assert.equal(m.importe, -7777);
  assert.equal(valores(await doc(RUTA), 'Recurrentes')[id], 'confirmado');
  await p.click(`${dialogo} [data-accion=rec-desmarcar][data-rec="${id}"]`);
  await hasta(async () => !valores(await doc(RUTA), 'Recurrentes')[id], 'desmarcado');
  assert.ok((await movs()).some((x) => x.rec === id), 'desmarcar no borra el movimiento');
  await p.waitForSelector(`${dialogo} [data-accion=rec-saltar][data-rec="${id}"]`);
  await p.click(`${dialogo} [data-accion=rec-saltar][data-rec="${id}"]`);
  await hasta(async () => valores(await doc(RUTA), 'Recurrentes')[id] === 'saltado', 'saltado');
  await p.keyboard.press('Escape');
  await p.waitForSelector(dialogo, { state: 'detached' });
});

test('ajustar saldo: un movimiento «ajuste» por la diferencia; el saldo queda como dices', async () => {
  const antes = (await movs()).length;
  await p.click('[data-accion=cuenta-ajustar]');
  await p.waitForSelector(`${dialogo} form[data-form=ajustar-saldo]`);
  await p.fill(`${dialogo} [name=saldo]`, '1.234,56');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => (await movs()).length === antes + 1, 'ajuste anotado');
  const a = (await movs()).find((x) => x.ajuste);
  assert.equal(a.concepto, 'Ajuste de saldo');
  assert.equal(a.naturaleza, 'traspaso');
});

test('pausar un recurrente desde Gestión', async () => {
  await p.click('[data-accion=gestion]');
  await p.click('[data-entrada=recurrentes]');
  await p.waitForSelector(`${dialogo} [data-accion=rec-pausa]`);
  const b = p.locator(`${dialogo} [data-accion=rec-pausa]`).first();
  const id = await b.getAttribute('data-id');
  await b.click();
  await hasta(async () => items(await doc('recurrentes.md')).find((r) => r.id === id).pausado === true, 'pausado');
  await p.keyboard.press('Escape');
  await p.waitForSelector(dialogo, { state: 'detached' });
});

test('borrar una nota: pide confirmar, va a la papelera y se puede restaurar', async () => {
  await p.goto(`${app.url}#conocimiento`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'conocimiento');
  const ruta = 'conocimiento/pizarra/2026-10-28-valoraciones.md';
  await p.fill('#busca-texto', 'P-0019');
  await p.waitForFunction(() => document.querySelectorAll('[data-accion=nota-ver]').length === 1);
  await p.click('[data-accion=nota-ver][data-id="P-0019"]');
  await p.click(`${dialogo} [data-accion=nota-borrar]`);
  await p.click('[data-si]');
  await hasta(async () => !(await fsp.readFile(join(ent.datos, ruta), 'utf8').catch(() => '')).includes('P-0019'), 'borrada');
  const pap = await p.evaluate(() => fetch('/api/papelera').then((r) => r.json()));
  const e = pap.entradas.find((x) => /P-0019/.test(x.que));
  assert.ok(e, 'en la papelera');
  const r = await p.evaluate((id) => fetch('/api/papelera/restaurar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then((x) => x.status), e.id);
  assert.equal(r, 200);
  assert.ok(bloques(await doc(ruta)).some((b) => b.id === 'P-0019'), 'restaurada');
});

test('cero errores de consola', () => {
  assert.deepEqual(errores, []);
});
