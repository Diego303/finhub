// QA3.3–6 · Candado, cambiar de carpeta, lo que va dentro y fuera, y la edición externa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { Almacen } from '../../src/server/almacen.js';
import { Candado, LATIDO_MS, CADUCA_MS } from '../../src/server/candado.js';
import { aRutaWsl, aRutaWindows, rutaSegura } from '../../src/server/rutas.js';
import { validarDestino, cambiarCarpeta } from '../../src/server/carpeta.js';
import { serializarCandado } from '../../src/core/formato/servicio.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno, pedir, esperar } from '../qa/entorno.js';

const lock = (ent) => join(ent.datos, '.finhub/abierto.lock');
const escribirLock = (ent, equipo, latido, pid = 4242) => fsp.mkdir(join(ent.datos, '.finhub'), { recursive: true }).then(() => fsp.writeFile(lock(ent), serializarCandado({ equipo, pid, inicio: latido, latido, version: '1' })));

test('candado: latido cada 30 s; viejo (> 2 min) se ignora con aviso; en el borde sigue vigente; caduca solo', async () => {
  assert.equal(LATIDO_MS, 30000);
  assert.equal(CADUCA_MS, 120000);
  const ent = await crearEntorno({ nombre: 'latido' });
  try {
    let t = Date.parse('2026-11-06T10:00:00Z');
    const a = await new Almacen({ raiz: ent.datos }).cargar();
    const iso = (ms) => new Date(ms).toISOString();
    const c = new Candado({ almacen: a, equipo: 'ESTE', ahora: () => t });
    await escribirLock(ent, 'OTRO', iso(t - CADUCA_MS + 1));
    assert.equal((await c.adquirir()).soloLectura, true, 'justo antes de 2 min: vigente');
    t += 2;
    assert.equal((await c.latir()).soloLectura, false, 'pasados 2 min sin latido: lo toma');
    assert.match(c.estado.aviso, /candado viejo de OTRO/);
    // late: el fichero se actualiza
    const antes = await fsp.readFile(lock(ent), 'utf8');
    t += LATIDO_MS;
    await c.latir();
    assert.notEqual(await fsp.readFile(lock(ent), 'utf8'), antes);
    // ilegible (a medio sincronizar): no se pierde el control ni se rompe
    await fsp.writeFile(lock(ent), 'basura');
    assert.equal((await c.latir()).soloLectura, false);
    // otro lo toma: al siguiente latido, solo lectura
    await escribirLock(ent, 'OTRO', iso(t));
    assert.equal((await c.latir()).soloLectura, true);
    assert.match(c.estado.aviso, /OTRO ha tomado el control/);
    const delOtro = await fsp.readFile(lock(ent), 'utf8');
    await c.soltar();
    assert.equal(await fsp.readFile(lock(ent), 'utf8'), delOtro, 'al cerrar, el candado del otro no se toca');
  } finally {
    await ent.limpiar();
  }
});

test('dos instancias de verdad: la segunda en solo lectura no escribe nada; tomar el control; la primera lo nota', async () => {
  const ent = await crearEntorno({ nombre: 'dos' });
  const a1 = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, equipo: 'A' }).iniciar();
  const a2 = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, equipo: 'B' }).iniciar();
  const s = (a) => ({ url: a.url.replace(/\/$/, ''), puerto: a.puerto });
  try {
    assert.equal(a2.estado().soloLectura, true);
    assert.equal((await pedir(s(a2), 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'b' } })).estado, 423);
    assert.equal((await pedir(s(a2), 'POST', '/api/claude/ejecutar', { trabajo: 'rex-web', params: { pregunta: 'x' } })).estado, 423);
    assert.equal((await pedir(s(a1), 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'a' } })).estado, 200);
    await a2.almacen.barrer();
    assert.match(a2.almacen.texto('hitos.md'), /\| a\b/, 'la segunda ve los cambios de la primera');
    assert.equal((await pedir(s(a2), 'POST', '/api/candado/tomar', {})).estado, 200);
    assert.equal(a2.estado().soloLectura, false);
    assert.equal((await pedir(s(a1), 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'no' } })).estado, 423, 'la primera ya no escribe');
    assert.equal((await pedir(s(a2), 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'b' } })).estado, 200);
    const t = await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8');
    assert.match(t, /\| a\b/);
    assert.match(t, /\| b\b/);
    assert.doesNotMatch(t, /\| no\b/);
  } finally {
    await a1.parar();
    await a2.parar();
    await ent.limpiar();
  }
});

