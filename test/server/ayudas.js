// Ayudas para los tests del servidor: carpetas temporales (nunca carpetas reales del usuario).
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { generar } from '../../scripts/generar-ejemplo.js';

const EJEMPLO = generar();

/** Directorio temporal nuevo con prefijo propio. */
export const temporal = (nombre = 'prueba') => fsp.mkdtemp(join(tmpdir(), `finhub-test-${nombre}-`));

/** Carpeta de datos temporal con los ficheros del ejemplo (o los dados). */
export async function carpetaDeEjemplo(ficheros = EJEMPLO, nombre = 'datos') {
  const raiz = await temporal(nombre);
  for (const [ruta, texto] of ficheros) {
    await fsp.mkdir(dirname(join(raiz, ruta)), { recursive: true });
    await fsp.writeFile(join(raiz, ruta), texto);
  }
  return raiz;
}

/** Borra un temporal SOLO si es de los nuestros. */
export async function borrarTemporal(dir) {
  if (!dir || !dir.startsWith(join(tmpdir(), 'finhub-test-'))) throw new Error(`no es un temporal de test: ${dir}`);
  await fsp.chmod(dir, 0o755).catch(() => {});
  await fsp.rm(dir, { recursive: true, force: true });
}

/** Entorno con XDG apuntando a un temporal (config, caché y datos locales de finhub). */
export async function entornoAislado() {
  const base = await temporal('xdg');
  return { base, env: { ...process.env, XDG_CONFIG_HOME: join(base, 'config'), XDG_CACHE_HOME: join(base, 'cache'), XDG_DATA_HOME: join(base, 'data') } };
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
export { EJEMPLO };
