// F4 «hecho cuando»: un mes real de punta a punta SIN tocar ficheros (todo desde la web),
// comprobando en cada paso el Markdown que queda en disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores, cabeceras } from '../../src/core/formato/motor.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar } from '../server/ayudas.js';

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
  await p.goto(`${app.url}#mes`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'mes' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  if (raiz) await borrarTemporal(raiz);
  if (aislado) await borrarTemporal(aislado.base);
});

const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
const movs = async (mes) => items(await doc(`mes/${mes}.md`), 'Movimientos');
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
const toastDice = (re) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector('#toast')?.textContent ?? ''), re.source, { timeout: 6000 });
async function anotar({ dia, concepto, importe, grupo, etiquetas = '', compensa, a }) {
  await p.selectOption('#anotar-grupo', grupo);
  await p.waitForFunction((g) => document.getElementById('anotar-grupo').value === g, grupo);
  if (compensa) await p.selectOption('#anotar-compensa', compensa);
  if (a) await p.selectOption('#anotar-a', a);
  await p.fill('#anotar-dia', String(dia));
  await p.fill('#anotar-concepto', concepto);
  await p.fill('#anotar-importe', importe);
  await p.fill('#anotar-etiquetas', etiquetas);
  await p.click('form[data-form=anotar] button[type=submit]');
  await hasta(async () => (await movs('2026-12')).some((x) => x.concepto === concepto), `anotado «${concepto}»`);
}

