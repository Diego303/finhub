// Ayudas para probar el motor de Claude con guiones del Claude falso. Nunca el Claude real.
import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construirModelo } from '../../src/core/modelo.js';
import { Sesiones } from '../../src/claude/registro.js';
import { generar } from '../../scripts/generar-ejemplo.js';

export const FAKE = join(import.meta.dirname, '..', 'fake-claude.js');
export const HOY = '2026-11-03';
export const ficherosEjemplo = () => new Map([...generar()].filter(([r]) => r.endsWith('.md')));
export const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].map(([r, texto]) => [r, { texto, version: 'v' }])));
export const json = (o, texto = 'Hecho.') => `${texto}\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

/** Taller temporal: guiones, sandbox, servicio en memoria y sesiones. Llamar a limpiar() al acabar. */
export async function taller(nombre = 'taller') {
  const dir = await fsp.mkdtemp(join(tmpdir(), `finhub-test-${nombre}-`));
  const ficheros = new Map();
  let n = 0;
  return {
    dir,
    base: join(dir, 'sandbox'),
    ficheros,
    servicio: { leer: async (r) => ficheros.get(r) ?? null, escribir: async (r, t) => void ficheros.set(r, t) },
    sesiones: () => new Sesiones(join(dir, 'sesiones.json')),
    async guion(pasos, extra = {}) {
      const f = join(dir, `guion-${++n}.json`);
      await fsp.writeFile(f, JSON.stringify(pasos));
      return [process.execPath, FAKE, '--guion', f, ...Object.entries(extra).flatMap(([k, v]) => [`--${k}`, v])];
    },
    limpiar: () => fsp.rm(dir, { recursive: true, force: true }),
  };
}
