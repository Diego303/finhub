// e2e de la web con Chromium (Playwright, devDependency aprobada en F0). Carpetas temporales y
// textos trampa de XSS (§2.2). Si no hay navegador instalado, se salta con aviso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, EJEMPLO, esperar } from '../server/ayudas.js';

const TRAMPAS = {
  cuenta: '<img src=x onerror="window.__xss=1">',
  meta: '<script>window.__xss=2</script>',
  movimiento: '<svg onload=window.__xss=3>',
  decision: '"><img src=x onerror=window.__xss=4>',
  descubrimiento: '<iframe src="javascript:window.__xss=5"></iframe>',
};

function ejemploConTrampas() {
  const m = new Map(EJEMPLO);
  m.set('cuentas.md', m.get('cuentas.md') + `- trampa | ${TRAMPAS.cuenta} | tipo: ahorro\n`);
  m.set('metas.md', m.get('metas.md') + `## trampa · ${TRAMPAS.meta}\n- objetivo: 100,00\n`);
  m.set('mes/2026-11.md', m.get('mes/2026-11.md').replace('| Concierto |', `| ${TRAMPAS.movimiento} |`));
  m.set('decisiones/2026-11-02-trampa.md', `# ${TRAMPAS.decision}\nesquema: 1\nfecha: 2026-11-02\nestado: lista\n## Qué\nx\n`);
  m.set('conocimiento/descubrimientos/D-002.md', m.get('conocimiento/descubrimientos/D-002.md').replace('# D-002 · Oro como diversificador', `# D-002 · ${TRAMPAS.descubrimiento}`));
  return m;
}

let navegador = null;
let app;
let aislado;
let raiz;
const apps = [];
const errores = [];

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch (e) {
    console.log(`(e2e saltado: no se pudo abrir Chromium: ${e.message.split('\n')[0]}. Instálalo con «pnpm exec playwright install chromium».)`);
    return;
  }
  aislado = await entornoAislado();
  raiz = await carpetaDeEjemplo(ejemploConTrampas());
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 100, barridoMs: 300, equipo: 'SOBREMESA' }).iniciar();
  apps.push(app);
});
after(async () => {
  await navegador?.close();
  for (const a of apps) await a.parar().catch(() => {});
  if (raiz) await borrarTemporal(raiz);
  if (aislado) await borrarTemporal(aislado.base);
});

async function pagina(url = app.url, opciones = {}) {
  const p = await navegador.newPage({ viewport: { width: 1320, height: 900 }, ...opciones });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(url);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista && !document.querySelector('.carga'));
  return p;
}

test('navegación completa: 10 pestañas, teclado, Pendientes salvo en Rex y Tu año, < 200 ms por vista', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const p = await pagina();
  const pestanas = await p.$$eval('[role=tab]', (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual(pestanas, ['Panel', 'Mes', 'Cartera', 'Metas', 'Herramientas', 'Análisis', '🔭 Descubrimientos', 'Conocimiento', '🦖 Rex', '✦ Tu año']);
  assert.match(await p.textContent('.cabecera'), /finhub · ☁ .*finhub-test-datos/);
  for (const [i, id] of ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'].entries()) {
    await p.click(`[role=tab] >> nth=${i}`);
    await p.waitForFunction((x) => document.querySelector('#marco').dataset.vista === x, id);
    assert.equal(await p.getAttribute(`#pestana-${id}`, 'aria-selected'), 'true');
    assert.equal(await p.isVisible('#titulo-pendientes'), !['rex', 'tuano'].includes(id), `Pendientes en ${id}`);
    const ms = Number(await p.evaluate(() => document.querySelector('#marco').dataset.renderMs));
    assert.ok(ms < 200, `${id} se pinta en ${ms} ms`);
  }
  await p.focus('#pestana-tuano');
  const llega = (x) => p.waitForFunction((v) => document.querySelector('#marco').dataset.vista === v, x, { timeout: 3000 });
  await p.keyboard.press('ArrowRight');
  await llega('panel');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'pestana-panel', 'las flechas recorren las pestañas en círculo y el foco sigue');
  await p.keyboard.press('End');
  await llega('tuano');
  await p.keyboard.press('Home');
  await llega('panel');
  await p.goto(`${app.url}#muestrario`);
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'muestrario');
  assert.equal(await p.$$eval('#contenido .rejilla > div:first-child svg[data-rex]', (s) => s.map((x) => x.dataset.rexEstado).join()), 'quieto,piensa,habla,feliz,preocupado');
  await p.close();
});

