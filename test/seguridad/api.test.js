// QA6 · Cada ruta de la API: feliz, operación desconocida (422), versión antigua (409), JSON roto, > 1 MB, método
// incorrecto e inexistente; solo 127.0.0.1; Host y Origin; rutas maliciosas; enlaces simbólicos. Nunca trazas ni rutas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { versionDe } from '../../src/server/almacen.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno, pedir, esperar } from '../qa/entorno.js';

let ent;
let app;
let srv;
const api = (...a) => pedir(srv, ...a);
const SIN_FUGAS = /\/mnt\/|\/tmp\/|\/home\/|node:internal|\.js:\d+|\bat [\w.<>]+ \(|ENOENT:|stack/;

/** Petición cruda (sin que fetch corrija Host, ni la ruta, ni el cuerpo). */
function cruda({ metodo = 'GET', ruta = '/', cabeceras = {}, cuerpo = null, puerto = app.puerto, host = '127.0.0.1' }) {
  return new Promise((ok, mal) => {
    const req = http.request({ host, port: puerto, method: metodo, path: ruta, headers: { Host: `127.0.0.1:${puerto}`, ...cabeceras } }, (res) => {
      const t = [];
      res.on('data', (d) => t.push(d));
      res.on('end', () => ok({ estado: res.statusCode, texto: Buffer.concat(t).toString(), cabeceras: res.headers }));
    });
    req.on('error', mal);
    req.setTimeout(5000, () => req.destroy(new Error('tiempo')));
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}

before(async () => {
  ent = await crearEntorno({ nombre: 'seguridad' });
  const g = join(ent.base, 'g.json');
  await fsp.writeFile(g, JSON.stringify([{ init: {} }, { esperar: 150 }, { responder: json({ respuesta_md: 'ok', citas: [], cifras_usadas: [] }) }]));
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, claude: { comando: [process.execPath, FAKE, '--guion', g] } }).iniciar();
  srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
});
after(async () => {
  await app.parar();
  await ent.limpiar();
});

const GETS = ['/api/salud', '/api/version', '/api/estado', '/api/datos', '/api/datos?prefijo=mes/', '/api/fichero?ruta=cuentas.md', '/api/papelera', '/api/semilla?tipo=roles', '/api/claude', '/api/claude/datos', '/api/claude/registro', '/api/claude/tareas', '/api/claude/cuarentena', '/api/carpeta'];
const POSTS = [['/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } }], ['/api/deshacer', {}], ['/api/papelera/restaurar', { id: 'x' }], ['/api/conflicto/resolver', { ruta: 'x', modo: 'tuya' }], ['/api/candado/tomar', {}], ['/api/claude/ejecutar', { trabajo: 'no' }], ['/api/claude/cancelar', { id: 'x' }], ['/api/contexto/procesado', { fichero: 'x', fuente: 'pizarra' }], ['/api/carpeta/validar', { ruta: '/no/existe' }], ['/api/carpeta/cambiar', { ruta: '/no/existe', modo: 'usar' }]];

test('todas las rutas GET responden JSON, con cabeceras de seguridad y sin CORS', async () => {
  for (const r of GETS) {
    const x = await api('GET', r);
    assert.equal(x.estado, 200, r);
    assert.ok(x.json, r);
    assert.equal(x.cabeceras.get('access-control-allow-origin'), null, r);
    assert.equal(x.cabeceras.get('x-content-type-options'), 'nosniff', r);
    assert.match(x.cabeceras.get('content-security-policy'), /default-src 'self'/, r);
  }
});

test('cada POST: JSON roto (400), > 1 MB (413), sin JSON (415), método incorrecto (404), sin rutas ni trazas', async () => {
  const grande = JSON.stringify({ relleno: 'x'.repeat(1024 * 1024 + 1) });
  for (const [r] of POSTS) {
    const roto = await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: '{roto' });
    assert.equal(roto.estado, 400, `${r}: ${roto.texto}`);
    for (const c of ['[1,2]', '"x"', '12', 'null']) assert.equal((await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: c })).estado, 400, `${r}: ${c}`);
    const g = await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: grande }).catch((e) => ({ estado: 413, texto: e.message }));
    assert.equal(g.estado, 413, r);
    assert.equal((await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'text/plain' }, cuerpo: '{}' })).estado, 415, r);
    const form = await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: 'a=1' });
    assert.equal(form.estado, 415, `${r}: un formulario de otra web no pasa`);
    for (const m of ['PUT', 'PATCH']) assert.equal((await cruda({ metodo: m, ruta: r, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: '{}' })).estado, 404, `${m} ${r}`);
    for (const m of ['DELETE', 'OPTIONS', 'TRACE']) assert.ok((await cruda({ metodo: m, ruta: r })).estado >= 400, `${m} ${r}`);
    assert.equal((await cruda({ ruta: r })).estado, 404, `GET ${r}`);
  }
  for (const r of GETS) assert.equal((await cruda({ metodo: 'POST', ruta: r, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: '{}' })).estado, 404, `POST ${r}`);
  assert.equal((await api('GET', '/api/no-existe')).estado, 404);
  assert.equal((await cruda({ metodo: 'POST', ruta: '/index.html', cabeceras: { 'Content-Type': 'application/json' }, cuerpo: '{}' })).estado, 405);
});

