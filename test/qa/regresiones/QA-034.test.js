// QA-034 (pérdida de datos): si «mover» o «copiar» se cortaba a medias, la carpeta destino ya tenía ajustes.md y
// parecía una carpeta de finhub: «usar» la aceptaba y abrías una carpeta con la mitad de tus datos, como si fueran
// todos. Ajustes.md se copia ahora el último: hasta que no acaba, el destino no es una carpeta de finhub.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { copiarVerificando, validarDestino, cambiarCarpeta } from '../../../src/server/carpeta.js';
import { crearEntorno, esperar, RAIZ } from '../entorno.js';

test('el ajustes.md es lo último que se copia', async () => {
  const ent = await crearEntorno({ nombre: 'orden' });
  try {
    const orden = [];
    await copiarVerificando(ent.datos, join(ent.base, 'destino'), { progreso: (p) => orden.push(p.ruta) });
    assert.equal(orden.at(-1), 'ajustes.md');
  } finally {
    await ent.limpiar();
  }
});

test('SIGKILL a mitad de copiar: la antigua intacta; el destino no se puede «usar»; arreglado, se reintenta', async () => {
  const ent = await crearEntorno({ nombre: 'cortar' });
  try {
    const lista = async (d) => {
      const out = [];
      const ver = async (x, rel) => {
        for (const e of await fsp.readdir(x, { withFileTypes: true })) {
          if (e.isDirectory()) await ver(join(x, e.name), `${rel}${e.name}/`);
          else out.push(`${rel}${e.name}:${(await fsp.readFile(join(x, e.name))).length}`);
        }
      };
      await ver(d, '');
      return out.sort();
    };
    const antes = await lista(ent.datos);
    const guion = join(ent.base, 'copiar.mjs');
    await fsp.writeFile(guion, `import { copiarVerificando } from ${JSON.stringify(join(RAIZ, 'src/server/carpeta.js'))};
await copiarVerificando(process.argv[2], process.argv[3], { progreso: (p) => { if (p.hechos === 3) process.stdout.write('ya\\n'); } });
process.stdout.write('fin\\n');`);
    const destino = join(ent.base, 'destino con espacios ñ');
    const h = spawn(process.execPath, [guion, ent.datos, destino], { stdio: ['ignore', 'pipe', 'ignore'], env: ent.env });
    await new Promise((ok) => h.stdout.once('data', ok));
    h.kill('SIGKILL');
    await new Promise((ok) => h.once('exit', ok));
    await esperar(20);
    assert.deepEqual(await lista(ent.datos), antes, 'la antigua, igual');
    const v = await validarDestino(destino, { actual: ent.datos });
    assert.notEqual(v.estado, 'finhub', 'una copia a medias no es una carpeta de finhub');
    await assert.rejects(cambiarCarpeta({ entrada: destino, modo: 'usar', actual: ent.datos }), /no es de finhub/);
    await assert.rejects(cambiarCarpeta({ entrada: destino, modo: 'copiar', actual: ent.datos, aceptarAjenos: true }), /no se sobrescribe/, 'nunca pisa lo que hay');
  } finally {
    await ent.limpiar();
  }
});

test('una copia que no coincide con el original (hash) se detecta: se deshace y la antigua no se toca', async () => {
  const ent = await crearEntorno({ nombre: 'hash' });
  const real = fsp.readFile;
  const destino = join(ent.base, 'destino');
  const m = mock.method(fsp, 'readFile', async (r, ...a) => {
    const c = await real.call(fsp, r, ...a);
    return String(r).startsWith(destino) && String(r).endsWith('cuentas.md') ? Buffer.concat([c, Buffer.from('x')]) : c;
  });
  try {
    await assert.rejects(copiarVerificando(ent.datos, destino), /no coincide/);
    await assert.rejects(fsp.stat(destino), { code: 'ENOENT' }, 'lo copiado se deshace');
  } finally {
    m.mock.restore();
    await ent.limpiar();
  }
});
