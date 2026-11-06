#!/usr/bin/env node
// QA9.1 · Prueba de humo con el Claude de VERDAD (gasta tu suscripción): una ejecución mínima de cada uno de los 9 trabajos,
// con `--model haiku`, sobre una copia temporal de ejemplo/. Nunca toca tu carpeta de datos ni tu config de finhub. Comprueba con
// el evento init real que las herramientas son las declaradas y que no se cargan MCP, plugins, hooks ni skills globales.
// Al acabar borra lo temporal: la carpeta y los transcripts de los dos trabajos con sesión. Solo con: pnpm qa:humo -- --si
import fsp from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { App } from '../src/server/app.js';
import { fechaLocal } from '../src/core/fechas.js';
import { TRABAJOS } from '../src/claude/trabajos/index.js';

if (!process.argv.includes('--si')) {
  console.error('Gasta tu suscripción de Claude. Lánzalo con: pnpm qa:humo -- --si');
  process.exit(2);
}
const RAIZ = join(import.meta.dirname, '..');
const HOME = homedir();
const PREFIJO = 'finhub-qa-humo-';
const base = await fsp.mkdtemp(join(tmpdir(), PREFIJO));
const datos = join(base, 'datos');
const trazas = join(base, 'trazas');
await fsp.cp(join(RAIZ, 'ejemplo'), datos, { recursive: true, filter: (f) => !f.endsWith('.gitkeep') });
await fsp.mkdir(trazas);

// envuelve al claude real: guarda stdin y stdout para mirarlos, y fuerza el modelo barato
const envoltura = join(base, 'envoltura.mjs');
await fsp.writeFile(envoltura, `import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
const [dir, ...args] = process.argv.slice(2);
const n = process.pid;
const fuera = createWriteStream(dir + '/' + n + '.stdout');
let entrada = '';
const h = spawn('claude', [...args, '--model', 'haiku'], { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.on('data', (d) => { entrada += d; h.stdin.write(d); });
process.stdin.on('end', () => { writeFileSync(dir + '/' + n + '.stdin', entrada); h.stdin.end(); });
h.stdout.on('data', (d) => { fuera.write(d); process.stdout.write(d); });
h.on('close', (c) => fuera.end(() => process.exit(c ?? 1)));
`);

const hoy = fechaLocal();
const env = { HOME, PATH: process.env.PATH, XDG_CONFIG_HOME: join(base, 'config'), XDG_CACHE_HOME: join(base, 'cache'), XDG_DATA_HOME: join(base, 'local') };
const app = await new App({ carpeta: datos, puerto: 0, env, guardarConfig: false, claude: { comando: [process.execPath, envoltura, trazas] } }).iniciar();
const PARAMS = {
  pulso: { fecha: hoy, temas: ['bancos-centrales'] },
  precios: { ids: [app.claude.modelo().activos.find((a) => a.campos.isin).id] },
  datos: { ids: ['msci-acwi-nr-eur'] },
  ingesta: { fichero: 'pizarra-andres-nov.txt', fuente: 'pizarra' },
  conocimiento: { pregunta: '¿Qué opinan mis fuentes de los tipos? Una frase.' },
  privado: { pregunta: '¿Cómo voy este mes? Una frase.' },
  'rex-web': { pregunta: '¿Qué es el TER de un fondo? Una frase, sin buscar si no hace falta.' },
  descubrir: { modo: 'nuevas', profundidad: 'rapida' },
  encaje: { descubrimiento: 'D-002' },
};
const M = app.claude.modelo();
const PRIVADOS = [...M.cuentas.map((c) => c.nombre), ...M.metas.map((m) => m.titulo)].filter((x) => x && x.length > 4);