test('errores de cada POST con datos malos: siempre JSON, nunca rutas internas ni trazas', async () => {
  for (const [r, c] of POSTS) {
    const x = await api('POST', r, c);
    assert.ok(x.json, `${r}: ${x.texto.slice(0, 100)}`);
    if (r !== '/api/carpeta/validar' && r !== '/api/carpeta/cambiar') assert.doesNotMatch(x.texto.replaceAll(app.carpeta, ''), SIN_FUGAS, r);
  }
  const malos = [{ op: 12 }, { op: null }, { op: ['a'] }, {}, { op: 'hito.crear', args: 'texto' }, { op: 'hito.crear', args: [1] }, { op: 'hito.crear', args: null }, { op: 'hito.crear', args: { fecha: { a: 1 }, texto: [] } }, { op: 'hito.crear', versiones: 'x', args: { fecha: '2026-11-06', texto: 'x' } }, { op: 'hito.crear', versiones: [1], args: { fecha: '2026-11-06', texto: 'x' } }];
  for (const c of malos) {
    const x = await api('POST', '/api/ops', c);
    assert.ok(x.estado >= 400 && x.estado < 500 || x.estado === 200, `${JSON.stringify(c)} → ${x.estado}: ${x.texto}`);
    assert.doesNotMatch(x.texto, SIN_FUGAS, JSON.stringify(c));
  }
});

