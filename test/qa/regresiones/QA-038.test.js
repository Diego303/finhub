// QA-038: cambiar de carpeta justo después de la primera escritura del día fallaba con ENOENT: la lista de ficheros
// recorría la copia del día mientras se hacía (y metía sus temporales en la carpeta nueva). Ahora se espera a la copia,
// y una copia a medias que haya quedado de un corte no se lleva.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../../src/server/app.js';
import { copiarVerificando } from '../../../src/server/carpeta.js';
import { crearEntorno } from '../entorno.js';

test('cambiar con la copia del día en marcha: sale bien', async () => {
  const ent = await crearEntorno({ nombre: 'copia-curso' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
  try {
    await app.aplicar({ op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } });
    const r = await app.cambiar({ ruta: join(ent.base, 'nueva'), modo: 'copiar' });
    assert.equal(r.ok, true);
    const copias = await fsp.readdir(join(ent.base, 'nueva/.finhub/copias'));
    assert.deepEqual(copias.filter((n) => n.includes('tmp')), []);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('una copia a medias de un corte no viaja a la carpeta nueva', async () => {
  const ent = await crearEntorno({ nombre: 'copia-resto' });
  try {
    await fsp.mkdir(join(ent.datos, '.finhub/copias/2026-11-05.finhub-tmp-77/mes'), { recursive: true });
    await fsp.writeFile(join(ent.datos, '.finhub/copias/2026-11-05.finhub-tmp-77/mes/x.md'), 'a medias');
    await copiarVerificando(ent.datos, join(ent.base, 'nueva'));
    await assert.rejects(fsp.stat(join(ent.base, 'nueva/.finhub/copias')), { code: 'ENOENT' });
  } finally {
    await ent.limpiar();
  }
});
