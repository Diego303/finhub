// QA6 · XSS: un texto hostil en CADA campo libre de CADA fichero y en las salidas del Claude falso, y se recorren todas
// las pestañas y los modales: todo se ve como texto, ningún elemento con on*, ningún script nuevo, ningún alert; y los
// enlaces solo son http(s), con rel="noopener noreferrer".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { generar } from '../../scripts/generar-ejemplo.js';
import { envenenar } from '../qa/hostil.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno } from '../qa/entorno.js';
import { fechaLocal } from '../../src/core/fechas.js';

const HOY = fechaLocal();
const TRAMPAS = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', 'javascript:alert(1)', '[x](javascript:alert(1))', '![x](x" onerror="alert(1))', '<script>alert(1)</script>', "'><iframe src=javascript:alert(1)>", '<a href="javascript:alert(1)">clic</a>', '`<b>negrita</b>`'];
const T = TRAMPAS[0];
const VISTAS = ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'];
const ENTRADAS = ['cuentas', 'grupos', 'etiquetas', 'recurrentes', 'activos'];

let navegador;
let ent;
let app;
let p;
const errores = [];

before(async () => {
  navegador = await chromium.launch();
  const f = envenenar(new Map([...generar()].filter(([r]) => r.endsWith('.md'))), (i) => TRAMPAS[i % TRAMPAS.length]);
  ent = await crearEntorno({ nombre: 'xss', ficheros: [...f] });
  const dir = join(ent.base, 'respuestas');
  await fsp.mkdir(dir);
  const md = `Mira ${TRAMPAS.join(' · ')} [enlace](javascript:alert(1)) [bueno](https://bueno.example/a)`;
  for (const [k, v] of Object.entries({
    privado: json({ respuesta_md: md, citas: [T, 'javascript:alert(1)'], cifras_usadas: [T] }, md),
    'rex-web': json({ respuesta_md: md, citas: ['https://bueno.example/a', T], cifras_usadas: [] }, md),
    pulso: json({ notas: [{ titulo: `Título ${T}`, tipo: 'hecho', fecha: HOY, origen: { medio: `Medio ${T}`, url: 'https://bueno.example/a' }, temas: ['bolsa'], activos: [], resumen: `Resumen largo de veinte caracteres ${T}` }] }, md),
    descubrir: json({ descubrimientos: [{ titulo: `Tema ${T}`, tipo: 'tema', postura: 'neutral', confianza: 'baja', tesis: `Una tesis suficientemente larga ${T}`, saldria_bien_si: T, la_invalidaria: T, riesgos: T, vehiculos: [{ nombre: T, isin: 'IE00B4L5Y983', indice: T }], citas: ['https://bueno.example/a'], afirmaciones: [{ tipo: 'hecho', texto: T }], revisar_en_dias: 30 }] }, md),
  })) await fsp.writeFile(join(dir, `${k}.txt`), v);
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, claude: { comando: [process.execPath, FAKE, '--respuestas', dir] } }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 900 } });
  await p.addInitScript(() => {
    window.__alertas = 0;
    window.alert = () => window.__alertas++;
  });
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Content Security Policy|Failed to load resource/.test(m.text())) errores.push(m.text());
  });
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  p.on('dialog', (d) => {
    errores.push(`diálogo: ${d.message()}`);
    d.dismiss().catch(() => {});
  });
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  await ent?.limpiar();
});

