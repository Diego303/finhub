// F5 «hecho cuando»: la cartera se mantiene entera desde la web (operaciones, valores, activos, objetivo,
// cartera base) y lo que enseña coincide con lo que calcula core; cada paso se comprueba en el disco.
import { fechaLocal } from '../../src/core/fechas.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras } from '../../src/core/formato/motor.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar } from '../server/ayudas.js';

let navegador = null;
let app;
let aislado;
let raiz;
let p;
const HOY = fechaLocal();
const errores = [];

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  aislado = await entornoAislado();
  raiz = await carpetaDeEjemplo();
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000 }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#cartera`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'cartera' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  if (raiz) await borrarTemporal(raiz);
  if (aislado) await borrarTemporal(aislado.base);
});

const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
const ops = async () => items(await doc('cartera/operaciones.md'));
async function hasta(fn, que, ms = 6000) {
  const fin = performance.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* el fichero aún no existe */
    }
    if (performance.now() > fin) throw new Error(`no se cumplió: ${que}`);
    await esperar(80);
  }
}
const texto = async (sel = '#contenido') => (await p.textContent(sel)).replace(/ /g, ' ');
const dialogo = '[role=dialog]';
const si = async () => {
  await p.click(`${dialogo} [data-si]`);
  await p.waitForSelector(dialogo, { state: 'detached' });
};

