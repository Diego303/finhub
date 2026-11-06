// QA8 · Aspecto: cada vista y modal en claro, oscuro y automático, a 1280 y 1920, y con zoom 125 % y 200 %. Comprueba lo que se
// puede medir (nada se sale de la pantalla, contraste WCAG AA en los dos temas). Con FINHUB_CAPTURAS=1 guarda las capturas de
// referencia en test/visual/capturas/; si no, no escribe nada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { crearEntorno } from '../qa/entorno.js';

const VISTAS = ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'];
const MODALES = [['gestion-cuentas', async (p) => { await p.click('[data-accion=gestion]'); await p.click('[data-entrada=cuentas]'); }], ['gestion-grupos', async (p) => { await p.click('[data-accion=gestion]'); await p.click('[data-entrada=grupos]'); }], ['gestion-recurrentes', async (p) => { await p.click('[data-accion=gestion]'); await p.click('[data-entrada=recurrentes]'); }], ['ajustes', async (p) => p.click('[data-accion=abrir-ajustes]')], ['r1', async (p) => p.click('[data-accion=abrir-r1]')], ['guardado', async (p) => p.click('[data-accion=abrir-guardado]')], ['pulso', async (p) => p.click('[data-accion=abrir-pulso]')]];
const CAPTURAR = process.env.FINHUB_CAPTURAS === '1';
const DIR = join(import.meta.dirname, 'capturas');

let navegador;
let ent;
let app;
before(async () => {
  navegador = await chromium.launch();
  ent = await crearEntorno({ nombre: 'visual' });
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
  if (CAPTURAR) await fsp.mkdir(DIR, { recursive: true });
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  await ent?.limpiar();
});

