// QA-025 (S16, pérdida de datos entre pestañas): la web nunca mandaba versión, así que el 409 de §2.4 no protegía
// nada: una pestaña con datos viejos aplicaba su operación sobre lo que había escrito la otra, sin enterarse.
// Ahora cada operación lleva la versión con la que se cargaron los datos («base»): si alguno de los ficheros que va
// a escribir cambió después, 409. Las operaciones de una misma pestaña van en serie, sin falsos conflictos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App } from '../../../src/server/app.js';
import { crearEntorno, pedir, RAIZ } from '../entorno.js';

const ARGS = (texto) => ({ fecha: '2026-11-06', texto });

async function conApp(fn) {
  const ent = await crearEntorno({ nombre: 'pestanas' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  try {
    await fn(app, (cuerpo) => pedir(srv, 'POST', '/api/ops', cuerpo));
  } finally {
    await app.parar();
    await ent.limpiar();
  }
}

test('dos pestañas: la que tiene datos viejos recibe 409 si toca el mismo fichero', async () => {
  await conApp(async (app, ops) => {
    const base = app.almacen.version;
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('de la pestaña A'), base })).estado, 200);
    const r = await ops({ op: 'hito.crear', args: ARGS('de la pestaña B'), base });
    assert.equal(r.estado, 409);
    assert.equal(r.json.codigo, 'conflicto_version');
    assert.equal(r.json.ruta, 'hitos.md');
    assert.doesNotMatch(app.almacen.texto('hitos.md'), /pestaña B/);
    assert.match(app.almacen.texto('hitos.md'), /pestaña A/);
  });
});

test('un fichero distinto no choca; con la versión al día, tampoco; sin base, como antes', async () => {
  await conApp(async (app, ops) => {
    const base = app.almacen.version;
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('uno'), base })).estado, 200);
    assert.equal((await ops({ op: 'ajustes.fijar', args: { clave: 'tema', valor: 'oscuro' }, base })).estado, 200, 'otro fichero');
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('dos'), base: app.almacen.version })).estado, 200, 'al día');
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('tres') })).estado, 200, 'sin base');
  });
});

test('una edición a mano ya vista por el sondeo también cuenta; tras reiniciar, una base del futuro es 409', async () => {
  await conApp(async (app, ops) => {
    const base = app.almacen.version;
    const texto = app.almacen.texto('hitos.md');
    await (await import('node:fs/promises')).writeFile(join(app.carpeta, 'hitos.md'), `${texto}\n`);
    await app.almacen.barrer();
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('x'), base })).estado, 409);
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('x'), base: app.almacen.version + 50 })).estado, 409);
    assert.equal((await ops({ op: 'hito.crear', args: ARGS('x'), base: 'mala' })).estado, 400);
  });
});

test('la web manda la base y pone en fila sus operaciones', () => {
  const api = readFileSync(join(RAIZ, 'web/api.js'), 'utf8');
  assert.match(api, /base: versionVista/);
  assert.match(api, /enFila/);
});
