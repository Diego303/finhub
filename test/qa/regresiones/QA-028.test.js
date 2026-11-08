// QA-028 (S20): entre latidos (30 s), una instancia a la que otro equipo le quitó el control seguía escribiendo.
// Ahora se relee el candado antes de cada escritura. Si desaparece, se vuelve a poner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../../src/server/app.js';
import { parsearCandado, serializarCandado } from '../../../src/core/formato/servicio.js';
import { crearEntorno } from '../entorno.js';

const OP = { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } };

test('otro toma el control entre latidos: la siguiente operación es 423, sin escribir', async () => {
  const ent = await crearEntorno({ nombre: 'quitar' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  try {
    const antes = await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8');
    const ahora = new Date().toISOString();
    const lock = serializarCandado({ equipo: 'OTRO-EQUIPO', pid: 4242, inicio: ahora, latido: ahora, version: '1' });
    await fsp.writeFile(join(ent.datos, '.finhub/abierto.lock'), lock);
    await assert.rejects(app.aplicar(OP), (e) => e.estado === 423);
    assert.equal(await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8'), antes);
    assert.equal(app.candado.estado.soloLectura, true);
    await assert.rejects(app.deshacerUltima({}), (e) => e.estado === 423);
    await app.parar();
    assert.equal(await fsp.readFile(join(ent.datos, '.finhub/abierto.lock'), 'utf8'), lock, 'el candado del otro no se toca');
  } finally {
    await app.parar().catch(() => {});
    await ent.limpiar();
  }
});

test('el candado desaparece: se vuelve a poner y la operación sigue; ilegible: no se pisa', async () => {
  const ent = await crearEntorno({ nombre: 'perder' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env }).iniciar();
  try {
    const lock = join(ent.datos, '.finhub/abierto.lock');
    await fsp.unlink(lock);
    await app.aplicar(OP);
    assert.equal(parsearCandado(await fsp.readFile(lock, 'utf8')).valor.pid, process.pid);
    assert.equal(app.candado.estado.soloLectura, false);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
