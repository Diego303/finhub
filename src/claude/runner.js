// Runner de Claude Code (§8.1, docs/CLAUDE-CLI.md): argumentos por trabajo, entorno mínimo, sandbox vacío
// por ejecución, prompt por stdin, lectura del stream-json, guardia del init y de cada tool_use, timeouts,
// cancelación y errores con mensaje claro. Nunca escribe en tu carpeta de datos.
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { join, basename } from 'node:path';
import { revisarInit } from './guardia.js';
import { PROHIBIDAS, HERRAMIENTAS_WEB } from './r1.js';

export const INIT_MS = 15000;

/** Argumentos de `claude` para un trabajo (verificados en F0). */
export function argumentos(trabajo, { sistema, modelo = trabajo.modelo, resume = null, persistir = trabajo.sesion ?? false, maxTurns = trabajo.maxTurns } = {}) {
  const prohibidas = [...PROHIBIDAS, ...HERRAMIENTAS_WEB.filter((h) => !trabajo.herramientas.includes(h))];
  const a = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--system-prompt', sistema, '--tools', trabajo.herramientas.join(','), '--allowedTools', trabajo.herramientas.join(' '), '--disallowedTools', prohibidas.join(' '), '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--disable-slash-commands', '--settings', '{"autoMemoryEnabled":false}', '--max-turns', String(maxTurns), '--model', modelo];
  if (resume) a.push('--resume', resume);
  else if (!persistir) a.push('--no-session-persistence');
  return a;
}

