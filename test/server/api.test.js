// API por HTTP real contra App en un puerto libre, con carpetas temporales.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { versionDe } from '../../src/server/almacen.js';
import { carpetaDeEjemplo, borrarTemporal, temporal, entornoAislado, esperar, EJEMPLO } from './ayudas.js';

const limpiar = [];
const apps = [];
let app;
let base;
let aislado;

before(async () => {
  aislado = await entornoAislado();
  limpiar.push(aislado.base);
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 60, barridoMs: 400, equipo: 'SOBREMESA' }).iniciar();
  apps.push(app);
  base = `http://127.0.0.1:${app.puerto}`;
});
after(async () => {
  for (const a of apps) await a.parar().catch(() => {});
  for (const d of limpiar) await borrarTemporal(d);
});

/** Petición cruda (para poder poner cualquier Host/Origin). */
function cruda({ metodo = 'GET', ruta, cabeceras = {}, cuerpo, puerto = app.puerto }) {
  return new Promise((ok, mal) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { Host: `127.0.0.1:${puerto}`, ...cabeceras } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => ok({ estado: res.statusCode, cabeceras: res.headers, texto: d, json: (() => { try { return JSON.parse(d); } catch { return null; } })() }));
    });
    req.on('error', mal);
    if (cuerpo !== undefined) req.write(cuerpo);
    req.end();
  });
}
const api = async (metodo, ruta, cuerpo, { sesion = 's1', puerto } = {}) =>
  cruda({ metodo, ruta, puerto, cabeceras: { 'Content-Type': 'application/json', 'X-Finhub-Sesion': sesion, Origin: `http://127.0.0.1:${puerto ?? app.puerto}` }, cuerpo: cuerpo ? JSON.stringify(cuerpo) : undefined });

