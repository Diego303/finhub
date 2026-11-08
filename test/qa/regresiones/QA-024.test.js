// QA-024 (S17, pérdida de datos): una edición a mano que el sondeo aún no ha visto (hasta 30 s en un fichero que
// no está en el conjunto caliente) se pisaba al escribir: el almacén no miraba el disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen } from '../../../src/server/almacen.js';
import { crearEntorno } from '../entorno.js';

const ABRIR = async (ficheros) => {
  const ent = await crearEntorno({ nombre: 'pisar', ficheros });
  return { ent, a: await new Almacen({ raiz: ent.datos }).cargar() };
};

test('edición a mano sin detectar → 409, la edición sigue en disco y el índice se pone al día', async () => {
  const { ent, a } = await ABRIR([['cuentas.md', 'original\n']]);
  try {
    await fsp.writeFile(join(ent.datos, 'cuentas.md'), 'editado a mano, y más largo\n');
    const avisos = [];
    a.alCambiar((e) => avisos.push(e));
    await assert.rejects(a.escribir({ 'cuentas.md': 'lo de la web\n' }), (e) => e.codigo === 'conflicto_version' && e.ruta === 'cuentas.md');
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'editado a mano, y más largo\n');
    assert.equal(a.texto('cuentas.md'), 'editado a mano, y más largo\n');
    assert.ok(avisos.some((x) => x.rutas.includes('cuentas.md')), 'la web se entera');
  } finally {
    await ent.limpiar();
  }
});

test('fichero creado o borrado por fuera sin detectar → 409; nada se pisa ni se resucita', async () => {
  const { ent, a } = await ABRIR([['cuentas.md', 'original\n']]);
  try {
    await fsp.writeFile(join(ent.datos, 'grupos.md'), 'de otro equipo\n');
    await assert.rejects(a.escribir({ 'grupos.md': 'nuevo\n' }), (e) => e.codigo === 'conflicto_version');
    assert.equal(await fsp.readFile(join(ent.datos, 'grupos.md'), 'utf8'), 'de otro equipo\n');
    await fsp.unlink(join(ent.datos, 'cuentas.md'));
    await assert.rejects(a.escribir({ 'cuentas.md': 'nuevo\n' }), (e) => e.codigo === 'conflicto_version');
    await assert.rejects(fsp.stat(join(ent.datos, 'cuentas.md')), { code: 'ENOENT' });
  } finally {
    await ent.limpiar();
  }
});

test('varios ficheros: si uno cambió por fuera no se escribe NINGUNO', async () => {
  const { ent, a } = await ABRIR([['cuentas.md', 'a\n'], ['grupos.md', 'b\n']]);
  try {
    await fsp.writeFile(join(ent.datos, 'grupos.md'), 'b editado\n');
    await assert.rejects(a.escribir({ 'cuentas.md': 'A\n', 'grupos.md': 'B\n' }), (e) => e.codigo === 'conflicto_version');
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'a\n');
  } finally {
    await ent.limpiar();
  }
});

test('un cambio de fecha sin cambio de contenido (lo que hace el cliente de sincronización) no es conflicto', async () => {
  const { ent, a } = await ABRIR([['cuentas.md', 'a\n']]);
  try {
    await fsp.utimes(join(ent.datos, 'cuentas.md'), new Date(), new Date(Date.now() + 5000));
    await a.escribir({ 'cuentas.md': 'b\n' });
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'b\n');
  } finally {
    await ent.limpiar();
  }
});

test('un fichero que no se puede consultar (EIO en stat) no se pisa', async () => {
  const { ent, a } = await ABRIR([['cuentas.md', 'a\n']]);
  try {
    const real = a.fs;
    a.fs = { ...real, readFile: real.readFile, stat: async (p, ...r) => { if (String(p).endsWith('cuentas.md')) throw Object.assign(new Error('x'), { code: 'EIO' }); return real.stat(p, ...r); } };
    a.reintentos = [];
    await assert.rejects(a.escribir({ 'cuentas.md': 'b\n' }), (e) => e.codigo === 'nube');
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'a\n');
  } finally {
    await ent.limpiar();
  }
});
