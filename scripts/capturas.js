#!/usr/bin/env node
// Capturas para el README y docs/ (pnpm capturas): finhub con la carpeta de EJEMPLO (datos inventados) en
// una copia temporal, Chromium de Playwright (devDependency) y el Claude falso. Escribe SOLO en
// docs/capturas/*.png; las copias temporales se borran al terminar. La ruta de la cabecera se enseña como
// «D:\GoogleDrive\FINANZAS» (la de la instalación típica) en vez de la del temporal.
// Los datos del ejemplo terminan el 3 de noviembre de 2026: las capturas quedan mejor ese día.
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { prepararEjemplo, limpiarEjemplo } from '../src/cli/ejemplo.js';
import { App } from '../src/server/app.js';

const SALIDA = join(import.meta.dirname, '..', 'docs', 'capturas');
const RUTA_VISTA = 'D:\\GoogleDrive\\FINANZAS';
const ANCHO = 1320;
const ALTO = 900;

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  console.error('Falta Playwright (devDependency): pnpm install && npx playwright install chromium');
  process.exit(1);
}

const temporales = [];
const apps = [];
const navegador = await chromium.launch();
const hechas = [];

async function abrirApp(dir, { ejemplo = true } = {}) {
  const xdg = await fsp.mkdtemp(join(dir, '..', 'finhub-capturas-xdg-'));
  temporales.push(xdg);
  const env = { ...process.env, XDG_CONFIG_HOME: join(xdg, 'c'), XDG_CACHE_HOME: join(xdg, 'k'), XDG_DATA_HOME: join(xdg, 'd') };
  const app = await new App({ carpeta: dir, puerto: 0, env, ejemplo, guardarConfig: false }).iniciar();
  apps.push(app);
  return app;
}

async function pagina(app, { tema = null } = {}) {
  const p = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO }, colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => !document.querySelector('.carga'));
  return p;
}

/** La ruta del temporal se enseña como la verías en tu equipo, en toda la página; sin toasts ni foco. */
async function preparar(p) {
  await p.evaluate((ruta) => {
    const temporal = document.querySelector('.cabecera .ruta > span')?.textContent ?? '';
    const wsl = temporal.startsWith('\\\\wsl') ? '/' + temporal.split('\\').slice(4).join('/') : null;
    const recorrer = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrer.nextNode(); n; n = recorrer.nextNode()) {
      if (temporal && n.nodeValue.includes(temporal)) n.nodeValue = n.nodeValue.replaceAll(temporal, ruta);
      if (wsl && n.nodeValue.includes(wsl)) n.nodeValue = n.nodeValue.replaceAll(wsl, '/mnt/d/GoogleDrive/FINANZAS');
    }
    for (const el of document.querySelectorAll('[title]')) if (temporal && el.title.includes(temporal)) el.title = el.title.replaceAll(temporal, ruta);
    document.getElementById('toast').replaceChildren();
    document.activeElement?.blur?.();
  }, RUTA_VISTA);
  await p.waitForTimeout(250);
}

async function foto(p, nombre, { completa = false } = {}) {
  await preparar(p);
  await p.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: completa });
  hechas.push(nombre);
}

async function ir(p, vista) {
  await p.evaluate((v) => (location.hash = v), vista);
  await p.waitForFunction((v) => document.querySelector('#marco')?.dataset.vista === v, vista);
  await p.waitForTimeout(300);
}

try {
  await fsp.mkdir(SALIDA, { recursive: true });
  const ej = await prepararEjemplo();
  const app = await abrirApp(ej);
  // la cabecera de un ejemplo dice «ejemplo · datos inventados»: así queda marcado en todas las capturas
  const p = await pagina(app);
  for (const [vista, nombre] of [['panel', '01-panel'], ['mes', '02-mes'], ['cartera', '03-cartera'], ['metas', '04-metas'], ['herramientas', '05-herramientas'], ['analisis', '06-analisis'], ['descubrimientos', '07-descubrimientos'], ['conocimiento', '08-conocimiento'], ['rex', '09-rex'], ['tuano', '10-tu-ano']]) {
    await ir(p, vista);
    await foto(p, nombre);
  }
  // modales: simulador, R1, ajustes y el detalle del indicador de guardado (tras un cambio)
  await ir(p, 'descubrimientos');
  await p.click('[data-descubrimiento=D-007] [data-accion=desc-sim]');
  await p.waitForSelector('[data-simulador]');
  await foto(p, '11-simulador');
  await p.keyboard.press('Escape');
  await p.click('[data-accion=abrir-r1]');
  await p.waitForSelector('[data-matriz-r1]');
  await foto(p, '12-regla-r1');
  await p.keyboard.press('Escape');
  await ir(p, 'panel');
  await p.evaluate(async () => (await import('/api.js')).op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'Mercadona', importe: -4370, grupo: 'comida', cuenta: 'corriente' } }, { mensaje: 'Anotado en mes/2026-11.md' }));
  await p.waitForFunction(() => /guardado \d/.test(document.querySelector('[data-accion=abrir-guardado]')?.textContent ?? ''));
  await p.click('[data-accion=abrir-guardado]');
  await p.waitForSelector('[data-historial-guardado]');
  await foto(p, '13-guardado');
  await p.keyboard.press('Escape');
  await p.click('[data-accion=abrir-ajustes]');
  await p.click('[role=dialog] [data-accion=aj-seccion][data-id=pendientes]');
  await foto(p, '14-ajustes');
  await p.keyboard.press('Escape');
  await p.close();
  // tema oscuro
  const po = await pagina(app, { tema: 'oscuro' });
  await foto(po, '15-oscuro');
  await po.close();
  // la primera vez: una carpeta nueva y vacía (solo ajustes.md)
  const vacia = await fsp.mkdtemp(join(ej, '..', 'finhub-ejemplo-vacia-'));
  temporales.push(vacia);
  await fsp.writeFile(join(vacia, 'ajustes.md'), '# Ajustes\nesquema: 1\n');
  const app2 = await abrirApp(vacia, { ejemplo: false }); // el asistente sale en una carpeta tuya, no en un ejemplo
  const pv = await pagina(app2);
  await pv.waitForSelector('[data-inicio]');
  await pv.click('text=siguiente →');
  await pv.fill('#io-cs-0', '1.250,00');
  await foto(pv, '16-primera-vez');
  await pv.close();
  for (const a of apps) await a.parar();
  await limpiarEjemplo(ej);
  console.log(`✓ ${hechas.length} capturas en docs/capturas/: ${hechas.join(', ')}`);
} finally {
  await navegador.close();
  for (const a of apps) await a.parar().catch(() => {});
  for (const d of temporales) if (/finhub-(capturas-xdg|ejemplo-vacia)-/.test(d)) await fsp.rm(d, { recursive: true, force: true });
}
