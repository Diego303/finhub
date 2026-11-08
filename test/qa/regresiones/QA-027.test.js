// QA-027 (S19): la segunda instancia (solo lectura) no debe escribir nada, pero al abrir borraba los temporales de
// la primera (que podía estar a media escritura) y purgaba la papelera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { App } from '../../../src/server/app.js';
import { serializarCandado } from '../../../src/core/formato/servicio.js';
import { crearEntorno } from '../entorno.js';

async function huella(dir) {
  const out = {};
  const ver = async (d) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      if (e.isDirectory()) await ver(r);
      else out[relative(dir, r)] = createHash('sha1').update(await fsp.readFile(r)).digest('hex');
    }
  };
  await ver(dir);
  return out;
}

test('segunda instancia: no toca NADA de la carpeta (ni temporales, ni papelera, ni copias, ni candado)', async () => {
  const ent = await crearEntorno({ nombre: 'segunda' });
  const ahora = new Date().toISOString();
  await fsp.mkdir(join(ent.datos, '.finhub/papelera'), { recursive: true });
  await fsp.mkdir(join(ent.datos, '.finhub/copias/2026-11-05.finhub-tmp-999'), { recursive: true });
  await fsp.writeFile(join(ent.datos, '.finhub/copias/2026-11-05.finhub-tmp-999/x.md'), 'a medias');
  await fsp.writeFile(join(ent.datos, '.finhub/abierto.lock'), serializarCandado({ equipo: 'OTRO-EQUIPO', pid: 4242, inicio: ahora, latido: ahora, version: '1' }));
  await fsp.writeFile(join(ent.datos, '.finhub-tmp-4242-1-abc'), 'la primera instancia está escribiendo');
  await fsp.writeFile(join(ent.datos, '.finhub/papelera/_indice.jsonl'), `${JSON.stringify({ id: 'p-1', que: 'x', ruta: 'cuentas.md', tipo: 'entidad', borrado: '2020-01-01T00:00:00.000Z', expira: '2020-01-31T00:00:00.000Z', contenido: 'x' })}\n`);
  const antes = await huella(ent.datos);
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, equipo: 'ESTE-EQUIPO' }).iniciar();
  try {
    assert.equal(app.candado.estado.soloLectura, true);
    assert.deepEqual(await huella(ent.datos), antes);
    await assert.rejects(app.aplicar({ op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } }), (e) => e.estado === 423);
    assert.deepEqual(await huella(ent.datos), antes);
  } finally {
    await app.parar();
  }
  assert.deepEqual(await huella(ent.datos), antes, 'y al cerrar tampoco');
  await ent.limpiar();
});

test('con el candado sí: limpia temporales y purga lo caducado', async () => {
  const ent = await crearEntorno({ nombre: 'primera' });
  await fsp.writeFile(join(ent.datos, '.finhub-tmp-4242-1-abc'), 'huérfano');
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  try {
    assert.equal(app.estado().temporalesLimpiados, 1);
    await assert.rejects(fsp.stat(join(ent.datos, '.finhub-tmp-4242-1-abc')));
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