test('seguridad HTTP (§2.2): Host, Origin, Sec-Fetch-Site, JSON obligatorio, límite de cuerpo, sin CORS ni trazas', async () => {
  assert.equal((await cruda({ ruta: '/api/salud' })).estado, 200);
  assert.equal((await cruda({ ruta: '/api/salud', cabeceras: { Host: `localhost:${app.puerto}` } })).estado, 200);
  assert.equal((await cruda({ ruta: '/api/salud', cabeceras: { Host: `evil.com:${app.puerto}` } })).estado, 403, 'DNS rebinding');
  assert.equal((await cruda({ ruta: '/api/salud', cabeceras: { Host: '127.0.0.1:1' } })).estado, 403);
  const otro = await cruda({ metodo: 'POST', ruta: '/api/ops', cabeceras: { Origin: 'https://evil.com', 'Content-Type': 'application/json' }, cuerpo: '{}' });
  assert.equal(otro.estado, 403);
  assert.equal(otro.cabeceras['access-control-allow-origin'], undefined, 'sin CORS');
  assert.equal((await cruda({ ruta: '/api/datos', cabeceras: { 'Sec-Fetch-Site': 'cross-site' } })).estado, 403);
  assert.equal((await cruda({ metodo: 'POST', ruta: '/api/ops', cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' }, cuerpo: 'op=mov.borrar' })).estado, 415);
  assert.equal((await cruda({ metodo: 'POST', ruta: '/api/ops', cabeceras: { 'Content-Type': 'application/json' }, cuerpo: 'x'.repeat(1024 * 1024 + 10) })).estado, 413);
  assert.equal((await cruda({ metodo: 'POST', ruta: '/api/ops', cabeceras: { 'Content-Type': 'application/json' }, cuerpo: '{roto' })).json.error, 'JSON no válido');
  assert.equal((await cruda({ metodo: 'DELETE', ruta: '/', cabeceras: { 'Content-Type': 'application/json' } })).estado, 405);
  for (const r of ['/core/../../package.json', '/core/%2e%2e/%2e%2e/package.json', '/..%2fpackage.json', '/%00', '/core/dinero.js%00.html', '/no-existe.js']) assert.equal((await cruda({ ruta: r })).estado, r === '/%00' ? 404 : 404, r);
  const idx = await cruda({ ruta: '/' });
  assert.equal(idx.estado, 200);
  assert.match(idx.cabeceras['content-security-policy'], /default-src 'self'; script-src 'self'/);
  assert.equal(idx.cabeceras['x-frame-options'], 'DENY');
  assert.equal((await cruda({ ruta: '/core/dinero.js' })).cabeceras['content-type'], 'text/javascript; charset=utf-8');
  const desconocida = await api('POST', '/api/ops', { op: 'inventada' });
  assert.equal(desconocida.estado, 400);
  assert.doesNotMatch(desconocida.texto, /at .*\.js:\d+/, 'nunca trazas');
  assert.equal((await api('POST', '/api/ops', { op: 'ficheros.restaurar', args: { ficheros: { 'cuentas.md': 'x' } } })).estado, 400, 'la inversa genérica no se pide desde fuera');
});

test('estado, datos y fichero', async () => {
  const e = (await api('GET', '/api/estado')).json;
  assert.equal(e.carpeta.ruta, app.carpeta);
  assert.equal(e.soloLectura, false);
  assert.deepEqual(e.conflictos, []);
  const d = (await api('GET', '/api/datos?prefijo=mes/')).json;
  assert.equal(Object.keys(d.ficheros).length, 12);
  assert.equal(d.ficheros['mes/2026-11.md'].version, versionDe(EJEMPLO.get('mes/2026-11.md')));
  assert.equal((await api('GET', '/api/fichero?ruta=metas.md')).json.texto, EJEMPLO.get('metas.md'));
  assert.equal((await api('GET', '/api/fichero?ruta=no.md')).estado, 404);
});

test('semilla: plantillas públicas del repo, solo los tipos permitidos', async () => {
  const s = (await api('GET', '/api/semilla?tipo=plantillas-cartera')).json;
  assert.deepEqual(Object.keys(s.ficheros), ['conservadora.md', 'crecimiento.md', 'equilibrada.md', 'total.md']);
  assert.match(s.ficheros['crecimiento.md'], /^# Plantilla · Crecimiento/);
  for (const t of ['', 'ejemplo', '../src', 'plantillas-cartera/../../src', 'roles%2F..']) assert.equal((await api('GET', `/api/semilla?tipo=${t}`)).estado, 404, t);
});

test('operación, 409 por versión vieja, mes cerrado, y deshacer byte a byte', async () => {
  const ruta = 'mes/2026-11.md';
  const v0 = (await api('GET', `/api/fichero?ruta=${ruta}`)).json.version;
  const r = await api('POST', '/api/ops', { op: 'mov.crear', args: { mov: { fecha: '2026-11-17', concepto: 'Café', importe: -350, grupo: 'ocio', cuenta: 'corriente' } }, versiones: { [ruta]: v0 } });
  assert.equal(r.estado, 200);
  assert.ok(r.json.deshacer);
  assert.match(await fsp.readFile(join(app.carpeta, ruta), 'utf8'), /Café/);
  const viejo = await api('POST', '/api/ops', { op: 'mov.crear', args: { mov: { fecha: '2026-11-18', concepto: 'x', importe: -1, grupo: 'ocio' } }, versiones: { [ruta]: v0 } });
  assert.equal(viejo.estado, 409);
  assert.equal(viejo.json.codigo, 'conflicto_version');
  const cerrado = await api('POST', '/api/ops', { op: 'mov.crear', args: { mov: { fecha: '2026-10-05', concepto: 'x', importe: -1, grupo: 'ocio' } } });
  assert.equal(cerrado.estado, 409);
  assert.equal(cerrado.json.codigo, 'mes_cerrado');
  assert.equal(cerrado.json.error, 'Este mes está cerrado: ¿lo editas igualmente?');
  const otraSesion = await api('POST', '/api/deshacer', {}, { sesion: 'otra' });
  assert.equal(otraSesion.estado, 404, 'cada sesión deshace lo suyo');
  const d = await api('POST', '/api/deshacer', { id: r.json.deshacer });
  assert.equal(d.estado, 200);
  assert.equal(await fsp.readFile(join(app.carpeta, ruta), 'utf8'), EJEMPLO.get(ruta), 'byte a byte');
  assert.equal((await api('POST', '/api/deshacer', { id: r.json.deshacer })).estado, 404, 'no se deshace dos veces');
});

test('deshacer no pisa cambios posteriores (edición a mano entre medias)', async () => {
  const r = await api('POST', '/api/ops', { op: 'lista.editar', args: { ruta: 'grupos.md', clave: 'ocio', cambios: { nombre: 'Ocio y planes' } } });
  await esperar(20);
  await fsp.appendFile(join(app.carpeta, 'grupos.md'), '- a-mano | A mano | naturaleza: consumo\n');
  await app.almacen.barrer();
  const d = await api('POST', '/api/deshacer', { id: r.json.deshacer });
  assert.equal(d.estado, 409);
  assert.equal(d.json.codigo, 'cambio_posterior');
  assert.match(await fsp.readFile(join(app.carpeta, 'grupos.md'), 'utf8'), /a-mano/);
});

test('papelera por la API: borrar, ver, restaurar; y deshacer un borrado quita la entrada', async () => {
  const b = await api('POST', '/api/ops', { op: 'fichero.borrar', args: { ruta: 'decisiones/2026-09-03-anado-nasdaq.md' } });
  assert.equal(b.estado, 200);
  const p = (await api('GET', '/api/papelera')).json;
  const e = p.entradas.find((x) => x.id === b.json.papelera[0]);
  assert.equal(e.ruta, 'decisiones/2026-09-03-anado-nasdaq.md');
  const r = await api('POST', '/api/papelera/restaurar', { id: e.id });
  assert.equal(r.estado, 200);
  assert.equal(await fsp.readFile(join(app.carpeta, e.ruta), 'utf8'), EJEMPLO.get(e.ruta));
  assert.equal((await api('GET', '/api/papelera')).json.entradas.some((x) => x.id === e.id), false);
  const b2 = await api('POST', '/api/ops', { op: 'bloque.borrar', args: { ruta: 'metas.md', id: 'piso' } });
  await api('POST', '/api/deshacer', { id: b2.json.deshacer });
  assert.equal((await api('GET', '/api/papelera')).json.entradas.some((x) => x.id === b2.json.papelera[0]), false, 'deshacer un borrado no deja basura en la papelera');
  assert.equal((await api('POST', '/api/papelera/restaurar', { id: 'p-nada' })).estado, 404);
});

test('SSE: se avisa de los cambios propios y de los que llegan de fuera (sondeo)', async () => {
  const eventos = [];
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/eventos`, { signal: ctrl.signal });
  const lector = res.body.getReader();
  const leer = (async () => {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value);
        for (const m of buf.split('\n\n').slice(0, -1)) {
          const ev = /^event: (.+)$/m.exec(m)?.[1];
          const data = /^data: (.+)$/m.exec(m)?.[1];
          if (ev) eventos.push({ ev, data: JSON.parse(data) });
        }
        buf = buf.split('\n\n').at(-1);
      }
    } catch {
      /* abortado */
    }
  })();
  await esperar(50);
  await api('POST', '/api/ops', { op: 'ajustes.fijar', args: { clave: 'tema', valor: 'oscuro' } });
  await esperar(30);
  await fsp.writeFile(join(app.carpeta, 'cuentas.md'), EJEMPLO.get('cuentas.md') + '- otra | Otra | tipo: ahorro\n');
  for (let i = 0; i < 40 && !eventos.some((e) => e.ev === 'version' && e.data.origen === 'disco' && e.data.rutas.includes('cuentas.md')); i++) await esperar(50);
  ctrl.abort();
  await leer;
  assert.equal(eventos[0].ev, 'hola');
  assert.ok(eventos.some((e) => e.ev === 'version' && e.data.origen === 'local' && e.data.rutas.includes('ajustes.md')));
  assert.ok(eventos.some((e) => e.ev === 'version' && e.data.origen === 'disco' && e.data.rutas.includes('cuentas.md')), 'el cambio externo llega por el sondeo');
});

test('dos equipos: el segundo abre en solo lectura (423 al escribir) hasta tomar el control', async () => {
  const otra = await new App({ carpeta: app.carpeta, puerto: 0, env: aislado.env, equipo: 'PORTATIL', sondeoMs: 60000, barridoMs: 60000 }).iniciar();
  apps.push(otra);
  const p = otra.puerto;
  const e = (await api('GET', '/api/estado', null, { puerto: p })).json;
  assert.equal(e.soloLectura, true);
  assert.match(e.candado.aviso, /abierto en SOBREMESA/);
  const w = await api('POST', '/api/ops', { op: 'ajustes.fijar', args: { clave: 'tema', valor: 'claro' } }, { puerto: p });
  assert.equal(w.estado, 423);
  assert.equal(w.json.codigo, 'solo_lectura');
  const t = await api('POST', '/api/candado/tomar', {}, { puerto: p });
  assert.equal(t.json.soloLectura, false);
  assert.equal((await api('POST', '/api/ops', { op: 'ajustes.fijar', args: { clave: 'tema', valor: 'claro' } }, { puerto: p })).estado, 200);
  await app.candado.latir();
  assert.equal((await api('GET', '/api/version')).json.soloLectura, true, 'el primero pasa a solo lectura');
  assert.equal((await api('POST', '/api/ops', { op: 'ajustes.fijar', args: { clave: 'tema', valor: 'auto' } })).estado, 423);
  await otra.parar();
  apps.splice(apps.indexOf(otra), 1);
  await app.candado.latir();
  assert.equal((await api('GET', '/api/version')).json.soloLectura, false, 'al irse el otro, se recupera el control');
});

test('cambiar de carpeta sin reiniciar el servidor: validar y copiar', async () => {
  const destinoBase = await temporal('nueva');
  limpiar.push(destinoBase);
  const destino = join(destinoBase, 'FINANZAS 2');
  const v = (await api('POST', '/api/carpeta/validar', { ruta: destino })).json;
  assert.deepEqual([v.ok, v.estado], [true, 'no-existe']);
  const mala = (await api('POST', '/api/carpeta/validar', { ruta: join(app.carpeta, 'sub') })).json;
  assert.match(mala.errores[0], /dentro de la carpeta actual/);
  const antigua = app.carpeta;
  const r = await api('POST', '/api/carpeta/cambiar', { ruta: destino, modo: 'copiar' });
  assert.equal(r.estado, 200, r.texto);
  assert.equal(r.json.ruta, destino);
  assert.equal((await api('GET', '/api/estado')).json.carpeta.ruta, destino);
  assert.equal((await api('GET', '/api/fichero?ruta=metas.md')).json.texto.length > 0, true);
  const cfg = JSON.parse(await fsp.readFile(join(aislado.env.XDG_CONFIG_HOME, 'finhub', 'config.json'), 'utf8'));
  assert.equal(cfg.carpeta, destino);
  assert.deepEqual(cfg.recientes, []);
  await assert.rejects(fsp.stat(join(antigua, '.finhub/abierto.lock')), 'el candado de la antigua se soltó');
  assert.ok(await fsp.stat(join(destino, '.finhub/abierto.lock')));
  assert.equal((await api('POST', '/api/carpeta/cambiar', { ruta: destino, modo: 'copiar' })).estado, 400);
});

test('un fichero que no se puede leer (en la nube) se marca y no se sobrescribe por la API', async () => {
  const raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  const a = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 60000, barridoMs: 60000 }).iniciar();
  apps.push(a);
  const fsNube = { ...fsp, readFile: async (f, o) => (f.endsWith('grupos.md') ? Promise.reject(Object.assign(new Error('E/S'), { code: 'EIO' })) : fsp.readFile(f, o)) };
  a.almacen.fs = fsNube;
  a.almacen.reintentos = [1];
  await fsp.utimes(join(raiz, 'grupos.md'), new Date(), new Date(Date.now() + 9000));
  await a.almacen.barrer();
  const e = (await api('GET', '/api/estado', null, { puerto: a.puerto })).json;
  assert.deepEqual(e.nube, [{ ruta: 'grupos.md', error: 'nube', codigo: 'EIO' }]);
  const w = await api('POST', '/api/ops', { op: 'lista.editar', args: { ruta: 'grupos.md', clave: 'ocio', cambios: { nombre: 'X' } } }, { puerto: a.puerto });
  assert.equal(w.estado, 503);
  assert.equal(w.json.codigo, 'nube');
  assert.equal(await fsp.readFile(join(raiz, 'grupos.md'), 'utf8'), EJEMPLO.get('grupos.md'));
});
