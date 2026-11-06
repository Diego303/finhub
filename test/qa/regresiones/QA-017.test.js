// QA-007, QA-008, QA-020, QA-021, QA-017 · Ciclo de vida del proceso de Claude: cancelar mata también a sus hijos,
// una salida enorme no agota la memoria, morir por una señal es un error, y nada queda huérfano.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { ejecutar } from '../../../src/claude/runner.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { App } from '../../../src/server/app.js';
import { taller, json, FAKE } from '../ayuda-claude.js';
import { crearEntorno, esperar } from '../entorno.js';

let ta;
before(async () => (ta = await taller('proceso')));
after(() => ta.limpiar());
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function hasta(fn, ms = 8000) {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    if (await fn()) return true;
    await esperar(50);
  }
  return false;
}

test('QA-017: parar el servidor cancela los trabajos en marcha, sin procesos ni sandboxes sobrantes', async () => {
  const ent = await crearEntorno({ nombre: 'parar' });
  const pidf = join(ent.base, 'pid');
  const guion = join(ent.base, 'guion.json');
  await fsp.writeFile(guion, JSON.stringify([{ init: {} }, { hijo: pidf }, { colgar: true }]));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, claude: { comando: [process.execPath, FAKE, '--guion', guion] } }).iniciar();
  try {
    await app.claude.lanzar({ trabajo: 'rex-web', params: { pregunta: '¿Qué es el TER?' } });
    assert.ok(await hasta(() => fsp.stat(pidf).then(() => true, () => false)));
    const pid = +(await fsp.readFile(pidf, 'utf8'));
    await app.parar();
    assert.ok(await hasta(() => !vivo(pid), 7000), 'el proceso de Claude sigue vivo tras parar');
    assert.deepEqual(await fsp.readdir(app.claude.sandboxBase).catch(() => []), []);
  } finally {
    await app.parar().catch(() => {});
    await ent.limpiar();
  }
});
