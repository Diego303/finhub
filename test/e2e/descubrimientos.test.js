// F11 «hecho cuando»: investigar → encaje → simulador → seguir → revisar, de punta a punta con la carpeta de
// ejemplo y el Claude falso (respuestas por trabajo y tarea). Se comprueba siempre lo que queda en el disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, valores, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, temporal } from '../server/ayudas.js';

const FAKE = join(import.meta.dirname, '..', 'fake-claude.js');
const HOY = fechaLocal();
const ISIN = 'IE00FHSALUD1'; // ficticio, con dígito de control válido
let navegador = null;
let app;
let raiz;
let p;
const limpiar = [];
const errores = [];
const json = (o, texto = 'Hecho.') => `${texto}\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;
const SALUD = { titulo: 'Salud global y envejecimiento', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'El envejecimiento de la población sostiene la demanda de salud a largo plazo [M-261103-01].', saldria_bien_si: 'Que el gasto sanitario siga creciendo.', la_invalidaria: 'Recortes fuertes de precios de medicamentos.', riesgos: 'Regulación · patentes', vehiculos: [{ nombre: 'ETF salud global ficticio', isin: ISIN, ter: 0.25 }, { nombre: 'Fondo con ISIN roto', isin: 'IE00BYX5NX34' }], citas: ['https://salud.example/informe', 'M-261103-01'], afirmaciones: [{ tipo: 'consenso', texto: 'la población envejece' }, { tipo: 'especulación', texto: 'el sector batirá al índice' }], prediccion: { texto: 'salud mejor que el índice mundial a 12 meses', horizonte: '12 meses' }, revisar_en_dias: 30 };
const RESPUESTAS = {
  'descubrir-descubrir-pulso': json({ descubrimientos: [SALUD] }, 'He revisado las noticias del periodo.'),
  'descubrir-descubrir-seguimiento': json({ descubrimientos: [{ ...SALUD, id: 'D-013', confianza: 'media', tesis: 'El envejecimiento sostiene la demanda de salud; dos noticias nuevas a favor.' }], cambios: 'dos noticias nuevas a favor; confianza baja → media' }),
  'encaje-encaje': json({ ya_tienes: 'Ya tienes algo de salud a través del fondo global.', solapamiento: 'medio: el fondo global ya incluye las grandes del sector', comentario_md: 'Encaja como idea para seguir, no como cambio necesario.', citas: ['D-013'], cifras_usadas: ['simulador: TER medio'] }),
  precios: json({ precios: [{ isin: ISIN, valor: 25.4, divisa: 'EUR', fecha: sumarDias(HOY, -1), origen: 'https://gestora.example/salud' }] }),
};

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  const dir = await temporal('respuestas-desc');
  limpiar.push(dir);
  for (const [k, v] of Object.entries(RESPUESTAS)) await fsp.writeFile(join(dir, `${k}.txt`), v);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000, claude: { comando: [process.execPath, FAKE, '--esperar', '700', '--respuestas', dir] } }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
async function hasta(fn, que, ms = 10000) {
  const fin = performance.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* aún no */
    }
    if (performance.now() > fin) throw new Error(`no se cumplió: ${que} · toast: ${await p.textContent('#toast').catch(() => '?')} · respuestas: ${JSON.stringify(globalThis.__resp?.slice(-8))} · modal: ${(await p.textContent('[role=dialog]').catch(() => '?')).slice(-300)}`);
    await esperar(80);
  }
}
globalThis.__resp = [];
const dialogo = '[role=dialog]';
const ir = async (vista) => {
  await p.waitForSelector(dialogo, { state: 'detached', timeout: 10000 });
  for (let i = 0; i < 20; i++) {
    await p.$eval(`.tabs [data-accion=vista][data-vista=${vista}]`, (x) => x.click());
    if (await p.waitForFunction((v) => document.querySelector('#marco').dataset.vista === v, vista, { timeout: 1500 }).then(() => true, () => false)) return;
  }
  throw new Error(`no se pudo ir a ${vista}`);
};
const clic = async (sel) => {
  await p.waitForSelector(sel, { timeout: 10000 });
  await p.$eval(sel, (x) => x.click());
};
const RUTA = 'conocimiento/descubrimientos/D-013.md';

test('mapa de efectos y lista: celdas con sus notas, rendimiento desde el descubrimiento, filtros', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('descubrimientos');
  await p.waitForSelector('[data-mapa-efectos]');
  assert.match(await p.textContent('main'), /posible efecto · especulación · contexto, no causa/);
  await clic('[data-accion=desc-celda]');
  await p.waitForSelector(`${dialogo} .cit`);
  assert.match(await p.textContent(dialogo), /\[M-\d{6}-\d{2}\]/);
  await p.keyboard.press('Escape');
  assert.match(await p.textContent('[data-descubrimiento=D-007] [data-rendimiento]'), /desde el descubrimiento: [+−]\d+,\d\s%/);
  assert.match(await p.textContent('[data-descubrimiento=D-011] [data-rendimiento]'), /—/);
  await clic('[data-accion=desc-filtro][data-id=descartado]');
  await p.waitForFunction(() => document.querySelectorAll('[data-descubrimiento]').length === 1);
  assert.ok(await p.$('[data-descubrimiento=D-002]'));
  await clic('[data-accion=desc-filtro][data-id=todos]');
  await p.waitForFunction(() => document.querySelectorAll('[data-descubrimiento]').length === 5);
  assert.match(await p.textContent('main'), /Es para informarte\. Los cambios en tu cartera los haces tú\./);
});

test('investigar → guardar: a partir del pulso, con la lupa de Rex; nada se guarda sin tu luz verde', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('descubrimientos');
  await clic('[data-accion=desc-modo][data-id=pulso]');
  await clic('[data-accion=desc-periodo][data-id="1m"]');
  await clic('[data-accion=desc-investigar]');
  await p.waitForSelector('[data-rex-accesorio~=lupa]', { timeout: 5000 });
  await p.waitForSelector('[data-propuestas]', { timeout: 15000 });
  await p.waitForFunction(() => !document.querySelector('[data-rex-accesorio~=lupa]'));
  assert.match(await p.textContent('[data-propuestas]'), /Salud global y envejecimiento/);
  await assert.rejects(fsp.stat(join(raiz, RUTA)), 'aún no se ha guardado');
  await clic('[data-propuestas] [data-accion=desc-guardar][data-i="0"]');
  const d = await hasta(async () => doc(RUTA), 'descubrimiento guardado');
  const v = valores(d);
  assert.deepEqual([v.estado, v.referencia, v.descubierto], ['nuevo', ISIN, HOY]);
  assert.match(v.origen, /^pulso /);
  assert.doesNotMatch(bloques(d)[0].campos.vehiculos, /IE00BYX5NX34/, 'el ISIN roto se descarta');
  const pr = items(await doc('conocimiento/predicciones.md')).find((x) => x.descubrimiento === 'D-013');
  assert.equal(pr.fuente, 'finhub-descubrir');
  await p.waitForSelector('[data-descubrimiento=D-013]');
});

test('simulador → encaje → guardar en privado → al diario de decisiones', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('descubrimientos');
  await clic('[data-descubrimiento=D-013] [data-accion=desc-sim]');
  await p.waitForSelector(`${dialogo} [data-simulador]`);
  await p.fill(`${dialogo} #sim-pct`, '10');
  await p.dispatchEvent(`${dialogo} #sim-pct`, 'change');
  await p.waitForFunction(() => /Nuevo: Salud global[\s\S]*10,0\s%/.test(document.querySelector('[data-simulador]')?.textContent ?? ''));
  await p.selectOption(`${dialogo} [data-cambio=sim-de]`, 'activo:msci-world');
  await p.waitForFunction(() => /Si lo hubieras tenido el último año/.test(document.querySelector('[data-simulador]')?.textContent ?? ''));
  const antes = await fsp.readFile(join(raiz, 'cartera/activos.md'), 'utf8');
  await clic(`${dialogo} [data-accion=desc-encaje]`);
  await clic(`${dialogo} [data-accion=encaje-pedir]`);
  await p.waitForSelector(`${dialogo} [data-encaje-resultado]`, { timeout: 15000 });
  assert.match(await p.textContent(`${dialogo} [data-encaje-resultado]`), /Encaja como idea para seguir/);
  await clic(`${dialogo} [data-accion=encaje-guardar]`);
  const ruta = `analisis/encajes/D-013-${HOY}.md`;
  const e = await hasta(async () => doc(ruta), 'encaje guardado');
  assert.deepEqual([cabeceras(e).descubrimiento, cabeceras(e).version], ['D-013', 'v1']);
  assert.match(textoSeccion(e, 'Cifras (código)'), /simulador: peso dedicado \(sacado de msci-world\): 10 %/);
  assert.equal(await fsp.readFile(join(raiz, 'cartera/activos.md'), 'utf8'), antes, 'el simulador no toca tu cartera');
  await assert.rejects(fsp.stat(join(raiz, 'conocimiento/descubrimientos/D-013-encaje.md')));
  p.on('response', async (r) => {
    if (r.request().method() === 'POST') globalThis.__resp.push([r.status(), r.url().slice(-20), (r.request().postData() ?? '').slice(0, 60), r.status() >= 400 ? (await r.text().catch(() => '')).slice(0, 160) : '']);
  });
  await clic(`${dialogo} [data-accion=encaje-diario]`);
  const dec = await hasta(async () => (await fsp.readdir(join(raiz, 'decisiones'))).find((f) => f.includes('idea-salud-global')), 'decisión creada');
  assert.match(cabeceras(await doc(`decisiones/${dec}`)).origen, /descubrimiento D-013/);
  await p.keyboard.press('Escape');
});