test('operación desconocida 422; versión antigua 409; las inversas no se piden desde fuera', async () => {
  assert.equal((await api('POST', '/api/ops', { op: 'no.existe' })).estado, 422);
  const r = await api('POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'v' }, versiones: { 'hitos.md': versionDe('otro texto') } });
  assert.equal(r.estado, 409);
  assert.equal(r.json.codigo, 'conflicto_version');
  for (const op of ['ficheros.restaurar', 'papelera.restaurar']) assert.equal((await api('POST', '/api/ops', { op, args: { ficheros: { 'cuentas.md': 'hack' } } })).estado, 400, op);
  assert.notEqual(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'hack');
});

test('solo 127.0.0.1: ni ::1 ni la IP de la red', async () => {
  assert.equal(app.servidor.address().address, '127.0.0.1');
  const conecta = (host) => new Promise((ok) => {
    const s = net.connect({ host, port: app.puerto, timeout: 800 });
    s.on('connect', () => (s.destroy(), ok(true)));
    s.on('error', () => ok(false));
    s.on('timeout', () => (s.destroy(), ok(false)));
  });
  assert.equal(await conecta('127.0.0.1'), true);
  assert.equal(await conecta('::1'), false);
  for (const lista of Object.values(networkInterfaces())) for (const i of lista ?? []) if (!i.internal && i.family === 'IPv4') assert.equal(await conecta(i.address), false, i.address);
});

test('Host y Origin ajenos: rechazados en todo, también en trabajos, SSE y cancelar', async () => {
  const rutas = [...POSTS.map(([r]) => ['POST', r]), ...GETS.map((r) => ['GET', r]), ['GET', '/api/eventos'], ['GET', '/'], ['GET', '/core/modelo.js']];
  const malos = [{ Host: 'malo.example' }, { Host: 'malo.example:4747' }, { Host: `127.0.0.1.malo.example:${app.puerto}` }, { Host: `127.0.0.1:${app.puerto + 1}` }, { Origin: 'https://malo.example' }, { Origin: 'null' }, { Origin: `http://127.0.0.1:${app.puerto + 1}` }, { Origin: `https://127.0.0.1:${app.puerto}` }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }];
  for (const [m, r] of rutas) {
    for (const h of malos) {
      const x = await cruda({ metodo: m, ruta: r, cabeceras: { ...(m === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...h }, cuerpo: m === 'POST' ? '{}' : null });
      assert.equal(x.estado, 403, `${m} ${r} con ${JSON.stringify(h)}: ${x.estado}`);
      assert.equal(x.cabeceras['access-control-allow-origin'], undefined);
    }
  }
  // el trabajo no se ha lanzado y nada ha cambiado
  assert.equal(app.claude.ejecuciones.size, 0);
  const pre = await cruda({ metodo: 'OPTIONS', ruta: '/api/ops', cabeceras: { Origin: 'https://malo.example', 'Access-Control-Request-Method': 'POST' } });
  assert.notEqual(pre.estado, 204);
  assert.equal(pre.cabeceras['access-control-allow-origin'], undefined, 'sin CORS');
});

const TRAVESIAS = ['..', '.', '../', '../../etc/passwd', '..%2f..%2fetc%2fpasswd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', '..%5c..%5cetc%5cpasswd', '%252e%252e%252f', '....//....//etc/passwd', '/etc/passwd', '//etc/passwd', 'C:\\Windows\\win.ini', '\\\\servidor\\x', 'a%00b', '%00', 'CON', 'NUL', 'con.md', 'a/../../b'];

test('rutas maliciosas en estáticos: nunca salen; solo tipos conocidos', async () => {
  for (const base of ['/', '/core/', '/componentes/', '/vistas/']) {
    for (const t of TRAVESIAS) {
      const x = await cruda({ ruta: base + t });
      // «/../» lo normaliza la URL y se queda dentro: como mucho, algo público de la web
      if (x.estado === 200) assert.match(x.cabeceras['content-type'], /text\/(html|javascript)|text\/css/, `${base}${t}`);
      else assert.ok([400, 404, 403].includes(x.estado), `${base}${t} → ${x.estado}`);
      assert.doesNotMatch(x.texto, /root:|\[fonts\]|"dependencies"|"devDependencies"/);
    }
  }
  for (const r of ['/.env', '/../package.json', '/%2e%2e/package.json', '/core/../../package.json', '/core/%2e%2e/%2e%2e/package.json', '/package.json', '/.git/config']) assert.ok([400, 403, 404].includes((await cruda({ ruta: r })).estado), r);
  assert.equal((await cruda({ ruta: '/%E0%A4%A' })).estado, 400, 'codificación rota');
});

test('rutas maliciosas en la API: fichero, conflicto, cuarentena, contexto, semilla, papelera, operaciones', async () => {
  const antes = await fsp.readdir(ent.datos);
  for (const t of TRAVESIAS) {
    const q = encodeURIComponent(t);
    assert.equal((await api('GET', `/api/fichero?ruta=${q}`)).estado, 404, t);
    assert.equal((await api('GET', `/api/conflicto?ruta=${q}`)).estado, 404, t);
    assert.ok([400, 404].includes((await api('GET', `/api/claude/cuarentena/ver?fichero=${q}`)).estado), t);
    assert.equal((await api('GET', `/api/semilla?tipo=${q}`)).estado, 404, t);
    assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: t, modo: 'tuya' })).estado, 404, t);
    const c = await api('POST', '/api/contexto/procesado', { fichero: t, fuente: 'pizarra' });
    assert.ok([400, 404].includes(c.estado), `contexto ${t} → ${c.estado}`);
    const c2 = await api('POST', '/api/contexto/procesado', { fichero: 'x.txt', fuente: t });
    assert.equal(c2.estado, 400, `fuente ${t}`);
    for (const [op, args] of [['fichero.borrar', { ruta: t }], ['texto.guardar', { ruta: t, texto: 'x' }], ['lista.crear', { ruta: t, valor: { id: 'x' } }], ['bloque.crear', { ruta: t, id: 'x', titulo: 'x' }], ['nota.editar', { ruta: t, id: 'x', cuerpo: 'x' }], ['chat.turno', { ruta: t, tu: 'x', rex: 'x', cuando: '2026-11-06 10:00' }], ['decision.editar', { ruta: t, titulo: 'x' }], ['borrador.aceptar', { ruta: t }]]) {
      const x = await api('POST', '/api/ops', { op, args });
      assert.ok(x.estado >= 400 && x.estado < 500, `${op} ${t} → ${x.estado}: ${x.texto.slice(0, 120)}`);
      assert.doesNotMatch(x.texto, SIN_FUGAS, `${op} ${t}`);
    }
  }
  // las que pasan por una carpeta válida pero intentan salir
  for (const [op, args] of [['nota.crear', { fuente: '../../x', titulo: 'x', fecha: '2026-11-06', campos: { tipo: 'hecho' }, cuerpo: 'x' }], ['nota.crear', { fuente: '..', titulo: 'x', fecha: '2026-11-06', campos: { tipo: 'hecho' }, cuerpo: 'x' }], ['fichero.borrar', { ruta: 'conocimiento/../cuentas.md' }], ['texto.guardar', { ruta: 'roles/../cuentas.md', texto: 'x' }], ['bloque.crear', { ruta: 'conocimiento/../../x/y.md', id: 'A-1', titulo: 'x' }], ['base.importar', { ficheros: { '../../fuera.md': '## X-1 · y\n' } }]]) {
    const x = await api('POST', '/api/ops', { op, args });
    assert.ok(x.estado >= 400 && x.estado < 500, `${op} ${JSON.stringify(args)} → ${x.estado}: ${x.texto.slice(0, 160)}`);
  }
  assert.deepEqual(await fsp.readdir(ent.datos), antes);
  await assert.rejects(fsp.stat(join(ent.base, 'fuera.md')));
});

