// QA-032: si fallaba crear la carpeta (disco lleno, sin permisos), el error salía sin traducir y la web veía «Error
// interno» en vez de «no se pudo escribir…: ENOSPC». Nada se corrompía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { Almacen } from '../../../src/server/almacen.js';
import { crearEntorno } from '../entorno.js';

test('fallo al crear la carpeta → error de disco con el código', async () => {
  const ent = await crearEntorno({ nombre: 'mkdir', ficheros: [['cuentas.md', 'a\n']] });
  try {
    const fs = { ...fsp, stat: fsp.stat.bind(fsp), readFile: fsp.readFile.bind(fsp), readdir: fsp.readdir.bind(fsp), unlink: fsp.unlink.bind(fsp), mkdir: async () => { throw Object.assign(new Error('x'), { code: 'ENOSPC' }); } };
    const a = await new Almacen({ raiz: ent.datos, fs }).cargar();
    await assert.rejects(a.escribir({ 'mes/2026-11.md': 'x\n' }), (e) => e.codigo === 'disco' && /ENOSPC/.test(e.message));
  } finally {
    await ent.limpiar();
  }
});
