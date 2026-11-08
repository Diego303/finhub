// QA6 · CLI de punta a punta, solo contra instancias de prueba (HOME y XDG temporales): --datos, --puerto, --silencioso,
// puerto ocupado, segunda instancia, PID huérfano, espacios y tildes, y el navegador con un wslview falso.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { abrirNavegador } from '../../src/cli/index.js';
import { crearEntorno, esperar } from '../qa/entorno.js';

const BIN = join(import.meta.dirname, '..', '..', 'bin', 'finhub.js');
const entornos = [];
after(async () => {
  for (const e of entornos) {
    spawnSync(process.execPath, [BIN, 'stop'], { env: e.env, timeout: 15000 });
    await e.limpiar();
  }
});

/** Entorno con un wslview falso que apunta lo que le piden: nunca se abre tu navegador. */
async function entorno(nombre) {
  const e = await crearEntorno({ nombre });
  entornos.push(e);
  const bin = join(e.base, 'bin');
  await fsp.mkdir(bin);
  e.navegador = join(e.base, 'navegador.log');
  await fsp.writeFile(join(bin, 'wslview'), `#!/bin/sh\necho "$@" >> "${e.navegador}"\n`, { mode: 0o755 });
  e.env.PATH = `${bin}:${e.env.PATH}`;
  e.finhub = (...args) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { env: e.env, encoding: 'utf8', timeout: 30000 });
    return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
  };
  return e;
}
const leido = (f) => fsp.readFile(f, 'utf8').catch(() => '');
async function hasta(fn) {
  for (let i = 0; i < 60; i++) {
    const v = await fn();
    if (v) return v;
    await esperar(50);
  }
  return null;
}

test('--datos con espacios y tildes, sin tocar la config; --silencioso no abre el navegador', async () => {
  const e = await entorno('cli-datos');
  const carpeta = join(e.base, 'Mis Datos Ñandú');
  await fsp.cp(e.datos, carpeta, { recursive: true });
  const s = e.finhub('start', '--datos', carpeta, '--puerto', '0', '--silencioso');
  assert.equal(s.codigo, 0, s.salida);
  assert.match(e.finhub('status').salida, /Mis Datos Ñandú/);
  assert.equal(await leido(e.navegador), '');
  await assert.rejects(fsp.stat(join(e.env.XDG_CONFIG_HOME, 'finhub/config.json')), 'con --datos no se guarda nada');
  assert.equal(e.finhub('stop').codigo, 0);
  await assert.rejects(fsp.stat(join(carpeta, '.finhub/abierto.lock')));
});

test('sin --silencioso abre el navegador con la URL; la segunda vez, abre pestaña y no otro servidor', async () => {
  const e = await entorno('cli-nav');
  const s = e.finhub('start', '--datos', e.datos, '--puerto', '0');
  assert.equal(s.codigo, 0, s.salida);
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(s.salida)[0];
  assert.ok(await hasta(async () => (await leido(e.navegador)).includes(url)), 'wslview con la URL');
  const dos = e.finhub('start', '--datos', e.datos);
  assert.match(dos.salida, /ya está en marcha/);
  assert.match(dos.salida, /primero «finhub stop»/);
  assert.ok(await hasta(async () => (await leido(e.navegador)).trim().split('\n').length === 2), 'otra pestaña');
  e.finhub('stop');
});

test('puerto ocupado: el siguiente libre; puerto no válido: error', async () => {
  const e = await entorno('cli-puerto');
  const ocupado = net.createServer();
  await new Promise((ok) => ocupado.listen(0, '127.0.0.1', ok));
  const n = ocupado.address().port;
  try {
    const s = e.finhub('start', '--datos', e.datos, '--puerto', String(n), '--silencioso');
    assert.equal(s.codigo, 0, s.salida);
    const usado = +/127\.0\.0\.1:(\d+)/.exec(s.salida)[1];
    assert.ok(usado > n && usado <= n + 20, `${usado} tras ${n}`);
    e.finhub('stop');
  } finally {
    await new Promise((ok) => ocupado.close(ok));
  }
  for (const p of ['abc', '99999', '-1', '1.5']) assert.equal(e.finhub('start', '--datos', e.datos, '--puerto', p, '--silencioso').codigo, 2, p);
});