test('nombres reservados de Windows (CON, NUL…): nunca como nombre de fichero o carpeta', async () => {
  for (const n of ['CON', 'nul', 'Aux', 'PRN', 'com1', 'LPT9']) {
    const familia = app.almacen.texto('conocimiento/_familias.md').match(/^- ([a-z0-9-]+) \|/m)[1];
    const f = await api('POST', '/api/ops', { op: 'fuente.crear', args: { nombre: n, familia } });
    assert.equal(f.estado, 200, f.texto);
    if (f.estado === 200) assert.doesNotMatch(f.json.resultado.id, /^(con|nul|aux|prn|com\d|lpt\d)$/i, `fuente ${n}`);
    const d = await api('POST', '/api/ops', { op: 'decision.crear', args: { titulo: n, fecha: '2026-11-06' } });
    if (d.estado === 200) assert.doesNotMatch(d.json.resultado.ruta, /\/(con|nul|aux|prn|com\d|lpt\d)\.md$/i, `decisión ${n}`);
    const t = await api('POST', '/api/ops', { op: 'texto.guardar', args: { ruta: `roles/${n}.md`, texto: '# x\nesquema: 1\n' } });
    assert.ok(t.estado >= 400, `roles/${n}.md → ${t.estado}`);
  }
});

test('enlaces simbólicos que salen de la carpeta: ni se leen ni se escribe a través de ellos', async () => {
  const fuera = join(ent.base, 'fuera');
  await fsp.mkdir(fuera);
  await fsp.writeFile(join(fuera, 'secreto.md'), '# Secreto\nesquema: 1\n- secreto | no debería verse | tipo: corriente\n');
  await fsp.symlink(join(fuera, 'secreto.md'), join(ent.datos, 'grupos-enlace.md')).catch(() => {});
  await fsp.mkdir(join(ent.datos, 'conocimiento/enlazada'), { recursive: true }).catch(() => {});
  await fsp.symlink(join(fuera, 'secreto.md'), join(ent.datos, 'conocimiento/enlazada/notas.md'));
  await fsp.symlink(fuera, join(ent.datos, 'conocimiento/carpeta-enlazada'));
  await fsp.symlink(join(fuera, 'secreto.md'), join(ent.datos, 'CONTEXTO-enlace.md'));
  await app.almacen.barrer();
  const datos = await api('GET', '/api/datos');
  assert.doesNotMatch(datos.texto, /no debería verse/, 'no se lee');
  assert.equal((await api('GET', '/api/fichero?ruta=conocimiento/enlazada/notas.md')).estado, 404);
  const x = await api('POST', '/api/ops', { op: 'bloque.crear', args: { ruta: 'conocimiento/enlazada/notas.md', id: 'A-0001', titulo: 'sobrescribir', campos: { tipo: 'hecho', fecha: '2026-11-06' }, cuerpo: 'x' } });
  assert.ok(x.estado >= 400, `escribir a través del enlace → ${x.estado}`);
  assert.match(await fsp.readFile(join(fuera, 'secreto.md'), 'utf8'), /no debería verse/);
  assert.doesNotMatch(await fsp.readFile(join(fuera, 'secreto.md'), 'utf8'), /sobrescribir/);
  for (const n of ['grupos-enlace.md', 'conocimiento/enlazada/notas.md', 'conocimiento/carpeta-enlazada', 'CONTEXTO-enlace.md']) await fsp.unlink(join(ent.datos, n));
  await fsp.rmdir(join(ent.datos, 'conocimiento/enlazada'));
  await app.almacen.barrer();
});

