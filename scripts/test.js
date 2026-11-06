#!/usr/bin/env node
// Lanzador de tests con ENTORNO AISLADO (QA0). Todos los procesos corren con:
//  · HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME y XDG_DATA_HOME en un temporal: nunca se usa tu config ni tu caché;
//  · un `claude` falso primero en el PATH, que da la alarma si algún test llega a llamarlo (ningún test llama
//    al Claude real);
//  · la trampa de rutas (test/qa/trampa-rutas.js) con --import: cualquier escritura fuera de los temporales
//    o de test/ hace fallar el test y queda anotada, aunque el código se trague el error;
//  · la comprobación final de que tu ~/.config/finhub/config.json sigue igual (solo se calcula su hash).
// Uso: node scripts/test.js [carpeta|fichero…] [--cobertura] [--todo]
//   sin carpetas: unitarias, propiedades, diferenciales, R1 y API (todo menos e2e, visual y largas).
//   --todo: lo anterior y después e2e y visual, de uno en uno. Funciona en Node 20 (sin globs en --test).
import { readdirSync, statSync, readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const raiz = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const cobertura = args.includes('--cobertura');
const todo = args.includes('--todo');
const pedidas = args.filter((a) => !a.startsWith('--'));
const APARTE = ['e2e', 'visual', 'larga'];

function buscarTests(ruta) {
  if (statSync(ruta).isFile()) return ruta.endsWith('.test.js') ? [ruta] : [];
  return readdirSync(ruta, { withFileTypes: true }).flatMap((e) => {
    const r = join(ruta, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : buscarTests(r);
    return e.name.endsWith('.test.js') ? [r] : [];
  });
}
const partes = (f) => relative(raiz, f).split(/[\\/]/);
const esAparte = (f) => partes(f).some((p) => APARTE.includes(p));
const enSerie = (f) => esAparte(f);

let ficheros;
if (pedidas.length) ficheros = pedidas.flatMap((c) => buscarTests(resolve(raiz, c)));
else ficheros = buscarTests(join(raiz, 'test')).filter((f) => todo ? !partes(f).includes('larga') : !esAparte(f));
ficheros = [...new Set(ficheros)].sort();
if (!ficheros.length) {
  console.error('No hay ficheros *.test.js en', pedidas.join(', ') || 'test/');
  process.exit(1);
}

// ---------- entorno aislado ----------
const realHome = userInfo().homedir;
const configReal = join(realHome, '.config', 'finhub', 'config.json');
const hashConfig = () => (existsSync(configReal) ? createHash('sha256').update(readFileSync(configReal)).digest('hex') : 'no existe');
const hashInicial = hashConfig();
const base = mkdtempSync(join(tmpdir(), 'finhub-test-aislado-'));
const home = join(base, 'home');
const bin = join(base, 'bin');
const logTrampa = join(base, 'trampa.log');
const logClaude = join(base, 'claude-llamado.log');
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, 'claude'), `#!/bin/sh\n# FINHUB_SHIM: ningun test puede llamar al Claude real\necho "$0 $*" | cut -c1-200 >> "${logClaude}"\necho "claude falso del lanzador: ningun test debe llegar aqui" >&2\nexit 99\n`);
chmodSync(join(bin, 'claude'), 0o755);
const env = {
  ...process.env,
  TZ: process.env.TZ || 'Europe/Madrid',
  HOME: home,
  XDG_CONFIG_HOME: join(home, '.config'),
  XDG_CACHE_HOME: join(home, '.cache'),
  XDG_DATA_HOME: join(home, '.local', 'share'),
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || join(realHome, '.cache', 'ms-playwright'),
  PATH: `${bin}:${process.env.PATH}`,
  FINHUB_TRAMPA_LOG: logTrampa,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(join(raiz, 'test', 'qa', 'trampa-rutas.js')).href}`.trim(),
};

// Los e2e manejan un navegador real con toasts que caducan: van después y de uno en uno, para que la carga
// de los demás ficheros (en paralelo) no los vuelva intermitentes.
const tandas = [ficheros.filter((f) => !enSerie(f)), ficheros.filter(enSerie)].filter((t) => t.length);
let estado = 0;
for (const [i, tanda] of tandas.entries()) {
  const serie = tanda.some(enSerie) ? ['--test-concurrency=1'] : [];
  const opciones = ['--test', ...serie, ...(cobertura ? ['--experimental-test-coverage'] : []), ...tanda.map((f) => relative(raiz, f))];
  if (i > 0) console.log('\n— e2e y visual (navegador), de uno en uno —');
  const r = spawnSync(process.execPath, opciones, { cwd: raiz, stdio: 'inherit', env });
  if ((r.status ?? 1) !== 0) estado = r.status ?? 1;
}

// ---------- comprobaciones finales ----------
const leer = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim() : '');
const infracciones = leer(logTrampa);
if (infracciones) {
  console.error(`\n✗ TRAMPA DE RUTAS: hubo escrituras fuera de las carpetas de test:\n${infracciones}`);
  estado = estado || 1;
}
const llamadas = leer(logClaude);
if (llamadas) {
  console.error(`\n✗ Algún test intentó llamar a \`claude\` sin el falso:\n${llamadas}`);
  estado = estado || 1;
}
if (hashConfig() !== hashInicial) {
  console.error('\n✗ ~/.config/finhub/config.json ha cambiado durante los tests.');
  estado = estado || 1;
}
rmSync(base, { recursive: true, force: true });
process.exit(estado);
