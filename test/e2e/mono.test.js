// QA7 · El mono: con una semilla, abre cada pestaña y modal, pulsa lo que haya y rellena y envía formularios al azar, con el
// Claude falso. Nunca puede haber: error de página, error de consola de la app, respuesta 5xx, un fichero que no se pueda
// leer ni serializar, o la carpeta fuera de su sitio. Además cuenta qué acciones de la web se han pulsado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { crearPrng } from '../../src/core/prng.js';
import { validar } from '../../scripts/qa-validar.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno } from '../qa/entorno.js';
import { fechaLocal } from '../../src/core/fechas.js';

const SEMILLA = Number(process.env.FINHUB_SEMILLA ?? 20261106);
const PASOS = Number(process.env.FINHUB_MONO ?? 1200);
const HOY = fechaLocal();
const VISTAS = ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano'];
// lo que sacaría la prueba de su carpeta o la dejaría sin servidor
const VETADAS = new Set(['carpeta-cambiar', 'tomar-control', 'tuano-png']);
const TEXTOS = ['Texto de prueba', '12,50', '-3', '2026-11-05', '100', '<img src=x onerror=alert(1)>', 'a | b # c', '', '🦖', '0'];

let navegador;
let ent;
let app;
const errores = [];
const servidor = [];

before(async () => {
  navegador = await chromium.launch();
  ent = await crearEntorno({ nombre: 'mono' });
  const dir = join(ent.base, 'respuestas');
  await fsp.mkdir(dir);
  const chat = json({ respuesta_md: 'Vas bien [B-0001].', citas: ['B-0001'], cifras_usadas: [] });
  for (const [k, v] of Object.entries({
    privado: chat,
    'rex-web': json({ respuesta_md: 'El TER es un coste.', citas: ['https://m.example/a'], cifras_usadas: [] }),
    pulso: json({ notas: [{ titulo: 'Noticia del mono', tipo: 'hecho', fecha: HOY, origen: { medio: 'Medio', url: 'https://m.example/a' }, temas: ['bolsa'], activos: [], resumen: 'Resumen de veinte caracteres o más.' }] }),
    descubrir: json({ descubrimientos: [{ titulo: 'Salud global', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'Tesis suficientemente larga para validar.', saldria_bien_si: 'a', la_invalidaria: 'b', riesgos: 'c', vehiculos: [], citas: ['https://m.example/a'], afirmaciones: [], revisar_en_dias: 30 }] }),
    conocimiento: json({ fuentes: [], coinciden: 'x', discrepan: 'y', opinion_modelo: 'z' }),
    encaje: json({ ya_tienes: 'x', solapamiento: 'y', comentario_md: 'Comentario largo.', citas: [], cifras_usadas: [] }),
    ingesta: json({ notas: [{ titulo: 'Idea', tipo: 'opinión', temas: [], activos: [], resumen: 'Resumen de veinte caracteres o más.' }], predicciones: [] }),
    precios: json({ precios: [] }),
    datos: json({ series: [] }),
  })) await fsp.writeFile(join(dir, `${k}.txt`), v);
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, sondeoMs: 500, barridoMs: 3000, enviarAPapelera: async () => ({ donde: 'prueba' }), claude: { comando: [process.execPath, FAKE, '--respuestas', dir] } }).iniciar();
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  await ent?.limpiar();
});

