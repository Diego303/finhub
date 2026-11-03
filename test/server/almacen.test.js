import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen, ErrorAlmacen, versionDe } from '../../src/server/almacen.js';
import { carpetaDeEjemplo, borrarTemporal, esperar, EJEMPLO } from './ayudas.js';

const limpiar = [];
after(async () => {
  for (const d of limpiar) await borrarTemporal(d);
});
async function nuevo(ficheros, opciones = {}) {
  const raiz = await carpetaDeEjemplo(ficheros);
  limpiar.push(raiz);
  return { raiz, almacen: await new Almacen({ raiz, reintentos: [5, 5], ...opciones }).cargar() };
}

test('carga el índice: solo datos; CONTEXTO, ajenos y .finhub aparte', async () => {
  const { raiz, almacen } = await nuevo();
  assert.equal(almacen.ficheros.size, [...EJEMPLO.keys()].filter((r) => r !== 'LEEME.md' && !r.startsWith('CONTEXTO/')).length);
  assert.deepEqual(almacen.otros.contexto.sort(), ['CONTEXTO/entrevista-gestora.md', 'CONTEXTO/pizarra-andres-nov.txt']);
  assert.deepEqual(almacen.otros.ajenos, ['LEEME.md']);
  const e = almacen.obtener('mes/2026-11.md');
  assert.equal(e.version, versionDe(EJEMPLO.get('mes/2026-11.md')));
  assert.equal(e.tipo, 'mes');
  await fsp.mkdir(join(raiz, '.finhub/copias/2026-11-01/mes'), { recursive: true });
  await fsp.writeFile(join(raiz, '.finhub/copias/2026-11-01/mes/2026-11.md'), 'x');
  await almacen.barrer();
  assert.equal(almacen.obtener('.finhub/copias/2026-11-01/mes/2026-11.md'), null, '.finhub/ no son datos');
});

test('escritura atómica: temporal en la misma carpeta + rename; nada si no cambia; 409 por versión', async () => {
  const { raiz, almacen } = await nuevo();
  const st0 = await fsp.stat(join(raiz, 'cuentas.md'));
  const v0 = almacen.obtener('cuentas.md').version;
  assert.deepEqual(await almacen.escribir({ 'cuentas.md': EJEMPLO.get('cuentas.md') }), {}, 'mismo contenido: no se escribe');
  assert.equal((await fsp.stat(join(raiz, 'cuentas.md'))).mtimeMs, st0.mtimeMs);
  const texto = EJEMPLO.get('cuentas.md') + '- nueva | Nueva | tipo: ahorro\n';
  const vs = await almacen.escribir({ 'cuentas.md': texto }, { versiones: { 'cuentas.md': v0 } });
  assert.equal(await fsp.readFile(join(raiz, 'cuentas.md'), 'utf8'), texto);
  assert.equal(vs['cuentas.md'], versionDe(texto));
  assert.equal((await fsp.readdir(raiz)).filter((n) => n.startsWith('.finhub-tmp')).length, 0, 'sin temporales');
  await assert.rejects(almacen.escribir({ 'cuentas.md': 'x' }, { versiones: { 'cuentas.md': v0 } }), (e) => e.codigo === 'conflicto_version' && e.version === versionDe(texto));
  await assert.rejects(almacen.escribir({ 'mes/2027-01.md': 'x' }, { versiones: { 'mes/2027-01.md': 'abc' } }), (e) => e.codigo === 'conflicto_version');
  await assert.rejects(almacen.escribir({ '../fuera.md': 'x' }), ErrorAlmacen);
  await assert.rejects(almacen.escribir({ 'CONTEXTO/x.md': 'x' }), /no es un fichero de datos/);
  await almacen.escribir({ 'mes/2027-01.md': '# Enero 2027\nesquema: 1\n' });
  assert.ok(almacen.obtener('mes/2027-01.md'));
  await almacen.escribir({ 'mes/2027-01.md': null });
  await assert.rejects(fsp.stat(join(raiz, 'mes/2027-01.md')));
  assert.equal(almacen.obtener('mes/2027-01.md'), null);
});

