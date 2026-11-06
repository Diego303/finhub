// QA2.10–13 · Escritura atómica, fallos de disco, escrituras inútiles, copias y concurrencia, sobre el servidor de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Almacen } from '../../src/server/almacen.js';
import { Copias, MANTENER } from '../../src/server/copias.js';
import { App } from '../../src/server/app.js';
import { crearEntorno, pedir, esperar, RAIZ } from '../qa/entorno.js';
import { crearPrng } from '../../src/core/prng.js';

const SEMILLA = Number(process.env.FINHUB_SEMILLA ?? 20261106);
const MATAR = Number(process.env.FINHUB_SIGKILL ?? 60); // test:todo usa 300

const ESCRITOR = `
import { Almacen } from ${JSON.stringify(join(RAIZ, 'src/server/almacen.js'))};
const a = await new Almacen({ raiz: process.argv[2] }).cargar({ limpiar: false });
process.stdout.write('listo\\n');
for (let i = 0; ; i++) {
  await a.escribir({ 'cuentas.md': 'A'.repeat(+process.argv[3]) + i + '\\nFIN\\n', 'grupos.md': 'B'.repeat(+process.argv[3]) + i + '\\nFIN\\n' });
}
`;

test(`SIGKILL a mitad de escritura (${MATAR} veces, pequeños y grandes; semilla ${SEMILLA}): nunca truncado, vacío ni mezclado`, async () => {
  const prng = crearPrng(SEMILLA);
  const ent = await crearEntorno({ nombre: 'sigkill', ficheros: [['cuentas.md', 'inicial\nFIN\n'], ['grupos.md', 'inicial\nFIN\n']] });
  try {
    const esc = join(ent.base, 'escritor.mjs');
    await fsp.writeFile(esc, ESCRITOR);
    let temporales = 0;
    for (let i = 0; i < MATAR; i++) {
      const tam = i % 3 === 0 ? 5 * 1024 * 1024 : i % 3 === 1 ? 200 : 64 * 1024;
      const h = spawn(process.execPath, [esc, ent.datos, String(tam)], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...ent.env } });
      await new Promise((ok) => h.stdout.once('data', ok));
      await esperar(prng.entero(0, 25));
      h.kill('SIGKILL');
      await new Promise((ok) => h.once('exit', ok));
      for (const f of ['cuentas.md', 'grupos.md']) {
        const t = await fsp.readFile(join(ent.datos, f), 'utf8');
        assert.ok(t.length > 0, `${f}: vacío (vuelta ${i})`);
        assert.ok(t.endsWith('\nFIN\n'), `${f}: truncado (vuelta ${i}, semilla ${SEMILLA})`);
        assert.ok(!(t.includes('A') && t.includes('B')), `${f}: mezclado`);
      }
      const tmp = readdirSync(ent.datos).filter((n) => n.startsWith('.finhub-tmp-'));
      temporales += tmp.length;
      const a = await new Almacen({ raiz: ent.datos }).cargar();
      assert.equal(a.temporalesLimpiados.length, tmp.length);
      assert.deepEqual(readdirSync(ent.datos).filter((n) => n.startsWith('.finhub-tmp-')), [], 'temporales limpiados al abrir');
      assert.ok(a.texto('cuentas.md').endsWith('\nFIN\n'));
    }
    assert.ok(temporales > 0 || MATAR < 30, `se ha llegado a matar a mitad de escritura (${temporales} temporales)`);
  } finally {
    await ent.limpiar();
  }
});

const FALLO = (codigo) => Object.assign(new Error(`${codigo}: simulado`), { code: codigo });
/** fs que falla en una fase de la escritura atómica. */
function fsQueFalla(fase, codigo) {
  let activo = false;
  const real = fsp;
  const envuelto = {
    ...real,
    stat: real.stat.bind(real),
    readFile: real.readFile.bind(real),
    readdir: real.readdir.bind(real),
    unlink: real.unlink.bind(real),
    mkdir: async (...a) => {
      if (activo && fase === 'mkdir') throw FALLO(codigo);
      return real.mkdir(...a);
    },
    rename: async (...a) => {
      if (activo && fase === 'rename') throw FALLO(codigo);
      return real.rename(...a);
    },
    open: async (ruta, modo) => {
      if (activo && fase === 'open') throw FALLO(codigo);
      const fh = await real.open(ruta, modo);
      if (!activo || (fase !== 'write' && fase !== 'sync')) return fh;
      return {
        writeFile: async (...a) => {
          if (fase === 'write') {
            // escribe a medias y falla, como un disco lleno
            await fh.writeFile(String(a[0]).slice(0, 3));
            throw FALLO(codigo);
          }
          return fh.writeFile(...a);
        },
        sync: async () => {
          if (fase === 'sync') throw FALLO(codigo);
          return fh.sync();
        },
        close: () => fh.close(),
      };
    },
  };
  return { fs: envuelto, activar: () => (activo = true), desactivar: () => (activo = false) };
}

