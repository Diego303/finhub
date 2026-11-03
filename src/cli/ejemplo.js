// --ejemplo: una copia TEMPORAL de ejemplo/ (datos inventados) que se borra al parar.
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';

const RAIZ_REPO = join(import.meta.dirname, '..', '..');
const PREFIJO = 'finhub-ejemplo-';
const MARCA = join('.finhub', 'ejemplo');

/** Copia ejemplo/ a un directorio temporal nuevo y lo marca. → ruta */
export async function prepararEjemplo({ base = tmpdir() } = {}) {
  await limpiarEjemplosViejos(base);
  const dir = await fsp.mkdtemp(join(base, PREFIJO));
  await fsp.cp(join(RAIZ_REPO, 'ejemplo'), dir, { recursive: true, filter: (f) => basename(f) !== '.gitkeep' });
  await fsp.mkdir(join(dir, '.finhub'), { recursive: true });
  await fsp.writeFile(join(dir, MARCA), `copia temporal de ejemplo/ creada ${new Date().toISOString()}\n`);
  return dir;
}

/** Borra una copia de ejemplo SOLO si es nuestra: nombre con prefijo, en el temporal y con la marca. */
export async function limpiarEjemplo(dir, { base = tmpdir() } = {}) {
  if (dirname(dir) !== base || !basename(dir).startsWith(PREFIJO)) throw new Error(`no es una copia de ejemplo: ${dir}`);
  const marca = await fsp.stat(join(dir, MARCA)).catch(() => null);
  if (!marca) throw new Error(`falta la marca de ejemplo en ${dir}: no se borra`);
  await fsp.rm(dir, { recursive: true, force: true });
}

/** Copias de ejemplo de más de un día que quedaron de ejecuciones anteriores. */
async function limpiarEjemplosViejos(base) {
  const nombres = await fsp.readdir(base).catch(() => []);
  for (const n of nombres.filter((x) => x.startsWith(PREFIJO))) {
    const dir = join(base, n);
    const st = await fsp.stat(join(dir, MARCA)).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 24 * 3600 * 1000) await limpiarEjemplo(dir, { base }).catch(() => {});
  }
}