test('un mes (diciembre 2026) de punta a punta desde la web', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  // 1 · ir a diciembre (vacío)
  await p.click('[data-accion=mes-mover][data-paso="1"]');
  await p.waitForFunction(() => document.getElementById('titulo-mes').textContent === 'Diciembre 2026');
  assert.match(await p.textContent('#contenido'), /Aún no hay movimientos este mes/);

  // 2 · recurrentes: confirmar todos (cambiando un importe)
  await p.click('[data-accion=mes-recurrentes]');
  await p.fill('#rec-imp-luz-internet', '-95,10');
  await p.click('[data-accion=rec-todos]');
  await toastDice(/Recurrentes anotados/);
  const dic = await hasta(async () => (await movs('2026-12')).length >= 9 && movs('2026-12'), 'recurrentes anotados');
  assert.equal(dic.find((x) => x.rec === 'luz-internet').importe, -9510);
  assert.equal(dic.find((x) => x.rec === 'a-remunerada').a, 'remunerada', 'el colchón va a la remunerada');
  assert.ok(Object.values(valores(await doc('mes/2026-12.md'), 'Recurrentes')).every((v) => v === 'confirmado'));

  // 3 · anotar: gasto sin signo (→ negativo), entrada, devolución que compensa ocio, traspaso entre cuentas
  await anotar({ dia: 5, concepto: 'Cena con amigos', importe: '64,40', grupo: 'ocio', etiquetas: '#social #cumple' });
  await anotar({ dia: 6, concepto: 'Venta de la consola', importe: '120', grupo: 'extra' });
  await anotar({ dia: 7, concepto: 'Bizum de Marta (cena)', importe: '20', grupo: 'devoluciones', compensa: 'ocio' });
  await anotar({ dia: 8, concepto: 'A efectivo', importe: '50', grupo: 'traspasos', a: 'efectivo' });
  const l = await hasta(async () => (await movs('2026-12')).find((x) => x.concepto === 'A efectivo') && movs('2026-12'), 'anotados');
  const cena = l.find((x) => x.concepto === 'Cena con amigos');
  assert.deepEqual([cena.importe, cena.fecha, cena.etiquetas], [-6440, '2026-12-05', ['social', 'cumple']]);
  assert.equal(l.find((x) => x.concepto === 'Venta de la consola').importe, 12000);
  const bizum = l.find((x) => x.concepto.startsWith('Bizum'));
  assert.deepEqual([bizum.importe, bizum.compensa], [2000, 'ocio']);
  const tras = l.find((x) => x.concepto === 'A efectivo');
  assert.deepEqual([tras.importe, tras.a], [-5000, 'efectivo']);
  // nómina de la plantilla 2.850 + venta 120 = 2.970; si el Bizum sumara a Entradas serían 2.990 (manda el plan)
  await p.waitForFunction(() => /Entradas\s*2\.970\s€/.test(document.querySelector('#contenido').textContent.replace(/\u00a0/g, ' ')), null, { timeout: 6000 });

  // 4 · edición en línea (doble clic) y cambio de naturaleza con un clic
  await p.dblclick(`[data-fila-mov="${cena.id}"]`);
  await p.fill('#ed-importe', '-70');
  await p.fill('#ed-concepto', 'Cena de cumpleaños');
  await p.click('tr.editando button[type=submit]');
  await toastDice(/Movimiento guardado/);
  await hasta(async () => (await movs('2026-12')).find((x) => x.id === cena.id)?.importe === -7000, 'editado');
  assert.equal((await movs('2026-12')).find((x) => x.id === cena.id).concepto, 'Cena de cumpleaños');
  await p.click(`[data-accion=mov-naturaleza][data-id="${cena.id}"]`);
  await hasta(async () => (await movs('2026-12')).find((x) => x.id === cena.id)?.naturaleza === 'inversion', 'naturaleza cambiada');

  // 5 · borrar y deshacer desde el toast (10 s)
  await p.click(`[data-accion=mov-borrar][data-id="${tras.id}"]`);
  await toastDice(/borrado/);
  await hasta(async () => !(await movs('2026-12')).some((x) => x.id === tras.id), 'borrado');
  await p.click('[data-toast-deshacer]');
  await hasta(async () => (await movs('2026-12')).some((x) => x.id === tras.id), 'deshecho');

  // 6 · presupuesto solo de este mes desde la barra
  await p.click('[data-accion=pres-editar][data-grupo=ocio]');
  await p.fill('#pres-ocio', '250');
  await p.press('#pres-ocio', 'Enter');
  await hasta(async () => valores(await doc('mes/2026-12.md'), 'Presupuestos').ocio === 25000, 'presupuesto del mes');

  // 7 · cerrar con lección
  await p.click('[data-accion=mes-cerrar]');
  await p.fill('#leccion', 'diciembre controlado');
  await p.click('form[data-form=cerrar-mes] button[type=submit]');
  await toastDice(/cerrado/);
  const cerrado = await hasta(async () => cabeceras(await doc('mes/2026-12.md')).estado.estado === 'cerrado' && doc('mes/2026-12.md'), 'cerrado');
  const cierre = valores(cerrado, 'Cierre');
  assert.equal(cierre.leccion, 'diciembre controlado');
  assert.equal(cierre.patrimonio, Object.values(cierre.saldos).reduce((a, b) => a + b, 0) + cierre.cartera);
  await p.waitForSelector('text=Diciembre 2026 está cerrado');

  // 8 · editar el mes cerrado: pide confirmación, marca y recalcula la foto
  await anotarCerrado();
  const tras2 = valores(await doc('mes/2026-12.md'), 'Cierre');
  assert.equal(tras2.editado_tras_cierre, true);
  assert.equal(tras2.saldos.corriente, cierre.saldos.corriente - 1000, 'foto recalculada');

  // 9 · reabrir
  await p.click('[data-accion=mes-reabrir]');
  await p.click('[data-si]');
  await hasta(async () => cabeceras(await doc('mes/2026-12.md')).estado.estado === 'reabierto', 'reabierto');
  assert.ok(!(await doc('mes/2026-12.md')).secciones.some((s) => s.nombre === 'Cierre'));
});

async function anotarCerrado() {
  await p.selectOption('#anotar-grupo', 'comida');
  await p.fill('#anotar-dia', '20');
  await p.fill('#anotar-concepto', 'Olvidado');
  await p.fill('#anotar-importe', '10');
  await p.click('form[data-form=anotar] button[type=submit]');
  await p.waitForSelector('text=Este mes está cerrado: ¿lo editas igualmente?');
  await p.click('[data-si]');
  await toastDice(/Anotado/);
  await hasta(async () => (await movs('2026-12')).some((x) => x.concepto === 'Olvidado'), 'anotado en cerrado');
}