test('ENOSPC, EACCES, EROFS, EIO en cada fase de la escritura: error claro, sin corrupción, sin temporales, y luego se puede escribir', async () => {
  for (const codigo of ['ENOSPC', 'EACCES', 'EROFS', 'EIO']) {
    for (const fase of ['mkdir', 'open', 'write', 'sync', 'rename']) {
      const ent = await crearEntorno({ nombre: 'disco', ficheros: [['cuentas.md', 'original a\n'], ['grupos.md', 'original b\n']] });
      try {
        const f = fsQueFalla(fase, codigo);
        const a = await new Almacen({ raiz: ent.datos, fs: f.fs }).cargar();
        f.activar();
        await assert.rejects(a.escribir({ 'cuentas.md': 'nuevo a\n', 'grupos.md': 'nuevo b\n' }), (e) => e.codigo === 'disco' && e.message.includes(codigo), `${codigo} en ${fase}`);
        f.desactivar();
        assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'original a\n');
        assert.equal(await fsp.readFile(join(ent.datos, 'grupos.md'), 'utf8'), 'original b\n');
        assert.equal(a.texto('cuentas.md'), 'original a\n');
        assert.deepEqual((await fsp.readdir(ent.datos)).filter((n) => n.includes('tmp')), [], `${codigo} en ${fase}: temporal limpio`);
        await a.escribir({ 'cuentas.md': 'nuevo a\n' });
        assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'nuevo a\n');
      } finally {
        await ent.limpiar();
      }
    }
  }
});

test('si falla el segundo fichero de una operación, el primero vuelve atrás', async () => {
  const ent = await crearEntorno({ nombre: 'mitad', ficheros: [['cuentas.md', 'original a\n'], ['grupos.md', 'original b\n']] });
  try {
    let n = 0;
    const fs = { ...fsp, stat: fsp.stat.bind(fsp), readFile: fsp.readFile.bind(fsp), readdir: fsp.readdir.bind(fsp), unlink: fsp.unlink.bind(fsp), mkdir: fsp.mkdir.bind(fsp), open: fsp.open.bind(fsp), rename: async (...a) => {
      if (++n === 2) throw FALLO('ENOSPC');
      return fsp.rename(...a);
    } };
    const a = await new Almacen({ raiz: ent.datos, fs }).cargar();
    await assert.rejects(a.escribir({ 'cuentas.md': 'nuevo a\n', 'grupos.md': 'nuevo b\n' }), (e) => e.codigo === 'disco');
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'original a\n');
    assert.equal(await fsp.readFile(join(ent.datos, 'grupos.md'), 'utf8'), 'original b\n');
    assert.equal(a.texto('cuentas.md'), 'original a\n');
  } finally {
    await ent.limpiar();
  }
});

async function conApp(fn, { nombre = 'app', ficheros = null, opciones = {} } = {}) {
  const ent = await crearEntorno({ nombre, ficheros });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, ...opciones }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  try {
    await fn(app, srv, ent);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
}

test('con el disco fallando la API responde un error claro, sin rutas internas, y el servidor sigue vivo', async () => {
  await conApp(async (app, srv) => {
    const real = app.almacen.fs;
    app.almacen.fs = { ...real, stat: real.stat.bind(real), readFile: real.readFile.bind(real), readdir: real.readdir.bind(real), unlink: real.unlink.bind(real), mkdir: real.mkdir.bind(real), rename: real.rename.bind(real), open: async () => {
      throw FALLO('ENOSPC');
    } };
    const r = await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } });
    assert.equal(r.estado, 500);
    assert.match(r.json.error, /ENOSPC/);
    assert.doesNotMatch(r.texto, /\/tmp\/|\/mnt\/|\.js:\d+/);
    app.almacen.fs = real;
    assert.equal((await pedir(srv, 'GET', '/api/salud')).estado, 200);
    assert.equal((await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } })).estado, 200);
  }, { nombre: 'vivo' });
});

test('sin escrituras inútiles: una operación que no cambia nada y el sondeo no tocan el mtime', async () => {
  const fechas = async (dir) => {
    const out = {};
    const ver = async (d) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true })) {
        const r = join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== '.finhub') await ver(r);
        } else out[r] = (await fsp.stat(r)).mtimeMs;
      }
    };
    await ver(dir);
    return out;
  };
  await conApp(async (app, srv, ent) => {
    const antes = await fechas(ent.datos);
    for (let i = 0; i < 3; i++) {
      await app.almacen.sondeoRapido({ calientes: app.calientes() });
      await app.almacen.barrer();
    }
    for (const r of ['/api/estado', '/api/datos', '/api/version', '/api/papelera']) await pedir(srv, 'GET', r);
    assert.deepEqual(await fechas(ent.datos), antes, 'leer y sondear no escriben');
    const nombre = app.ajustesDe(app.almacen).nombre;
    const r = await pedir(srv, 'POST', '/api/ops', { op: 'ajustes.fijar', args: { clave: 'nombre', valor: nombre } });
    assert.equal(r.estado, 200);
    assert.deepEqual(r.json.cambios, {});
    assert.deepEqual(await fechas(ent.datos), antes, 'una operación que no cambia nada, tampoco');
    assert.equal(await fsp.stat(join(ent.datos, '.finhub/copias')).then(() => true, () => false), false, 'ni hace la copia del día');
  }, { nombre: 'mtime' });
});

