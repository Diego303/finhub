// F12 de punta a punta en el navegador: la primera vez (carpeta vacía → asistente → carpeta lista), la
// guarida de Rex, Ajustes (Pendientes y Rex), conflictos resueltos desde la interfaz, la papelera, los roles
// propios y la app instalable. Carpetas temporales; se comprueba lo que queda en el disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores } from '../../src/core/formato/motor.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, EJEMPLO } from '../server/ayudas.js';

let navegador = null;
const apps = [];
const limpiar = [];
const errores = [];
let aislado;

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  aislado = await entornoAislado();
  limpiar.push(aislado.base);
});
after(async () => {
  await navegador?.close();
  for (const a of apps) await a.parar().catch(() => {});
  for (const d of limpiar) await borrarTemporal(d);
});

async function abrirApp(ficheros, nombre) {
  const raiz = await carpetaDeEjemplo(ficheros, nombre);
  limpiar.push(raiz);
  const app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 150, barridoMs: 500 }).iniciar();
  apps.push(app);
  const p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => !document.querySelector('.carga'));
  return { app, raiz, p, doc: async (r) => leer(r, await fsp.readFile(join(raiz, r), 'utf8')) };
}
async function hasta(fn, que, ms = 8000) {
  const fin = performance.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* aún no */
    }
    if (performance.now() > fin) throw new Error(`no se cumplió: ${que}`);
    await esperar(80);
  }
}

test('primera vez: carpeta vacía → asistente → cuentas, grupos, recurrentes y Base en tu carpeta', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { p, doc, raiz } = await abrirApp(new Map([['ajustes.md', '# Ajustes\nesquema: 1\n']]), 'vacia');
  await p.waitForSelector('[data-inicio]');
  await p.fill('#io-nombre', 'Alex');
  await p.selectOption('#io-dia', '25');
  await p.click('[data-inicio] [data-accion=io-paso][data-i="1"]:not([disabled]) >> text=siguiente');
  await p.fill('#io-cs-0', '1.250,00');
  await p.click('[data-accion=io-anadir][data-lista=cuentas]');
  await p.fill('#io-cn-1', 'Remunerada');
  await p.fill('#io-cs-1', '3.000');
  await p.check('[data-cambio=io-colchon][data-i="1"]');
  await p.click('text=siguiente →');
  await p.uncheck('[data-cambio=io-grupo][data-id=regalos]');
  await p.click('text=siguiente →');
  await p.fill('#io-ri-0', '2.500,00');
  await p.click('[data-accion=io-anadir][data-lista=recurrentes]');
  await p.fill('#io-rc-1', 'Alquiler');
  await p.fill('#io-ri-1', '-750');
  await p.selectOption('#io-rg-1', 'vivienda');
  await p.click('text=siguiente →');
  await p.click('[data-accion=io-crear]');
  await p.waitForSelector('[data-inicio]', { state: 'detached', timeout: 15000 });
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'panel');
  const c = await doc('cuentas.md');
  assert.deepEqual(items(c).map((x) => [x.id, x.saldo_inicial.importe, !!x.colchon]), [['cuenta-corriente', 125000, false], ['remunerada', 300000, true]]);
  assert.ok(!items(await doc('grupos.md')).some((g) => g.id === 'regalos'));
  assert.deepEqual(items(await doc('recurrentes.md')).map((r) => [r.concepto, r.importe, r.grupo]), [['Nómina', 250000, 'sueldo'], ['Alquiler', -75000, 'vivienda']]);
  assert.deepEqual([valores(await doc('ajustes.md')).nombre, valores(await doc('ajustes.md')).mes_inicio_dia], ['Alex', 25]);
  assert.ok((await fsp.readdir(join(raiz, 'conocimiento/base'))).length >= 6, 'la Base copiada');
  // ya no es la primera vez: las pestañas normales
  await p.waitForSelector('.tabs [data-vista=mes]');
});

test('guarida de Rex, Pendientes configurables y humor desde Ajustes', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { p, doc } = await abrirApp(EJEMPLO, 'guarida');
  await p.evaluate(() => (location.hash = 'rex'));
  await p.waitForSelector('[data-guarida]');
  assert.match(await p.textContent('[data-guarida]'), /humor: (contento|tranquilo|preocupado)/);
  assert.equal(await p.getAttribute('[data-accesorio=gafas]', 'data-logrado'), 'true');
  assert.match(await p.getAttribute('[data-guarida] svg.rex', 'data-rex-accesorio'), /gafas/, 'Rex lleva sus gafas');
  // Ajustes → Rex: con un umbral imposible, Rex se pone preocupado en reposo
  await p.click('[data-accion=abrir-ajustes]');
  await p.click('[role=dialog] [data-accion=aj-seccion][data-id=rex]');
  await p.fill('#aj-rex_humor', 'contento>=95 | preocupado<95');
  await p.click('[role=dialog] form[data-seccion=rex] button[type=submit]');
  await hasta(async () => valores(await doc('ajustes.md')).rex_humor === 'contento>=95 | preocupado<95', 'humor guardado');
  await p.waitForFunction(() => document.querySelector('[data-humor]')?.textContent === 'preocupado');
  // un humor mal escrito no se guarda (aviso claro)
  await p.fill('#aj-rex_humor', 'siempre feliz');
  await p.click('[role=dialog] form[data-seccion=rex] button[type=submit]');
  await p.waitForSelector('.toast.error');
  assert.equal(valores(await doc('ajustes.md')).rex_humor, 'contento>=95 | preocupado<95');
  // ese 400 lo hemos provocado: el navegador lo apunta en la consola
  const i = errores.findIndex((e) => /status of 400/.test(e));
  if (i >= 0) errores.splice(i, 1);
  // Pendientes: quitar «Gastos y entradas al día»
  await p.click('[role=dialog] [data-accion=aj-seccion][data-id=pendientes]');
  await p.uncheck('#pe-movimientos');
  await p.click('[role=dialog] form[data-form=aj-pendientes] button[type=submit]');
  await hasta(async () => !/movimientos/.test(valores(await doc('ajustes.md')).pendientes), 'pendientes guardados');
  await p.keyboard.press('Escape');
  await p.evaluate(() => (location.hash = 'panel'));
  await p.waitForFunction(() => !/Gastos y entradas al día/.test(document.querySelector('.lateral')?.textContent ?? ''));
  // §14.18: una predicción de un descubrimiento sale bien (resuelta desde otro sitio) → Rex lo celebra
  await p.evaluate(() => fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'prediccion.resolver', args: { id: 'PR-0130', estado: 'acertada' } }) }));
  await p.waitForFunction(() => /¡Acertó!/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => document.querySelector('[data-rex]')?.dataset.rexEstado), 'feliz');
});

