#!/usr/bin/env node
// Claude Code falso para los tests (ningún test llama al Claude real). Emite stream-json como el real
// (formato de test/grabaciones/) y deja una traza de lo que recibió: argumentos, entorno, directorio y stdin.
// Uso: node test/fake-claude.js [--escenario X] [--traza f.json | --trazas dir] [--respuesta f.txt | --respuestas dir] [--esperar ms] [--guion f.json] -p …(args de claude)
// --trazas dir: una traza por ejecución (<pid>.json) · la traza lleva args, env, cwd, contenido del cwd y stdin.
// --guion f.json: lista de pasos, en orden (ver pasoDeGuion): {init: {…cambios}} · {sinInit: true} · {emitir: objeto} · {linea: "texto crudo"} ·
//   {crudo: "sin salto de línea"} · {enorme: bytes} · {stderr: "texto"} · {deltas: "texto"} · {responder: "texto"} · {toolUse: "Bash", enStream?: true} ·
//   {esperar: ms} · {salir: código} · {senal: "SIGKILL"} · {hijo: "ruta donde apuntar el pid"} · {colgar: true}
// Con --respuestas, elige <dir>/<trabajo>-<tarea>.txt o <dir>/<trabajo>.txt según la 1.ª línea del sistema «[finhub:trabajo:tarea]».
// Escenarios: respuesta (por defecto) · grabacion:<nombre> · herramienta:<Nombre> · colgado · colgado-tras-init · limite · sin-sesion
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const argv = process.argv.slice(2);
const propios = {};
while (argv.length && argv[0] !== '-p') {
  const k = argv.shift().replace(/^--/, '');
  propios[k] = argv.shift();
}
const valor = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const escenario = propios.escenario ?? 'respuesta';
const sesion = valor('--resume') ?? randomUUID(); // como el real: una sesión nueva por ejecución
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const emitir = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', principal);

function init() {
  const tools = (valor('--tools') ?? '').split(',').filter(Boolean);
  return { type: 'system', subtype: 'init', cwd: process.cwd(), session_id: sesion, tools, mcp_servers: [], model: `claude-${valor('--model') ?? 'opus'}-5-5`, permissionMode: valor('--permission-mode') ?? 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: '2.1.317', skills: [], plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin', source: 'cc-plugin-agents-md@builtin' }, { name: 'cc-plugin-privacy', path: 'builtin', source: 'cc-plugin-privacy@builtin' }] };
}

function responder(texto) {
  emitir({ type: 'system', subtype: 'status', status: 'requesting', session_id: sesion });
  for (const trozo of texto.match(/[\s\S]{1,40}/g) ?? []) emitir({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: trozo } }, session_id: sesion });
  emitir({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: texto }] }, session_id: sesion });
  emitir({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.1, resetsAt: 1793944800 } });
  emitir({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1234, num_turns: 1, result: texto, session_id: sesion, total_cost_usd: 0.0012, usage: { input_tokens: 10, output_tokens: 20 }, terminal_reason: 'completed' });
}

/** Pasos de un guion: permiten emitir exactamente lo que cada prueba necesita (también lo que está mal). */
async function ejecutarGuion(pasos) {
  for (const p of pasos) {
    if (p.init) emitir({ ...init(), ...p.init });
    else if (p.emitir !== undefined) emitir(p.emitir);
    else if (p.linea !== undefined) process.stdout.write(`${p.linea}\n`);
    else if (p.crudo !== undefined) process.stdout.write(p.crudo);
    else if (p.enorme !== undefined) await new Promise((ok) => process.stdout.write(`${'x'.repeat(p.enorme)}\n`, ok));
    else if (p.stderr !== undefined) process.stderr.write(`${p.stderr}\n`);
    else if (p.deltas !== undefined) for (const t of p.deltas.match(/[\s\S]{1,10}/g) ?? []) emitir({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, session_id: sesion });
    else if (p.responder !== undefined) responder(p.responder);
    else if (p.toolUse && p.enStream) emitir({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_s', name: p.toolUse, input: {} } }, session_id: sesion });
    else if (p.toolUse) emitir({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: p.toolUse, input: p.entrada ?? { query: 'x' } }] }, session_id: sesion });
    else if (p.esperar !== undefined) await esperar(p.esperar);
    else if (p.salir !== undefined) return void (process.exitCode = p.salir);
    else if (p.senal) return void process.kill(process.pid, p.senal);
    else if (p.hijo) {
      const h = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      writeFileSync(p.hijo, String(h.pid));
    } else if (p.colgar) await esperar(600000);
  }
}

async function principal() {
  const traza = { pid: process.pid, args: argv, cwd: process.cwd(), env: process.env, stdin, contenidoCwd: readdirSync(process.cwd()), vacio: readdirSync(process.cwd()).length === 0, cwdExiste: statSync(process.cwd()).isDirectory(), escenario };
  if (propios.traza) writeFileSync(propios.traza, JSON.stringify(traza, null, 1));
  if (propios.trazas) writeFileSync(join(propios.trazas, `${process.pid}.json`), JSON.stringify(traza, null, 1));
  if (propios.esperar) await esperar(+propios.esperar);
  if (propios.guion) return ejecutarGuion(JSON.parse(readFileSync(propios.guion, 'utf8')));
  if (escenario === 'colgado') return esperar(60000);
  if (escenario.startsWith('grabacion:')) {
    const lineas = readFileSync(join(import.meta.dirname, 'grabaciones', `${escenario.slice(10)}.jsonl`), 'utf8').split('\n').filter(Boolean);
    for (const l of lineas) process.stdout.write(`${l.replaceAll('/SANDBOX', process.cwd())}\n`);
    const ultima = JSON.parse(lineas.at(-1));
    process.exitCode = ultima.is_error ? 1 : 0;
    return;
  }
  emitir(init());
  if (escenario === 'colgado-tras-init') return esperar(60000);
  if (escenario.startsWith('herramienta:')) {
    emitir({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: escenario.slice(12), input: { command: 'cat ~/FINANZAS/cuentas.md' } }] }, session_id: sesion });
    return esperar(60000);
  }
  if (escenario === 'sin-sesion') {
    emitir({ type: 'assistant', message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: 'Not logged in · Please run /login' }] }, session_id: sesion });
    emitir({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login', terminal_reason: 'api_error', session_id: sesion, total_cost_usd: 0, usage: {} });
    process.exitCode = 1;
    return;
  }
  if (escenario === 'limite') {
    emitir({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1793944800 } });
    return esperar(60000);
  }
  let fichero = propios.respuesta ?? null;
  if (propios.respuestas) {
    const m = /^\[finhub:([a-z-]+)(?::([a-z0-9-]+))?\]/.exec(valor('--system-prompt') ?? '');
    const candidatos = m ? [`${m[1]}-${m[2]}.txt`, `${m[1]}.txt`] : [];
    fichero = candidatos.map((c) => join(propios.respuestas, c)).find((c) => existsSync(c)) ?? null;
  }
  responder(fichero ? readFileSync(fichero, 'utf8') : 'Sin nada que decir.\n\n```json\n{}\n```');
}
