import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen } from '../../src/server/almacen.js';
import { Candado, CADUCA_MS } from '../../src/server/candado.js';
import { Papelera, DIAS } from '../../src/server/papelera.js';
import { Copias, MANTENER } from '../../src/server/copias.js';
import { Deshacer, MAX_POR_SESION } from '../../src/server/deshacer.js';
import { carpetaDeEjemplo, borrarTemporal, temporal } from './ayudas.js';

const limpiar = [];
after(async () => {
  for (const d of limpiar) await borrarTemporal(d);
});
async function almacenNuevo() {
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  return new Almacen({ raiz }).cargar();
}

test('candado: el segundo equipo abre en solo lectura; «tomar el control» y el primero lo nota (§2.6, §9.23)', async () => {
  const almacen = await almacenNuevo();
  let reloj = Date.parse('2026-11-03T18:02:00Z');
  const ahora = () => reloj;
  const a = new Candado({ almacen, equipo: 'SOBREMESA', pid: 111, ahora, procesoVivo: () => true });
  const b = new Candado({ almacen, equipo: 'PORTATIL', pid: 222, ahora, procesoVivo: () => true });
  assert.equal((await a.adquirir()).soloLectura, false);
  const lock = JSON.parse(await fsp.readFile(join(almacen.raiz, '.finhub/abierto.lock'), 'utf8'));
  assert.deepEqual([lock.equipo, lock.pid], ['SOBREMESA', 111]);
  const eb = await b.adquirir();
  assert.equal(eb.soloLectura, true);
  assert.match(eb.aviso, /finhub está abierto en SOBREMESA desde las \d\d:\d\d/);
  reloj += 60 * 1000;
  await a.latir();
  assert.equal((await b.latir()).soloLectura, true, 'sigue vigente con latido');
  const tomado = await b.adquirir({ tomarControl: true });
  assert.equal(tomado.soloLectura, false);
  assert.match(tomado.aviso, /has tomado el control/);
  const ea = await a.latir();
  assert.equal(ea.soloLectura, true);
  assert.match(ea.aviso, /PORTATIL ha tomado el control/);
  await a.soltar();
  assert.ok(await fsp.stat(join(almacen.raiz, '.finhub/abierto.lock')), 'A no borra un candado que no es suyo');
  await b.soltar();
  await assert.rejects(fsp.stat(join(almacen.raiz, '.finhub/abierto.lock')), 'B borra el suyo');
});

test('candado viejo (> 2 min) de otro equipo, o del mismo equipo con el proceso muerto: se ignora con aviso', async () => {
  const almacen = await almacenNuevo();
  let reloj = Date.parse('2026-11-03T18:00:00Z');
  const otro = new Candado({ almacen, equipo: 'PORTATIL', pid: 5, ahora: () => reloj });
  await otro.adquirir();
  reloj += CADUCA_MS + 1000;
  const yo = new Candado({ almacen, equipo: 'SOBREMESA', pid: 6, ahora: () => reloj });
  const e = await yo.adquirir();
  assert.equal(e.soloLectura, false);
  assert.match(e.aviso, /candado viejo de PORTATIL/);
  const muerto = new Candado({ almacen, equipo: 'SOBREMESA', pid: 7, ahora: () => reloj, procesoVivo: () => false });
  assert.equal((await muerto.adquirir()).soloLectura, false, 'mismo equipo, pid muerto');
  const vivo = new Candado({ almacen, equipo: 'SOBREMESA', pid: 8, ahora: () => reloj, procesoVivo: () => true });
  assert.equal((await vivo.adquirir()).soloLectura, true, 'mismo equipo, otro proceso vivo');
  await fsp.writeFile(join(almacen.raiz, '.finhub/abierto.lock'), '{roto');
  assert.equal((await new Candado({ almacen, equipo: 'X', pid: 9 }).adquirir()).soloLectura, false, 'candado ilegible: se toma');
});

test('papelera: enviar, ver, restaurar el contenido, quitar, avisar antes y purgar a los 30 días', async () => {
  const almacen = await almacenNuevo();
  let reloj = Date.parse('2026-11-03T10:00:00Z');
  const p = new Papelera({ almacen, ahora: () => reloj });
  const [idE, idF] = await p.enviar([
    { que: 'Concierto', ruta: 'mes/2026-11.md', tipo: 'entidad', seccion: 'Movimientos', indice: 3, contenido: '- 2026-11-16 | Concierto | -65,00 | ocio' },
    { que: 'decisión', ruta: 'decisiones/x.md', tipo: 'fichero', contenido: '# D\nesquema: 1\n' },
  ]);
  const lista = await p.listar();
  assert.equal(lista.length, 2);
  assert.equal(lista[0].expira, '2026-12-03T10:00:00.000Z');
  assert.equal((await p.entrada(idF)).contenido, '# D\nesquema: 1\n');
  assert.equal((await p.entrada(idE)).seccion, 'Movimientos');
  reloj += (DIAS - 2) * 24 * 3600 * 1000;
  assert.equal((await p.caducidad()).pronto.length, 2, 'se avisa antes');
  await p.quitar([idE]);
  assert.deepEqual((await p.listar()).map((f) => f.id), [idF]);
  reloj += 3 * 24 * 3600 * 1000;
  const purgadas = await p.purgar();
  assert.deepEqual(purgadas.map((f) => f.id), [idF]);
  assert.deepEqual(await p.listar(), []);
  assert.equal(await almacen.leerServicio(lista[1].archivo), null, 'la copia del fichero también se borra');
});

test('copias diarias: una al día, desde memoria, y se guardan las 14 últimas', async () => {
  const almacen = await almacenNuevo();
  let dia = '2026-11-01';
  const c = new Copias({ almacen, hoy: () => dia });
  await c.antesDeEscribir();
  const base = join(almacen.raiz, '.finhub/copias');
  assert.equal(await fsp.readFile(join(base, '2026-11-01/mes/2026-11.md'), 'utf8'), almacen.obtener('mes/2026-11.md').texto);
  assert.equal(c.antesDeEscribir(), c.enCurso, 'el mismo día no se repite');
  for (let d = 2; d <= 17; d++) {
    dia = `2026-11-${String(d).padStart(2, '0')}`;
    await c.antesDeEscribir();
  }
  const quedan = (await fsp.readdir(base)).sort();
  assert.equal(quedan.length, MANTENER);
  assert.equal(quedan[0], '2026-11-04');
  const local = await temporal('copias-local');
  limpiar.push(local);
  const cl = new Copias({ almacen, hoy: () => '2026-11-20', destinoLocal: local });
  await cl.antesDeEscribir();
  const [sub] = await fsp.readdir(local);
  assert.ok(await fsp.stat(join(local, sub, '2026-11-20', 'ajustes.md')), '«copias: local» fuera de la carpeta sincronizada');
});

test('deshacer: pila de 30 por sesión, separada entre sesiones', () => {
  const d = new Deshacer();
  for (let i = 0; i < MAX_POR_SESION + 5; i++) d.guardar('a', { op: `op${i}`, inversa: { op: 'x' }, esperado: { 'a.md': String(i) } });
  d.guardar('b', { op: 'otra', inversa: { op: 'x' }, esperado: {} });
  assert.equal(d.sesiones.get('a').length, MAX_POR_SESION);
  assert.equal(d.tomar('a').op, `op${MAX_POR_SESION + 4}`);
  assert.equal(d.tomar('b').op, 'otra');
  assert.equal(d.tomar('b'), null);
  assert.equal(d.guardar('a', { op: 'sin', inversa: null, esperado: {} }), null, 'sin cambios no hay nada que deshacer');
});
