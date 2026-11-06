// F6 «hecho cuando»: la proyección del navegador es la misma que calcula Node (determinismo) y metas,
// decisiones e hitos se mantienen desde la web; cada paso se comprueba en el disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { resumenMetas } from '../../src/core/metas-resumen.js';
import { formatearEuros } from '../../src/core/dinero.js';
import { fechaLocal } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, EJEMPLO } from '../server/ayudas.js';

let navegador = null;
let app;
let aislado;
let raiz;
let p;
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
  await p.goto(`${app.url}#metas`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'metas' && !document.querySelector('.carga'));
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
const limpio = (t) => t.replace(/\s/g, ' ');
const cifras = () => p.$$eval('[data-proy]', (xs) => xs.map((x) => x.textContent.replace(/\s/g, ' ')));
const meta = async (id) => bloques(await doc('metas.md')).find((b) => b.id === id);
const HOY = fechaLocal();

test('proyección: el navegador da las mismas cifras que Node, con cualquier opción', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const M = construirModelo(Object.fromEntries([...EJEMPLO].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
  const plantillas = [...EJEMPLO.keys()].filter((r) => r.startsWith('cartera/plantillas/')).sort().map((r) => leer(r, EJEMPLO.get(r))).map((d) => ({ perfil: cabeceras(d).perfil, titulo: d.titulo.replace(/^Plantilla · /, ''), filas: items(d) }));
  const esperado = (op) => {
    const r = resumenMetas(M, HOY, { plantillas, ...op }).proyeccion;
    const n = r.anios.length - 1;
    return [r.p10[n], r.p50[n], r.p90[n]].map((v) => limpio(formatearEuros(v, 0)));
  };
  const mira = async (op) => {
    const e = esperado(op);
    await p.waitForFunction((x) => JSON.stringify([...document.querySelectorAll('[data-proy]')].map((y) => y.textContent.replace(/\s/g, ' '))) === JSON.stringify(x), e, { timeout: 6000 }).catch(() => {});
    assert.deepEqual(await cifras(), e, JSON.stringify(op));
  };
  await mira({});
  await p.fill('#proy-anios', '35');
  await p.press('#proy-anios', 'Enter');
  await mira({ anios: 35 });
  await p.fill('#proy-aportacion', '0');
  await p.press('#proy-aportacion', 'Enter');
  await mira({ anios: 35, aportacion: 0 });
  await p.click('[data-accion=proy-perfil][data-perfil=conservadora]');
  await mira({ anios: 35, aportacion: 0, perfil: 'conservadora' });
  await p.click('[data-accion=proy-real]');
  await mira({ anios: 35, aportacion: 0, perfil: 'conservadora', real: false });
  assert.match(limpio(await p.textContent('#contenido')), /Sin descontar inflación/);
  assert.match(limpio(await p.textContent('#libertad')), /la regla del 4 % pide [\d.]+ €/);
  // años fuera de rango: no se aceptan
  await p.fill('#proy-anios', '90');
  await p.press('#proy-anios', 'Enter');
  await p.waitForFunction(() => /de 1 a 40/.test(document.querySelector('#toast')?.textContent ?? ''));
});

test('metas, decisiones e hitos desde la web', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  // 1 · nueva meta con importe manual y aportación fija
  await p.click('[data-accion=meta-form][data-id=""]');
  await p.fill(`${dialogo} [name=nombre]`, 'Coche eléctrico');
  await p.fill(`${dialogo} [name=objetivo]`, '15.000');
  await p.fill(`${dialogo} [name=fecha]`, '2029-06-01');
  await p.selectOption(`${dialogo} [name=origen]`, 'manual');
  await p.fill(`${dialogo} [name=manual]`, '3000');
  await p.fill(`${dialogo} [name=aportacion]`, '250');
  await p.click(`${dialogo} button[type=submit]`);
  const coche = await hasta(() => meta('coche-electrico'), 'meta creada');
  assert.deepEqual([coche.titulo, coche.campos.objetivo, coche.campos.se_alimenta_de, coche.campos.aportacion, coche.campos.estado.estado], ['Coche eléctrico', 1500000, { tipo: 'manual', valor: 300000 }, { mensual: 25000 }, 'activa']);
  // 12.000 € / 250 €/mes = 48 meses; llevas 20 %
  await p.waitForFunction(() => /llevas 20 % · 250 €\/mes → /.test(document.querySelector('[data-meta=coche-electrico]')?.textContent.replace(/\s/g, ' ') ?? ''));

  // 2 · editar: pasa a alimentarse de una cuenta con la media de 3 meses
  await p.click('[data-accion=meta-form][data-id=coche-electrico]');
  await p.selectOption(`${dialogo} [name=origen]`, 'cuenta:remunerada');
  await p.fill(`${dialogo} [name=aportacion]`, '');
  await p.check(`${dialogo} [name=media3m]`);
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => (await meta('coche-electrico')).campos.aportacion?.media3m === true, 'meta editada');
  assert.deepEqual((await meta('coche-electrico')).campos.se_alimenta_de, { tipo: 'cuenta', valor: 'remunerada' });

  // 3 · pausar y reanudar; cumplir (Rex lo celebra) y archivar
  await p.click('[data-accion=meta-estado][data-id=colchon][data-estado=pausada]');
  await hasta(async () => (await meta('colchon')).campos.estado.estado === 'pausada', 'pausada');
  await p.click('[data-accion=meta-estado][data-id=colchon][data-estado=activa]');
  await hasta(async () => (await meta('colchon')).campos.estado.estado === 'activa', 'reanudada');
  await p.click('[data-accion=meta-form][data-id=japon]');
  await p.click(`${dialogo} [data-accion=meta-estado][data-estado=cumplida]`);
  await hasta(async () => (await meta('japon')).campos.estado.estado === 'cumplida', 'cumplida');
  assert.equal((await meta('japon')).campos.estado.fecha, HOY);
  await p.waitForFunction(() => /¡«Viaje a Japón» cumplida!/.test(document.querySelector('#toast')?.textContent ?? ''));
  await p.waitForFunction(() => [...document.querySelectorAll('[data-rex]')].some((x) => x.dataset.rexEstado === 'feliz'));
  await p.click('[data-accion=meta-estado][data-id=portatil][data-estado=archivada]');
  await hasta(async () => (await meta('portatil')).campos.estado.estado === 'archivada', 'archivada');
  assert.equal(await p.$('[data-meta=portatil]'), null, 'las archivadas no se ven…');
  await p.click('[data-accion=metas-archivadas]');
  await p.waitForSelector('[data-meta=portatil]'); // …hasta que las pides

  // 4 · borrar una meta (a la papelera)
  await p.click('[data-accion=meta-form][data-id=coche-electrico]');
  await p.click(`${dialogo} [data-accion=meta-borrar]`);
  await p.click(`${dialogo} [data-si]`);
  await hasta(async () => !(await meta('coche-electrico')), 'meta borrada');

  // 5 · decisión con pausa de 48 h; después se revisa y se borra
  await p.click('[data-accion=decision-form][data-ruta=""]');
  await p.fill(`${dialogo} [name=titulo]`, 'Comprar oro físico');
  await p.selectOption(`${dialogo} [name=estado]`, 'pausa-48h');
  await p.fill(`${dialogo} [name="s:Qué"]`, 'Un 5 % en oro.');
  await p.fill(`${dialogo} [name="s:Por qué"]`, 'Miedo a una crisis.\nLo leí en un foro.');
  await p.click(`${dialogo} button[type=submit]`);
  const ruta = `decisiones/${HOY}-comprar-oro-fisico.md`;
  const d = await hasta(() => doc(ruta), 'decisión creada');
  assert.equal(cabeceras(d).estado, 'pausa-48h');
  assert.ok(cabeceras(d).vuelve?.fecha > HOY);
  assert.equal(textoSeccion(d, 'Por qué'), 'Miedo a una crisis.\nLo leí en un foro.');
  await p.click(`[data-accion=decision-form][data-ruta="${ruta}"]`);
  await p.selectOption(`${dialogo} [name=estado]`, 'descartada');
  await p.fill(`${dialogo} [name="s:Resultado de la revisión"]`, 'Pasadas 48 h, no lo veo.');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => cabeceras(await doc(ruta)).estado === 'descartada', 'decisión revisada');
  assert.equal(textoSeccion(await doc(ruta), 'Resultado de la revisión'), 'Pasadas 48 h, no lo veo.');
  await p.click(`[data-accion=decision-form][data-ruta="${ruta}"]`);
  await p.click(`${dialogo} [data-accion=decision-borrar]`);
  await p.click(`${dialogo} [data-si]`);
  await hasta(async () => !(await fsp.stat(join(raiz, ruta)).catch(() => null)), 'decisión borrada');

  // 6 · hitos: crear, editar y borrar
  await p.click('[data-accion=hito-form][data-id=""]');
  await p.fill(`${dialogo} [name=fecha]`, '2026-07-15');
  await p.fill(`${dialogo} [name=texto]`, 'Cambio de trabajo');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => items(await doc('hitos.md')).some((h) => h.id === 'H-0005'), 'hito creado');
  await p.click('[data-accion=hito-form][data-id=H-0005]');
  await p.fill(`${dialogo} [name=texto]`, 'Trabajo nuevo');
  await p.click(`${dialogo} button[type=submit]`);
  await hasta(async () => items(await doc('hitos.md')).find((h) => h.id === 'H-0005')?.texto === 'Trabajo nuevo', 'hito editado');
  await p.click('[data-accion=hito-borrar][data-id=H-0005]');
  await hasta(async () => !items(await doc('hitos.md')).some((h) => h.id === 'H-0005'), 'hito borrado');

  assert.deepEqual(errores, []);
});
