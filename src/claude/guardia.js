// Guardia del evento «init» (§0.3.3, docs/CLAUDE-CLI.md §4): si Claude Code arranca con algo de más
// (herramientas, MCP, plugins, skills, memoria, permisos o directorio distinto), se aborta antes de que
// pueda ejecutarse ninguna herramienta. No depende de que los flags funcionen.
import { realpathSync } from 'node:fs';

export const PLUGINS_INTERNOS = new Set(['cc-plugin-agents-md', 'cc-plugin-privacy', 'cc-plugin-plugin-authoring', 'cc-plugin-telemetry']);

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** → lista de motivos para abortar (vacía = el arranque es el esperado). */
export function revisarInit(init, trabajo, sandbox) {
  const m = [];
  const tools = [...(init.tools ?? [])].sort();
  const esperadas = [...trabajo.herramientas].sort();
  if (tools.join() !== esperadas.join()) m.push(`herramientas ${JSON.stringify(tools)} ≠ ${JSON.stringify(esperadas)}`);
  if ((init.mcp_servers ?? []).length) m.push(`servidores MCP: ${init.mcp_servers.map((s) => s.name ?? s).join(', ')}`);
  for (const p of init.plugins ?? []) {
    if (p.path !== 'builtin') m.push(`plugin «${p.name}» (${p.path})`);
    else if (!PLUGINS_INTERNOS.has(p.name)) m.push(`plugin interno desconocido «${p.name}»: Claude Code ha cambiado, revisa docs/CLAUDE-CLI.md`);
  }
  if ((init.skills ?? []).length) m.push(`skills: ${init.skills.length}`);
  if ((init.slash_commands ?? []).length) m.push(`comandos: ${init.slash_commands.length}`);
  if (init.memory_paths) m.push('memoria automática activa');
  if (init.permissionMode !== 'dontAsk') m.push(`modo de permisos «${init.permissionMode}»`);
  if (sandbox && real(init.cwd ?? '') !== real(sandbox)) m.push(`directorio «${init.cwd}» distinto del sandbox`);
  return m;
}
