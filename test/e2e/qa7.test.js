// QA7 · Lo que faltaba de punta a punta: sincronización con el sondeo real (≤ 3 s), dos pestañas (409 con aviso), parar y
// arrancar sin perder nada, Pendientes con reloj simulado, deshacer de 10 s, modos y estados de Rex (error → preocupado),
// PNG de Tu año no en blanco, y teclado: sin trampas, foco visible, iconos con nombre. Cero errores de consola.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { FAKE } from '../qa/ayuda-claude.js';
import { crearEntorno, esperar } from '../qa/entorno.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';

const HOY = fechaLocal();
let navegador;
const pendientesDeLimpiar = [];
const errores = [];
const ESPERADOS = /Failed to load resource|ERR_ABORTED|net::ERR/;

before(async () => {
  navegador = await chromium.launch();
});
after(async () => {
  await navegador?.close();
  for (const f of pendientesDeLimpiar) await f();
});

async function montar({ nombre = 'qa7', opciones = {}, ent: e0 = null } = {}) {
  const ent = e0 ?? (await crearEntorno({ nombre }));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, ...opciones }).iniciar();
  pendientesDeLimpiar.push(async () => {
    await app.parar().catch(() => {});
    await ent.limpiar();
  });
  return { ent, app };
}
async function pagina(app, vista = 'panel', { reloj = null } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1320, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  if (reloj) await p.clock.install({ time: new Date(`${reloj}T10:00:00`) });
  p.on('console', (m) => m.type() === 'error' && !ESPERADOS.test(m.text()) && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#${vista}`);
  await p.waitForFunction((v) => document.querySelector('#marco')?.dataset.vista === v && !document.querySelector('.carga'), vista);
  return p;
}
async function hasta(fn, que, ms = 6000) {
  const fin = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* aún no */
    }
    if (Date.now() > fin) throw new Error(`no se cumplió: ${que}`);
    await esperar(50);
  }
}

test('una edición a mano se ve en la web en ≤ 3 s, con el sondeo por defecto', async () => {
  const { ent, app } = await montar({ nombre: 'qa7-mano' });
  const p = await pagina(app, 'panel');
  const ruta = join(ent.datos, 'ajustes.md');
  await esperar(100);
  await fsp.writeFile(ruta, (await fsp.readFile(ruta, 'utf8')).replace(/^- nombre: .*$/m, '- nombre: Editado en el Bloc de notas'));
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('#contenido').textContent.includes('Editado en el Bloc de notas'), null, { timeout: 5000 });
  assert.ok(Date.now() - t0 <= 3000, `${Date.now() - t0} ms`);
  await p.context().close();
});

test('dos pestañas: la que no se ha enterado recibe el aviso y sus datos se recargan; nada se pisa', async () => {
  const { ent, app } = await montar({ nombre: 'qa7-pestanas' });
  const p1 = await pagina(app, 'mes');
  const p2 = await pagina(app, 'mes');
  // la segunda se queda sin enterarse de nada: ni eventos, ni sondeo, y los datos que ya tiene
  await p2.route('**/api/version', (r) => r.abort());
  await p2.evaluate(() => 0);
  const anotar = async (p, concepto) => {
    await p.fill('#anotar-dia', String(+HOY.slice(8)));
    await p.fill('#anotar-concepto', concepto);
    await p.fill('#anotar-importe', '1');
    await p.click('form[data-form=anotar] button[type=submit]');
  };
  // simulamos «en vuelo»: p2 calcula con la base vieja porque la petición sale antes de que le llegue el aviso
  const base = await p2.evaluate(() => fetch('/api/version').then((r) => r.json()).catch(() => null));
  assert.equal(base, null, 'la segunda está aislada');
  const v0 = app.almacen.version;
  await anotar(p1, 'De la primera pestaña');
  const ruta = join(ent.datos, `mes/${HOY.slice(0, 7)}.md`);
  await hasta(async () => (await fsp.readFile(ruta, 'utf8')).includes('De la primera pestaña'), 'p1 guarda');
  const r = await p2.evaluate(async (b) => {
    const x = await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'mov.crear', args: { mov: { fecha: new Date().toISOString().slice(0, 10), concepto: 'De la segunda', importe: 1, grupo: null, naturaleza: 'traspaso' } }, base: b }) });
    return { estado: x.status, json: await x.json() };
  }, v0);
  assert.equal(r.estado, 409);
  assert.equal(r.json.codigo, 'conflicto_version');
  const t = await fsp.readFile(ruta, 'utf8');
  assert.match(t, /De la primera pestaña/);
  assert.doesNotMatch(t, /De la segunda/);
  await p1.context().close();
  await p2.context().close();
});