test('conflicto resuelto desde la interfaz (fusionar) y papelera con restaurar', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { p, raiz, app } = await abrirApp(EJEMPLO, 'conflicto');
  const otra = 'cuentas (copia en conflicto de PORTATIL).md';
  await fsp.writeFile(join(raiz, otra), `${EJEMPLO.get('cuentas.md')}- nueva | Cuenta del portátil | tipo: ahorro\n`);
  await app.almacen.barrer();
  await p.waitForSelector('.banda [data-accion=conflictos]', { timeout: 10000 });
  await p.click('.banda [data-accion=conflictos]');
  await p.click(`[role=dialog] [data-accion=cf-ver][data-ruta="${otra}"]`);
  await p.waitForSelector('[role=dialog] [data-conflicto]');
  assert.match(await p.textContent('[role=dialog] [data-conflicto]'), /Cuenta del portátil/);
  await p.click('[role=dialog] [data-accion=cf-resolver][data-modo=fusionar]');
  await p.click('[data-si]');
  await hasta(async () => /Cuenta del portátil/.test(await fsp.readFile(join(raiz, 'cuentas.md'), 'utf8')), 'fusionado');
  await p.waitForSelector('[role=dialog]', { state: 'detached' });
  await p.waitForSelector('.banda [data-accion=conflictos]', { state: 'detached' });
  // papelera: las versiones descartadas están ahí, con vista previa
  await p.click('[data-accion=gestion]');
  await p.click('[data-accion=gestion-entrada][data-entrada=papelera]');
  await p.waitForSelector('[role=dialog] [data-papelera] [data-accion=pap-restaurar]');
  await p.fill('#pap-busca', 'PORTATIL');
  await p.waitForFunction(() => document.querySelectorAll('[data-papelera] [data-accion=pap-restaurar]').length === 1);
  await p.click('[data-papelera] [data-accion=pap-restaurar]');
  await hasta(() => fsp.stat(join(raiz, otra)), 'la copia en conflicto vuelve');
  await p.keyboard.press('Escape');
});

test('roles: tu versión de un rol de finhub, y volver al de finhub', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { p, raiz } = await abrirApp(new Map([...EJEMPLO].filter(([r]) => !r.startsWith('roles/'))), 'roles');
  await p.click('[data-accion=gestion]');
  await p.click('[data-accion=gestion-entrada][data-entrada=roles]');
  await p.waitForSelector('[role=dialog] [data-texto="diablo.md"]');
  await p.click('[role=dialog] [data-accion=txt-editar][data-n="diablo.md"]');
  await p.waitForSelector('#txt-area');
  const texto = await p.inputValue('#txt-area');
  await p.fill('#txt-area', `${texto.trimEnd()}\n- Sé breve.\n`);
  await p.click('[role=dialog] form[data-form=txt-guardar] button[type=submit]');
  await hasta(async () => /Sé breve/.test(await fsp.readFile(join(raiz, 'roles/diablo.md'), 'utf8')), 'rol guardado');
  await p.waitForSelector('[role=dialog] [data-accion=txt-restaurar][data-n="diablo.md"]');
  await p.click('[role=dialog] [data-accion=txt-restaurar][data-n="diablo.md"]');
  await p.click('[data-si]');
  await hasta(async () => fsp.stat(join(raiz, 'roles/diablo.md')).then(() => false, () => true), 'vuelta al de finhub');
  await p.keyboard.press('Escape');
});

test('app instalable: manifiesto y service worker servidos; sin errores en todo el recorrido', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { p, app } = await abrirApp(EJEMPLO, 'pwa');
  const r = await p.evaluate(async () => {
    const m = await fetch('/manifest.webmanifest');
    const s = await fetch('/sw.js');
    return { m: m.headers.get('content-type'), s: s.headers.get('content-type'), nombre: (await m.json()).name };
  });
  assert.deepEqual(r, { m: 'application/manifest+json; charset=utf-8', s: 'text/javascript; charset=utf-8', nombre: 'finhub' });
  await p.waitForFunction(() => navigator.serviceWorker.getRegistration().then((x) => !!x), null, { timeout: 5000 });
  assert.ok(app.url);
  assert.deepEqual(errores, []);
});
