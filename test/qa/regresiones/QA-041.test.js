// QA-041 (seguridad, S22): un enlace simbólico dentro de la carpeta que apunta fuera se leía como si fuera tuyo (y su
// contenido podía acabar en un trabajo de Claude), y a través de una carpeta enlazada se escribía fuera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen } from '../../../src/server/almacen.js';
import { crearEntorno } from '../entorno.js';

async function montar() {
  const ent = await crearEntorno({ nombre: 'enlace', ficheros: [['cuentas.md', 'de verdad\n']] });
  const fuera = join(ent.base, 'fuera');
  await fsp.mkdir(fuera);
  await fsp.writeFile(join(fuera, 'x.md'), 'secreto\n');
  return { ent, fuera };
}

test('un enlace a un fichero de fuera no entra en los datos; uno de dentro, sí', async () => {
  const { ent, fuera } = await montar();
  try {
    await fsp.symlink(join(fuera, 'x.md'), join(ent.datos, 'grupos.md'));
    await fsp.symlink(join(ent.datos, 'cuentas.md'), join(ent.datos, 'etiquetas.md'));
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    assert.equal(a.obtener('grupos.md'), null);
    assert.ok(a.otros.ajenos.includes('grupos.md'), 'se avisa como ajeno');
    assert.equal(a.texto('etiquetas.md'), 'de verdad\n');
    await assert.rejects(a.escribir({ 'grupos.md': 'x\n' }), (e) => e.codigo === 'ruta');
    assert.equal(await fsp.readFile(join(fuera, 'x.md'), 'utf8'), 'secreto\n');
  } finally {
    await ent.limpiar();
  }
});

test('escribir a través de una carpeta enlazada que sale: rechazado', async () => {
  const { ent, fuera } = await montar();
  try {
    await fsp.mkdir(join(ent.datos, 'conocimiento'), { recursive: true });
    await fsp.symlink(fuera, join(ent.datos, 'conocimiento/enlazada'));
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    await assert.rejects(a.escribir({ 'conocimiento/enlazada/nuevo.md': 'x\n' }), (e) => e.codigo === 'ruta');
    assert.deepEqual(await fsp.readdir(fuera), ['x.md']);
  } finally {
    await ent.limpiar();
  }
});

test('un enlace colgando no rompe la carga', async () => {
  const { ent } = await montar();
  try {
    await fsp.symlink(join(ent.base, 'no-existe'), join(ent.datos, 'grupos.md'));
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    assert.equal(a.obtener('grupos.md'), null);
  } finally {
    await ent.limpiar();
  }
});
