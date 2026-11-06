// Entorno aislado para las pruebas de QA: HOME, config, caché y datos en temporales, copia de ejemplo/,
// servidor real en un puerto libre y parada solo de SU pid. Nunca toca ~/.config/finhub ni una carpeta real.
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

export const RAIZ = resolve(import.meta.dirname, '..', '..');
const PRINCIPAL = join(RAIZ, 'src', 'server', 'principal.js');
const PREFIJO = 'finhub-test-qa-';
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea un entorno nuevo. opciones: {ficheros: Map ruta→texto (si no, copia ejemplo/), vacio: sin datos}
 * → {base, home, datos, env, limpiar()}
 */
export async function crearEntorno({ ficheros = null, vacio = false, nombre = 'qa' } = {}) {
  const base = await fsp.mkdtemp(join(tmpdir(), `${PREFIJO}${nombre}-`));
  const home = join(base, 'home');
  const datos = join(base, 'datos');
  await fsp.mkdir(home, { recursive: true });
  if (ficheros) {
    for (const [r, t] of ficheros) {
      await fsp.mkdir(dirname(join(datos, r)), { recursive: true });
      await fsp.writeFile(join(datos, r), t);
    }
  } else if (!vacio) await fsp.cp(join(RAIZ, 'ejemplo'), datos, { recursive: true, filter: (f) => !f.endsWith('.gitkeep') });
  else await fsp.mkdir(datos, { recursive: true });
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local', 'share') };
  const hijos = new Set();
  return {
    base,
    home,
    datos,
    env,
    hijos,
    async limpiar() {
      for (const h of hijos) await h.parar().catch(() => {});
      if (!base.startsWith(join(tmpdir(), PREFIJO))) throw new Error(`no es un entorno de QA: ${base}`);
      await fsp.rm(base, { recursive: true, force: true });
    },
  };
}

/** Arranca un servidor real (proceso aparte) del entorno. → {pid, puerto, url, parar(), matar()} */
export async function arrancarServidor(ent, { puerto = 0, carpeta = ent.datos, env = {} } = {}) {
  const hijo = spawn(process.execPath, [PRINCIPAL, '--carpeta', carpeta, '--puerto', String(puerto)], { env: { ...ent.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let salida = '';
  hijo.stdout.on('data', (d) => (salida += d));
  hijo.stderr.on('data', (d) => (salida += d));
  const termino = new Promise((ok) => hijo.on('exit', (c, s) => ok({ codigo: c, senal: s })));
  const url = await new Promise((ok, mal) => {
    const t = setInterval(() => {
      const m = /finhub en (http:\/\/127\.0\.0\.1:(\d+)\/)/.exec(salida);
      if (m) {
        clearInterval(t);
        ok(m[1]);
      }
    }, 20);
    hijo.on('exit', () => {
      clearInterval(t);
      mal(new Error(`el servidor no arrancó: ${salida}`));
    });
  });
  const servidor = {
    pid: hijo.pid,
    url,
    puerto: Number(new URL(url).port),
    salida: () => salida,
    async parar() {
      if (hijo.exitCode !== null || hijo.signalCode !== null) return termino;
      hijo.kill('SIGTERM');
      const t = setTimeout(() => hijo.kill('SIGKILL'), 8000);
      const r = await termino;
      clearTimeout(t);
      ent.hijos.delete(servidor);
      return r;
    },
    async matar() {
      hijo.kill('SIGKILL');
      const r = await termino;
      ent.hijos.delete(servidor);
      return r;
    },
  };
  ent.hijos.add(servidor);
  return servidor;
}

/** Petición a un servidor de prueba, con Host y Origin válidos. → {estado, json, texto, cabeceras} */
export async function pedir(servidor, metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${servidor.url.replace(/\/$/, '')}${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json', Origin: servidor.url.replace(/\/$/, ''), ...cabeceras }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* no es JSON */
  }
  return { estado: r.status, json, texto, cabeceras: r.headers };
}