test('XSS (§2.2): los textos trampa de los ficheros se ven literales y nunca se ejecutan', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const p = await pagina();
  for (const v of ['panel', 'metas', 'descubrimientos', 'rex']) {
    await p.goto(`${app.url}#${v}`);
    await p.waitForFunction((x) => document.querySelector('#marco').dataset.vista === x, v);
  }
  await p.goto(`${app.url}#metas`);
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'metas');
  const texto = await p.textContent('#app');
  assert.ok(texto.includes(TRAMPAS.meta), 'meta literal');
  assert.ok(texto.includes(TRAMPAS.decision), 'decisión literal');
  assert.ok(texto.includes(TRAMPAS.movimiento), 'movimiento literal en «último anotado»');
  await p.click('[data-accion=gestion]');
  await p.click('[data-entrada=cuentas]');
  assert.ok((await p.textContent('[role=dialog]')).includes(TRAMPAS.cuenta), 'cuenta literal en Gestión');
  await p.keyboard.press('Escape');
  await p.goto(`${app.url}#descubrimientos`);
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'descubrimientos');
  assert.ok((await p.textContent('#contenido')).includes('<iframe'), 'descubrimiento literal');
  await esperar(300);
  assert.equal(await p.evaluate(() => window.__xss), undefined, 'ningún texto trampa se ejecutó');
  assert.equal(await p.$$eval('#app img, #app iframe, #app script', (x) => x.length), 0, 'no se creó ningún elemento de los textos');
  await p.close();
});

test('Gestión ▾, modales accesibles (Esc, ×, foco), R1 y Ajustes', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const p = await pagina();
  await p.click('[data-accion=gestion]');
  assert.equal(await p.$$eval('.menu-gestion [role=menuitem]', (x) => x.length), 13);
  await p.keyboard.press('Escape');
  assert.equal(await p.$('.menu-gestion'), null, 'Esc cierra el menú');
  await p.click('[data-accion=gestion]');
  await p.click('[data-entrada=grupos]');
  assert.equal(await p.textContent('#titulo-modal'), 'Grupos y naturaleza');
  assert.equal(await p.getAttribute('[data-cerrar-modal]', 'aria-label'), 'Cerrar');
  assert.equal(await p.getAttribute('[role=dialog]', 'aria-modal'), 'true');
  await p.keyboard.press('Escape');
  assert.equal(await p.$('[role=dialog]'), null, 'Esc cierra el modal');
  await p.click('[data-accion=abrir-r1]');
  await p.waitForSelector('[data-matriz-r1] tbody tr');
  assert.equal(await p.$$eval('[data-matriz-r1] tbody tr', (x) => x.length), 9, 'R1: los 9 trabajos del plan');
  await p.click('[data-cerrar-modal]');
  assert.equal(await p.evaluate(() => document.activeElement?.dataset.accion), 'abrir-r1', 'el foco vuelve al botón');
  await p.click('[data-accion=abrir-ajustes]');
  assert.match(await p.textContent('[role=dialog]'), /Carpeta de datos · todo finhub vive aquí/);
  await p.click('[data-fondo-modal]', { position: { x: 5, y: 5 } });
  assert.equal(await p.$('[role=dialog]'), null, 'clic fuera cierra');
  await p.close();
});

test('tema: guardar «oscuro» en ajustes.md, aplicarlo y deshacerlo desde el toast', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const p = await pagina();
  await p.click('[data-accion=abrir-ajustes]');
  await p.selectOption('[data-tema]', 'oscuro');
  await p.waitForFunction(() => document.documentElement.dataset.tema === 'oscuro');
  assert.match(await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8'), /^- tema: oscuro$/m);
  assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(26, 26, 25)');
  await p.click('[data-toast-deshacer]');
  await p.waitForFunction(() => !document.documentElement.dataset.tema);
  assert.equal(await fsp.readFile(join(raiz, 'ajustes.md'), 'utf8'), EJEMPLO.get('ajustes.md'), 'deshacer: byte a byte');
  await p.close();
});

test('cambios de fuera, conflictos y otro equipo: la web se entera sola', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const p = await pagina();
  await fsp.writeFile(join(raiz, 'ajustes.md'), EJEMPLO.get('ajustes.md').replace('- nombre: Alex', '- nombre: Sam'));
  await p.waitForFunction(() => document.querySelector('#contenido').textContent.includes(', Sam.'), null, { timeout: 8000 });
  await fsp.writeFile(join(raiz, 'mes', '2026-11-PORTATIL.md'), 'copia del otro equipo');
  await p.waitForSelector('text=Conflicto en', { timeout: 8000 });
  assert.match(await p.textContent('.cabecera'), /1 conflicto/);
  const otra = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, equipo: 'PORTATIL', sondeoMs: 100, barridoMs: 300 }).iniciar();
  apps.push(otra);
  const q = await pagina(otra.url);
  assert.match(await q.textContent('.banda.aviso'), /finhub está abierto en SOBREMESA/);
  await q.click('[data-accion=tomar-control]');
  await q.click('[data-si]');
  await q.waitForFunction(() => !document.body.textContent.includes('abierto en SOBREMESA'), null, { timeout: 8000 });
  await app.candado.latir();
  await p.waitForSelector('text=PORTATIL ha tomado el control', { timeout: 8000 });
  await q.close();
  await p.close();
  await otra.parar();
  apps.splice(apps.indexOf(otra), 1);
  await app.candado.latir();
});

test('sin errores en la consola en todo el recorrido', (t) => {
  if (!navegador) return t.skip('sin Chromium');
  assert.deepEqual(errores, []);
});
