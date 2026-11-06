// QA-026 (S18, pérdida de datos): un marcador de 0 bytes (fichero solo en la nube) se leía como un fichero vacío y
// una operación podía reescribirlo; un `stat` que fallaba dejaba el fichero fuera del índice y se trataba como
// inexistente: una operación con «crear» lo pisaba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen } from '../../../src/server/almacen.js';
import { crearEntorno } from '../entorno.js';

test('un fichero de 0 bytes es «nube», nunca vacío: se reintenta y no se escribe', async () => {
  const ent = await crearEntorno({ nombre: 'cero', ficheros: [['cuentas.md', '']] });
  try {
    const a = await new Almacen({ raiz: ent.datos, reintentos: [1, 1] }).cargar();
    assert.equal(a.obtener('cuentas.md').legible, false);
    assert.equal(a.obtener('cuentas.md').error, 'nube');
    assert.throws(() => a.texto('cuentas.md'), (e) => e.codigo === 'nube');
    await assert.rejects(a.escribir({ 'cuentas.md': 'x\n' }), (e) => e.codigo === 'nube');
    assert.equal((await fsp.stat(join(ent.datos, 'cuentas.md'))).size, 0);
  } finally {
    await ent.limpiar();
  }
});

test('un fichero bueno que pasa a 0 bytes conserva el último texto, marcado; al volver, se recupera', async () => {
  const ent = await crearEntorno({ nombre: 'cero2', ficheros: [['cuentas.md', 'bueno\n']] });
  try {
    const a = await new Almacen({ raiz: ent.datos, reintentos: [1] }).cargar();
    await fsp.writeFile(join(ent.datos, 'cuentas.md'), '');
    await a.barrer();
    assert.equal(a.obtener('cuentas.md').legible, false);
    assert.equal(a.obtener('cuentas.md').texto, 'bueno\n');
    await fsp.writeFile(join(ent.datos, 'cuentas.md'), 'bueno y descargado\n');
    await a.barrer();
    assert.equal(a.texto('cuentas.md'), 'bueno y descargado\n');
  } finally {
    await ent.limpiar();
  }
});

test('un `stat` que falla no saca el fichero del índice ni lo hace pasar por inexistente', async () => {
  const ent = await crearEntorno({ nombre: 'stat', ficheros: [['cuentas.md', 'a\n'], ['grupos.md', 'b\n']] });
  try {
    const falla = (real) => ({ ...real, stat: async (p, ...r) => { if (String(p).endsWith('grupos.md')) throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' }); return real.stat(p, ...r); } });
    const a = new Almacen({ raiz: ent.datos, reintentos: [1], fs: falla(fsp) });
    await a.cargar();
    assert.equal(a.obtener('grupos.md')?.legible, false, 'sale como ilegible, no como inexistente');
    assert.equal(a.obtener('grupos.md').error, 'nube');
    assert.throws(() => a.texto('grupos.md'));
    const b = await new Almacen({ raiz: ent.datos, reintentos: [1] }).cargar();
    b.fs = falla(fsp);
    await b.barrer();
    assert.equal(b.obtener('grupos.md').legible, false);
    assert.equal(b.obtener('grupos.md').texto, 'b\n');
  } finally {
    await ent.limpiar();
  }
});
