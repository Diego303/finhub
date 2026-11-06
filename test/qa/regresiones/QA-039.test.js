// QA-039 (seguridad): «conocimiento/../../x.md» pasaba por un fichero de datos; lo paraba el almacén, pero con un error
// sin traducir (500). Y «..» como nombre en CONTEXTO apuntaba a la carpeta de datos entera. Ahora: fuera en la entrada y 4xx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { detectar } from '../../../src/core/formato/index.js';
import { App } from '../../../src/server/app.js';
import { Almacen } from '../../../src/server/almacen.js';
import { crearEntorno, pedir } from '../entorno.js';

test('detectar no da por datos una ruta con «..» o «.»', () => {
  for (const r of ['conocimiento/../../x/y.md', 'conocimiento/../cuentas.md', 'conocimiento/x/../../y.md', 'conocimiento/./x/y.md', 'roles/../cuentas.md', '../cuentas.md', 'conocimiento/../mes/2026-11.md']) assert.equal(detectar(r), null, r);
  for (const r of ['cuentas.md', 'conocimiento/mias/2026-10-02-x.md', 'mes/2026-11.md']) assert.ok(detectar(r), r);
});

test('una ruta que intenta salir: error de ruta del almacén (400), no 500', async () => {
  const ent = await crearEntorno({ nombre: 'ruta' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
  const api = (...a) => pedir({ url: app.url.replace(/\/$/, ''), puerto: app.puerto }, ...a);
  try {
    assert.equal((await api('POST', '/api/ops', { op: 'bloque.crear', args: { ruta: 'conocimiento/../../x/y.md', id: 'A-1', titulo: 'x' } })).estado, 400);
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    assert.throws(() => a.rutaServicio('../../x'), (e) => e.codigo === 'ruta');
    for (const fichero of ['..', '.', 'a\\b', 'a/b', '']) {
      assert.equal((await api('POST', '/api/contexto/procesado', { fichero, fuente: 'pizarra' })).estado, 400, fichero);
    }
    assert.ok(await fsp.stat(join(ent.datos, 'ajustes.md')), 'la carpeta sigue en su sitio');
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
