// F9 desde la web, con el Claude falso: «Datos de mercado» (luz verde → progreso → propuesta → guardar) y el
// modal R1 con la matriz de los trabajos y el registro reales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items } from '../../src/core/formato/motor.js';
import { fechaLocal, sumarMesesMes, mesDe } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, temporal } from '../server/ayudas.js';

const FAKE = join(import.meta.dirname, '..', 'fake-claude.js');
let navegador = null;
let app;
let raiz;
let p;
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
  const tmp = await temporal('resp');
  limpiar.push(tmp);
  const mes = mesDe(fechaLocal());
  const filas = Array.from({ length: 24 }, (_, i) => ({ mes: sumarMesesMes(mes, i - 24), valor: 50 + i * 0.5 }));
  const resp = join(tmp, 'r.txt');
  await fsp.writeFile(resp, `He usado el ETF de acumulación como proxy.\n\n\`\`\`json\n${JSON.stringify({ series: [{ id: 'msci-acwi-nr-eur', filas, origen: 'iShares MSCI ACWI · https://www.ishares.com/x' }] })}\n\`\`\``);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000, claude: { comando: [process.execPath, FAKE, '--esperar', '400', '--respuesta', resp] } }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#conocimiento`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'conocimiento' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const dialogo = '[role=dialog]';

test('Datos de mercado con Claude: luz verde, progreso, propuesta revisada y guardar', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await p.click('[data-accion=abrir-datos]');
  await p.waitForSelector(`${dialogo} [data-cambio=datos-serie]`);
  assert.equal(await p.isDisabled(`${dialogo} [data-cambio=datos-serie][data-id=msci-world-nr-eur]`), true, 'las sintéticas no se tocan');
  for (const id of await p.$$eval(`${dialogo} [data-cambio=datos-serie]:checked`, (x) => x.map((y) => y.dataset.id))) await p.uncheck(`${dialogo} [data-cambio=datos-serie][data-id=${id}]`);
  await p.check(`${dialogo} [data-cambio=datos-serie][data-id=msci-acwi-nr-eur]`);
  await p.click(`${dialogo} [data-accion=datos-lanzar]`);
  await p.waitForSelector(`${dialogo} .spinner`);
  await p.waitForFunction(() => [...document.querySelectorAll('[data-rex]')].some((x) => ['piensa', 'habla'].includes(x.dataset.rexEstado)));
  await p.waitForSelector(`${dialogo} [data-accion=datos-guardar]`, { timeout: 10000 });
  assert.match(await p.textContent(dialogo), /msci-acwi-nr-eur/);
  await p.click(`${dialogo} [data-accion=datos-guardar]`);
  const ruta = join(raiz, 'conocimiento/datos/series/msci-acwi-nr-eur.md');
  for (let i = 0; i < 100 && !(await fsp.stat(ruta).catch(() => null)); i++) await esperar(80);
  const doc = leer('conocimiento/datos/series/msci-acwi-nr-eur.md', await fsp.readFile(ruta, 'utf8'));
  assert.equal(items(doc, 'Filas').length, 24);
  // la serie nueva aparece en el visor de Conocimiento
  await p.waitForSelector('[data-accion=serie-ver][data-id=msci-acwi-nr-eur]');
});

test('modal R1: la matriz real de los 9 trabajos y el registro de hoy', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await p.waitForFunction(() => /registro de hoy: [1-9]/.test(document.querySelector('.r1bar')?.textContent ?? ''));
  await p.$eval('[data-accion=abrir-r1]', (b) => b.click()); // el toast de «deshacer» (10 s) tapa la barra
  await p.waitForSelector('[data-matriz-r1]');
  assert.equal(await p.$$eval('[data-matriz-r1] tbody tr', (x) => x.length), 9);
  const filas = await p.$$eval('[data-matriz-r1] tbody tr', (x) => x.map((r) => [...r.children].slice(2, 5).map((c) => c.textContent.trim())));
  assert.ok(filas.every(([i, pr, ex]) => !(i === 'sí' && pr === 'sí' && ex !== 'no')), 'ninguna fila con los tres');
  assert.match(await p.textContent('[data-registro-hoy]'), /datos.*✓/s);
  assert.deepEqual(errores, []);
});