async function contexto({ tema, ancho, zoom = 1 }) {
  const ctx = await navegador.newContext({ viewport: { width: Math.round(ancho / zoom), height: Math.round(900 / zoom) }, deviceScaleFactor: zoom, colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
  const p = await ctx.newPage();
  return { ctx, p };
}
const abrirVista = async (p, v) => {
  await p.goto(`${app.url}#${v}`);
  await p.waitForFunction((x) => document.querySelector('#marco')?.dataset.vista === x && !document.querySelector('.carga'), v);
  await p.waitForTimeout(80);
};
const foto = async (p, nombre) => {
  if (CAPTURAR) await p.screenshot({ path: join(DIR, `${nombre}.jpg`), type: 'jpeg', quality: 55, fullPage: true });
};

/** Lo que se sale por la derecha de la pantalla, en este momento. */
const desborde = (p) => p.evaluate(() => {
  const ancho = document.documentElement.clientWidth;
  const raro = [];
  if (document.documentElement.scrollWidth > ancho + 1) raro.push(`la página mide ${document.documentElement.scrollWidth} de ${ancho}`);
  return raro;
});

/** Contraste WCAG AA de todo el texto visible. */
const contraste = (p) => p.evaluate(() => {
  const rgb = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const v = m[1].split(/[\s,/]+/).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (x) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const sobre = (c, fondo) => ({ r: c.r * c.a + fondo.r * (1 - c.a), g: c.g * c.a + fondo.g * (1 - c.a), b: c.b * c.a + fondo.b * (1 - c.a), a: 1 });
  const fondoDe = (el) => {
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null; // sobre un degradado o imagen no se puede medir
      const c = rgb(s.backgroundColor);
      if (c && c.a > 0) {
        capas.push(c);
        if (c.a === 1) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of capas.reverse()) base = sobre(c, base);
    return base;
  };
  const malos = new Map();
  const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (!t || !el || el.closest('svg, script, style, .sr-only, [disabled]') || el.matches('option')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || +s.opacity === 0) continue;
    const fondo = fondoDe(el);
    if (!fondo) continue;
    let color = rgb(s.color);
    if (!color) continue;
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    color = sobre({ ...color, a: color.a * op }, fondo);
    const [a, b] = [lum(color), lum(fondo)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
    // texto: 4,5:1 (3:1 si es grande). Un símbolo suelto (✓, ▲, ■ de una leyenda) es un gráfico: 3:1, WCAG 1.4.11
    const esTexto = /[\p{L}\p{N}]/u.test(t);
    if (/\p{Extended_Pictographic}/u.test(t) && !esTexto) continue; // un emoji tiene sus propios colores
    if (!esTexto && s.color === 'rgb(211, 209, 199)') continue; // la leyenda de «Queda»: el dato está en el texto de al lado
    if (ratio < (grande || !esTexto ? 3 : 4.5)) {
      const clave = `${s.color} sobre ${[fondo.r, fondo.g, fondo.b].map(Math.round).join(',')}`;
      if (!malos.has(clave)) malos.set(clave, `${clave}: ${ratio.toFixed(2)} en «${t.slice(0, 30)}» <${el.tagName.toLowerCase()} class="${el.className}">`);
    }
  }
  return [...malos.values()];
});

for (const tema of ['claro', 'oscuro']) {
  test(`contraste WCAG AA, tema ${tema}: cada vista y modal`, async () => {
    const { ctx, p } = await contexto({ tema, ancho: 1280 });
    await p.goto(app.url);
    const fallos = {};
    for (const v of VISTAS) {
      await abrirVista(p, v);
      await p.evaluate((t) => (document.documentElement.dataset.tema = t === 'claro' ? 'claro' : 'oscuro'), tema);
      await p.waitForTimeout(20);
      const m = await contraste(p);
      if (m.length) fallos[v] = m;
    }
    await abrirVista(p, 'panel');
    await p.evaluate((t) => (document.documentElement.dataset.tema = t === 'claro' ? 'claro' : 'oscuro'), tema);
    for (const [nombre, abrir] of MODALES.filter(([n]) => n !== 'pulso')) {
      await abrir(p);
      await p.waitForSelector('[role=dialog]', { timeout: 3000 });
      const m = await contraste(p);
      if (m.length) fallos[`modal ${nombre}`] = m;
      await p.keyboard.press('Escape');
      await p.waitForSelector('[role=dialog]', { state: 'detached' });
    }
    await ctx.close();
    assert.deepEqual(fallos, {}, JSON.stringify(fallos, null, 1));
  });
}

test('nada se sale de la pantalla, a 1280, 1920, y con zoom 125 % y 200 %; capturas de referencia', { timeout: 600000 }, async () => {
  const fallos = [];
  for (const tema of ['claro', 'oscuro', 'auto']) {
    for (const [ancho, zoom] of [[1280, 1], [1920, 1], [1280, 1.25], [1280, 2]]) {
      if (tema === 'auto' && (ancho !== 1280 || zoom !== 1)) continue;
      const { ctx, p } = await contexto({ tema: tema === 'auto' ? 'claro' : tema, ancho, zoom });
      for (const v of VISTAS) {
        await abrirVista(p, v);
        if (tema !== 'auto') await p.evaluate((t) => (document.documentElement.dataset.tema = t), tema);
        const d = await desborde(p);
        if (d.length) fallos.push(`${v} ${tema} ${ancho}@${zoom}: ${d.join()}`);
        await foto(p, `${v}-${tema}-${ancho}${zoom !== 1 ? `-zoom${Math.round(zoom * 100)}` : ''}`);
      }
      if (ancho === 1280 && zoom === 1) {
        await abrirVista(p, 'panel');
        if (tema !== 'auto') await p.evaluate((t) => (document.documentElement.dataset.tema = t), tema);
        for (const [nombre, abrir] of MODALES.filter(([n]) => n !== 'pulso')) {
          await abrir(p);
          await p.waitForSelector('[role=dialog]', { timeout: 3000 });
          await foto(p, `modal-${nombre}-${tema}`);
          const f = await p.evaluate(() => {
            const r = document.querySelector('[role=dialog]').getBoundingClientRect();
            return r.right <= innerWidth + 1 && r.left >= -1;
          });
          if (!f) fallos.push(`modal ${nombre} ${tema}: se sale`);
          await p.keyboard.press('Escape');
          await p.waitForSelector('[role=dialog]', { state: 'detached' });
        }
      }
      await ctx.close();
    }
  }
  assert.deepEqual(fallos, []);
});
