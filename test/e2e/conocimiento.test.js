// F8 «hecho cuando»: Conocimiento sin IA desde la web (mezcla, ficha, buscador, notas, predicciones, Base)
// y la mezcla fluida con 60 fuentes ficticias. Cada paso se comprueba en el disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { indiceNotas, buscarNotas } from '../../src/core/conocimiento.js';
import { validarBase } from '../../scripts/validar-base.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, EJEMPLO } from '../server/ayudas.js';

let navegador = null;
let aislado;
const limpiar = [];
const apps = [];
const errores = [];

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

async function abrirApp(ficheros = EJEMPLO) {
  const raiz = await carpetaDeEjemplo(ficheros);
  limpiar.push(raiz);
  const app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000 }).iniciar();
  apps.push(app);
  const p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#conocimiento`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'conocimiento' && !document.querySelector('.carga'));
  const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
  return { raiz, p, doc };
}
async function hasta(fn, que, ms = 6000) {
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
const dialogo = '[role=dialog]';

test('conocimiento de punta a punta desde la web', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const { raiz, p, doc } = await abrirApp();
  const fuentes = async () => items(await doc('conocimiento/_fuentes.md'));
  const activas = async () => (await fuentes()).filter((f) => f.activa_por_defecto).map((f) => f.id).sort();

  // 1 · tu mezcla: casilla de la tabla, mezcla guardada desde el panel, familia entera
  await p.check('table [data-cambio=fuente-activa][data-id=sinprisa]');
  await hasta(async () => (await activas()).includes('sinprisa'), 'casilla');
  await p.click('[data-accion=mezcla-panel]');
  await p.click('[data-panel-mezcla] [data-accion=mezcla-aplicar][data-id=solo-base]');
  await hasta(async () => (await activas()).join() === 'base,datos', 'mezcla «Solo base»');
  await p.waitForFunction(() => /Mezcla: Solo base · 2 de 35/.test(document.querySelector('[data-accion=mezcla-panel]').textContent));
  await p.click('[data-panel-mezcla] [data-accion=familia-plegar][data-id=pod]');
  await p.click('[data-panel-mezcla] [data-accion=familia-todas][data-id=pod]');
  await hasta(async () => (await activas()).length === 2 + 6, 'familia de podcasts añadida');
  await p.fill('#buscar-fuente', 'café');
  await p.waitForFunction(() => document.querySelectorAll('[data-panel-mezcla] [data-cambio=fuente-activa]').length === 1);
  await p.click('[data-accion=mezcla-panel]');

  // 2 · ficha: renombrar y cambiar caducidad
  await p.click('button[data-accion=ficha][data-id=pizarra]');
  await p.fill(`${dialogo} [name=nombre]`, 'La pizarra');
  await p.fill(`${dialogo} [name=caducidad]`, '90d');
  await p.click(`${dialogo} form[data-form=fuente-editar] button[type=submit]`);
  await hasta(async () => (await fuentes()).find((f) => f.id === 'pizarra')?.nombre === 'La pizarra', 'renombrada');
  assert.equal((await fuentes()).find((f) => f.id === 'pizarra').caducidad.dias, 90);
  await p.keyboard.press('Escape');

  // 3 · buscador: mismo resultado que core; ver, editar y mover una nota
  const M = construirModelo(Object.fromEntries([...EJEMPLO].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
  const esperado = buscarNotas(indiceNotas(M), { texto: 'tecnolog' }).length;
  await p.fill('#busca-texto', 'tecnolog');
  await p.waitForFunction((n) => document.querySelectorAll('[data-accion=nota-ver]').length === Math.min(n, 30), esperado);
  await p.fill('#busca-texto', 'P-0019');
  await p.waitForFunction(() => document.querySelectorAll('[data-accion=nota-ver]').length === 1);
  await p.click('[data-accion=nota-ver][data-id="P-0019"]');
  assert.match(await p.textContent('[data-nota-cuerpo]'), /corrección superior al 10 %/);
  await p.click(`${dialogo} [data-accion=nota-form]`);
  await p.fill(`${dialogo} [name=cuerpo]`, 'Resumen corregido a mano.');
  await p.fill(`${dialogo} [name=temas]`, 'bolsa, valoraciones, sp500');
  await p.click(`${dialogo} button[type=submit]`);
  const ruta = 'conocimiento/pizarra/2026-10-28-valoraciones.md';
  await hasta(async () => bloques(await doc(ruta)).find((b) => b.id === 'P-0019')?.campos.editada === true, 'nota editada');
  assert.deepEqual(bloques(await doc(ruta)).find((b) => b.id === 'P-0019').campos.temas, ['bolsa', 'valoraciones', 'sp500']);
  await p.click('[data-accion=nota-ver][data-id="P-0019"]');
  await p.selectOption(`${dialogo} form[data-form=nota-mover] select`, 'indexado');
  await p.click(`${dialogo} form[data-form=nota-mover] button[type=submit]`);
  await hasta(async () => (await fsp.readdir(join(raiz, 'conocimiento/indexado'))).some((f) => f.includes('500-esta-caro')), 'nota movida');
  await p.fill('#busca-texto', '');

  // 4 · + nota en Mis notas
  await p.click('main [data-accion=nota-form][data-id=""] >> nth=0');
  await p.fill(`${dialogo} [name=titulo]`, 'No tocar el colchón');
  await p.fill(`${dialogo} [name=cuerpo]`, 'El colchón no se invierte nunca, pase lo que pase.');
  await p.fill(`${dialogo} [name=temas]`, 'colchón');
  await p.click(`${dialogo} button[type=submit]`);
  const mias = await hasta(async () => (await fsp.readdir(join(raiz, 'conocimiento/mias'))).find((f) => f.includes('no-tocar-el-colchon')), 'nota creada');
  assert.deepEqual(bloques(await doc(`conocimiento/mias/${mias}`))[0].campos.temas, ['colchon']);

  // 5 · predicciones: registrar una medible, resolverla sola; resolver otra a mano
  await p.click('[data-accion=pred-form]');
  await p.fill(`${dialogo} [name=texto]`, 'el índice mundial sube en octubre');
  await p.fill(`${dialogo} [name=medir]`, 'msci-world-nr-eur variacion 2026-10-01→2026-10-31 > 0');
  await p.click(`${dialogo} button[type=submit]`);
  await p.waitForSelector('[data-accion=pred-auto]');
  await p.click('[data-accion=pred-auto]');
  const preds = async () => items(await doc('conocimiento/predicciones.md'));
  await hasta(async () => (await preds()).find((x) => x.texto === 'el índice mundial sube en octubre')?.estado !== 'pendiente', 'resuelta sola');
  assert.equal((await preds()).find((x) => x.texto === 'el índice mundial sube en octubre').resuelta, '2026-10-31');
  await p.click('[data-accion=pred-resolver][data-id=PR-0130][data-estado=no-medible]');
  await hasta(async () => (await preds()).find((x) => x.id === 'PR-0130')?.estado === 'no-medible', 'no medible');

  // 6 · la Base de finhub: importar las notas nuevas (si el repo ya las tiene)
  const base = validarBase();
  if (base.notas) {
    await p.click('[data-accion=base-revisar]');
    await p.click(`${dialogo} [data-accion=base-importar]`);
    await hasta(async () => (await fsp.readdir(join(raiz, 'conocimiento/base'))).filter((x) => x.endsWith('.md') && !x.startsWith('.')).length > 1, 'base importada');
    await p.waitForFunction(() => !document.querySelector('[data-accion=base-revisar]'));
    let n = 0;
    for (const f of (await fsp.readdir(join(raiz, 'conocimiento/base'))).filter((x) => x.endsWith('.md') && !x.startsWith('.'))) n += bloques(await doc(`conocimiento/base/${f}`)).filter((b) => /^B-1\d{3}$/.test(b.id)).length;
    assert.equal(n, base.notas);
    await p.waitForFunction(() => !document.querySelector('[data-accion=base-revisar]'));
  }

  // 7 · nueva fuente y borrar otra (sus notas a la papelera, la mezcla avisa)
  await p.click('[data-accion=fuente-nueva]');
  await p.fill(`${dialogo} [name=nombre]`, 'Finanzas con Calma');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => (await fuentes()).some((f) => f.id === 'finanzas-con-calma'), 'fuente creada');
  await p.click('button[data-accion=ficha][data-id=cafe]');
  await p.click(`${dialogo} [data-accion=fuente-borrar]`);
  await p.click(`${dialogo} [data-si]`);
  await hasta(async () => !(await fuentes()).some((f) => f.id === 'cafe'), 'fuente borrada');
  assert.equal(await fsp.stat(join(raiz, 'conocimiento/cafe')).then((s) => s.isDirectory() && fsp.readdir(join(raiz, 'conocimiento/cafe')).then((x) => x.length)).catch(() => 0), 0);
  assert.deepEqual(errores, []);
});

test('mezcla fluida con 60 fuentes ficticias', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const extra = Array.from({ length: 25 }, (_, i) => `- ficticia-${i} | Canal ficticio ${i} | familia: ${['yt', 'macro', 'pod', 'prensa'][i % 4]} | prefijo: Z${String.fromCharCode(65 + i)} | privada: no | activa_por_defecto: ${i % 2 ? 'sí' : 'no'}`);
  const ficheros = new Map(EJEMPLO);
  ficheros.set('conocimiento/_fuentes.md', `${EJEMPLO.get('conocimiento/_fuentes.md').trimEnd()}\n${extra.join('\n')}\n`);
  const { p, doc } = await abrirApp(ficheros);
  assert.equal(items(await doc('conocimiento/_fuentes.md')).length, 60);
  await p.click('[data-accion=mezcla-panel]');
  for (const f of ['yt', 'macro', 'pod', 'prensa', 'mias']) if ((await p.getAttribute(`[data-panel-mezcla] [data-accion=familia-plegar][data-id=${f}]`, 'aria-expanded')) === 'false') await p.click(`[data-panel-mezcla] [data-accion=familia-plegar][data-id=${f}]`);
  assert.equal(await p.$$eval('[data-panel-mezcla] [data-cambio=fuente-activa]', (x) => x.length), 60);
  // escribir en el buscador repinta en milisegundos
  const tiempos = [];
  for (const c of 'canal ficticio 1') {
    await p.type('#buscar-fuente', c);
    tiempos.push(Number(await p.evaluate(() => document.querySelector('#marco').dataset.renderMs)));
  }
  assert.ok(Math.max(...tiempos) < 150, `render máximo ${Math.max(...tiempos)} ms`);
  assert.equal(await p.$$eval('[data-panel-mezcla] [data-cambio=fuente-activa]', (x) => x.length), 11); // 1 y 10–19
  await p.fill('#buscar-fuente', '');
  // «todas» y vuelta a «ninguna»
  await p.click('[data-panel-mezcla] [data-accion=mezcla-todas]');
  await hasta(async () => items(await doc('conocimiento/_fuentes.md')).every((f) => f.activa_por_defecto), 'todas activas');
  await p.waitForFunction(() => /· 60 de 60/.test(document.querySelector('[data-accion=mezcla-panel]').textContent));
  assert.deepEqual(errores, []);
});