test('la cartera de punta a punta desde la web', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  // 1 · lo que se ve: KPIs, comparativa con «tendrías», reparto de 600 €, exposición y clases
  const t1 = await texto();
  assert.match(t1, /Valor\s*37\.117 €/);
  assert.match(t1, /Hay operaciones posteriores a la última foto de valor/);
  assert.match(t1, /hoy tendrías:.*MSCI World 38\.699 €/s);
  assert.match(t1, /Reparte tu aportación/);
  assert.match(t1, /Dónde está tu dinero de verdad/);
  assert.match(t1, /Operaciones · 268/);

  // 2 · reparto: otra aportación recalcula al momento (múltiplos de 10 €)
  await p.fill('#aportacion', '1000');
  await p.press('#aportacion', 'Enter');
  await p.waitForFunction(() => document.getElementById('aportacion').value === '1.000');
  const aportes = await p.$$eval('#contenido .box table.tb', (ts) => {
    const t = ts.find((x) => x.textContent.includes('peso / obj.'));
    return [...t.querySelectorAll('tbody tr td:last-child')].map((td) => td.textContent.replace(/[^\d]/g, ''));
  });
  assert.equal(aportes.reduce((s, x) => s + (Number(x) || 0), 0), 1000);

  // 3 · + operación (con participaciones) → al disco; editar y borrar
  await p.click('main [data-accion=operacion-form][data-id=""]');
  await p.fill(`${dialogo} [name=fecha]`, '2026-11-03');
  await p.selectOption(`${dialogo} [name=activo]`, 'emergentes');
  await p.fill(`${dialogo} [name=importe]`, '250');
  await p.fill(`${dialogo} [name=participaciones]`, '7,25');
  await p.fill(`${dialogo} [name=nota]`, 'extra de noviembre');
  await p.click(`${dialogo} button[type=submit]`);
  const nueva = await hasta(async () => (await ops()).find((o) => o.nota === 'extra de noviembre'), 'operación creada');
  assert.deepEqual([nueva.id, nueva.tipo, nueva.activo, nueva.importe, nueva.participaciones], ['OP-0269', 'aportacion', { activo: 'emergentes' }, 25000, 7250000]);
  await p.waitForFunction(() => /Operaciones · 269/.test(document.querySelector('#contenido').textContent));
  await p.click('[data-accion=operacion-form][data-id="OP-0269"]');
  await p.fill(`${dialogo} [name=importe]`, '260');
  await p.fill(`${dialogo} [name=participaciones]`, '');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => (await ops()).find((o) => o.id === 'OP-0269')?.importe === 26000, 'operación editada');
  assert.equal((await ops()).find((o) => o.id === 'OP-0269').participaciones, undefined);
  await p.click('[data-accion=operacion-borrar][data-id="OP-0269"]');
  await si();
  await hasta(async () => !(await ops()).some((o) => o.id === 'OP-0269'), 'operación borrada');

  // 4 · traspaso sin destino: no se envía
  await p.click('main [data-accion=operacion-form][data-id=""]');
  await p.selectOption(`${dialogo} [name=tipo]`, 'traspaso');
  await p.selectOption(`${dialogo} [name=activo]`, 'msci-world');
  await p.fill(`${dialogo} [name=importe]`, '100');
  await p.click(`${dialogo} button[type=submit]`);
  await p.waitForFunction(() => /necesita destino/.test(document.querySelector('#toast')?.textContent ?? ''));
  await p.keyboard.press('Escape');

  // 5 · actualizar valores → foto del día en cartera/valores/ y desaparece el aviso de «faltan valores»
  await p.click('main [data-accion=valores-form]');
  const filas = await p.$$eval(`${dialogo} input[name^="v:"]`, (xs) => xs.map((x) => x.name.slice(2)));
  for (const id of filas) await p.fill(`${dialogo} [name="v:${id}"]`, '1000');
  await p.click(`${dialogo} button[type=submit]`);
  const foto = await hasta(async () => items(await doc(`cartera/valores/${HOY}.md`)), 'foto guardada');
  assert.equal(foto.length, filas.length);
  assert.ok(foto.every((f) => f.valor === 100000 && f.origen === 'manual'));
  await p.waitForFunction((n) => new RegExp(`Valor\\s*${n}\\.000 €`).test(document.querySelector('#contenido').textContent.replace(/ /g, ' ')), filas.length);
  assert.doesNotMatch(await texto(), /Hay operaciones posteriores a la última foto/);

  // 6 · + activo con ISIN y exposición; el ISIN con dígito de control mal pide confirmación
  await p.click('main [data-accion=activo-form][data-id=""]');
  await p.fill(`${dialogo} [name=nombre]`, 'Fondo Oro');
  await p.fill(`${dialogo} [name=isin]`, 'IE00B4ND3602');
  await p.selectOption(`${dialogo} [name=tipo]`, 'etf');
  await p.fill(`${dialogo} [name=ter]`, '0,12');
  await p.fill(`${dialogo} [name=exposicion]`, 'divisa USD 100');
  await p.click(`${dialogo} button[type=submit]`);
  const oro = await hasta(async () => bloques(await doc('cartera/activos.md')).find((a) => a.id === 'fondo-oro'), 'activo creado');
  assert.deepEqual([oro.titulo, oro.campos.isin, oro.campos.tipo, oro.campos.ter, oro.campos.exposicion.dimensiones.divisa], ['Fondo Oro', 'IE00B4ND3602', 'etf', 12, [{ nombre: 'USD', pb: 10000 }]]);
  await p.click('main [data-accion=activo-form][data-id=""]');
  await p.fill(`${dialogo} [name=nombre]`, 'Mal ISIN');
  await p.fill(`${dialogo} [name=isin]`, 'IE00B4ND3603');
  await p.click(`${dialogo} button[type=submit]`);
  await p.waitForFunction(() => /dígito de control/.test(document.querySelector('[role=dialog]')?.textContent ?? ''));
  await p.click(`${dialogo} [data-no]`);

  // 7 · Generar cartera base → borrador → aceptar: objetivo con los pesos de la plantilla
  await p.click('[data-accion=cartera-generar]');
  await p.click(`${dialogo} [data-accion=generar-perfil][data-perfil=conservadora]`);
  await p.waitForFunction(() => document.querySelector('[data-perfil=conservadora]')?.classList.contains('on'));
  await p.click(`${dialogo} [data-accion=generar-crear]`);
  const ruta = `cartera/borradores/${HOY}-conservadora.md`;
  await hasta(async () => cabeceras(await doc(ruta)).estado === 'borrador', 'borrador creado');
  await p.click(`[data-accion=borrador-aceptar][data-ruta="${ruta}"]`);
  await si();
  await hasta(async () => cabeceras(await doc(ruta)).estado === 'aceptado', 'borrador aceptado');
  const plantilla = items(await doc('cartera/plantillas/conservadora.md'));
  assert.deepEqual(items(await doc('cartera/objetivo.md')).map((o) => [o.activo, o.peso]), plantilla.map((f) => [f.id, f.peso]));

  // 8 · Gestión → Activos y objetivo: cambiar pesos (la suma se vigila) y guardar
  await p.click('[data-accion=gestion]');
  await p.click('[data-entrada=activos]');
  const [a, b] = [...plantilla].sort((x, y) => y.peso - x.peso);
  await p.fill(`#obj-${a.id}`, String(a.peso / 100 + 5));
  await p.press(`#obj-${a.id}`, 'Tab');
  await p.waitForFunction(() => /debe ser 100/.test(document.querySelector('[role=dialog]').textContent));
  assert.ok(await p.isDisabled(`${dialogo} [data-accion=objetivo-guardar]`));
  await p.fill(`#obj-${b.id}`, String(b.peso / 100 - 5));
  await p.press(`#obj-${b.id}`, 'Tab');
  await p.waitForFunction(() => /Suma: 100 % ✓/.test(document.querySelector('[role=dialog]').textContent));
  await p.click(`${dialogo} [data-accion=objetivo-guardar]`);
  const peso = async (id) => items(await doc('cartera/objetivo.md')).find((o) => o.activo === id)?.peso;
  await hasta(async () => (await peso(a.id)) === a.peso + 500, 'objetivo guardado');
  assert.equal(await peso(b.id), b.peso - 500);
  await p.keyboard.press('Escape');

  // 9 · desde Mes: anotar una inversión ofrece registrar la operación enlazada
  await p.click('[data-accion=vista][data-vista=mes]');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'mes');
  await p.selectOption('#anotar-grupo', 'cartera');
  await p.fill('#anotar-dia', String(+HOY.slice(8)));
  await p.fill('#anotar-concepto', 'Aportación extra fondo');
  await p.fill('#anotar-importe', '150');
  await p.click('form[data-form=anotar] button[type=submit]');
  await p.waitForFunction(() => /es una inversión/.test(document.querySelector('[role=dialog]')?.textContent ?? ''));
  await p.click(`${dialogo} [data-si]`);
  await p.waitForFunction(() => /Registrar la operación en la cartera/.test(document.querySelector('[role=dialog]')?.textContent ?? ''));
  assert.equal(await p.inputValue(`${dialogo} [name=importe]`), '150,00');
  await p.selectOption(`${dialogo} [name=activo]`, 'msci-world');
  await p.click(`${dialogo} button[type=submit]`);
  const enlazada = await hasta(async () => (await ops()).find((o) => o.mov && o.fecha === HOY), 'operación enlazada');
  const [mes, idMov] = enlazada.mov.split('/');
  const m = items(await doc(`mes/${mes}.md`), 'Movimientos').find((x) => x.id === idMov);
  assert.deepEqual([m.concepto, m.importe, m.op], ['Aportación extra fondo', -15000, enlazada.id]);
  assert.equal(enlazada.importe, 15000);

  assert.deepEqual(errores, []);
});
