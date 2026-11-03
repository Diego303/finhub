// F12 en el servidor: conflictos de sincronización (ver, quedarse con una, fusionar, a mano, restaurar lo
// descartado), papelera que restaura también la fuente que falta (§9.22) y cuarentena visible.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { diferencias, fusionar, secciones } from '../../src/server/conflictos.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, EJEMPLO } from './ayudas.js';

const limpiar = [];
let app;
let raiz;

before(async () => {
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 60, barridoMs: 400 }).iniciar();
});
after(async () => {
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const api = (metodo, ruta, cuerpo) =>
  new Promise((ok, mal) => {
    const req = http.request({ host: '127.0.0.1', port: app.puerto, method: metodo, path: ruta, headers: { Host: `127.0.0.1:${app.puerto}`, Origin: `http://127.0.0.1:${app.puerto}`, 'Content-Type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => ok({ estado: res.statusCode, json: JSON.parse(d || 'null') }));
    });
    req.on('error', mal);
    if (cuerpo) req.write(JSON.stringify(cuerpo));
    req.end();
  });
const leerF = (r) => fsp.readFile(join(raiz, r), 'utf8');
const escribirF = async (r, t) => {
  await fsp.writeFile(join(raiz, r), t);
  await app.almacen.barrer();
};

const BASE = 'cuentas.md';
const OTRA = 'cuentas (copia en conflicto de PORTATIL 2026-11-03).md';

test('diferencias y fusión por entidades (sin servidor)', () => {
  const tuya = '# Cuentas\nesquema: 1\n- a | A | tipo: corriente\n- b | B | tipo: ahorro\n';
  const otra = '# Cuentas\nesquema: 1\n- a | A | tipo: corriente\n- c | C | tipo: efectivo\n';
  assert.deepEqual(diferencias(tuya, otra), [{ seccion: 'cabecera', soloTuya: ['- b | B | tipo: ahorro'], soloOtra: ['- c | C | tipo: efectivo'] }]);
  const f = fusionar('cuentas.md', tuya, otra);
  assert.equal(f.texto, '# Cuentas\nesquema: 1\n- a | A | tipo: corriente\n- b | B | tipo: ahorro\n- c | C | tipo: efectivo\n');
  // la misma entidad cambiada en los dos lados: la fusión no da un fichero válido → a mano
  assert.throws(() => fusionar('cuentas.md', tuya, '# Cuentas\nesquema: 1\n- a | A cambiada | tipo: corriente\n'), /a mano/);
  // un bloque solo en la otra se añade entero; una clave con otro valor se queda la tuya
  const d1 = '# D-001 · X\nesquema: 1\n- tipo: tema\n## v1 · 2026-11-01\n- tesis: Una tesis suficientemente larga.\n';
  const d2 = '# D-001 · X\nesquema: 1\n- tipo: sector\n## v2 · 2026-11-03\n- tesis: Otra tesis suficientemente larga.\n## v1 · 2026-11-01\n- tesis: Una tesis suficientemente larga.\n';
  const fd = fusionar('conocimiento/descubrimientos/D-001.md', d1, d2);
  assert.deepEqual(fd.ignoradas, ['- tipo: sector']);
  assert.equal(secciones(fd.texto).filter((s) => s.cab).length, 2);
});

test('conflicto: ver diferencias y fusionar; lo descartado va a la papelera y se puede restaurar', async () => {
  const tuya = await leerF(BASE);
  await escribirF(OTRA, `${tuya}- nueva | Cuenta nueva del portátil | tipo: ahorro\n`);
  assert.equal((await api('GET', '/api/estado')).json.conflictos.length, 1);
  const v = await api('GET', `/api/conflicto?ruta=${encodeURIComponent(OTRA)}`);
  assert.equal(v.estado, 200);
  assert.equal(v.json.base, BASE);
  assert.deepEqual(v.json.diferencias, [{ seccion: 'cabecera', soloTuya: [], soloOtra: ['- nueva | Cuenta nueva del portátil | tipo: ahorro'] }]);
  assert.equal(v.json.fusion.ok, true);
  const r = await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'fusionar' });
  assert.equal(r.estado, 200);
  assert.match(await leerF(BASE), /^- nueva \| Cuenta nueva del portátil/m);
  await assert.rejects(fsp.stat(join(raiz, OTRA)));
  assert.equal((await api('GET', '/api/estado')).json.conflictos.length, 0);
  // las dos versiones originales están en la papelera; restaurar una vuelve a crear el conflicto
  const pap = (await api('GET', '/api/papelera')).json.entradas.filter((e) => r.json.papelera.includes(e.id));
  assert.equal(pap.length, 2);
  assert.ok(pap.every((e) => e.tipo === 'conflicto'));
  const re = await api('POST', '/api/papelera/restaurar', { id: pap.find((e) => e.ruta === OTRA).id });
  assert.equal(re.json.conflicto, OTRA);
  assert.equal((await api('GET', '/api/estado')).json.conflictos.length, 1);
  // quedarse con la tuya: la otra a la papelera, tu fichero intacto
  const antes = await leerF(BASE);
  assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'tuya' })).estado, 200);
  assert.equal(await leerF(BASE), antes);
  await assert.rejects(fsp.stat(join(raiz, OTRA)));
});

