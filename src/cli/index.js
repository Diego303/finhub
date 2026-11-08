// CLI de finhub (§2.3): start | stop | status | carpeta [ruta]
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { openSync, existsSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { leerConfig, fijarCarpeta, leerServidor, rutaConfig, rutaServidor } from '../server/config.js';
import { aRutaWsl, aRutaWindows, carpetasLocales } from '../server/rutas.js';
import { validarDestino, cambiarCarpeta } from '../server/carpeta.js';
import { prepararEjemplo } from './ejemplo.js';
import { arranque } from './arranque.js';
import { leer } from '../core/formato/index.js';
import { valores } from '../core/formato/motor.js';

export const AYUDA = `finhub · tu dinero en local

Uso:
  finhub [start]            arranca el servidor en 127.0.0.1:4747 y abre el navegador
  finhub stop | status      para el servidor o muestra su estado
  finhub carpeta [ruta]     muestra o cambia la carpeta de datos (ruta de Windows o de WSL)
      --usar      usa una carpeta que ya tiene datos de finhub
      --copiar    copia tus datos a la nueva carpeta (la antigua queda intacta)
      --mover     copia, verifica y manda la antigua a la papelera (pide confirmación)
      --crear     crea una carpeta de finhub nueva y vacía
      --si        no preguntar (confirma)
  finhub arranque [activar | desactivar | estado]
                            arrancar finhub (sin ventana) al iniciar Windows

Opciones:
  --datos <ruta>   usa esa carpeta solo en esta ejecución
  --puerto <n>     puerto (por defecto el de ajustes.md, 4747, o el siguiente libre)
  --silencioso     no abre el navegador
  --ejemplo        usa una copia temporal de ejemplo/ (datos inventados)
  --primer-plano   no se separa de la terminal (Ctrl+C para parar)
  -h, --help       esta ayuda`;

const OPCIONES = {
  datos: { type: 'string' },
  puerto: { type: 'string' },
  silencioso: { type: 'boolean' },
  ejemplo: { type: 'boolean' },
  'primer-plano': { type: 'boolean' },
  usar: { type: 'boolean' },
  copiar: { type: 'boolean' },
  mover: { type: 'boolean' },
  crear: { type: 'boolean' },
  si: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

/** Cliente HTTP mínimo contra el servidor local (con Host y Origin correctos). */
export async function llamar(servidor, metodo, ruta, cuerpo) {
  const r = await fetch(`http://127.0.0.1:${servidor.puerto}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${servidor.puerto}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(metodo === 'GET' ? 3000 : 600000),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `HTTP ${r.status}`);
  return datos;
}

/** El servidor registrado, si de verdad responde con ese pid. */
export async function servidorVivo(env = process.env) {
  const s = await leerServidor(env);
  if (!s) return null;
  try {
    const salud = await llamar(s, 'GET', '/api/salud');
    return salud.pid === s.pid ? { ...s, salud } : null;
  } catch {
    return null;
  }
}

export function abrirNavegador(url, { candidatos = [['wslview', [url]], ['/mnt/c/Windows/explorer.exe', [url]], ['xdg-open', [url]]], env = process.env } = {}) {
  for (const [cmd, args] of candidatos) {
    if (cmd.startsWith('/') ? !existsSync(cmd) : !env.PATH?.split(':').some((d) => existsSync(join(d, cmd)))) continue;
    try {
      const p = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: cmd.includes('/mnt/c/') ? '/mnt/c' : undefined });
      p.on('error', () => {});
      p.unref();
      return true;
    } catch {
      /* siguiente */
    }
  }
  return false;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function preguntar(texto) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(`${texto} [s/N] `);
  rl.close();
  return /^s(i|í)?$/i.test(r.trim());
}

/** Puerto de `ajustes.md` de la carpeta (o 4747): la opción --puerto manda. */
export async function puertoDeCarpeta(carpeta) {
  const t = await fsp.readFile(join(carpeta, 'ajustes.md'), 'utf8').catch(() => null);
  const p = t ? valores(leer('ajustes.md', t)).puerto : null;
  return Number.isInteger(p) ? p : 4747;
}

/**
 * Carpetas sugeridas para la primera vez (§14.17): dentro de Google Drive u OneDrive si existen (desde WSL),
 * o ~/FINANZAS. Solo se sugieren: nada se crea sin que lo confirmes.
 */
export function sugerirCarpetas(env = process.env, existe = existsSync) {
  const out = [];
  const usuario = env.USER ?? '';
  for (const unidad of ['d', 'e', 'c']) {
    if (existe(`/mnt/${unidad}/GoogleDrive`)) out.push(`${unidad.toUpperCase()}:\\GoogleDrive\\FINANZAS`);
    if (existe(`/mnt/${unidad}/Google Drive`)) out.push(`${unidad.toUpperCase()}:\\Google Drive\\FINANZAS`);
  }
  for (const u of [usuario, usuario.charAt(0).toUpperCase() + usuario.slice(1)].filter(Boolean)) {
    if (existe(`/mnt/c/Users/${u}/OneDrive`)) out.push(`C:\\Users\\${u}\\OneDrive\\FINANZAS`);
  }
  out.push(join(env.HOME ?? '/tmp', 'FINANZAS'));
  return [...new Set(out)];
}

/** Primera vez en la terminal: ¿dónde guardo tus datos? (crear o usar). → ruta WSL o null */
async function primeraVez({ out, env }) {
  const sug = sugerirCarpetas(env);
  out('Bienvenido a finhub. Todo se guarda en una carpeta de Markdown que puedes sincronizar.');
  if (sug.length > 1) out(`Sugerencias:\n${sug.map((x) => `  ${x}`).join('\n')}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = ((await rl.question(`¿Dónde guardo tus datos? [${sug[0]}] `)).trim() || sug[0]).replace(/^"|"$/g, '');
  rl.close();
  const val = await validarDestino(r, { actual: null });
  if (!val.ok) {
    out(`✗ ${val.errores.join('; ')}`);
    return null;
  }
  for (const a of val.avisos) out(`⚠ ${a}`);
  if (val.estado === 'ajena' && !(await preguntar('Esa carpeta tiene otros ficheros que no son de finhub. ¿Crear finhub ahí igualmente?'))) return null;
  const modo = val.estado === 'finhub' ? 'usar' : 'crear';
  if (!(await preguntar(`${modo === 'usar' ? 'Usar los datos de finhub que ya hay en' : 'Crear finhub en'} ${aRutaWindows(val.ruta)}?`))) return null;
  const res = await cambiarCarpeta({ entrada: r, modo, actual: null, aceptarAjenos: val.estado === 'ajena' });
  await fijarCarpeta(res.ruta, env);
  out(`✓ carpeta de datos: ${aRutaWindows(res.ruta)}${modo === 'crear' ? ' · al abrir el navegador te guío con lo demás' : ''}`);
  return res.ruta;
}

// ---------- comandos ----------
async function start(v, { out, env }) {
  const vivo = await servidorVivo(env);
  if (vivo) {
    out(`finhub ya está en marcha en ${vivo.url} (carpeta ${aRutaWindows(vivo.carpeta)})`);
    if (v.datos || v.ejemplo) out('aviso: para usar otra carpeta, primero «finhub stop»');
    if (!v.silencioso) abrirNavegador(vivo.url);
    return 0;
  }
  let carpeta;
  let ejemplo = null;
  if (v.ejemplo) carpeta = ejemplo = await prepararEjemplo();
  else if (v.datos) carpeta = aRutaWsl(v.datos);
  else carpeta = (await leerConfig(env)).carpeta;
  if (!carpeta && process.stdin.isTTY && !v.silencioso) carpeta = await primeraVez({ out, env });
  if (!carpeta) {
    out('Aún no has elegido carpeta de datos. Elige una con:\n  finhub carpeta "D:\\GoogleDrive\\FINANZAS" --crear   (o --usar si ya tiene datos)\no prueba con datos inventados: finhub --ejemplo');
    return 1;
  }
  const puerto = v.puerto ? Number(v.puerto) : await puertoDeCarpeta(carpeta);
  if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
    out(`puerto no válido: ${v.puerto}`);
    return 2;
  }
  if (v['primer-plano']) {
    const { arrancarServidor } = await import('../server/principal.js');
    const app = await arrancarServidor({ carpeta, puerto, ejemplo, log: out, env });
    if (!v.silencioso) abrirNavegador(app.url);
    return null; // sigue vivo
  }
  const { cache } = carpetasLocales(env);
  await fsp.mkdir(cache, { recursive: true });
  const log = openSync(join(cache, 'servidor.log'), 'a');
  const args = [join(import.meta.dirname, '..', 'server', 'principal.js'), '--carpeta', carpeta, '--puerto', String(puerto), ...(ejemplo ? ['--ejemplo', ejemplo] : [])];
  const hijo = spawn(process.execPath, args, { detached: true, stdio: ['ignore', log, log], env });
  hijo.unref();
  for (let i = 0; i < 100; i++) {
    await esperar(150);
    const s = await servidorVivo(env);
    if (s && s.pid === hijo.pid) {
      out(`finhub en ${s.url} · carpeta ${aRutaWindows(s.carpeta)}${ejemplo ? ' (ejemplo temporal, se borra al parar)' : ''}`);
      if (!v.silencioso) abrirNavegador(s.url);
      return 0;
    }
    if (hijo.exitCode !== null) break;
  }
  out(`no se pudo arrancar finhub. Mira ${join(cache, 'servidor.log')}`);
  return 1;
}

async function stop(v, { out, env }) {
  const s = await leerServidor(env);
  const vivo = await servidorVivo(env);
  if (!vivo) {
    if (s) await fsp.unlink(rutaServidor(env)).catch(() => {});
    out('finhub no está en marcha');
    return 0;
  }
  process.kill(vivo.pid, 'SIGTERM');
  for (let i = 0; i < 70; i++) {
    await esperar(150);
    if (!(await servidorVivo(env))) {
      out('finhub parado');
      return 0;
    }
  }
  out('finhub no responde a la parada; prueba de nuevo');
  return 1;
}

async function status(v, { out, env }) {
  const vivo = await servidorVivo(env);
  const config = await leerConfig(env).catch((e) => ({ error: e.message }));
  if (!vivo) {
    out(`finhub no está en marcha · carpeta configurada: ${config.carpeta ? aRutaWindows(config.carpeta) : '(ninguna)'}`);
    return 3;
  }
  const e = await llamar(vivo, 'GET', '/api/estado');
  out(`finhub en marcha en ${vivo.url} (pid ${vivo.pid})`);
  out(`carpeta: ${e.carpeta.rutaWindows}${e.carpeta.ejemplo ? ' (ejemplo temporal)' : ''} · ${e.carpeta.ficheros} ficheros`);
  if (e.soloLectura) out(`SOLO LECTURA: ${e.candado.aviso}`);
  if (e.conflictos.length) out(`⚠ conflictos de sincronización: ${e.conflictos.map((c) => c.ruta).join(', ')}`);
  if (e.nube.length) out(`⚠ ficheros que no se pueden leer (¿solo en la nube?): ${e.nube.map((n) => n.ruta).join(', ')}`);
  return 0;
}

async function carpeta(v, posicionales, { out, env }) {
  const ruta = posicionales[1];
  const config = await leerConfig(env);
  if (!ruta) {
    out(config.carpeta ? `carpeta de datos: ${aRutaWindows(config.carpeta)}  (WSL: ${config.carpeta})` : 'aún no hay carpeta de datos');
    if (config.recientes.length) out(`recientes:\n${config.recientes.map((r) => '  ' + aRutaWindows(r)).join('\n')}`);
    out(`(se guarda en ${rutaConfig(env)})`);
    return 0;
  }
  const modos = ['usar', 'copiar', 'mover', 'crear'].filter((m) => v[m]);
  if (modos.length > 1) {
    out('elige solo uno: --usar, --copiar, --mover o --crear');
    return 2;
  }
  let modo = modos[0];
  const val = await validarDestino(ruta, { actual: config.carpeta });
  if (!val.ok) {
    out(`✗ ${val.errores.join('; ')}`);
    return 1;
  }
  for (const a of val.avisos) out(`⚠ ${a}`);
  if (!modo) {
    if (config.carpeta) {
      out('elige qué hacer con tus datos: --mover, --copiar o --usar (si la nueva ya tiene datos de finhub)');
      return 2;
    }
    modo = val.estado === 'finhub' ? 'usar' : ['vacia', 'no-existe'].includes(val.estado) ? 'crear' : null;
    if (!modo) {
      out('esa carpeta tiene ficheros que no son de finhub: usa --crear para crear finhub ahí igualmente');
      return 2;
    }
  }
  const aceptarAjenos = val.estado === 'ajena' && (v.si || (await preguntar('La carpeta tiene otros ficheros. ¿Seguir?')));
  let confirmarBorrado = false;
  if (modo === 'mover') confirmarBorrado = v.si || (await preguntar(`Tras copiar y verificar, ¿mando la carpeta antigua (${aRutaWindows(config.carpeta)}) a la papelera?`));
  const vivo = await servidorVivo(env);
  let res;
  if (vivo && !vivo.ejemplo && vivo.carpeta === config.carpeta) {
    res = await llamar(vivo, 'POST', '/api/carpeta/cambiar', { ruta, modo, confirmarBorrado, aceptarAjenos });
  } else {
    res = await cambiarCarpeta({ entrada: ruta, modo, actual: config.carpeta, confirmarBorrado, aceptarAjenos, progreso: ({ hechos, total }) => hechos % 50 === 0 && out(`  ${hechos}/${total}…`) });
    await fijarCarpeta(res.ruta, env);
  }
  out(`✓ carpeta de datos: ${aRutaWindows(res.ruta)} (${modo}${res.ficheros ? `, ${res.ficheros} ficheros verificados` : ''})`);
  if (res.antiguaEnPapelera) out(`  la antigua está en: ${res.antiguaEnPapelera.donde}`);
  for (const a of res.avisos ?? []) out(`⚠ ${a}`);
  return 0;
}

/** → código de salida, o null si el proceso debe seguir vivo (primer plano). */
export async function main(argv, { out = (m) => console.log(m), env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPCIONES, allowPositionals: true });
  } catch (e) {
    out(`${e.message}\n\n${AYUDA}`);
    return 2;
  }
  const { values: v, positionals } = parsed;
  if (v.help) {
    out(AYUDA);
    return 0;
  }
  const comando = positionals[0] ?? 'start';
  try {
    switch (comando) {
      case 'start':
        return await start(v, { out, env });
      case 'stop':
        return await stop(v, { out, env });
      case 'status':
        return await status(v, { out, env });
      case 'carpeta':
        return await carpeta(v, positionals, { out, env });
      case 'arranque':
        return await arranque(positionals[1], { out, env });
      default:
        out(`Comando desconocido: «${comando}».\n\n${AYUDA}`);
        return 2;
    }
  } catch (e) {
    out(`✗ ${e.message}`);
    return 1;
  }
}