/** Entorno mínimo (§0.3.5): nada con rutas de tus datos. */
export function entornoMinimo(env = process.env) {
  return { HOME: env.HOME, PATH: env.PATH, LANG: 'C.UTF-8', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' };
}

/** Sandbox nuevo y vacío por ejecución (§0.3.4), fuera de tu carpeta de datos. */
export async function crearSandbox(base) {
  await fsp.mkdir(base, { recursive: true });
  const dir = await fsp.mkdtemp(join(base, 'sbx-'));
  if ((await fsp.readdir(dir)).length) throw new Error('el sandbox no está vacío');
  return dir;
}
export async function borrarSandbox(dir, base) {
  if (!dir || !dir.startsWith(base) || !basename(dir).startsWith('sbx-')) throw new Error(`no es un sandbox de finhub: ${dir}`);
  await fsp.rm(dir, { recursive: true, force: true });
}

const MENSAJES = {
  no_instalado: 'No encuentro `claude` en WSL. Instálalo (Claude Code) y vuelve a probar.',
  sin_sesion: 'Claude no tiene sesión iniciada: abre una terminal de WSL, ejecuta `claude` y luego `/login`.',
  limite: 'Has llegado al límite de uso de Claude.',
  turnos: 'El trabajo necesitó más pasos de los permitidos.',
  timeout: 'Claude tardó demasiado y se ha parado el trabajo.',
  cancelado: 'Has cancelado el trabajo.',
  guardia: 'Claude Code arrancó con algo que no debía (herramientas, MCP o plugins): se ha abortado por seguridad.',
  sin_init: 'Claude Code no respondió al arrancar.',
  fallo: 'Claude terminó con un error.',
};

/**
 * Ejecuta un trabajo. → Promise<{estado: ok|error, codigo?, mensaje?, texto, sesion, init, herramientas, resultado, motivos?}>
 * opciones: {sistema, usuario, sandboxBase, comando = ['claude'], modelo, resume, persistir, timeoutMs, initMs, senal, alEvento, maxTurns}
 */
export async function ejecutar(trabajo, { sistema, usuario, sandboxBase, comando = ['claude'], modelo, resume = null, persistir = trabajo.sesion ?? false, timeoutMs = trabajo.timeoutMs, initMs = INIT_MS, senal = null, alEvento = () => {}, env = process.env, maxTurns = trabajo.maxTurns }) {
  const sandbox = await crearSandbox(sandboxBase);
  const herramientas = [];
  let texto = '';
  let textoDeltas = '';
  let init = null;
  let resultado = null;
  let limite = null;
  let fin = null; // {estado, codigo, motivos}
  const args = argumentos(trabajo, { sistema, modelo, resume, persistir, maxTurns });
  try {
    return await new Promise((resolver) => {
      let hijo;
      try {
        hijo = spawn(comando[0], [...comando.slice(1), ...args], { cwd: sandbox, env: entornoMinimo(env), stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        resolver({ estado: 'error', codigo: e.code === 'ENOENT' ? 'no_instalado' : 'fallo', mensaje: e.code === 'ENOENT' ? MENSAJES.no_instalado : e.message, texto: '', herramientas });
        return;
      }
      const temporizadores = [];
      const parar = (estado, codigo, motivos = []) => {
        if (fin) return;
        fin = { estado, codigo, motivos };
        hijo.kill(codigo === 'guardia' ? 'SIGKILL' : 'SIGTERM');
        temporizadores.push(setTimeout(() => hijo.kill('SIGKILL'), 5000));
      };
      temporizadores.push(setTimeout(() => !init && parar('error', 'sin_init'), initMs));
      temporizadores.push(setTimeout(() => parar('error', 'timeout'), timeoutMs));
      const alAbortar = () => parar('error', 'cancelado');
      senal?.addEventListener('abort', alAbortar, { once: true });
      let resto = '';
      let stderr = '';
      const linea = (l) => {
        if (!l.trim()) return;
        let ev;
        try {
          ev = JSON.parse(l);
        } catch {
          return;
        }
        if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return; // «null», números…: ruido, no un evento
        if (ev.type === 'system' && ev.subtype === 'init') {
          init = ev;
          const motivos = revisarInit(ev, trabajo, sandbox);
          if (motivos.length) return parar('error', 'guardia', motivos);
          alEvento({ tipo: 'init', modelo: ev.model, sesion: ev.session_id });
        } else if (ev.type === 'stream_event' && ev.event?.delta?.type === 'text_delta' && typeof ev.event.delta.text === 'string') {
          textoDeltas += ev.event.delta.text;
          alEvento({ tipo: 'texto', delta: ev.event.delta.text });
        } else if (ev.type === 'assistant') {
          const contenido = Array.isArray(ev.message?.content) ? ev.message.content : [];
          for (const b of contenido) {
            if (b?.type === 'tool_use') {
              herramientas.push({ nombre: b.name, entrada: resumirEntrada(b.input) });
              if (!trabajo.herramientas.includes(b.name)) return parar('error', 'guardia', [`herramienta no permitida «${b.name}»`]);
              alEvento({ tipo: 'herramienta', nombre: b.name, entrada: resumirEntrada(b.input) });
            } else if (b?.type === 'text' && typeof b.text === 'string') texto += b.text;
          }
        } else if (ev.type === 'rate_limit_event') {
          limite = ev.rate_limit_info;
          if (limite?.status === 'rejected') parar('error', 'limite');
        } else if (ev.type === 'result' || (ev.session_id && ev.stop_reason !== undefined && ev.usage)) resultado = ev;
      };
      hijo.stdout.on('data', (d) => {
        resto += d.toString('utf8');
        let i;
        while ((i = resto.indexOf('\n')) >= 0) {
          linea(resto.slice(0, i));
          resto = resto.slice(i + 1);
        }
      });
      hijo.stderr.on('data', (d) => (stderr = (stderr + d.toString('utf8')).slice(-4000)));
      hijo.on('error', (e) => {
        fin ??= { estado: 'error', codigo: e.code === 'ENOENT' ? 'no_instalado' : 'fallo', motivos: [e.message] };
      });
      hijo.on('close', (codigoSalida) => {
        if (resto) linea(resto);
        for (const t of temporizadores) clearTimeout(t);
        senal?.removeEventListener('abort', alAbortar);
        let r = fin;
        const final = resultado?.result ?? (texto || textoDeltas);
        if (!r) {
          const errorTexto = `${resultado?.result ?? ''} ${resultado?.errors?.join(' ') ?? ''} ${stderr}`;
          if (resultado?.subtype === 'error_max_turns' || resultado?.terminal_reason === 'max_turns') r = { estado: 'error', codigo: 'turnos' };
          else if (/not logged in|please run \/login/i.test(errorTexto)) r = { estado: 'error', codigo: 'sin_sesion' };
          else if (resultado?.is_error || codigoSalida) r = { estado: 'error', codigo: 'fallo', motivos: [errorTexto.trim().slice(0, 300)] };
          // sin init no se ha podido comprobar el aislamiento: la salida no vale, aunque el proceso acabe bien (§0.3.3)
          else if (!init) r = { estado: 'error', codigo: 'sin_init' };
          else r = { estado: 'ok' };
        }
        resolver({
          estado: r.estado,
          codigo: r.codigo ?? null,
          mensaje: r.codigo ? `${MENSAJES[r.codigo]}${r.codigo === 'limite' && limite?.resetsAt ? ` Se renueva el ${new Date(limite.resetsAt * 1000).toLocaleString('es-ES')}.` : ''}` : null,
          motivos: r.motivos ?? [],
          texto: final,
          sesion: init?.session_id ?? resultado?.session_id ?? null,
          init: init ? { modelo: init.model, version: init.claude_code_version, herramientas: init.tools } : null,
          herramientas,
          resultado: resultado ? { duracionMs: resultado.duration_ms ?? null, turnos: resultado.num_turns ?? null, coste: resultado.total_cost_usd ?? null } : null,
          limite: limite ? { estado: limite.status, uso: limite.utilization ?? null, renueva: limite.resetsAt ?? null } : null,
        });
      });
      hijo.stdin.on('error', () => {});
      hijo.stdin.end(usuario);
    });
  } finally {
    await borrarSandbox(sandbox, sandboxBase).catch(() => {});
  }
}

/** Entrada de una herramienta para el registro (sin textos largos). */
function resumirEntrada(input) {
  if (!input || typeof input !== 'object') return '';
  const v = input.query ?? input.url ?? JSON.stringify(input);
  return String(v).slice(0, 200);
}