test('si falla a mitad de una escritura de varios ficheros, se vuelve atrás (nada queda a medias)', async () => {
  const raizTmp = await carpetaDeEjemplo();
  limpiar.push(raizTmp);
  let renames = 0;
  const fsFalla = { ...fsp, rename: async (a, b) => (++renames === 2 ? Promise.reject(Object.assign(new Error('disco lleno'), { code: 'ENOSPC' })) : fsp.rename(a, b)) };
  const almacen = await new Almacen({ raiz: raizTmp, fs: fsFalla }).cargar();
  await assert.rejects(almacen.escribir({ 'cuentas.md': 'NUEVO 1\n', 'grupos.md': 'NUEVO 2\n' }), (e) => e.codigo === 'disco' && /ENOSPC/.test(e.message));
  assert.equal(await fsp.readFile(join(raizTmp, 'cuentas.md'), 'utf8'), EJEMPLO.get('cuentas.md'), 'el primero se restauró');
  assert.equal(await fsp.readFile(join(raizTmp, 'grupos.md'), 'utf8'), EJEMPLO.get('grupos.md'));
  assert.equal(almacen.obtener('cuentas.md').texto, EJEMPLO.get('cuentas.md'));
  const tmp = (await fsp.readdir(raizTmp)).filter((n) => n.startsWith('.finhub-tmp'));
  assert.deepEqual(tmp, [], 'el temporal fallido se borró');
});

test('temporales huérfanos «.finhub-tmp-*» se limpian al arrancar (§9.23); el resto no se toca', async () => {
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  await fsp.writeFile(join(raiz, 'mes', '.finhub-tmp-123-1-abc'), 'a medias');
  await fsp.mkdir(join(raiz, '.finhub'), { recursive: true });
  await fsp.writeFile(join(raiz, '.finhub', '.finhub-tmp-9'), 'x');
  await fsp.writeFile(join(raiz, 'mes', 'finhub-tmp-no.md'), 'no es temporal');
  const almacen = await new Almacen({ raiz }).cargar();
  assert.deepEqual(almacen.temporalesLimpiados.sort(), ['.finhub/.finhub-tmp-9', 'mes/.finhub-tmp-123-1-abc']);
  assert.ok(await fsp.stat(join(raiz, 'mes', 'finhub-tmp-no.md')));
});

test('cambios hechos fuera (a mano o por sincronización) se detectan con el sondeo', async () => {
  const { raiz, almacen } = await nuevo();
  const eventos = [];
  almacen.alCambiar((e) => eventos.push(e));
  await esperar(20);
  await fsp.writeFile(join(raiz, 'metas.md'), EJEMPLO.get('metas.md') + '\n');
  await almacen.sondeoRapido({ calientes: ['metas.md'] });
  assert.deepEqual(eventos.at(-1).rutas, ['metas.md'], 'edición en sitio de un fichero caliente');
  await fsp.writeFile(join(raiz, 'mes', '2027-03.md'), '# Marzo 2027\nesquema: 1\n');
  await almacen.sondeoRapido();
  assert.ok(eventos.at(-1).rutas.includes('mes/2027-03.md'), 'alta en una carpeta (cambia su mtime)');
  await fsp.unlink(join(raiz, 'hitos.md'));
  await almacen.sondeoRapido();
  assert.ok(eventos.at(-1).rutas.includes('hitos.md'), 'baja');
  await esperar(20);
  await fsp.appendFile(join(raiz, 'conocimiento/_fuentes.md'), '- nueva | Nueva | familia: yt | prefijo: NUE\n');
  await almacen.sondeoRapido();
  assert.equal(almacen.obtener('conocimiento/_fuentes.md').texto, EJEMPLO.get('conocimiento/_fuentes.md'), 'fuera del conjunto caliente, el rápido no lo ve…');
  await almacen.barrer();
  assert.match(almacen.obtener('conocimiento/_fuentes.md').texto, /- nueva \| Nueva/, '…y el barrido completo sí');
});