test('seguir → «¿qué ha cambiado?» → nueva versión; precios de lo que sigues desde Pendientes', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('descubrimientos');
  await clic('[data-descubrimiento=D-013] [data-accion=desc-estado][data-estado=siguiendo]');
  await hasta(async () => valores(await doc(RUTA)).estado === 'siguiendo', 'siguiendo');
  // Pendientes: la referencia aún no tiene precios
  await p.waitForSelector('[data-accion=pendiente][data-destino=seguimiento]', { timeout: 10000 });
  await clic('[data-accion=pendiente][data-destino=seguimiento]');
  await clic(`${dialogo} [data-accion=seg-precios-buscar]`);
  await p.waitForSelector(`${dialogo} [data-precios-seguimiento]`, { timeout: 15000 });
  await clic(`${dialogo} [data-accion=seg-precios-guardar]`);
  const s = await hasta(async () => doc(`conocimiento/datos/series/${ISIN.toLowerCase()}.md`), 'precio guardado');
  assert.equal(items(s, 'Filas').at(-1).valor, 25400000);
  await p.waitForSelector(dialogo, { state: 'detached' });
  // ¿qué ha cambiado?
  await clic('[data-descubrimiento=D-013] [data-accion=desc-cambio]');
  await p.waitForFunction(() => /¿Qué ha cambiado en D-013\?/.test(document.querySelector('[data-propuestas]')?.textContent ?? ''), null, { timeout: 15000 });
  await clic('[data-propuestas] [data-accion=desc-guardar][data-i="0"]');
  const d = await hasta(async () => {
    const x = await doc(RUTA);
    return bloques(x).length === 2 && x;
  }, 'nueva versión');
  assert.deepEqual(bloques(d).map((b) => b.id), ['v2', 'v1']);
  assert.match(bloques(d)[0].campos.cambios, /confianza baja → media/);
  assert.equal(valores(d).confianza, 'media');
  // informe con historial y comparación con la versión anterior
  await clic('[data-descubrimiento=D-013] [data-accion=desc-informe]');
  await p.waitForSelector(`${dialogo} [data-accion=desc-version][data-id=v1]`);
  assert.match(await p.textContent(dialogo), /cambió en v2/);
  assert.match(await p.textContent(dialogo), /Encajes guardados/);
  await p.keyboard.press('Escape');
  assert.deepEqual(errores, []);
});
