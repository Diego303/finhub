// Arranque con Windows (§10 F12): un único fichero `finhub.vbs` en la carpeta «Inicio» de tu usuario de
// Windows, que lanza finhub en WSL sin ventana. Solo se crea o se quita con `finhub arranque activar |
// desactivar`, y solo se borra si es nuestro (lleva la marca). FINHUB_STARTUP_DIR lo cambia (tests).
import fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const MARCA = "' finhub · arranque con Windows (creado por «finhub arranque activar»)";
const NOMBRE = 'finhub.vbs';

/** Carpeta Inicio de Windows vista desde WSL (o FINHUB_STARTUP_DIR). → ruta | null */
export function carpetaInicio(env = process.env) {
  if (env.FINHUB_STARTUP_DIR) return env.FINHUB_STARTUP_DIR;
  try {
    const appdata = execFileSync('/mnt/c/Windows/System32/cmd.exe', ['/c', 'echo %APPDATA%'], { cwd: '/mnt/c', encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!/^[A-Z]:\\/i.test(appdata)) return null;
    const wsl = `/mnt/${appdata[0].toLowerCase()}/${appdata.slice(3).replaceAll('\\', '/')}`;
    const dir = join(wsl, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

/** Contenido del .vbs: wsl.exe en tu distribución, finhub en primer plano y sin ventana (0). */
export function scriptVbs({ distro, node, finhub }) {
  const q = (s) => String(s).replaceAll('"', '""');
  const orden = `wsl.exe -d ${distro} -- "${node}" "${finhub}" --primer-plano --silencioso`;
  return `${MARCA}\r\n' Para quitarlo: finhub arranque desactivar (o borra este fichero).\r\nCreateObject("WScript.Shell").Run "${q(orden)}", 0, False\r\n`;
}

export async function estadoArranque(env = process.env) {
  const dir = carpetaInicio(env);
  if (!dir) return { dir: null, activo: false };
  const f = join(dir, NOMBRE);
  const t = await fsp.readFile(f, 'utf8').catch(() => null);
  return { dir, fichero: f, activo: t !== null && t.startsWith(MARCA), ajeno: t !== null && !t.startsWith(MARCA) };
}

export async function arranque(accion, { out, env = process.env, node = process.execPath, finhub = join(import.meta.dirname, '..', '..', 'bin', 'finhub.js') } = {}) {
  const e = await estadoArranque(env);
  if (!e.dir) {
    out('No encuentro la carpeta «Inicio» de Windows desde WSL. Puedes copiar a mano scripts/windows/finhub-arranque.vbs (ver README).');
    return 1;
  }
  if (accion === 'estado' || !accion) {
    out(e.activo ? `finhub arranca con Windows (${e.fichero})` : 'finhub no arranca con Windows');
    return 0;
  }
  if (accion === 'activar') {
    if (e.ajeno) {
      out(`Ya hay un ${NOMBRE} en ${e.dir} que no es de finhub: no lo toco.`);
      return 1;
    }
    const distro = env.WSL_DISTRO_NAME;
    if (!distro) {
      out('No sé en qué distribución de WSL estás (falta WSL_DISTRO_NAME).');
      return 1;
    }
    await fsp.writeFile(e.fichero, scriptVbs({ distro, node, finhub }));
    out(`✓ finhub arrancará con Windows, sin ventana (${e.fichero})`);
    return 0;
  }
  if (accion === 'desactivar') {
    if (!e.activo) {
      out(e.ajeno ? `El ${NOMBRE} de ${e.dir} no es de finhub: no lo toco.` : 'finhub no arrancaba con Windows');
      return 0;
    }
    await fsp.unlink(e.fichero);
    out('✓ finhub ya no arranca con Windows');
    return 0;
  }
  out('uso: finhub arranque [activar | desactivar | estado]');
  return 2;
}