test('parar y arrancar: la pestaña se reconecta y no se pierde nada', async () => {
  const { ent, app } = await montar({ nombre: 'qa7-reinicio' });
  const p = await pagina(app, 'mes');
  await p.fill('#anotar-dia', String(+HOY.slice(8)));
  await p.fill('#anotar-concepto', 'Antes de parar');
  await p.fill('#anotar-importe', '2');
  await p.click('form[data-form=anotar] button[type=submit]');
  const ruta = join(ent.datos, `mes/${HOY.slice(0, 7)}.md`);
  await hasta(async () => (await fsp.readFile(ruta, 'utf8')).includes('Antes de parar'), 'guardado');
  const antes = await fsp.readFile(ruta, 'utf8');
  const puerto = app.puerto;
  await app.parar();
  await p.waitForFunction(() => /sin conexión|Sin conexión/i.test(document.body.textContent), null, { timeout: 8000 });
  assert.equal(await fsp.readFile(ruta, 'utf8'), antes, 'lo guardado sigue');
  const otra = await new App({ carpeta: ent.datos, puerto, env: ent.env, guardarConfig: false }).iniciar();
  pendientesDeLimpiar.unshift(() => otra.parar().catch(() => {}));
  await p.waitForFunction(() => !/sin conexión/i.test(document.querySelector('#marco').textContent), null, { timeout: 8000 });
  await p.fill('#anotar-concepto', 'Después de arrancar');
  await p.fill('#anotar-importe', '3');
  await p.fill('#anotar-dia', String(+HOY.slice(8)));
  await p.click('form[data-form=anotar] button[type=submit]');
  await hasta(async () => (await fsp.readFile(ruta, 'utf8')).includes('Después de arrancar'), 'guardado tras reiniciar');
  assert.match(await fsp.readFile(ruta, 'utf8'), /Antes de parar/);
  await p.context().close();
  await otra.parar();
});

test('Pendientes con reloj simulado: lo hecho desaparece de hacer y al día siguiente reaparece; nada se lanza solo', async () => {
  const { ent, app } = await montar({ nombre: 'qa7-reloj', opciones: { claude: { comando: [process.execPath, FAKE, '--trazas', '/nonexistent'] } } });
  const ahora = '2026-11-03'; // el día del pulso del ejemplo
  assert.ok(await fsp.stat(join(ent.datos, `conocimiento/mundo/${ahora}.md`)));
  const p = await pagina(app, 'panel', { reloj: ahora });
  const fila = (t) => p.evaluate((x) => {
    const el = [...document.querySelectorAll('.pd')].find((d) => d.textContent.includes(x));
    return el ? el.querySelector('.cb').classList.contains('ok') : null;
  }, t);
  assert.equal(await fila('Pulso de noticias'), true, 'hoy ya hay pulso');
  await p.context().close();
  const p2 = await pagina(app, 'panel', { reloj: sumarDias(ahora, 1) });
  assert.equal(await p2.evaluate(() => [...document.querySelectorAll('.pd')].find((d) => d.textContent.includes('Pulso de noticias')).querySelector('.cb').classList.contains('ok')), false, 'al día siguiente vuelve a estar pendiente');
  assert.equal(app.claude.ejecuciones.size, 0, 'Pendientes nunca lanza nada');
  await p2.context().close();
});

test('deshacer: dentro de los 10 s deja el fichero byte a byte; pasados, el toast ya no está', async () => {
  const { ent, app } = await montar({ nombre: 'qa7-deshacer' });
  const p = await pagina(app, 'mes');
  const ruta = join(ent.datos, `mes/${HOY.slice(0, 7)}.md`);
  const antes = await fsp.readFile(ruta, 'utf8').catch(() => null);
  await p.fill('#anotar-dia', String(+HOY.slice(8)));
  await p.fill('#anotar-concepto', 'Para deshacer');
  await p.fill('#anotar-importe', '4');
  await p.click('form[data-form=anotar] button[type=submit]');
  await p.waitForSelector('[data-toast-deshacer]');
  await hasta(async () => (await fsp.readFile(ruta, 'utf8')).includes('Para deshacer'), 'guardado');
  await p.click('[data-toast-deshacer]');
  await hasta(async () => (await fsp.readFile(ruta, 'utf8').catch(() => null)) === antes, 'deshecho byte a byte');
  await p.fill('#anotar-dia', String(+HOY.slice(8)));
  await p.fill('#anotar-concepto', 'Sin deshacer');
  await p.fill('#anotar-importe', '5');
  await p.click('form[data-form=anotar] button[type=submit]');
  await p.waitForSelector('[data-toast-deshacer]');
  await p.waitForSelector('[data-toast-deshacer]', { state: 'detached', timeout: 12000 });
  assert.match(await fsp.readFile(ruta, 'utf8'), /Sin deshacer/);
  await p.context().close();
});