test('Gestión: grupos (naturaleza con pregunta), etiquetas, recurrentes («también este mes») y cuentas', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const abrirGestion = async (id) => {
    await p.click('[data-accion=gestion]');
    await p.click(`[data-entrada=${id}]`);
  };
  await abrirGestion('grupos');
  await p.fill('#gr-nuevo', 'Mascotas');
  await p.press('#gr-nuevo', 'Enter');
  await hasta(async () => items(await doc('grupos.md')).some((g) => g.id === 'mascotas' && g.naturaleza === 'consumo'), 'grupo creado');
  await p.click('[data-accion=grupo-naturaleza][data-id=formacion][data-valor=inversion]');
  await p.click('[data-opcion=no]');
  await hasta(async () => items(await doc('grupos.md')).find((g) => g.id === 'formacion').naturaleza === 'inversion', 'naturaleza del grupo');
  // la operación escribe varios ficheros, uno tras otro: se espera a que lleguen los meses
  await hasta(async () => (await movs('2026-11')).filter((x) => x.grupo === 'formacion').every((x) => x.naturaleza === 'consumo'), 'lo anotado conserva su naturaleza');
  await p.keyboard.press('Escape');

  await abrirGestion('etiquetas');
  const fila = p.locator('tr', { hasText: '#social' });
  await fila.locator('input[name=a]').fill('amigos');
  await fila.locator('input[name=a]').press('Enter');
  await hasta(async () => (await movs('2026-11')).some((x) => x.etiquetas.includes('amigos')) && !(await movs('2026-11')).some((x) => x.etiquetas.includes('social')), 'etiqueta renombrada');
  await p.keyboard.press('Escape');

  await abrirGestion('recurrentes');
  await p.click('[data-accion=rec-form][data-id=gimnasio]');
  await p.fill('form[data-form=recurrente] input[name=importe]', '-45,00');
  await p.click('form[data-form=recurrente] button[type=submit]');
  await p.click('[data-opcion=esteMes]');
  await hasta(async () => items(await doc('recurrentes.md')).find((r) => r.id === 'gimnasio').importe === -4500, 'recurrente');
  await hasta(async () => (await movs('2026-11')).find((x) => x.rec === 'gimnasio').importe === -4500, '«también este mes»');
  assert.equal((await movs('2026-10')).find((x) => x.rec === 'gimnasio').importe, -3990, 'los meses pasados no');
  await p.keyboard.press('Escape');

  await abrirGestion('cuentas');
  await p.fill('#cu-nueva', 'Cuenta niños');
  await p.press('#cu-nueva', 'Enter');
  await hasta(async () => items(await doc('cuentas.md')).some((c) => c.id === 'cuenta-ninos'), 'cuenta creada');
  await p.fill('#cu-n-cuenta-ninos', 'Cuenta de los niños');
  await p.press('#cu-n-cuenta-ninos', 'Tab');
  await hasta(async () => items(await doc('cuentas.md')).find((c) => c.id === 'cuenta-ninos').nombre === 'Cuenta de los niños', 'renombrada sin cambiar el id');
  await p.keyboard.press('Escape');
});

test('mes financiero desde Ajustes: reparte todo con aviso y se deshace de una vez', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  const antes = await fsp.readFile(join(raiz, 'mes/2026-11.md'), 'utf8');
  await p.click('[data-accion=abrir-ajustes]');
  await p.click('[role=dialog] [data-accion=aj-seccion][data-id=general]');
  await p.selectOption('#aj-mes', '25');
  await p.waitForSelector('text=reparte TODOS tus movimientos');
  await p.click('[data-si]');
  await toastDice(/Mes financiero cambiado/);
  await hasta(async () => cabeceras(await doc('mes/2026-11.md')).periodo.desde === '2026-10-25', 'periodo nuevo');
  assert.equal(valores(await doc('ajustes.md')).mes_inicio_dia, 25);
  await p.click('[data-toast-deshacer]');
  await hasta(async () => (await fsp.readFile(join(raiz, 'mes/2026-11.md'), 'utf8')) === antes, 'deshecho byte a byte');
});

test('sin errores en la consola', (t) => {
  if (!navegador) return t.skip('sin Chromium');
  assert.deepEqual(errores, []);
});
