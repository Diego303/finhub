// F7: Panel (cifras = core, hitos desde el gráfico, «?» → Rex), las 7 herramientas (cifras = core, guardar
// escenario, crear meta, IPC y uso de suscripciones al disco) y Tu año (tarjetas y PNG descargado).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras, textoSeccion, valores } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { kpisPanel } from '../../src/core/panel.js';
import * as H from '../../src/core/herramientas.js';
import { tuAnio, tarjetas } from '../../src/core/tu-ano.js';
import { formatearEuros } from '../../src/core/dinero.js';
import { fechaLocal } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, EJEMPLO } from '../server/ayudas.js';

let navegador = null;
let app;
let aislado;
let raiz;
let p;
const errores = [];
const HOY = fechaLocal();
const M = construirModelo(Object.fromEntries([...EJEMPLO].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  aislado = await entornoAislado();
  raiz = await carpetaDeEjemplo();
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000 }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 }, acceptDownloads: true });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  if (raiz) await borrarTemporal(raiz);
  if (aislado) await borrarTemporal(aislado.base);
});

const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
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
const n = (t) => t.replace(/\s/g, ' ');
const eur = (c) => n(formatearEuros(Math.round(c), 0));
const cifra = async (titulo) => n(await p.textContent(`[data-cifra="${titulo}"]`));
async function campo(clave, valor) {
  await p.fill(`#h-${clave}`, String(valor));
  await p.press(`#h-${clave}`, 'Enter');
  await p.waitForFunction(([c, v]) => document.getElementById(`h-${c}`)?.value.replace(/\./g, '') === String(v).replace(/\./g, ''), [clave, valor]);
}
const herramienta = async (id) => {
  await p.click(`[data-accion=herr][data-id=${id}]`);
  await p.waitForFunction((x) => document.getElementById('herramienta')?.dataset.herramienta === x, id);
};

test('panel: KPI iguales a core, hitos desde el gráfico y «?» abre Rex con la cifra', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const k = kpisPanel(M, HOY);
  const texto = n(await p.textContent('#contenido'));
  assert.ok(texto.includes(`Patrimonio neto ?${eur(k.patrimonio.valor)}`), 'patrimonio');
  assert.match(texto, /Colchón \?[\d.]+ €/);
  assert.match(n(await p.textContent('#resumen-al-abrir')), /Meta más cercana: Viaje a Japón, te faltan 2\.200 €/);
  // + hito desde el gráfico y editarlo pulsando en él
  await p.click('main [data-accion=hito-form][data-id=""]');
  await p.fill(`${dialogo} [name=fecha]`, '2026-08-20');
  await p.fill(`${dialogo} [name=texto]`, 'Mudanza');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => items(await doc('hitos.md')).some((h) => h.texto === 'Mudanza'), 'hito creado');
  await p.waitForSelector('g.hito[data-id="H-0005"]');
  await p.focus('g.hito[data-id="H-0005"]');
  await p.keyboard.press('Enter');
  await p.fill(`${dialogo} [name=texto]`, 'Mudanza a Valencia');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => items(await doc('hitos.md')).find((h) => h.id === 'H-0005')?.texto === 'Mudanza a Valencia', 'hito editado');
  // «?» → Rex con la cifra
  await p.click('[data-accion=explicame][data-cifra="patrimonio neto"]');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'rex');
  assert.match(n(await p.textContent('[data-explicame]')), /Explícame: patrimonio neto/);
  await p.click('[data-accion=explicame-quitar]');
  await p.waitForFunction(() => !document.querySelector('[data-explicame]'));
});

