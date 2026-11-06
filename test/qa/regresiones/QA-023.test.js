// QA-023 (S23): la copia del día es la de ANTES del cambio. La foto se tomaba tras varios `await`, así que podía
// llevar ya lo nuevo; y al parar el servidor no se esperaba: quedaba una carpeta «*.finhub-tmp-*» a medias, que
// nadie limpiaba nunca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen } from '../../../src/server/almacen.js';
import { Copias } from '../../../src/server/copias.js';
import { App } from '../../../src/server/app.js';
import { crearEntorno } from '../entorno.js';

test('la copia lleva el texto de antes de la escritura', async () => {
  const ent = await crearEntorno({ nombre: 'copia-foto', ficheros: [['ajustes.md', 'antes\n']] });
  try {
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    const c = new Copias({ almacen: a, hoy: () => '2026-11-06' });
    const p = c.antesDeEscribir();
    await a.escribir({ 'ajustes.md': 'despues\n' });
    await p;
    assert.equal(await fsp.readFile(join(ent.datos, '.finhub/copias/2026-11-06/ajustes.md'), 'utf8'), 'antes\n');
  } finally {
    await ent.limpiar();
  }
});

test('parar espera a la copia en curso: no deja temporales', async () => {
  const ent = await crearEntorno({ nombre: 'copia-parar' });
  try {
    const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
    try {
      await app.aplicar({ op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } });
    } finally {
      await app.parar();
    }
    assert.deepEqual((await fsp.readdir(join(ent.datos, '.finhub/copias'))).filter((n) => n.includes('tmp')), []);
  } finally {
    await ent.limpiar();
  }
});

test('una carpeta temporal huérfana de un corte se limpia al abrir (y solo esa)', async () => {
  const ent = await crearEntorno({ nombre: 'copia-huerfana' });
  try {
    const dir = join(ent.datos, '.finhub/copias');
    await fsp.mkdir(join(dir, '2026-11-05.finhub-tmp-999/cartera'), { recursive: true });
    await fsp.mkdir(join(dir, '2026-11-04/cartera'), { recursive: true });
    await fsp.writeFile(join(dir, '2026-11-04/cartera/x.md'), 'buena');
    const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
    await app.parar();
    assert.deepEqual((await fsp.readdir(dir)).sort(), ['2026-11-04']);
  } finally {
    await ent.limpiar();
  }
});
