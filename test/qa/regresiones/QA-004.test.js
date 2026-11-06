// QA-003 a QA-006 · La guardia no se puede saltar: sin init no hay ejecución válida, un init malformado aborta,
// el ruido en el stream no tira el servidor y un tool_use prohibido se ve también en el stream parcial.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { ejecutar } from '../../../src/claude/runner.js';
import { revisarInit } from '../../../src/claude/guardia.js';
import { ejecutarTrabajo } from '../../../src/claude/motor.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { taller, ficherosEjemplo, modeloDe, json, HOY } from '../ayuda-claude.js';

let ta;
before(async () => (ta = await taller('guardia')));
after(() => ta.limpiar());
const VALIDO = json({ notas: [], predicciones: [] });
const correr = async (id, pasos, extra = {}) => ejecutar(trabajo(id), { sistema: 'S', usuario: 'x', sandboxBase: ta.base, comando: await ta.guion(pasos), initMs: 3000, timeoutMs: 4000, ...extra });

test('QA-004: un init malformado aborta (nunca se da por bueno ni revienta); los campos nuevos no', () => {
  const t = trabajo('privado');
  const bueno = { tools: [], mcp_servers: [], plugins: [], skills: [], slash_commands: [], permissionMode: 'dontAsk', cwd: '/x' };
  assert.deepEqual(revisarInit({ ...bueno, campoNuevo: { algo: 1 }, otro: 'x' }, t, '/x'), [], 'campos nuevos sin efecto en herramientas ni MCP');
  for (const [nombre, malo] of Object.entries({
    'sin tools': (({ tools, ...x }) => x)(bueno),
    'tools no es lista': { ...bueno, tools: 'Bash' },
    'tools nulo': { ...bueno, tools: null },
    'sin mcp_servers': (({ mcp_servers, ...x }) => x)(bueno),
    'mcp_servers objeto': { ...bueno, mcp_servers: { huddle: { command: 'x' } } },
    'mcp_servers nulo': { ...bueno, mcp_servers: null },
    'herramienta de más': { ...bueno, tools: ['Bash'] },
    'servidor MCP': { ...bueno, mcp_servers: [{ name: 'huddle', status: 'connected' }] },
    'herramienta MCP': { ...bueno, tools: ['mcp__huddle__x'] },
    'plugins no es lista': { ...bueno, plugins: { a: 1 } },
    'skills no es lista': { ...bueno, skills: 3 },
  })) {
    let m;
    assert.doesNotThrow(() => (m = revisarInit(malo, t, '/x')), nombre);
    assert.ok(m.length > 0, `${nombre} debe abortar`);
  }
  assert.ok(revisarInit(null, t, '/x').length > 0, 'init nulo');
});
