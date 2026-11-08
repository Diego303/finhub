// QA-035: al «mover», si la papelera del sistema fallaba, el servidor ya había cerrado la carpeta y se quedaba sin
// ninguna: todo daba error hasta reiniciar. Los datos ya están copiados y verificados: se abre la nueva y se avisa de
// que la antigua sigue en su sitio. Y si abrir la nueva falla, se vuelve a la que había.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../../src/server/app.js';
import { crearEntorno, pedir } from '../entorno.js';

test('la papelera falla al mover: sigues en la carpeta nueva, con aviso, y la antigua intacta', async () => {
  const ent = await crearEntorno({ nombre: 'papelera-falla' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, enviarAPapelera: async () => { throw new Error('powershell no responde'); } }).iniciar();
  try {
    const destino = join(ent.base, 'nueva');
    const r = await app.cambiar({ ruta: destino, modo: 'mover', confirmarBorrado: true });
    assert.equal(r.ruta, destino);
    assert.match(r.avisos.join(), /no se pudo mandar.*sigue en su sitio/);
    assert.equal(app.carpeta, destino);
    assert.ok(await fsp.stat(join(ent.datos, 'ajustes.md')));
    const s = await pedir({ url: app.url.replace(/\/$/, ''), puerto: app.puerto }, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } });
    assert.equal(s.estado, 200);
    assert.match(await fsp.readFile(join(destino, 'hitos.md'), 'utf8'), /\| x\b/);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('un destino que no se puede abrir: se vuelve a la carpeta de antes y el servidor sigue', async () => {
  const ent = await crearEntorno({ nombre: 'abrir-falla' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
  try {
    const real = app.abrirCarpeta.bind(app);
    let primera = true;
    app.abrirCarpeta = async (ruta, o) => {
      if (primera) {
        primera = false;
        throw new Error('no se puede abrir');
      }
      return real(ruta, o);
    };
    const otra = join(ent.base, 'otra');
    await assert.rejects(app.cambiar({ ruta: otra, modo: 'crear' }), /no se puede abrir/);
    assert.equal(app.carpeta, ent.datos);
    assert.equal((await pedir({ url: app.url.replace(/\/$/, ''), puerto: app.puerto }, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'y' } })).estado, 200);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