test('herramientas: cifras iguales a core y lo que se guarda llega al disco', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await p.click('[data-accion=vista][data-vista=herramientas]');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'herramientas');

  // prueba de crisis: cambiar de periodo y guardar como escenario (al diario, sin estado: no es una pausa)
  await p.click('[data-accion=crisis-periodo][data-id="2020"]');
  const cov = H.pruebaCrisis({ filas: H.filasCartera(M), clases: M.clases, series: (id) => M.serie(id), periodo: H.parseCrisis(M.ajustes.crisis_periodos).find((x) => x.id === '2020'), valor: 3711735, aportacion: 60000 });
  await p.waitForFunction((v) => document.querySelector('[data-cifra="Tu cartera caería a"]')?.textContent.replace(/\s/g, ' ') === v, eur(cov.valorMinimo));
  await p.click('[data-accion=herr-escenario][data-tipo=crisis]');
  const ruta = await hasta(async () => (await fsp.readdir(join(raiz, 'decisiones'))).find((f) => f.includes('escenario-si-se-repite-covid')), 'escenario guardado');
  const d = await doc(`decisiones/${ruta}`);
  assert.equal(cabeceras(d).estado, undefined);
  assert.match(cabeceras(d).origen, /prueba de crisis/);
  assert.match(textoSeccion(d, 'Qué'), /Caída máxima/);
  // periodos editables (a ajustes.md) y validados
  await p.fill('#crisis-periodos', '2008-01..2009-03 Mi crisis');
  await p.click('form[data-form=crisis-periodos] button[type=submit]');
  await hasta(async () => valores(await doc('ajustes.md')).crisis_periodos === '2008-01..2009-03 Mi crisis', 'periodos guardados');
  await p.waitForSelector('[data-accion=crisis-periodo][data-id="2008"]');
  await p.fill('#crisis-periodos', 'mal');
  await p.click('form[data-form=crisis-periodos] button[type=submit]');
  await p.waitForFunction(() => /AAAA-MM/.test(document.querySelector('#toast')?.textContent ?? ''));

  // IPC personal: asignar componente a «Regalos» lo guarda en grupos.md
  await herramienta('ipc');
  const ipc = H.ipcPersonal(M, HOY);
  assert.equal(await cifra('IPC general'), n(`+${(Math.round(ipc.general * 1000) / 10).toFixed(1).replace('.', ',')} %`));
  await p.selectOption('[data-cambio=grupo-ipc][data-id=regalos]', 'ipc-ocio-cultura');
  await hasta(async () => items(await doc('grupos.md')).find((g) => g.id === 'regalos')?.ipc === 'ipc-ocio-cultura', 'ipc asignado');

  // coste de oportunidad
  await herramienta('oport');
  await campo('oImporte', 500);
  await campo('oAnios', 10);
  const o = H.costeOportunidad({ importe: 50000, mensual: 3000, anios: 10, tasa: 0.04 });
  assert.equal(await cifra('puntual'), eur(o.puntual));
  assert.equal(await cifra('mensual'), eur(o.mensual));

  // comparador de fondos: TER desde tus fondos
  await herramienta('fondos');
  await campo('fTerB', '1,5');
  const f = H.comparadorFondos({ inicial: 1000000, mensual: 30000, anios: 30, bruta: 0.06, terA: 0.0012, terB: 0.015 });
  assert.equal(await cifra('diferencia'), eur(f.diferencia));

  // escenarios de vida: pausa y guardar
  await herramienta('vida');
  await campo('vPausa', 6);
  const v = H.escenariosVida(M, HOY, { pausaMeses: 6 });
  const japon = v.metas.find((x) => x.id === 'japon');
  assert.match(n(await p.textContent('#herramienta')), new RegExp(`antes: oct 2027`));
  assert.equal(japon.despues.slice(0, 7), '2028-04');
  await p.click('[data-accion=herr-escenario][data-tipo=vida]');
  await hasta(async () => (await fsp.readdir(join(raiz, 'decisiones'))).some((x) => x.includes('escenario-dejo-de-aportar-6-meses')), 'escenario de vida guardado');

  // calculadoras: interés compuesto, meta (y crearla) y alquilar o comprar
  await herramienta('calc');
  await campo('icAnios', 10);
  const ic = H.interesCompuesto({ capital: 1000000, mensual: 30000, anios: 10, tasa: 0.05 });
  assert.equal(await cifra('Total'), eur(ic.total));
  await p.click('[data-accion=calc][data-id=meta]');
  await campo('mObjetivo', 6000);
  await campo('mInicial', 0);
  await campo('mMeses', 12);
  const cuota = H.cuotaMeta({ objetivo: 600000, inicial: 0, meses: 12, tasa: 0.02 });
  assert.equal(await cifra('cuota'), `${eur(cuota)}/mes`);
  await p.click('[data-accion=calc-crear-meta]');
  const meta = await hasta(async () => bloques(await doc('metas.md')).find((b) => b.campos.objetivo === 600000), 'meta creada');
  assert.deepEqual(meta.campos.aportacion, { mensual: cuota });
  await p.click('[data-accion=calc][data-id=casa]');
  await campo('cHorizonte', 15);
  const ac = H.alquilarComprar({ precio: 25000000, alquiler: 95000, ibi: 40000, comunidad: 6000, horizonte: 15 });
  assert.equal(await cifra('Comprar · patrimonio a 15 años'), eur(ac.comprar));
  assert.equal(await cifra('Alquilar e invertir la diferencia'), eur(ac.alquilar));

  // radar de suscripciones: marcar y «¿la usas?» (al disco)
  await herramienta('subs');
  assert.equal(await cifra('ahorro'), `${n(formatearEuros(11987, 2))}/año`);
  await p.click('[data-accion=subs-marcar][data-id=gimnasio]');
  await p.waitForFunction(() => /598,67/.test(document.querySelector('[data-cifra=ahorro]').textContent));
  await p.click('[data-accion=subs-uso][data-id=nube]');
  await hasta(async () => items(await doc('recurrentes.md')).find((r) => r.id === 'nube')?.uso?.estado === 'no', 'uso guardado');
  assert.deepEqual(errores, []);
});

test('tu año: tarjetas iguales a core y PNG descargado', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await p.click('[data-accion=vista][data-vista=tuano]');
  await p.waitForFunction(() => document.querySelector('#marco').dataset.vista === 'tuano');
  for (const c of tarjetas(tuAnio(M, +HOY.slice(0, 4), HOY)).filter((x) => !['Metas cumplidas', 'Tu patrimonio creció'].includes(x.titulo))) {
    assert.match(n(await p.textContent(`[data-tarjeta="${c.titulo}"]`)), new RegExp(n(c.valor).replace(/[+.*?()]/g, '\\$&')), c.titulo);
  }
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('[data-accion=tuano-png]')]);
  assert.equal(descarga.suggestedFilename(), `finhub-tu-${HOY.slice(0, 4)}.png`);
  const ruta = await descarga.path();
  const bytes = await fsp.readFile(ruta);
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'firma PNG');
  assert.equal(bytes.readUInt32BE(16), 1200, 'ancho');
  assert.ok(bytes.length > 20000);
  assert.deepEqual(errores, []);
});
