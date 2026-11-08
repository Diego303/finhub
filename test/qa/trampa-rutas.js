// Trampa de rutas (QA0): se carga ANTES de cada test (--import) y hace fallar cualquier escritura de fs fuera
// de os.tmpdir() o de las carpetas de test del repo. Cubre writeFile, appendFile, rename, mkdir, rm, rmdir,
// unlink, copyFile, cp, mkdtemp, symlink, link, truncate, chmod, utimes, open con flags de escritura y streams,
// en sus versiones callback, promesa y síncrona. Además de lanzar el error, anota la infracción en
// FINHUB_TRAMPA_LOG: así un `.catch(() => {})` no la esconde y scripts/test.js falla al final.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const RAIZ = resolve(fileURLToPath(new URL('../..', import.meta.url)));
// el fs original, para que el registro y la autocomprobación no se atrapen a sí mismos
const original = { appendFileSync: fs.appendFileSync, realpathSync: fs.realpathSync };

const real = (p) => {
  try {
    return original.realpathSync(p);
  } catch {
    return p;
  }
};
const PERMITIDAS = [...new Set([tmpdir(), real(tmpdir()), '/tmp', join(RAIZ, 'test'), '/dev', ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? [process.env.PLAYWRIGHT_BROWSERS_PATH] : [])])];

const dentro = (abs) => PERMITIDAS.some((b) => abs === b || abs.startsWith(b + sep));

function aRuta(p) {
  if (typeof p === 'number') return null; // descriptor: ya se comprobó al abrirlo
  if (p instanceof URL) return resolve(fileURLToPath(p));
  if (Buffer.isBuffer(p)) return resolve(p.toString());
  return resolve(String(p));
}

let modoPrueba = false;
/** Solo para la autocomprobación: las infracciones provocadas a propósito no se anotan. */
export async function probandoLaTrampa(fn) {
  modoPrueba = true;
  try {
    return await fn();
  } finally {
    modoPrueba = false;
  }
}

function comprobar(p, que) {
  const abs = aRuta(p);
  if (abs === null || dentro(abs)) return;
  const mensaje = `TRAMPA DE RUTAS: ${que} fuera de las carpetas de test: ${abs}`;
  if (!modoPrueba && process.env.FINHUB_TRAMPA_LOG) {
    try {
      original.appendFileSync(process.env.FINHUB_TRAMPA_LOG, `${mensaje} (pid ${process.pid}, ${process.argv.slice(1).join(' ').slice(0, 120)})\n`);
    } catch {
      /* el error se lanza igual */
    }
  }
  throw Object.assign(new Error(mensaje), { code: 'EFINHUBTRAMPA' });
}

const escribe = (flags) => (typeof flags === 'number' ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0 : /[wax+]/.test(String(flags ?? 'r')));

/** Nombre → qué argumentos son rutas de destino. */
const FUNCIONES = {
  writeFile: [0], appendFile: [0], rename: [0, 1], mkdir: [0], rm: [0], rmdir: [0], unlink: [0], copyFile: [1], cp: [1], mkdtemp: [0], symlink: [1], link: [1], truncate: [0], chmod: [0], chown: [0], utimes: [0], lutimes: [0], lchown: [0],
};

function envolver(obj, nombre, indices, sufijo = '') {
  const fn = obj[nombre + sufijo];
  if (typeof fn !== 'function') return;
  const w = function (...args) {
    for (const i of indices) comprobar(args[i], `${nombre}${sufijo}`);
    return fn.apply(this, args);
  };
  Object.defineProperty(w, 'name', { value: nombre + sufijo });
  for (const k of Object.keys(fn)) w[k] = fn[k];
  obj[nombre + sufijo] = w;
}

for (const [n, idx] of Object.entries(FUNCIONES)) {
  envolver(fs, n, idx);
  envolver(fs, n, idx, 'Sync');
  envolver(fsp, n, idx);
}

for (const [obj, n] of [[fs, 'open'], [fs, 'openSync'], [fsp, 'open']]) {
  const fn = obj[n];
  obj[n] = function (ruta, flags, ...resto) {
    if (typeof flags !== 'function' && escribe(flags)) comprobar(ruta, n);
    return fn.call(this, ruta, flags, ...resto);
  };
}

for (const n of ['createWriteStream']) {
  const fn = fs[n];
  fs[n] = function (ruta, op, ...resto) {
    comprobar(ruta, n);
    return fn.call(this, ruta, op, ...resto);
  };
}

syncBuiltinESMExports();