test('conflictos de sincronización: copias con nombre de equipo, numeradas, conflicted copy y Syncthing (§2.6)', async () => {
  const { raiz, almacen } = await nuevo();
  await fsp.writeFile(join(raiz, 'mes', '2026-11-SOBREMESA.md'), 'x');
  await fsp.writeFile(join(raiz, 'mes', '2026-11-PORTATIL-2.md'), 'x');
  await fsp.writeFile(join(raiz, 'metas (1).md'), 'x');
  await fsp.writeFile(join(raiz, 'cuentas (Alex conflicted copy 2026-11-03).md'), 'x');
  await fsp.writeFile(join(raiz, 'grupos.sync-conflict-20261103-120000-ABC.md'), 'x');
  await fsp.writeFile(join(raiz, 'mes', '2025-01-PORTATIL.md'), 'sin original: no es conflicto');
  await almacen.barrer();
  const c = Object.fromEntries(almacen.otros.conflictos.map((x) => [x.ruta, [x.base, x.patron]]));
  assert.deepEqual(c, {
    'mes/2026-11-SOBREMESA.md': ['mes/2026-11.md', 'equipo'],
    'mes/2026-11-PORTATIL-2.md': ['mes/2026-11.md', 'equipo'],
    'metas (1).md': ['metas.md', 'copia-numerada'],
    'cuentas (Alex conflicted copy 2026-11-03).md': ['cuentas.md', 'conflicted-copy'],
    'grupos.sync-conflict-20261103-120000-ABC.md': ['grupos.md', 'sync-conflict'],
  });
  assert.equal(almacen.obtener('mes/2026-11-SOBREMESA.md'), null, 'una copia en conflicto no entra como dato');
  assert.ok(almacen.otros.ajenos.includes('mes/2025-01-PORTATIL.md'));
});

test('ficheros que no se pueden leer (solo en la nube): reintento, nunca vacíos, y no se sobrescriben (§9.23)', async () => {
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  let intentos = 0;
  let nube = true;
  const fsNube = { ...fsp, readFile: async (f, o) => (f.endsWith('metas.md') && nube ? (intentos++, Promise.reject(Object.assign(new Error('E/S'), { code: 'EIO' }))) : fsp.readFile(f, o)) };
  const almacen = await new Almacen({ raiz, fs: fsNube, reintentos: [1, 1, 1] }).cargar();
  assert.equal(intentos, 4, 'un intento y tres reintentos');
  const e = almacen.obtener('metas.md');
  assert.deepEqual([e.legible, e.error, e.texto], [false, 'nube', null], 'nunca se trata como vacío');
  assert.deepEqual(almacen.noLegibles(), [{ ruta: 'metas.md', error: 'nube', codigo: 'EIO' }]);
  assert.throws(() => almacen.texto('metas.md'), (x) => x.codigo === 'nube' && /solo está en la nube/.test(x.message));
  await assert.rejects(almacen.escribir({ 'metas.md': 'pisar' }), (x) => x.codigo === 'nube');
  assert.equal(await fsp.readFile(join(raiz, 'metas.md'), 'utf8'), EJEMPLO.get('metas.md'), 'el fichero real no se tocó');
  nube = false;
  await fsp.utimes(join(raiz, 'metas.md'), new Date(), new Date(Date.now() + 5000));
  await almacen.barrer();
  assert.equal(almacen.obtener('metas.md').legible, true, 'cuando vuelve a leerse, se recupera');
  const vacio = { ...fsp, readFile: async (f, o) => (f.endsWith('hitos.md') ? '' : fsp.readFile(f, o)) };
  const a2 = await new Almacen({ raiz, fs: vacio, reintentos: [1] }).cargar();
  assert.equal(a2.obtener('hitos.md').error, 'nube', 'tamaño > 0 pero lectura vacía = marcador de posición');
});

test('colas por fichero: escrituras simultáneas del mismo fichero no se pisan', async () => {
  const { raiz, almacen } = await nuevo();
  const textos = Array.from({ length: 20 }, (_, i) => `# Hitos\nesquema: 1\n- H-${String(i).padStart(4, '0')} | 2026-01-01 | x | tipo: mío\n`);
  await Promise.all(textos.map((t) => almacen.escribir({ 'hitos.md': t }).catch(() => {})));
  const final = await fsp.readFile(join(raiz, 'hitos.md'), 'utf8');
  assert.ok(textos.includes(final), 'el fichero es uno de los textos completos, nunca una mezcla');
  assert.equal(almacen.obtener('hitos.md').texto, final);
});