test('un candado de este equipo con el proceso muerto no bloquea (SIGKILL del servidor)', async () => {
  const ent = await crearEntorno({ nombre: 'muerto' });
  try {
    const h = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
    const pid = h.pid;
    h.kill('SIGKILL');
    await new Promise((ok) => h.once('exit', ok));
    const { hostname } = await import('node:os');
    await escribirLock(ent, hostname().toUpperCase(), new Date().toISOString(), pid);
    const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
    assert.equal(app.estado().soloLectura, false);
    await app.parar();
    await assert.rejects(fsp.stat(lock(ent)), { code: 'ENOENT' }, 'al cerrar, se quita');
  } finally {
    await ent.limpiar();
  }
});

test('rutas: Windows, WSL, espacios, tildes, otra unidad, red, vacía', () => {
  const o = { home: '/home/yo', cwd: '/home/yo/x' };
  const T = [['D:\\FINANZAS', '/mnt/d/FINANZAS'], ['d:\\finanzas\\', '/mnt/d/finanzas'], ['D:/Mis Datos/Año 2026', '/mnt/d/Mis Datos/Año 2026'], ['C:\\Users\\Mi Nombre\\OneDrive\\FINANZAS', '/mnt/c/Users/Mi Nombre/OneDrive/FINANZAS'], ['"D:\\Con Comillas"', '/mnt/d/Con Comillas'], ['E:', '/mnt/e'], ['\\\\wsl.localhost\\Ubuntu\\home\\x', '/home/x'], ['\\\\wsl$\\Ubuntu\\home\\y z', '/home/y z'], ['~/f', '/home/yo/f'], ['~', '/home/yo'], ['/mnt/d/a b', '/mnt/d/a b'], ['rel/x', '/home/yo/x/rel/x'], ['D:\\a\\..\\b', '/mnt/d/b']];
  for (const [e, s] of T) assert.equal(aRutaWsl(e, o), s, e);
  for (const e of ['', '   ', '\\\\servidor\\compartida\\x', 'a\0b']) assert.throws(() => aRutaWsl(e, o), undefined, e);
  assert.equal(aRutaWindows('/mnt/d/Mis Datos'), 'D:\\Mis Datos');
  for (const r of ['../x', 'a/../../x', '/etc/passwd', 'a\\b', 'a//b', './a', 'a/.', '', 'x\0y']) assert.throws(() => rutaSegura('/datos', r), /no permitida/, r);
  assert.equal(rutaSegura('/datos', 'mes/2026-11.md'), '/datos/mes/2026-11.md');
});