test(`${PASOS} pasos al azar (semilla ${SEMILLA}): sin errores de página, sin 5xx y los ficheros siempre sanos`, { timeout: 900000 }, async () => {
  const prng = crearPrng(SEMILLA);
  const p = await (await navegador.newContext({ viewport: { width: 1320, height: 900 } })).newPage();
  let ultimo = '';
  p.on('pageerror', (e) => errores.push(`pageerror tras «${ultimo}»: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|Content Security Policy|net::ERR/.test(m.text())) errores.push(`consola tras «${ultimo}»: ${m.text()}`);
  });
  p.on('response', (r) => {
    if (r.status() >= 500 && r.status() !== 503) servidor.push(`${r.status()} ${r.request().method()} ${r.url()} tras «${ultimo}» ${r.request().postData()?.slice(0, 200) ?? ''}`);
  });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
  const pulsadas = new Set();
  const formularios = new Set();
  for (let i = 0; i < PASOS; i++) {
    const azar = prng.siguiente();
    try {
      if (azar < 0.1) {
        const v = VISTAS[prng.entero(0, VISTAS.length - 1)];
        ultimo = `vista ${v}`;
        await p.evaluate(() => document.querySelector('[data-cerrar-modal]')?.click());
        await p.evaluate((x) => (location.hash = x), v);
        await p.waitForFunction((x) => document.querySelector('#marco')?.dataset.vista === x, v, { timeout: 2000 });
      } else if (azar < 0.72) {
        // pulsar algo visible (dentro del modal si hay uno)
        const objetivo = await p.evaluate(({ r, r2, vetadas, ya }) => {
          const raiz = document.querySelector('[role=dialog]') ?? document.body;
          const l = [...raiz.querySelectorAll('[data-accion], [data-si], [data-no], [data-opcion], [data-toast-deshacer]')].filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width && b.height && !e.disabled && !vetadas.includes(e.dataset.accion) && !e.closest('[data-accion=carpeta-cambiar]');
          });
          if (!l.length) return null;
          // sobre todo lo que aún no se ha pulsado
          const nuevos = l.filter((e) => e.dataset.accion && !ya.includes(e.dataset.accion));
          const lista = nuevos.length && r2 < 0.8 ? nuevos : l;
          const e = lista[Math.floor(r * lista.length)];
          e.setAttribute('data-mono', '1');
          return e.dataset.accion ?? 'respuesta';
        }, { r: prng.siguiente(), r2: prng.siguiente(), vetadas: [...VETADAS], ya: [...pulsadas] });
        if (objetivo) {
          ultimo = `pulsar ${objetivo}`;
          pulsadas.add(objetivo);
          await p.click('[data-mono="1"]', { timeout: 800, force: true }).catch(() => {});
          await p.evaluate(() => document.querySelector('[data-mono="1"]')?.removeAttribute('data-mono'));
        }
      } else if (azar < 0.97) {
        // rellenar un formulario entero y enviarlo
        const f = await p.evaluate(({ r, r2, ya, textos, semilla }) => {
          const raiz = document.querySelector('[role=dialog]') ?? document.body;
          const l = [...raiz.querySelectorAll('form[data-form]')].filter((x) => x.getBoundingClientRect().height);
          if (!l.length) return null;
          const nuevos = l.filter((x) => !ya.includes(x.dataset.form));
          const lista = nuevos.length && r2 < 0.8 ? nuevos : l;
          const form = lista[Math.floor(r * lista.length)];
          let k = semilla;
          for (const c of form.querySelectorAll('input:not([type=hidden]), textarea, select')) {
            k = (k * 16807) % 2147483647;
            if (c.tagName === 'SELECT') {
              if (c.options.length) c.selectedIndex = k % c.options.length;
            } else if (c.type === 'checkbox' || c.type === 'radio') c.checked = k % 2 === 0;
            else if (c.type !== 'file' && k % 4 !== 0) c.value = textos[k % textos.length];
            c.dispatchEvent(new Event('input', { bubbles: true }));
            c.dispatchEvent(new Event('change', { bubbles: true }));
          }
          form.requestSubmit();
          return form.dataset.form;
        }, { r: prng.siguiente(), r2: prng.siguiente(), ya: [...formularios], textos: TEXTOS, semilla: prng.entero(1, 1e9) });
        if (f) {
          ultimo = `formulario ${f}`;
          formularios.add(f);
        }
      } else {
        ultimo = 'Esc';
        await p.keyboard.press('Escape');
      }
      await p.waitForTimeout(25);
    } catch (e) {
      if (/closed|crash/i.test(e.message)) throw e;
    }
    if (i % 100 === 99) assert.equal((await p.evaluate(() => fetch('/api/salud').then((r) => r.status))), 200, `el servidor sigue vivo (paso ${i})`);
  }
  console.log(`acciones pulsadas: ${pulsadas.size} · formularios enviados: ${formularios.size} (${[...formularios].sort().join(', ')})`);
  await p.waitForTimeout(800);
  await p.context().close();
  assert.deepEqual(errores.slice(0, 20), [], `semilla ${SEMILLA}`);
  assert.deepEqual(servidor.slice(0, 20), [], `semilla ${SEMILLA}`);
  assert.equal(app.carpeta, ent.datos, 'la carpeta sigue siendo la misma');
  // al acabar, los ficheros están sanos
  const r = await validar(ent.datos);
  assert.deepEqual(r.sinLeer.filter((x) => x.ruta.endsWith('.md')), []);
  assert.deepEqual(r.idaYVuelta.filter((x) => /no es estable/.test(x.problema)), []);
  assert.ok(pulsadas.size >= 70, `${pulsadas.size} acciones`);
});
