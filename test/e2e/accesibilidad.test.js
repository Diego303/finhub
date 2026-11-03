// Accesibilidad (F12): en cada pestaña y en los modales principales, todo control tiene nombre accesible,
// no hay ids repetidos, las imágenes tienen texto alternativo, el idioma está declarado y se puede saltar
// al contenido y moverse por las pestañas con el teclado. Carpeta temporal de ejemplo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado } from '../server/ayudas.js';

const VISTAS = ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'];
let navegador = null;
let app;
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
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

/** Auditoría en la página: devuelve la lista de problemas encontrados en `sel`. */
const auditar = (sel) =>
  p.evaluate((sel) => {
    const raiz = document.querySelector(sel) ?? document;
    const problemas = [];
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
    const texto = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const nombre = (el) => {
      if (el.getAttribute('aria-label')?.trim()) return true;
      const lb = el.getAttribute('aria-labelledby');
      if (lb && lb.split(' ').some((id) => texto(document.getElementById(id)))) return true;
      if (el.labels && [...el.labels].some((l) => texto(l))) return true;
      if (el.title?.trim()) return true;
      if (['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role')) return !!texto(el) || !!el.querySelector('[aria-label], img[alt]');
      return false;
    };
    for (const el of raiz.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=tab], [role=radio], [role=menuitem], [role=checkbox]')) {
      if (!visible(el)) continue;
      if (!nombre(el)) problemas.push(`sin nombre: ${el.outerHTML.slice(0, 140)}`);
    }
    for (const el of raiz.querySelectorAll('svg[role=img], img')) if (!el.getAttribute('aria-label') && !el.getAttribute('alt')) problemas.push(`imagen sin texto: ${el.outerHTML.slice(0, 100)}`);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) problemas.push(`id repetido: ${id}`);
    for (const el of raiz.querySelectorAll('[aria-labelledby]')) for (const id of el.getAttribute('aria-labelledby').split(' ')) if (!document.getElementById(id)) problemas.push(`aria-labelledby roto: ${id}`);
    return problemas;
  }, sel);

const ir = async (v) => {
  await p.evaluate((x) => (location.hash = x), v);
  await p.waitForFunction((x) => document.querySelector('#marco').dataset.vista === x, v);
};

test('cada pestaña: nombres accesibles, sin ids repetidos, imágenes con texto, idioma', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  assert.equal(await p.getAttribute('html', 'lang'), 'es');
  // el auditor detecta de verdad un control sin nombre (autocomprobación)
  await p.evaluate(() => document.querySelector('#contenido').insertAdjacentHTML('beforeend', '<button type="button" id="sin-nombre-prueba"></button><input id="campo-prueba">'));
  assert.equal((await auditar('#marco')).length, 2);
  await p.evaluate(() => ['sin-nombre-prueba', 'campo-prueba'].forEach((id) => document.getElementById(id).remove()));
  const todos = {};
  for (const v of VISTAS) {
    await ir(v);
    const pr = await auditar('#marco');
    if (pr.length) todos[v] = pr;
  }
  assert.deepEqual(todos, {});
});

test('modales: Ajustes (todas las secciones), Gestión, papelera, R1, informe y simulador', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const todos = {};
  const modal = async (nombre, abrirlo) => {
    await abrirlo();
    await p.waitForSelector('[role=dialog]');
    await p.waitForTimeout(150);
    const pr = await auditar('#modal');
    if (pr.length) todos[nombre] = pr;
    await p.keyboard.press('Escape');
    await p.waitForSelector('[role=dialog]', { state: 'detached' });
  };
  await ir('panel');
  for (const s of ['carpeta', 'general', 'impuestos', 'proyeccion', 'pendientes', 'rex', 'claude', 'mas']) {
    await modal(`ajustes-${s}`, async () => {
      await p.click('[data-accion=abrir-ajustes]');
      await p.click(`[role=dialog] [data-accion=aj-seccion][data-id=${s}]`);
    });
  }
  await modal('papelera', async () => {
    await p.click('[data-accion=gestion]');
    await p.click('[data-accion=gestion-entrada][data-entrada=papelera]');
  });
  await modal('r1', () => p.click('[data-accion=abrir-r1]'));
  for (const e of ['cuentas', 'grupos', 'recurrentes']) {
    await modal(`gestion-${e}`, async () => {
      await p.click('[data-accion=gestion]');
      await p.click(`[data-accion=gestion-entrada][data-entrada=${e}]`);
    });
  }
  await ir('descubrimientos');
  await modal('informe', () => p.click('[data-descubrimiento=D-007] [data-accion=desc-informe]'));
  await modal('simulador', () => p.click('[data-descubrimiento=D-007] [data-accion=desc-sim]'));
  assert.deepEqual(todos, {});
});

test('teclado: saltar al contenido y flechas entre pestañas', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('panel');
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Tab');
  assert.match(await p.evaluate(() => document.activeElement.textContent), /Saltar al contenido/);
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'contenido');
  await p.focus('#pestana-panel');
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'mes');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'pestana-mes');
  await p.keyboard.press('End');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'tuano');
  assert.deepEqual(errores, []);
});