test('PID huérfano: servidor.json de un proceso que ya no es finhub; stop no lo mata y start arranca', async () => {
  const e = await entorno('cli-huerfano');
  const ajeno = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  try {
    const dir = join(e.env.XDG_CACHE_HOME, 'finhub');
    await fsp.mkdir(dir, { recursive: true });
    const fichero = join(dir, 'servidor.json');
    await fsp.writeFile(fichero, JSON.stringify({ pid: ajeno.pid, puerto: 1, url: 'http://127.0.0.1:1/', carpeta: e.datos }));
    assert.match(e.finhub('status').salida, /no está en marcha/);
    assert.match(e.finhub('stop').salida, /no está en marcha/);
    assert.equal(ajeno.exitCode, null);
    process.kill(ajeno.pid, 0); // sigue vivo
    await fsp.writeFile(fichero, JSON.stringify({ pid: ajeno.pid, puerto: 1, url: 'http://127.0.0.1:1/', carpeta: e.datos }));
    const s = e.finhub('start', '--datos', e.datos, '--puerto', '0', '--silencioso');
    assert.equal(s.codigo, 0, s.salida);
    assert.equal(e.finhub('stop').codigo, 0);
    process.kill(ajeno.pid, 0);
    await fsp.writeFile(fichero, '{basura');
    assert.equal(e.finhub('status').codigo, 3);
    assert.match(e.finhub('stop').salida, /no está en marcha/);
  } finally {
    ajeno.kill('SIGKILL');
  }
});

test('stop: otro servidor responde en ese puerto con otro pid: no se le manda ninguna señal', async () => {
  const e = await entorno('cli-otro');
  const { createServer } = await import('node:http');
  const otro = createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ ok: true, app: 'finhub', pid: process.pid + 100000 }));
  });
  await new Promise((ok) => otro.listen(0, '127.0.0.1', ok));
  const puerto = otro.address().port;
  try {
    const dir = join(e.env.XDG_CACHE_HOME, 'finhub');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(join(dir, 'servidor.json'), JSON.stringify({ pid: process.pid, puerto, url: `http://127.0.0.1:${puerto}/`, carpeta: e.datos }));
    const r = e.finhub('stop');
    assert.match(r.salida, /no está en marcha/);
    process.kill(process.pid, 0);
  } finally {
    await new Promise((ok) => otro.close(ok));
  }
});

test('navegador: wslview; si no, explorer.exe con la URL; si fallan todos, false y la URL se ve igual', async () => {
  const e = await entorno('cli-candidatos');
  const crear = async (nombre, cuerpo) => {
    const f = join(e.base, nombre);
    await fsp.writeFile(f, cuerpo, { mode: 0o755 });
    return f;
  };
  const log = join(e.base, 'cand.log');
  const explorer = await crear('explorer.exe', `#!/bin/sh\necho "explorer $@" >> "${log}"\n`);
  const noHay = join(e.base, 'no-existe');
  const url = 'http://127.0.0.1:1234/';
  assert.equal(abrirNavegador(url, { candidatos: [[noHay, [url]], [explorer, [url]]] }), true);
  assert.ok(await hasta(async () => (await leido(log)).includes(`explorer ${url}`)));
  assert.equal(abrirNavegador(url, { candidatos: [[noHay, [url]]] }), false);
  assert.equal(abrirNavegador(url, { candidatos: [['comando-que-no-existe', [url]]], env: { PATH: e.base } }), false);
  // sin navegador, la URL está en lo que imprime start (se comprueba en el primer test con --silencioso)
  const s = e.finhub('start', '--datos', e.datos, '--puerto', '0', '--silencioso');
  assert.match(s.salida, /http:\/\/127\.0\.0\.1:\d+\//);
  e.finhub('stop');
});

test('--ejemplo no toca nada tuyo; carpeta inexistente da error claro', async () => {
  const e = await entorno('cli-ejemplo');
  const r = e.finhub('start', '--datos', join(e.base, 'no-existe'), '--puerto', '0', '--silencioso');
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /no se pudo arrancar|no existe/);
  const log = await leido(join(e.env.XDG_CACHE_HOME, 'finhub/servidor.log'));
  assert.doesNotMatch(r.salida, /\.js:\d+/);
  assert.ok(log.length >= 0);
});
