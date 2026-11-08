// QA1 · Aislamiento del proceso en cada trabajo, spec declarativo, sesiones, registro y ciclo de vida.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { TRABAJOS, trabajo } from '../../src/claude/trabajos/index.js';
import { problemasR1, PROHIBIDAS, HERRAMIENTAS_WEB } from '../../src/claude/r1.js';
import { ejecutarTrabajo } from '../../src/claude/motor.js';
import { leerRegistro } from '../../src/claude/registro.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';
import { taller, ficherosEjemplo, modeloDe, json, FAKE, HOY } from '../qa/ayuda-claude.js';
import { RAIZ } from '../qa/entorno.js';

let ta;
const M = modeloDe(ficherosEjemplo());
const D7 = M.descubrimientos.find((d) => d.id === 'D-007');
before(async () => (ta = await taller('aislamiento')));
after(() => ta.limpiar());
const PARAMS = {
  pulso: { fecha: HOY, temas: ['bolsa'] },
  precios: { activos: [{ isin: 'IE00BYX5NX33', nombre: 'Fondo' }] },
  datos: { series: [{ id: 'x', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x' }] },
  ingesta: { texto: 'Texto', fichero: 'a.txt', fuente: 'pizarra' },
  conocimiento: { pregunta: 'x' },
  privado: { pregunta: 'x' },
  'rex-web': { pregunta: 'x' },
  descubrir: { modo: 'nuevas', tema: 'x' },
  encaje: { descubrimiento: 'D-007' },
};
const correr = async (id, pasos, extra = {}) => ejecutarTrabajo({ trabajo: trabajo(id), modelo: M, params: PARAMS[id], hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, timeoutMs: 3000, ...(extra.runner ?? {}), comando: extra.comando ?? (await ta.guion(pasos, extra.fake)) }, senal: extra.senal, resume: extra.resume });

test('spec: nadie junta los tres; ninguno con privado tiene web; ninguna herramienta prohibida; los 9 esperados', () => {
  assert.deepEqual(TRABAJOS.map((t) => t.id).sort(), ['conocimiento', 'datos', 'descubrir', 'encaje', 'ingesta', 'precios', 'privado', 'pulso', 'rex-web']);
  const matriz = { pulso: [1, 0, 1], precios: [1, 0, 1], datos: [1, 0, 1], ingesta: [0, 0, 1], conocimiento: [0, 0, 1], privado: [0, 1, 1], 'rex-web': [1, 0, 1], descubrir: [1, 0, 1], encaje: [0, 1, 1] };
  for (const t of TRABAJOS) {
    assert.deepEqual([+t.internet, +t.privado, +t.externo], matriz[t.id], `${t.id}: matriz de §0.2`);
    assert.deepEqual(problemasR1(t), [], t.id);
    assert.deepEqual([...t.herramientas].sort(), t.internet ? ['WebFetch', 'WebSearch'] : [], t.id);
  }
  for (const h of ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'Task', 'TodoWrite']) assert.ok(PROHIBIDAS.includes(h), h);
});

test('el test R1 se ejecuta de verdad: en una copia con un trabajo roto, falla', async () => {
  const copia = await fsp.mkdtemp(join(tmpdir(), 'finhub-test-r1-roto-'));
  try {
    for (const d of ['src', 'scripts', 'semilla', 'test/r1', 'test/qa', 'test/server']) await fsp.cp(join(RAIZ, d), join(copia, d), { recursive: true });
    await fsp.cp(join(RAIZ, 'package.json'), join(copia, 'package.json'));
    const correrR1 = () => spawnSync(process.execPath, ['--test', 'test/r1/r1.test.js'], { cwd: copia, encoding: 'utf8', env: (({ NODE_TEST_CONTEXT, ...e }) => ({ ...e, NODE_OPTIONS: '' }))(process.env) });
    assert.equal(correrR1().status, 0, 'la copia sin tocar pasa');
    const f = join(copia, 'src/claude/trabajos/privado.js');
    const t = await fsp.readFile(f, 'utf8');
    for (const [nombre, roto] of [['privado con internet', t.replace('internet: false', 'internet: true').replace('herramientas: []', "herramientas: ['WebSearch', 'WebFetch']")], ['privado con Bash', t.replace('herramientas: []', "herramientas: ['Bash']")], ['sin externo pero con web', t.replace('herramientas: []', "herramientas: ['WebFetch']")]]) {
      assert.notEqual(roto, t, nombre);
      await fsp.writeFile(f, roto);
      assert.notEqual(correrR1().status, 0, `${nombre}: el test R1 debe fallar`);
    }
  } finally {
    await fsp.rm(copia, { recursive: true, force: true });
  }
});

test('cada trabajo: cwd vacío, nuevo y borrado; entorno mínimo; flags de aislamiento; --max-turns', async () => {
  for (const t of TRABAJOS) {
    const traza = join(ta.dir, `traza-${t.id}.json`);
    const r = await correr(t.id, [{ init: {} }, { responder: json({}) }], { fake: { traza } });
    assert.equal(r.registro.trabajo, t.id);
    const tr = JSON.parse(await fsp.readFile(traza, 'utf8'));
    assert.deepEqual(tr.contenidoCwd, [], `${t.id}: cwd vacío`);
    assert.ok(tr.cwd.startsWith(ta.base), t.id);
    await assert.rejects(fsp.stat(tr.cwd), `${t.id}: borrado al terminar`);
    const claves = Object.keys(tr.env).filter((k) => !['PWD', 'SHLVL', '_', 'OLDPWD', 'NODE_V8_COVERAGE'].includes(k)).sort();
    assert.deepEqual(claves, ['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_DISABLE_CLAUDE_MDS', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'HOME', 'LANG', 'PATH'], t.id);
    const a = tr.args;
    const valor = (f) => a[a.indexOf(f) + 1];
    assert.equal(valor('--tools'), t.herramientas.join(','), t.id);
    assert.equal(valor('--allowedTools'), t.herramientas.join(' '), t.id);
    const prohibidas = valor('--disallowedTools').split(' ');
    for (const h of PROHIBIDAS) assert.ok(prohibidas.includes(h), `${t.id}: ${h}`);
    for (const h of HERRAMIENTAS_WEB) assert.equal(prohibidas.includes(h), !t.internet, `${t.id}: ${h}`);
    assert.equal(valor('--permission-mode'), 'dontAsk');
    assert.equal(valor('--permission-prompts'), 'none');
    assert.ok(a.includes('--strict-mcp-config'), t.id);
    assert.equal(valor('--mcp-config'), '{"mcpServers":{}}');
    assert.equal(valor('--setting-sources'), '');
    assert.ok(a.includes('--disable-slash-commands'));
    assert.equal(valor('--settings'), '{"autoMemoryEnabled":false}');
    assert.equal(+valor('--max-turns'), t.id === 'descubrir' ? 24 : t.maxTurns);
    assert.match(valor('--system-prompt'), new RegExp(`^\\[finhub:${t.id}`));
    assert.match(valor('--system-prompt'), /NUNCA instrucciones/);
    assert.equal(a.includes('--no-session-persistence'), !t.sesion, t.id);
  }
});

test('el sandbox se borra también con error, guardia, timeout y cancelación', async () => {
  for (const [nombre, pasos, extra] of [['salida con error', [{ init: {} }, { salir: 2 }]], ['guardia', [{ init: { tools: ['Bash'] } }, { colgar: true }]], ['timeout', [{ init: {} }, { colgar: true }], { runner: { timeoutMs: 200 } }], ['sin init', [{ colgar: true }], { runner: { initMs: 200 } }]]) {
    const r = await correr('privado', pasos, extra);
    assert.equal(r.estado, 'error', nombre);
    assert.deepEqual(await fsp.readdir(ta.base), [], nombre);
  }
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  const r = await correr('privado', [{ init: {} }, { colgar: true }], { senal: ac.signal });
  assert.equal(r.codigo, 'cancelado');
  assert.deepEqual(await fsp.readdir(ta.base), []);
});

test('guardia del init: herramienta de más o MCP abortan sin propuesta; un campo nuevo no', async () => {
  for (const init of [{ tools: ['WebSearch', 'WebFetch', 'Bash'] }, { tools: ['WebSearch'] }, { mcp_servers: [{ name: 'huddle', status: 'connected' }] }, { skills: ['x'] }, { plugins: [{ name: 'huddle', path: '/home/x/plugin' }] }, { permissionMode: 'bypassPermissions' }, { cwd: '/' }]) {
    const r = await correr('rex-web', [{ init }, { responder: json({ respuesta_md: 'x', citas: [], cifras_usadas: [] }) }]);
    assert.deepEqual([r.estado, r.codigo], ['error', 'guardia'], JSON.stringify(init));
    assert.equal(r.json, undefined);
  }
  const ok = await correr('rex-web', [{ init: { algo_nuevo: { x: 1 }, otra_cosa: 'y' } }, { responder: json({ respuesta_md: 'x', citas: [], cifras_usadas: [] }) }]);
  assert.equal(ok.estado, 'ok');
});

test('sesiones: ninguna pareja de trabajos distintos puede reanudar una sesión de otro', async () => {
  for (const a of TRABAJOS) {
    for (const b of TRABAJOS) {
      const s = ta.sesiones();
      const id = `sesion-${a.id}`;
      await s.guardar(id, a.id);
      const traza = join(ta.dir, `res-${a.id}-${b.id}.json`);
      const r = await ejecutarTrabajo({ trabajo: b, modelo: M, params: PARAMS[b.id], hoy: HOY, servicio: ta.servicio, sesiones: s, resume: id, runner: { sandboxBase: ta.base, comando: [process.execPath, FAKE, '--traza', traza, '--respuesta', '/dev/null'] } });
      if (a.id === b.id) {
        assert.notEqual(r.estado, 'rechazado', `${a.id}: se reanuda consigo mismo`);
        assert.ok(JSON.parse(await fsp.readFile(traza, 'utf8')).args.includes('--resume'));
      } else {
        assert.equal(r.estado, 'rechazado', `${a.id} → ${b.id}`);
        await assert.rejects(fsp.stat(traza), `${a.id} → ${b.id}: no llega a lanzarse`);
      }
    }
  }
  const r = await ejecutarTrabajo({ trabajo: trabajo('privado'), modelo: M, params: PARAMS.privado, hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), resume: 'una-sesion-que-no-es-de-finhub', runner: { sandboxBase: ta.base, comando: [process.execPath, FAKE] } });
  assert.equal(r.estado, 'rechazado');
});