test('copias: primera escritura del día; rotan 14; «copias: local» va fuera; restaurar da los mismos bytes', async () => {
  const ent = await crearEntorno({ nombre: 'copias', ficheros: [['cuentas.md', 'día 0\n'], ['mes/2026-11.md', 'mes\n']] });
  try {
    let dia = '2026-11-01';
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    const c = new Copias({ almacen: a, hoy: () => dia });
    await c.antesDeEscribir();
    await c.antesDeEscribir();
    const dir = join(ent.datos, '.finhub/copias');
    assert.deepEqual(await fsp.readdir(dir), ['2026-11-01']);
    await a.escribir({ 'cuentas.md': 'modificado\n' });
    assert.equal(await fsp.readFile(join(dir, '2026-11-01/cuentas.md'), 'utf8'), 'día 0\n', 'la copia no cambia con lo que venga después');
    // restaurar: copiar de vuelta da los mismos bytes
    await fsp.cp(join(dir, '2026-11-01'), ent.datos, { recursive: true });
    assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'día 0\n');
    for (let d = 2; d <= 25; d++) {
      dia = `2026-11-${String(d).padStart(2, '0')}`;
      await c.antesDeEscribir();
    }
    const quedan = (await fsp.readdir(dir)).sort();
    assert.equal(quedan.length, MANTENER);
    assert.equal(quedan.at(-1), '2026-11-25');
    assert.equal(quedan[0], '2026-11-12');
    // una carpeta que no es una copia no se toca
    await fsp.mkdir(join(dir, 'mis-cosas'));
    await c.rotar();
    assert.ok((await fsp.readdir(dir)).includes('mis-cosas'));
    // local: fuera de la carpeta de datos
    const local = join(ent.base, 'local');
    const l = new Copias({ almacen: a, hoy: () => '2026-12-01', destinoLocal: local });
    await l.antesDeEscribir();
    assert.equal((await fsp.readdir(dir)).includes('2026-12-01'), false);
    assert.equal((await fsp.readdir(await fsp.readdir(local).then((x) => join(local, x[0])))).length, 1);
  } finally {
    await ent.limpiar();
  }
});

test('50 operaciones en paralelo: ninguna se pierde', async () => {
  await conApp(async (app, srv) => {
    const antes = app.almacen.texto('hitos.md').split('\n').filter((l) => l.startsWith('- ')).length;
    const res = await Promise.all(Array.from({ length: 50 }, (_, i) => pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: `hito ${i}` } })));
    assert.deepEqual([...new Set(res.map((r) => r.estado))], [200]);
    const texto = await fsp.readFile(join(app.carpeta, 'hitos.md'), 'utf8');
    assert.equal(texto.split('\n').filter((l) => l.startsWith('- ')).length, antes + 50);
    for (let i = 0; i < 50; i++) assert.match(texto, new RegExp(`hito ${i}\\b`));
    const ids = res.map((r) => r.json.resultado.id);
    assert.equal(new Set(ids).size, 50);
  }, { nombre: 'paralelo' });
});

test('el deshacer por HTTP: hecho, repetido y pasado de plazo; lo cambiado después no se deshace', async () => {
  await conApp(async (app, srv) => {
    const h = { 'X-Finhub-Sesion': 's1' };
    const antes = app.almacen.texto('hitos.md');
    const a = await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'a' } }, h);
    assert.equal((await pedir(srv, 'POST', '/api/deshacer', { id: a.json.deshacer }, h)).estado, 200);
    assert.equal(await fsp.readFile(join(app.carpeta, 'hitos.md'), 'utf8'), antes);
    assert.equal((await pedir(srv, 'POST', '/api/deshacer', { id: a.json.deshacer }, h)).estado, 404, 'dos veces, no');
    const b = await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'b' } }, h);
    await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'c' } }, h);
    const r = await pedir(srv, 'POST', '/api/deshacer', { id: b.json.deshacer }, h);
    assert.equal(r.estado, 409);
    assert.equal(r.json.codigo, 'cambio_posterior');
    assert.match(await fsp.readFile(join(app.carpeta, 'hitos.md'), 'utf8'), /\| c\b/);
    const d = await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'd' } }, h);
    const otra = await pedir(srv, 'POST', '/api/deshacer', { id: d.json.deshacer }, { 'X-Finhub-Sesion': 'otra' });
    assert.equal(otra.estado, 404, 'la de otra sesión, no');
    { const real = app.deshacer.ahora; app.deshacer.ahora = () => real() + 60000; }
    assert.equal((await pedir(srv, 'POST', '/api/deshacer', { id: d.json.deshacer }, h)).estado, 404, 'pasado el plazo, no');
  }, { nombre: 'deshacer' });
});