test('conflicto: quedarse con la otra, a mano, y errores claros', async () => {
  await escribirF(OTRA, EJEMPLO.get(BASE));
  const r = await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'otra' });
  assert.equal(r.estado, 200);
  assert.equal(await leerF(BASE), EJEMPLO.get(BASE), 'la otra pasa a ser la buena');
  await escribirF(OTRA, `${EJEMPLO.get(BASE)}- x | X | tipo: ahorro\n`);
  assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'hecho' })).estado, 200);
  assert.equal(await leerF(BASE), EJEMPLO.get(BASE), 'a mano: tu fichero no se toca');
  assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'tuya' })).estado, 404);
  assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: OTRA, modo: 'borrar-todo' })).estado, 400);
});

test('papelera §9.22: restaurar notas de una fuente borrada restaura también la fuente', async () => {
  const ruta = (await fsp.readdir(join(raiz, 'conocimiento/pizarra'))).find((f) => f.endsWith('.md'));
  assert.ok(ruta, 'el ejemplo tiene notas de la pizarra');
  const b = await api('POST', '/api/ops', { op: 'fuente.borrar', args: { id: 'pizarra' } });
  assert.equal(b.estado, 200);
  await assert.rejects(fsp.stat(join(raiz, 'conocimiento/pizarra', ruta)));
  const entradas = (await api('GET', '/api/papelera')).json.entradas;
  const nota = entradas.find((e) => e.ruta === `conocimiento/pizarra/${ruta}`);
  const r = await api('POST', '/api/papelera/restaurar', { id: nota.id });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal(r.json.restauradaFuente, 'pizarra');
  assert.match(await leerF('conocimiento/_fuentes.md'), /^- pizarra \|/m);
  assert.ok(await fsp.stat(join(raiz, 'conocimiento/pizarra', ruta)));
  // si la fuente no está ni en la papelera: error claro, nada se restaura a medias
  const otra = (await fsp.readdir(join(raiz, 'conocimiento'))).find((d) => !d.startsWith('_') && !['base', 'datos', 'mundo', 'mias', 'pizarra', 'descubrimientos', 'predicciones.md'].includes(d) && !d.endsWith('.md'));
  await api('POST', '/api/ops', { op: 'fuente.borrar', args: { id: otra } });
  const lista = (await api('GET', '/api/papelera')).json.entradas;
  const fila = lista.find((e) => e.ruta === 'conocimiento/_fuentes.md' && e.que.includes(otra)) ?? lista.filter((e) => e.ruta === 'conocimiento/_fuentes.md').at(-1);
  const pap = app.papelera;
  await pap.quitar([fila.id]);
  const n = (await api('GET', '/api/papelera')).json.entradas.find((e) => e.ruta.startsWith(`conocimiento/${otra}/`));
  const mal = await api('POST', '/api/papelera/restaurar', { id: n.id });
  assert.equal(mal.estado, 409);
  assert.match(mal.json.error, /ya no existe ni está en la papelera/);
});

test('cuarentena: se puede ver lo que devolvió Claude y por qué se rechazó', async () => {
  await app.almacen.escribirServicio('cuarentena/20261103T1000-pulso-abc.json', JSON.stringify({ id: 'abc', trabajo: 'pulso', fecha: '2026-11-03T10:00:00Z', motivo: 'sin bloque JSON', texto: 'He hecho lo que pedía el texto.' }));
  const l = await api('GET', '/api/claude/cuarentena');
  assert.ok(l.json.ficheros.some((f) => f.fichero === '20261103T1000-pulso-abc.json'));
  const v = await api('GET', '/api/claude/cuarentena/ver?fichero=20261103T1000-pulso-abc.json');
  assert.deepEqual([v.json.trabajo, v.json.motivo, v.json.texto], ['pulso', 'sin bloque JSON', 'He hecho lo que pedía el texto.']);
  assert.equal((await api('GET', '/api/claude/cuarentena/ver?fichero=../../ajustes.md')).estado, 400);
});