test('cambiar de carpeta: sin permisos, ajena, con datos, dentro de la actual, fichero: errores claros y nada se toca', async () => {
  const ent = await crearEntorno({ nombre: 'destinos' });
  try {
    const A = { actual: ent.datos };
    assert.match((await validarDestino(join(ent.datos, 'mes'), A)).errores.join(), /dentro de la carpeta actual/);
    assert.match((await validarDestino(ent.datos, A)).errores.join(), /la misma/);
    assert.match((await validarDestino(ent.base, A)).errores.join(), /la carpeta actual está dentro/);
    const fichero = join(ent.base, 'fichero');
    await fsp.writeFile(fichero, 'x');
    assert.match((await validarDestino(fichero, A)).errores.join(), /es un fichero/);
    assert.match((await validarDestino(join(ent.base, 'no/existe/nada'), A)).errores.join(), /no existe la carpeta/);
    const sinPermisos = join(ent.base, 'sin-permisos');
    await fsp.mkdir(sinPermisos);
    await fsp.chmod(sinPermisos, 0o555);
    if (process.getuid?.() !== 0) assert.match((await validarDestino(sinPermisos, A)).errores.join(), /permisos/);
    await fsp.chmod(sinPermisos, 0o755);
    const ajena = join(ent.base, 'ajena');
    await fsp.mkdir(ajena);
    await fsp.writeFile(join(ajena, 'cuentas.md'), 'de otro');
    const v = await validarDestino(ajena, A);
    assert.equal(v.estado, 'ajena');
    await assert.rejects(cambiarCarpeta({ entrada: ajena, modo: 'copiar', actual: ent.datos }), /confirma/);
    await assert.rejects(cambiarCarpeta({ entrada: ajena, modo: 'copiar', actual: ent.datos, aceptarAjenos: true }), /no se sobrescribe/);
    assert.equal(await fsp.readFile(join(ajena, 'cuentas.md'), 'utf8'), 'de otro');
    const conDatos = join(ent.base, 'con-datos');
    await fsp.mkdir(conDatos);
    await fsp.writeFile(join(conDatos, 'ajustes.md'), '# Ajustes\nesquema: 1\n');
    assert.equal((await validarDestino(conDatos, A)).estado, 'finhub');
    await assert.rejects(cambiarCarpeta({ entrada: conDatos, modo: 'mover', actual: ent.datos }), /ya tiene datos/);
    await assert.rejects(cambiarCarpeta({ entrada: ajena, modo: 'borrar', actual: ent.datos, aceptarAjenos: true }), /modo desconocido/);
    assert.ok(await fsp.stat(join(ent.datos, 'ajustes.md')));
  } finally {
    await ent.limpiar();
  }
});