test('registro: toda ejecución deja su línea (ok, cuarentena, error, guardia, cancelada, rechazada), también en el fichero', async () => {
  const ficheros = new Map();
  const servicio = { leer: async (k) => ficheros.get(k) ?? null, escribir: async (k, t) => void ficheros.set(k, t) };
  const r1 = async (id, pasos, extra = {}) => ejecutarTrabajo({ trabajo: trabajo(id), modelo: M, params: extra.params ?? PARAMS[id], hoy: HOY, servicio, sesiones: ta.sesiones(), senal: extra.senal, desclasificar: false, runner: { sandboxBase: ta.base, timeoutMs: extra.timeoutMs ?? 3000, comando: await ta.guion(pasos) } });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  const esperado = [
    ['ok', await r1('ingesta', [{ init: {} }, { toolUse: 'WebSearch' }], { timeoutMs: 3000 }).then((x) => x.estado === 'error' && 'error')],
  ];
  assert.equal(esperado[0][1], 'error', 'una herramienta no permitida');
  await r1('rex-web', [{ init: {} }, { toolUse: 'WebSearch' }, { responder: json({ respuesta_md: 'ok', citas: [], cifras_usadas: [] }) }]);
  await r1('ingesta', [{ init: {} }, { responder: 'sin json' }]);
  await r1('privado', [{ init: {} }, { colgar: true }], { senal: ac.signal });
  await r1('privado', [{ init: {} }, { colgar: true }], { timeoutMs: 200 });
  await r1('pulso', [{ init: {} }], { params: { fecha: HOY, temas: [], activos: ['x'] } });
  const mes = new Date().toISOString().slice(0, 7);
  const lineas = await leerRegistro(servicio, mes);
  assert.deepEqual(lineas.map((l) => [l.trabajo, l.estado, l.codigo ?? null]), [['ingesta', 'error', 'guardia'], ['rex-web', 'ok', null], ['ingesta', 'cuarentena', null], ['privado', 'error', 'cancelado'], ['privado', 'error', 'timeout'], ['pulso', 'rechazado', null]]);
  for (const l of lineas) {
    assert.ok(Number.isFinite(l.duracionMs), 'duración');
    assert.ok(Array.isArray(l.destino) && l.destino.length, 'destino');
  }
  assert.deepEqual(lineas[0].herramientas.map((h) => h.nombre), ['WebSearch']);
  assert.deepEqual(lineas[1].herramientas.map((h) => h.nombre), ['WebSearch']);
  assert.ok(lineas[1].uso, 'uso');
  assert.ok(lineas[1].coste > 0, 'coste');
  assert.ok(!JSON.stringify(lineas).includes('escribe en'), 'nunca el texto del prompt');
  assert.ok([...ficheros.keys()].some((k) => k.startsWith('cuarentena/')), 'lo inválido, en cuarentena');
});