const resultados = [];
const leerTraza = (pid) => readFileSync(join(trazas, `${pid}.stdout`), 'utf8').split('\n').filter(Boolean).flatMap((l) => {
  try {
    return [JSON.parse(l)];
  } catch {
    return [];
  }
});
try {
  for (const t of TRABAJOS) {
    const antes = new Set(readdirSync(trazas));
    const t0 = performance.now();
    let linea = { trabajo: t.id };
    try {
      const { id } = await app.claude.lanzar({ trabajo: t.id, params: PARAMS[t.id] });
      await app.claude.ejecuciones.get(id).promesa;
      const r = app.claude.resultado(id);
      linea = { ...linea, estado: r.estado, motivo: r.resultado?.motivo ?? r.resultado?.mensaje ?? null, avisos: r.resultado?.avisos?.length ?? 0 };
    } catch (e) {
      linea = { ...linea, estado: 'no lanzado', motivo: e.message };
    }
    linea.segundos = Math.round((performance.now() - t0) / 1000);
    const nuevos = readdirSync(trazas).filter((f) => !antes.has(f) && f.endsWith('.stdout'));
    linea.ejecuciones = nuevos.length;
    for (const f of nuevos) {
      const pid = f.replace('.stdout', '');
      const evs = leerTraza(pid);
      const init = evs.find((e) => e.type === 'system' && e.subtype === 'init');
      const res = evs.findLast((e) => e.type === 'result');
      const usadas = evs.flatMap((e) => (e.type === 'assistant' ? e.message?.content ?? [] : [])).filter((b) => b.type === 'tool_use').map((b) => b.name);
      const entrada = existsSync(join(trazas, `${pid}.stdin`)) ? readFileSync(join(trazas, `${pid}.stdin`), 'utf8') : '';
      linea.init = init ? { version: init.claude_code_version, modelo: init.model, tools: init.tools, mcp: init.mcp_servers, plugins: (init.plugins ?? []).map((p) => `${p.name}@${p.path}`), skills: init.skills?.length ?? null, comandos: init.slash_commands?.length ?? null, agentes: init.agents?.length ?? null, memoria: init.memory_paths ?? null, permisos: init.permissionMode, claves: Object.keys(init).sort() } : null;
      linea.toolsEsperadas = [...t.herramientas].sort();
      linea.toolsOk = init ? [...init.tools].sort().join() === [...t.herramientas].sort().join() : false;
      linea.usadas = [...new Set(usadas)];
      linea.ganchos = [...new Set(evs.filter((e) => /hook/.test(e.subtype ?? '')).map((e) => e.hook_name ?? e.subtype))];
      linea.coste = (linea.coste ?? 0) + (res?.total_cost_usd ?? 0);
      linea.fugas = t.privado ? [] : PRIVADOS.filter((x) => entrada.includes(x));
    }
    resultados.push(linea);
    console.log(JSON.stringify(linea));
  }
} finally {
  await app.parar();
  // los transcripts de los trabajos con sesión: solo los de esta carpeta temporal, por su nombre exacto
  const proyectos = join(HOME, '.claude', 'projects');
  const marca = base.replaceAll('/', '-').replaceAll('_', '-');
  const borrados = [];
  for (const n of existsSync(proyectos) ? readdirSync(proyectos) : []) {
    if (n.startsWith(marca)) {
      await fsp.rm(join(proyectos, n), { recursive: true, force: true });
      borrados.push(n);
    }
  }
  if (!base.startsWith(join(tmpdir(), PREFIJO))) throw new Error(`no es la carpeta de esta prueba: ${base}`);
  await fsp.rm(base, { recursive: true, force: true });
  console.log(JSON.stringify({ limpieza: { temporalBorrado: !existsSync(base), transcriptsBorrados: borrados.length } }));
}
const v = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
const sinAislar = resultados.filter((r) => !r.toolsOk || r.init?.mcp?.length || r.init?.skills || r.init?.comandos || r.init?.memoria || r.fugas?.length);
console.log(JSON.stringify({ version: v, trabajos: resultados.length, ejecuciones: resultados.reduce((a, r) => a + (r.ejecuciones ?? 0), 0), coste: resultados.reduce((a, r) => a + (r.coste ?? 0), 0), sinAislar: sinAislar.map((r) => r.trabajo), configFinhub: existsSync(join(HOME, '.config', 'finhub', 'config.json')) }));
process.exit(sinAislar.length ? 1 : 0);