/** Nada ejecutable en el DOM, en este momento. */
async function limpio(donde) {
  const r = await p.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (/^on/i.test(a.name)) malos.push(`${el.tagName} ${a.name}`);
        if (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*(javascript|data|vbscript):/i.test(a.value) && !(el.tagName === 'IMG' && a.value.startsWith('data:image/'))) malos.push(`${el.tagName} ${a.name}=${a.value}`);
      }
      if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName) && !(el.tagName === 'SCRIPT' && el.src)) malos.push(el.tagName);
    }
    const enlaces = [...document.querySelectorAll('a[href]')].map((a) => ({ h: a.getAttribute('href'), rel: a.rel, t: a.target }));
    return { malos, alertas: window.__alertas, enlaces };
  });
  assert.deepEqual(r.malos, [], `${donde}: elementos peligrosos`);
  assert.equal(r.alertas, 0, donde);
  for (const a of r.enlaces) {
    assert.match(a.h, /^(https?:\/\/|#|\/)/i, `${donde}: enlace ${a.h}`);
    if (/^https?:/i.test(a.h)) assert.match(a.rel, /noopener/, `${donde}: ${a.h} sin rel`);
    if (/^https?:/i.test(a.h)) assert.match(a.rel, /noreferrer/, `${donde}: ${a.h} sin rel`);
  }
}

test('todas las pestañas y, en cada una, todo lo que se despliega', async () => {
  const conTexto = [];
  for (const v of VISTAS) {
    await p.goto(`${app.url}#${v}`);
    await p.waitForFunction((x) => document.querySelector('#marco')?.dataset.vista === x, v, { timeout: 8000 }).catch(async (e) => {
      throw new Error(`no se abre ${v}: ${errores.join(' | ')} · ${(await p.textContent('body')).slice(0, 300)} · ${e.message.slice(0, 80)}`);
    });
    await p.waitForTimeout(150);
    await limpio(v);
    if ((await p.textContent('#contenido')).includes('<img src=x') || (await p.textContent('#contenido')).includes('<svg')) conTexto.push(v);
    // lo que abre un detalle en esta vista
    const n = Math.min(await p.locator('#contenido [data-accion]').count(), 40);
    for (let i = 0; i < n; i++) {
      const b = p.locator('#contenido [data-accion]').nth(i);
      const accion = await b.getAttribute('data-accion').catch(() => null);
      if (!accion || !/ver|abrir|detalle|editar|nota|fuente|mezcla|historial/.test(accion) || /borrar|cerrar|lanzar|hacer|pedir|generar/.test(accion)) continue;
      await b.click({ timeout: 800 }).catch(() => {});
      await p.waitForTimeout(40);
      await limpio(`${v} · ${accion}`);
      await p.keyboard.press('Escape');
    }
  }
  assert.ok(conTexto.length >= 5, `el texto hostil se ve como texto en: ${conTexto}`);
  assert.deepEqual(errores, []);
});

test('Gestión: cada entrada; Ajustes y Papelera', async () => {
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel');
  for (const e of ENTRADAS) {
    await p.click('[data-accion=gestion]');
    await p.click(`[data-entrada=${e}]`, { timeout: 2000 });
    await p.waitForTimeout(40);
    await limpio(`gestión ${e}`);
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
  }
  await p.click('[data-accion=abrir-ajustes]');
  await limpio('ajustes');
  await p.keyboard.press('Escape');
  assert.deepEqual(errores, []);
});

test('salidas del Claude falso: chat privado y web, con los textos hostiles como texto', async () => {
  await p.goto(`${app.url}#rex`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'rex');
  await p.fill('#pregunta-rex', `Pregunta con ${T}`);
  await p.press('#pregunta-rex', 'Enter');
  await p.waitForFunction(() => /\[enlace\]|enlace/.test(document.querySelector('#contenido').textContent) && /<img src=x/.test(document.querySelector('#contenido').textContent), null, { timeout: 15000 });
  await limpio('chat privado');
  assert.deepEqual(errores, []);
});

test('un valor con HTML en un formulario se guarda tal cual y se ve como texto', async () => {
  await p.goto(`${app.url}#mes`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'mes');
  await p.selectOption('#anotar-grupo', { index: 1 });
  await p.fill('#anotar-dia', '2');
  await p.fill('#anotar-concepto', T);
  await p.fill('#anotar-importe', '-1');
  await p.click('form[data-form=anotar] button[type=submit]');
  await p.waitForFunction((t) => document.querySelector('#contenido').textContent.includes(t), T);
  await limpio('concepto');
  const mes = HOY.slice(0, 7);
  assert.ok((await fsp.readFile(join(ent.datos, `mes/${mes}.md`), 'utf8')).includes(T));
  assert.deepEqual(errores, []);
});