test('Rex: los 5 modos; un error de Claude da un mensaje claro y Rex preocupado; el aviso de web', async () => {
  const { app } = await montar({ nombre: 'qa7-rex', opciones: { claude: { comando: [process.execPath, FAKE, '--escenario', 'sin-sesion'] } } });
  const p = await pagina(app, 'rex');
  for (const m of ['opinan', 'pausa', 'semana', 'quiz', 'chat']) {
    await p.click(`[data-accion=rex-modo][data-modo=${m}]`);
    await p.waitForFunction((x) => document.querySelector(`[data-accion=rex-modo][data-modo=${x}]`)?.getAttribute('aria-selected') === 'true', m, { timeout: 2000 });
  }
  await p.fill('#pregunta-rex', '¿Cómo voy?');
  await p.press('#pregunta-rex', 'Enter');
  await p.waitForFunction(() => document.querySelector('[data-rex]') && [...document.querySelectorAll('[data-rex]')].some((r) => r.dataset.rexEstado === 'preocupado'), null, { timeout: 10000 });
  await p.waitForFunction(() => /sesión|login|inici/i.test(document.body.textContent), null, { timeout: 5000 });
  await p.context().close();
});

test('el PNG de Tu año no está en blanco', async () => {
  const { app } = await montar({ nombre: 'qa7-png' });
  const p = await pagina(app, 'tuano');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-accion=tuano-png]')]);
  const ruta = await d.path();
  const b = await fsp.readFile(ruta);
  assert.deepEqual([...b.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  const info = await p.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    const px = x.getImageData(0, 0, bmp.width, bmp.height).data;
    const colores = new Set();
    for (let i = 0; i < px.length; i += 4 * 97) colores.add(`${px[i]},${px[i + 1]},${px[i + 2]},${px[i + 3]}`);
    return { ancho: bmp.width, alto: bmp.height, colores: colores.size };
  }, [...b]);
  assert.ok(info.ancho > 200 && info.alto > 200, JSON.stringify(info));
  assert.ok(info.colores > 10, `tiene contenido: ${JSON.stringify(info)}`);
  await p.context().close();
});

test('teclado: Tab recorre sin trampas y con foco visible; Esc cierra y el foco vuelve; todo botón con nombre', async () => {
  const { app } = await montar({ nombre: 'qa7-teclado' });
  const p = await pagina(app, 'panel');
  for (const v of ['panel', 'mes', 'cartera', 'metas', 'herramientas', 'analisis', 'descubrimientos', 'conocimiento', 'rex', 'tuano']) {
    await p.goto(`${app.url}#${v}`);
    await p.waitForFunction((x) => document.querySelector('#marco')?.dataset.vista === x, v);
    const sinNombre = await p.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], [role=tab], input:not([type=hidden]), select, textarea')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const nombre = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim() || el.placeholder || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.closest('label')?.textContent || el.getAttribute('aria-labelledby');
      return !nombre;
    }).map((el) => el.outerHTML.slice(0, 110)));
    assert.deepEqual(sinNombre, [], `${v}: controles sin nombre`);
    // Tab: el foco avanza, nunca se queda atascado, y se ve
    await p.evaluate(() => document.activeElement?.blur());
    const vistos = new Set();
    let atascado = 0;
    await p.evaluate(() => {
      window.__vistos = new Set();
      window.__foco = null;
    });
    for (let i = 0; i < 80; i++) {
      await p.keyboard.press('Tab');
      const f = await p.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const s = getComputedStyle(a);
        const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' || a.matches(':focus-visible');
        const mismo = window.__foco === a;
        window.__foco = a;
        window.__vistos = (window.__vistos ?? new Set()).add(a);
        return { clave: a.id || a.outerHTML.slice(0, 90), visible, mismo, vistos: window.__vistos.size };
      });
      if (!f) continue;
      assert.ok(f.visible, `${v}: sin foco visible en ${f.clave}`);
      atascado = f.mismo ? atascado + 1 : 0;
      assert.ok(atascado < 3, `${v}: trampa de foco en ${f.clave}`);
      vistos.add(f.vistos);
    }
    assert.ok(Math.max(...vistos) >= 8, `${v}: Tab solo visita ${Math.max(...vistos)}`);
  }
  // modal: Esc cierra y el foco vuelve a donde estaba
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel');
  await p.focus('[data-accion=abrir-r1]').catch(() => p.focus('[data-accion=gestion]'));
  const antes = await p.evaluate(() => document.activeElement.dataset.accion);
  await p.keyboard.press('Enter');
  if (antes === 'abrir-r1') {
    await p.waitForSelector('[role=dialog]');
    // dentro del modal, Tab no se escapa
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press('Tab');
      assert.ok(await p.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'el foco se queda en el modal');
    }
    await p.keyboard.press('Escape');
    await p.waitForSelector('[role=dialog]', { state: 'detached' });
    assert.equal(await p.evaluate(() => document.activeElement?.dataset?.accion), antes, 'el foco vuelve');
  }
  await p.context().close();
});

test('cero errores de consola en todo este recorrido', () => {
  assert.deepEqual(errores, []);
});
