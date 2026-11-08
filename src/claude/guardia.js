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

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** → lista de motivos para abortar (vacía = el arranque es el esperado). Falla cerrado: lo que no se entiende, aborta. */
export function revisarInit(init, trabajo, sandbox) {
  if (!esObjeto(init)) return ['el evento init está malformado'];
  const m = [];
  if (!Array.isArray(init.tools)) m.push('el init no trae la lista de herramientas');
  else {
    const tools = [...init.tools].sort();
    const esperadas = [...trabajo.herramientas].sort();
    if (tools.join() !== esperadas.join()) m.push(`herramientas ${JSON.stringify(tools)} ≠ ${JSON.stringify(esperadas)}`);
  }
  if (!Array.isArray(init.mcp_servers)) m.push('el init no trae la lista de servidores MCP');
  else if (init.mcp_servers.length) m.push(`servidores MCP: ${init.mcp_servers.map((s) => s?.name ?? s).join(', ')}`);
  // estas listas pueden faltar en otra versión; si vienen con otro tipo, no se entienden
  for (const k of ['plugins', 'skills', 'slash_commands']) if (init[k] !== undefined && !Array.isArray(init[k])) m.push(`el campo «${k}» del init no es una lista`);
  for (const p of Array.isArray(init.plugins) ? init.plugins : []) {
    if (p?.path !== 'builtin') m.push(`plugin «${p?.name}» (${p?.path})`);
    else if (!PLUGINS_INTERNOS.has(p.name)) m.push(`plugin interno desconocido «${p.name}»: Claude Code ha cambiado, revisa docs/CLAUDE-CLI.md`);
  }
  if (Array.isArray(init.skills) && init.skills.length) m.push(`skills: ${init.skills.length}`);
  if (Array.isArray(init.slash_commands) && init.slash_commands.length) m.push(`comandos: ${init.slash_commands.length}`);
  if (init.memory_paths) m.push('memoria automática activa');
  if (init.permissionMode !== 'dontAsk') m.push(`modo de permisos «${init.permissionMode}»`);
  if (sandbox && real(init.cwd ?? '') !== real(sandbox)) m.push(`directorio «${init.cwd}» distinto del sandbox`);
  return m;
}
