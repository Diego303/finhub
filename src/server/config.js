// ~/.config/finhub/config.json (§2.6): la ruta de la carpeta de datos y las recientes.
// Está FUERA de la carpeta porque apunta a ella. También el fichero del servidor en marcha.
import fsp from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { carpetasLocales } from './rutas.js';
import { parsearConfig, serializarConfig } from '../core/formato/servicio.js';

const MAX_RECIENTES = 10;

async function escribirAtomico(ruta, texto) {
  await fsp.mkdir(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.finhub-tmp-${randomBytes(3).toString('hex')}`;
  await fsp.writeFile(tmp, texto, { mode: 0o600 });
  await fsp.rename(tmp, ruta);
}

export function rutaConfig(env = process.env) {
  return join(carpetasLocales(env).config, 'config.json');
}

/** → {esquema, carpeta, recientes}. Si no existe, carpeta null. Si está corrupto, error claro (no se pisa). */
export async function leerConfig(env = process.env) {
  let t;
  try {
    t = await fsp.readFile(rutaConfig(env), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { esquema: 1, carpeta: null, recientes: [] };
    throw new Error(`no se puede leer ${rutaConfig(env)}: ${e.code}`);
  }
  const r = parsearConfig(t);
  if (!r.ok) throw new Error(`${rutaConfig(env)} está dañado (${r.error}). Arréglalo o bórralo y vuelve a elegir la carpeta.`);
  return r.valor;
}

/** Fija la carpeta actual; la anterior pasa a «recientes». */
export async function fijarCarpeta(ruta, env = process.env) {
  const c = await leerConfig(env);
  const recientes = [c.carpeta, ...c.recientes].filter((x) => x && x !== ruta).slice(0, MAX_RECIENTES);
  const nueva = { esquema: 1, carpeta: ruta, recientes };
  await escribirAtomico(rutaConfig(env), serializarConfig(nueva));
  return nueva;
}

// ---------- servidor en marcha (para stop/status) ----------
export const rutaServidor = (env = process.env) => join(carpetasLocales(env).cache, 'servidor.json');

export async function leerServidor(env = process.env) {
  try {
    return JSON.parse(await fsp.readFile(rutaServidor(env), 'utf8'));
  } catch {
    return null;
  }
}
export const escribirServidor = (datos, env = process.env) => escribirAtomico(rutaServidor(env), JSON.stringify(datos) + '\n');
export async function borrarServidor(pid, env = process.env) {
  const s = await leerServidor(env);
  if (s && s.pid === pid) await fsp.unlink(rutaServidor(env)).catch(() => {});
}
