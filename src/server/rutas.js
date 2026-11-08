// Rutas: Windows ↔ WSL (§2.6) y carpetas locales de finhub (fuera de la carpeta de datos).
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep, posix } from 'node:path';
import { esReservado } from '../core/ids.js';

/**
 * Convierte una ruta escrita por el usuario a ruta de WSL:
 *   D:\GoogleDrive\FINANZAS → /mnt/d/GoogleDrive/FINANZAS
 *   \\wsl.localhost\Ubuntu\home\x → /home/x   ·   ~/x → $HOME/x   ·   relativa → absoluta
 * Es pura (no llama a wslpath) para que funcione igual en los tests.
 */
export function aRutaWsl(entrada, { home = homedir(), cwd = process.cwd() } = {}) {
  let r = String(entrada ?? '').trim().replace(/^["']|["']$/g, '');
  if (!r) throw new Error('la ruta está vacía');
  if (/[\0]/.test(r)) throw new Error('la ruta contiene caracteres no válidos');
  let m = /^([a-zA-Z]):(?:[\\/](.*))?$/.exec(r);
  if (m) return posix.normalize(`/mnt/${m[1].toLowerCase()}/${(m[2] ?? '').replaceAll('\\', '/')}`).replace(/\/$/, '') || '/';
  m = /^\\\\(?:wsl\$|wsl\.localhost)\\[^\\]+(\\.*)?$/i.exec(r);
  if (m) return posix.normalize((m[1] ?? '\\').replaceAll('\\', '/')).replace(/(.)\/$/, '$1');
  if (/^\\\\/.test(r)) throw new Error('las rutas de red (\\\\servidor\\…) no se admiten; usa una unidad o una carpeta local');
  if (r === '~' || r.startsWith('~/')) r = join(home, r.slice(1));
  return resolve(cwd, r);
}

/** Ruta de WSL → como la vería Windows (para mostrarla). /mnt/d/x → D:\x; el resto, \\wsl.localhost\… */
export function aRutaWindows(ruta, { distro = process.env.WSL_DISTRO_NAME || 'Ubuntu' } = {}) {
  const m = /^\/mnt\/([a-z])(?:\/(.*))?$/.exec(ruta);
  if (m) return `${m[1].toUpperCase()}:\\${(m[2] ?? '').replaceAll('/', '\\')}`;
  return `\\\\wsl.localhost\\${distro}${ruta.replaceAll('/', '\\')}`;
}

/** ¿`hijo` está dentro de `padre` (o es la misma)? */
export function dentroDe(hijo, padre) {
  const rel = relative(resolve(padre), resolve(hijo));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Ruta relativa de un fichero de datos → absoluta dentro de la carpeta, o error si intenta salir (§2.2).
 * Solo se admiten separadores "/" y nombres sin ".." ni rutas absolutas.
 */
export function rutaSegura(raiz, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || rel.includes('\\') || isAbsolute(rel) || rel.split('/').some((p) => p === '..' || p === '.' || p === '' || esReservado(p))) {
    throw new Error(`ruta no permitida: «${rel}»`);
  }
  const abs = resolve(raiz, rel);
  if (!abs.startsWith(resolve(raiz) + sep)) throw new Error(`ruta no permitida: «${rel}»`);
  return abs;
}

/** Carpetas locales (XDG), nunca dentro de la carpeta de datos ni sincronizadas. */
export function carpetasLocales(env = process.env) {
  const home = env.HOME || homedir();
  return {
    config: join(env.XDG_CONFIG_HOME || join(home, '.config'), 'finhub'),
    cache: join(env.XDG_CACHE_HOME || join(home, '.cache'), 'finhub'),
    datos: join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'finhub'),
  };
}