test('trabajos por HTTP: lanzar, ver y cancelar; id ajeno; trabajo desconocido; SSE cerrado a mitad sin huérfanos', async () => {
  assert.equal((await api('POST', '/api/claude/ejecutar', { trabajo: 'inventado' })).estado, 400);
  for (const t of ['__proto__', 'constructor', 12, null, ['privado']]) assert.ok((await api('POST', '/api/claude/ejecutar', { trabajo: t })).estado >= 400, String(t));
  assert.equal((await api('GET', '/api/claude/ejecucion?id=no')).estado, 404);
  assert.equal((await api('POST', '/api/claude/cancelar', { id: 'no' })).json.cancelado, false);
  const a = await api('POST', '/api/claude/ejecutar', { trabajo: 'privado', params: { pregunta: 'hola' } });
  assert.equal(a.estado, 202);
  assert.equal((await api('POST', '/api/claude/cancelar', { id: a.json.id })).json.cancelado, true);
  await app.claude.ejecuciones.get(a.json.id).promesa;
  const fin = (await api('GET', `/api/claude/ejecucion?id=${a.json.id}`)).json;
  assert.equal(fin.estado, 'error');
  assert.match(fin.resultado.mensaje, /[Cc]ancel/);
  await esperar(30);
  assert.deepEqual(await fsp.readdir(app.claude.sandboxBase).catch(() => []), []);
});
