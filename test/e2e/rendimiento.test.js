// §9.18: con 5 años de datos (≈ 3.000 movimientos, 600 operaciones, 2.000 notas), cada vista se pinta en
// < 200 ms. Se mide el repintado de cada pestaña (data-render-ms) en Chromium, con una carpeta temporal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado } from '../server/ayudas.js';
import { datosGrandes } from '../server/grande.js';

const VISTAS = ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'];
let navegador = null;
let app;
let p;
const limpiar = [];
const errores = [];
let datos;

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  datos = datosGrandes();
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  const raiz = await carpetaDeEjemplo(datos.fs, 'grande');
  limpiar.push(raiz);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'), null, { timeout: 30000 });
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

test('5 años de datos: cada pestaña se pinta en menos de 200 ms', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  assert.ok(datos.movimientosNuevos >= 2500 && datos.operaciones >= 600 && datos.notasNuevas >= 2000);
  const tiempos = {};
  for (const v of VISTAS) {
    const medidas = [];
    // el peor de tres repintados, incluido el primero (en frío)
    for (let i = 0; i < 3; i++) {
      await p.evaluate((x) => {
        location.hash = x === location.hash.slice(1) ? '' : x;
        if (location.hash !== `#${x}`) location.hash = x;
      }, v);
      await p.waitForFunction((x) => document.querySelector('#marco').dataset.vista === x, v, { timeout: 30000 });
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      medidas.push(Number(await p.evaluate(() => document.querySelector('#marco').dataset.renderMs)));
    }
    tiempos[v] = Math.max(...medidas);
  }
  t.diagnostic(`render (ms): ${JSON.stringify(tiempos)}`);
  for (const [v, ms] of Object.entries(tiempos)) assert.ok(ms < 200, `${v}: ${ms} ms`);
  assert.deepEqual(errores, []);
});
