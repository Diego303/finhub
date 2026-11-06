// QA-030 (S25): una operación desconocida respondía 400; se pide 422 (la petición está bien formada, pero esa
// operación no existe). Sin rutas internas ni trazas en el mensaje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../../src/server/app.js';
import { crearEntorno, pedir } from '../entorno.js';

test('op desconocida → 422', async () => {
  const ent = await crearEntorno({ nombre: 'desconocida' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  try {
    for (const op of ['no.existe', '__proto__', 'constructor', 'toString']) {
      const r = await pedir({ url: app.url.replace(/\/$/, ''), puerto: app.puerto }, 'POST', '/api/ops', { op, args: {} });
      assert.equal(r.estado, 422, op);
      assert.doesNotMatch(r.texto, /\/mnt\/|\/tmp\/|\.js:|at /);
    }
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
