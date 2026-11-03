// Regla R1 (§0): ningún trabajo de Claude junta a la vez datos privados, texto externo y salida a internet.
// Comprobaciones puras sobre la especificación de cada trabajo y sobre su entrada (defensa en profundidad).

export const HERRAMIENTAS_WEB = ['WebSearch', 'WebFetch'];
/** Prohibidas siempre (§0.3.1): disco, terminal, subagentes, tareas y cualquier MCP. */
export const PROHIBIDAS = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'NotebookEdit', 'Task', 'Agent', 'TodoWrite', 'Skill', 'Workflow', 'LS', 'KillShell', 'BashOutput', 'ExitPlanMode', 'SlashCommand'];
/** Niveles de los bloques <datos> (§0.1). */
export const NIVELES = ['privado', 'metadato', 'publico', 'externo'];

/** Problemas de una especificación (vacío = cumple R1 y las reglas de herramientas). */
export function problemasR1(t) {
  const p = [];
  if (t.internet && t.privado && t.externo) p.push(`«${t.id}» junta datos privados, texto externo e internet`);
  const web = t.herramientas.some((h) => HERRAMIENTAS_WEB.includes(h));
  if (web !== !!t.internet) p.push(`«${t.id}»: sus herramientas no coinciden con «internet: ${t.internet}»`);
  if (t.privado && web) p.push(`«${t.id}» es privado y tiene herramientas web`);
  for (const h of t.herramientas) {
    if (!HERRAMIENTAS_WEB.includes(h)) p.push(`«${t.id}» incluye la herramienta no permitida «${h}»`);
    if (PROHIBIDAS.includes(h) || h.startsWith('mcp__')) p.push(`«${t.id}» incluye la herramienta prohibida «${h}»`);
  }
  if (t.privado && t.escribe.some((d) => d.startsWith('conocimiento/'))) p.push(`«${t.id}» es privado y escribe en conocimiento/ (blanqueo, §0.3.7)`);
  if (t.internet && t.escribe.some((d) => /^(mes|cartera|metas|decisiones|analisis|chat\/privado)\b/.test(d))) p.push(`«${t.id}» tiene internet y escribe en datos privados`);
  return p;
}

/**
 * Comprueba la ENTRADA montada para una ejecución: un trabajo con internet nunca recibe bloques privados;
 * los metadatos solo si el trabajo los admite y el usuario lo activó en esta ejecución; un trabajo sin
 * «externo» no recibe texto externo. → lista de problemas (vacía = se puede ejecutar).
 */
export function problemasEntrada(t, bloques, { desclasificar = false } = {}) {
  const p = [];
  for (const b of bloques) {
    if (!NIVELES.includes(b.nivel)) p.push(`bloque «${b.origen}» sin nivel válido`);
    if (b.nivel === 'privado' && !t.privado) p.push(`«${t.id}» no puede recibir datos privados («${b.origen}»)`);
    if (b.nivel === 'privado' && t.internet) p.push(`«${t.id}» tiene internet: nunca recibe datos privados («${b.origen}»)`);
    if (b.nivel === 'metadato' && !(t.metadatos && (desclasificar || t.metadatosSiempre))) p.push(`«${t.id}»: los nombres de tus activos solo van si lo activas en esta ejecución («${b.origen}»)`);
    if (b.nivel === 'externo' && !t.externo) p.push(`«${t.id}» no recibe texto externo («${b.origen}»)`);
    if (t.internet && b.privada) p.push(`«${t.id}» tiene internet: nunca recibe Mis notas («${b.origen}»)`);
  }
  return p;
}
