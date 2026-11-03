#!/usr/bin/env node
// Claude Code falso para los tests (ningún test llama al Claude real). Emite stream-json como el real
// (formato de test/grabaciones/) y deja una traza de lo que recibió: argumentos, entorno, directorio y stdin.
// Uso: node test/fake-claude.js [--escenario X] [--traza f.json] [--respuesta f.txt] [--esperar ms] -p …(args de claude)
// Escenarios: respuesta (por defecto) · grabacion:<nombre> · herramienta:<Nombre> · colgado · colgado-tras-init · limite · sin-sesion
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

async function principal() {
  if (propios.traza) {
    writeFileSync(propios.traza, JSON.stringify({ args: argv, cwd: process.cwd(), env: process.env, stdin, vacio: readdirSync(process.cwd()).length === 0, escenario }, null, 1));
  }
  if (propios.esperar) await esperar(+propios.esperar);
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
  responder(propios.respuesta ? readFileSync(propios.respuesta, 'utf8') : 'Sin nada que decir.\n\n```json\n{}\n```');
}