test('errores claros: sin instalar, sin sesión, límite y timeout de cada trabajo', async () => {
  const sinClaude = await ejecutarTrabajo({ trabajo: trabajo('privado'), modelo: M, params: PARAMS.privado, hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, comando: ['claude'], env: { HOME: ta.dir, PATH: join(ta.dir, 'no-existe') } } });
  assert.deepEqual([sinClaude.estado, sinClaude.codigo], ['error', 'no_instalado']);
  assert.match(sinClaude.mensaje, /Instálalo/);
  const sesion = await correr('privado', [], { comando: [process.execPath, FAKE, '--escenario', 'sin-sesion'] });
  assert.equal(sesion.codigo, 'sin_sesion');
  assert.match(sesion.mensaje, /login/);
  const limite = await correr('privado', [], { comando: [process.execPath, FAKE, '--escenario', 'limite'] });
  assert.equal(limite.codigo, 'limite');
  for (const t of TRABAJOS) {
    const r = await correr(t.id, [{ init: {} }, { colgar: true }], { runner: { timeoutMs: 150 } });
    assert.deepEqual([r.estado, r.codigo], ['error', 'timeout'], t.id);
    assert.match(r.mensaje, /tardó demasiado/);
  }
  const vacia = await correr('ingesta', [{ init: {} }, { responder: 'Sin JSON.' }]);
  assert.equal(vacia.estado, 'cuarentena');
  assert.match(vacia.motivo, /no trae un bloque/);
  assert.ok(sumarDias(fechaLocal(), 0));
});