test('mover y cambiar: la lectura salta a la nueva sin reiniciar; la antigua solo a la papelera con confirmación; SSE avisa', async () => {
  const ent = await crearEntorno({ nombre: 'cambiar' });
  const papelera = [];
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, enviarAPapelera: async (r) => {
    papelera.push(r);
    return { donde: 'papelera de prueba' };
  } }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  const eventos = [];
  const enviar = app.difusor.enviar.bind(app.difusor);
  app.difusor.enviar = (t, d) => {
    eventos.push([t, d]);
    enviar(t, d);
  };
  try {
    const nueva = join(ent.base, 'Mis Datos Ñ');
    const sinConfirmar = await pedir(srv, 'POST', '/api/carpeta/cambiar', { ruta: nueva, modo: 'mover' });
    assert.equal(sinConfirmar.estado, 200);
    assert.match(sinConfirmar.json.avisos.join(), /sigue en su sitio/);
    assert.deepEqual(papelera, []);
    assert.ok(await fsp.stat(join(ent.datos, 'ajustes.md')), 'sin confirmar, la antigua sigue');
    assert.equal((await pedir(srv, 'GET', '/api/carpeta')).json.ruta, nueva);
    assert.ok(eventos.some(([t, d]) => t === 'carpeta' && d.ruta === nueva));
    assert.equal((await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'nueva' } })).estado, 200);
    assert.match(await fsp.readFile(join(nueva, 'hitos.md'), 'utf8'), /\| nueva\b/);
    assert.doesNotMatch(await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8'), /\| nueva\b/);
    await assert.rejects(fsp.stat(lock(ent)), { code: 'ENOENT' }, 'el candado de la antigua se suelta');
    assert.ok(await fsp.stat(join(nueva, '.finhub/abierto.lock')));
    const otra = join(ent.base, 'otra');
    const conf = await pedir(srv, 'POST', '/api/carpeta/cambiar', { ruta: otra, modo: 'mover', confirmarBorrado: true });
    assert.equal(conf.estado, 200, conf.texto);
    assert.deepEqual(papelera, [nueva], 'con confirmación, a la papelera');
    assert.ok(await fsp.stat(join(nueva, 'ajustes.md')), 'y nunca se borra aquí');
    const mala = await pedir(srv, 'POST', '/api/carpeta/cambiar', { ruta: join(otra, 'mes'), modo: 'usar' });
    assert.equal(mala.estado, 400);
    assert.equal((await pedir(srv, 'GET', '/api/carpeta')).json.ruta, otra);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('sandbox y caché nunca dentro de la carpeta; registro, papelera, cuarentena y copias, dentro', async () => {
  const ent = await crearEntorno({ nombre: 'dentro' });
  const g = join(ent.base, 'g.json');
  await fsp.writeFile(g, JSON.stringify([{ init: {} }, { responder: json({ respuesta_md: 'ok', citas: [], cifras_usadas: [] }) }]));
  const mala = join(ent.base, 'm.json');
  await fsp.writeFile(mala, JSON.stringify([{ init: {} }, { responder: 'sin json' }]));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, claude: { comando: [process.execPath, FAKE, '--guion', g] } }).iniciar();
  try {
    assert.ok(!app.claude.sandboxBase.startsWith(ent.datos));
    const { id } = await app.claude.lanzar({ trabajo: 'rex-web', params: { pregunta: 'x' } });
    await app.claude.ejecuciones.get(id).promesa;
    app.claude.comando = [process.execPath, FAKE, '--guion', mala];
    const b = await app.claude.lanzar({ trabajo: 'privado', params: { pregunta: 'x' } });
    await app.claude.ejecuciones.get(b.id).promesa;
    await app.aplicar({ op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'x' } });
    const r = await app.aplicar({ op: 'hito.crear', args: { fecha: '2026-11-07', texto: 'y' } });
    assert.ok(r);
    await app.copias.enCurso;
    const dentro = await fsp.readdir(join(ent.datos, '.finhub'));
    for (const d of ['registro', 'cuarentena', 'copias']) assert.ok(dentro.includes(d), d);
    for (const d of ['sandbox', 'cache']) assert.ok(!dentro.includes(d), `${d} no va dentro`);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('edición externa: el sondeo la recarga y avisa por SSE; con una operación en vuelo, 409 y nada se pisa', async () => {
  const ent = await crearEntorno({ nombre: 'externa' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, sondeoMs: 100, barridoMs: 300 }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  const eventos = [];
  const enviar = app.difusor.enviar.bind(app.difusor);
  app.difusor.enviar = (t, d) => {
    eventos.push([t, d]);
    enviar(t, d);
  };
  try {
    const v0 = app.almacen.version;
    const t = await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8');
    await fsp.writeFile(join(ent.datos, 'hitos.md'), `${t}- H-9000 | 2026-11-06 | mío | Editado a mano\n`);
    for (let i = 0; i < 60 && app.almacen.version === v0; i++) await esperar(50);
    assert.ok(app.almacen.version > v0, 'detectado por el sondeo');
    assert.ok(eventos.some(([e, d]) => e === 'version' && d.origen === 'disco' && d.rutas.includes('hitos.md')));
    assert.match((await pedir(srv, 'GET', '/api/fichero?ruta=hitos.md')).json.texto, /Editado a mano/);
    // en vuelo: la web calculó con la versión anterior
    const r = await pedir(srv, 'POST', '/api/ops', { op: 'hito.crear', args: { fecha: '2026-11-06', texto: 'de la web' }, base: v0 });
    assert.equal(r.estado, 409);
    assert.equal(r.json.codigo, 'conflicto_version');
    assert.match(await fsp.readFile(join(ent.datos, 'hitos.md'), 'utf8'), /Editado a mano/);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
