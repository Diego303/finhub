# Claude Code CLI · verificación F0

> Verificado el 2026-11-03 en WSL2 (Ubuntu 22.04), **Claude Code 2.1.317**, Node 24.21.0, pnpm 12.6.0.
> Autenticación: **OAuth de claude.ai** (suscripción Max), sin `ANTHROPIC_API_KEY`.
> Todas las pruebas se lanzaron como lo hará finhub: `cwd` en un directorio vacío nuevo y entorno mínimo (`env -i HOME PATH LANG`).
> Coste total de las ~15 ejecuciones de prueba: < 0,10 USD (casi todas con `--model haiku`).

## 1. Resumen de la decisión

**Todas las medidas de aislamiento de §0.3 se pueden garantizar con esta versión.** No hace falta un `CLAUDE_CONFIG_DIR` dedicado.

Comando de un trabajo **sin internet** (`ingesta`, `conocimiento`, `privado`, `encaje`):

```bash
claude -p --output-format stream-json --verbose --include-partial-messages \
  --system-prompt "<R1 + rol + reglas + formato>" \
  --tools "" --allowedTools "" \
  --disallowedTools "Bash Read Write Edit MultiEdit Glob Grep NotebookEdit Task Agent TodoWrite WebSearch WebFetch Skill Workflow" \
  --permission-mode dontAsk --permission-prompts none \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --setting-sources "" --disable-slash-commands \
  --settings '{"autoMemoryEnabled":false}' \
  --max-turns <n> [--model <modelo>] \
  [--no-session-persistence | --resume <sesión del mismo trabajo>]
```

Trabajo **con internet** (`pulso`, `precios`, `datos`, `rex-web`, `descubrir`): igual, pero
`--tools "WebSearch,WebFetch" --allowedTools "WebSearch WebFetch"` y `--disallowedTools` sin esas dos.

Entorno (nada más):

```js
{ HOME, PATH, LANG: 'C.UTF-8',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',  // quita el plugin de telemetría; analytics_disabled: true
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',           // refuerzo de autoMemoryEnabled:false
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' }           // refuerzo de --setting-sources ""
```

**Desviación del plan §8.1:** se usa `--system-prompt` (sustituye el de Claude Code) en lugar de `--append-system-prompt`. Así el modelo no recibe instrucciones de programación, ni la ruta del `cwd`, ni git status, ni datos del entorno. Además el prompt queda bajo control total de finhub y es unas 4 veces más barato por llamada (0,00017 frente a 0,00063 USD con haiku). La fecha de hoy la pone finhub en el prompt.

## 2. Flags verificados

| Flag | ¿Existe? | Resultado |
|---|---|---|
| `--bare` | sí | ❌ **inutilizable**: con OAuth responde `Not logged in · Please run /login` (`is_error: true`, `terminal_reason: api_error`). Solo admite `ANTHROPIC_API_KEY`. Además seguía listando el plugin huddle. |
| `--safe-mode` | sí | ❌ **insuficiente**: con `--tools ""` y MCP estricto, **huddle seguía en `plugins`** y quedaban 20 skills. |
| `--restricted` | sí | No usado: quita Bash y WebFetch pero mantiene herramientas de fichero; `--tools` ya es más estricto. |
| `--tools ""` | sí | ✅ `init.tools = []`. |
| `--tools "WebSearch,WebFetch"` | sí | ✅ `init.tools = ["WebFetch","WebSearch"]` exactamente. |
| `--allowedTools` / `--disallowedTools` | sí | ✅ aceptados (defensa en profundidad; `--tools` es el que manda). |
| `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` | sí | ✅ `init.mcp_servers = []`. Sin él aparecen los **conectores de claude.ai** (Claude Docs *connected*; Gmail, Drive y Calendar *needs-auth*). |
| `--setting-sources ""` | sí | ✅ no carga `~/.claude/settings.json` → **huddle desaparece**, 0 skills, y **no lee CLAUDE.md ni AGENTS.md** (canarios en el directorio padre: «NINGUNA»). |
| `--disable-slash-commands` | sí | ✅ `slash_commands = []`. |
| `--settings '{"autoMemoryEnabled":false}'` | sí | ✅ `memory_paths` desaparece del init. Se aplica aunque `--setting-sources ""`. |
| `--permission-mode dontAsk` + `--permission-prompts none` | sí | ✅ WebFetch funciona sin preguntar; `init.permissionMode = "dontAsk"`. |
| `--max-turns` | **oculto** (no sale en `--help`) | ✅ funciona. Al agotarse: `result.subtype = "error_max_turns"`, `terminal_reason = "max_turns"`, `errors = ["Reached maximum number of turns (1)"]`, código de salida 1. |
| `--resume <id>` | sí | ✅ funciona **desde otro directorio** (la sesión se busca por id). Ver §5. |
| `--no-session-persistence` | sí | ✅ no deja transcript en `~/.claude/projects/`. Imposibilita `--resume`. |
| `--system-prompt` / `--append-system-prompt` | sí | ✅ ambos funcionan con OAuth. |
| `--include-partial-messages` | sí | ✅ eventos `stream_event` con `content_block_delta` / `text_delta` (para que Rex «hable»). |
| `--json-schema` | sí | Funciona, pero **añade la herramienta `StructuredOutput`** al init y la salida va en `result.structured_output`, sin `text_delta`. **No se usa**: un único camino (texto + bloque ```json, §8.2) y la guardia exige herramientas exactas. |
| `--max-budget-usd` | sí | No probado a fondo. Candidato a tope por trabajo en F9. |
| `--model` | sí | Sin `--model` y sin tus settings, el modelo es **`claude-opus-5-5`** (tus settings no se cargan). **Decisión F0:** `--model` siempre explícito por trabajo (`pulso` sonnet · `precios`, `datos` haiku · `ingesta`, `conocimiento`, `rex-web` sonnet · `privado`, `encaje`, `descubrir` opus), editable en `ajustes.md` → `claude_modelo`. |

## 3. Línea base sin aislamiento (lo que hay que evitar)

`claude -p --output-format stream-json --verbose` en un directorio vacío, con un `CLAUDE.md` canario en el padre:

- `tools` (35): `Task, Bash, CronCreate, …, Edit, Read, Write, WebFetch, WebSearch, Workflow, mcp__claude_ai_Claude_Docs__*` …
- `mcp_servers`: `claude.ai Claude Docs` (connected), `claude.ai Google Drive`, `claude.ai Google Calendar`, `claude.ai Gmail` (needs-auth), todos con `source: "claudeai"`.
- `plugins`: **`huddle`** (`/mnt/d/GitHub/huddle`) + 4 internos.
- `skills` (34), `slash_commands` (70), `memory_paths.auto` presente.
- El modelo **leyó el canario** del CLAUDE.md del directorio padre.

`--include-hook-events` no emitió eventos de hook en ninguna prueba, porque huddle registra sus hooks como «mod» (`hooks/register.tsx`). Por eso **la señal fiable es `init.plugins`**: con el aislamiento huddle no aparece.

## 4. Evento `init` (campos)

```json
{"type":"system","subtype":"init","cwd":"…/sbx-final","session_id":"…","tools":[],"mcp_servers":[],
 "model":"claude-opus-5-5","permissionMode":"dontAsk","slash_commands":[],"apiKeySource":"none",
 "claude_code_version":"2.1.317","output_style":"default","agents":["claude","Explore","general-purpose","Plan","statusline-setup"],
 "skills":[],"plugins":[{"name":"cc-plugin-agents-md","path":"builtin","source":"cc-plugin-agents-md@builtin"},
 {"name":"cc-plugin-privacy","path":"builtin",…},{"name":"cc-plugin-plugin-authoring","path":"builtin",…}],
 "analytics_disabled":true,"messaging_socket_path":"/tmp/cc-socks/9217.sock","original_cwd":"…","additional_directories":[], …}
```

Otros eventos observados: `system:status` (`requesting`), `system:thinking_tokens`, `assistant` (con bloques `tool_use` → `name`, `input`), `user` (con `tool_result`), `stream_event`, `rate_limit_event`, `result`.

### Guardia del init (`src/claude/guardia.js`, F9)
Aborta la ejecución (`SIGKILL`, estado `abortado_guardia`, registro con el motivo) si:
1. `set(init.tools) ≠ set(trabajo.herramientas)`: ni una de más ni una de menos;
2. `init.mcp_servers.length > 0`;
3. algún plugin con `path ≠ "builtin"`, o un interno fuera de la lista conocida `{cc-plugin-agents-md, cc-plugin-privacy, cc-plugin-plugin-authoring, cc-plugin-telemetry}`. Si una versión nueva añade otro, finhub **falla cerrado** con el mensaje «Claude Code ha cambiado: revisa docs/CLAUDE-CLI.md»;
4. `skills` o `slash_commands` no vacíos, o `memory_paths` presente (señal de que el aislamiento de settings no se aplicó);
5. `permissionMode ≠ "dontAsk"`, o `cwd ≠ sandbox`;
6. no llega `init` en 15 s.

Además, durante la ejecución, cualquier `tool_use` con un nombre fuera de la lista del trabajo → abortar.

**Momento:** el `init` solo se emite **después** de recibir el prompt, incluso con `--input-format stream-json` (comprobado), así que la guardia no puede validar antes de enviar. El orden observado es `init` → `status: requesting` → respuesta del modelo, y una herramienta solo puede ejecutarse cuando vuelve una respuesta (segundos después). Matar el proceso al leer el `init` **impide que se ejecute cualquier herramienta sobrante**. El prompt ya habrá viajado a la API de Anthropic, que es su destino normal.

## 5. Sesiones y `--resume`

- Sin `--no-session-persistence`, el transcript completo (prompt incluido) se guarda en `~/.claude/projects/<cwd-escapado>/<sesión>.jsonl`. Para los trabajos `privado` eso deja **datos privados en `~/.claude`** (fuera de la carpeta de datos, en el equipo local).
- **Decisión:** `--no-session-persistence` en todos los trabajos de una sola ejecución. Solo los chats de Rex (`privado` y `rex-web`) persisten sesión, para poder hacer `--resume`. Se documentará en Ajustes → Seguridad.
- `--resume <id>` funciona desde **cualquier** `cwd`, así que el sandbox puede ser nuevo y vacío en cada ejecución.
- ⚠ **Al reanudar, las herramientas las deciden los flags de la ejecución nueva**, no los de la sesión original. Si `rex-web` reanudara una sesión `privado`, tendría internet **y** el historial privado. La regla §0.3.8 (par `sesión → trabajo` guardado por el servidor y rechazo si no coincide) es **imprescindible**, y tendrá test.
- Por defecto (`--system-prompt-snapshot on`) el system prompt de la primera llamada se reutiliza tal cual al reanudar.

## 6. Errores y cómo detectarlos

| Situación | Señal | Mensaje |
|---|---|---|
| `claude` no instalado | `spawn` → `ENOENT` | «No encuentro `claude` en WSL. Instálalo y vuelve a probar.» |
| Sin sesión | `result.is_error` + texto `Not logged in` / `terminal_reason: api_error` | «Claude no tiene sesión iniciada: abre una terminal de WSL, ejecuta `claude` y luego `/login`.» |
| Límite de uso | `rate_limit_event.rate_limit_info.status` = `rejected` (o `allowed_warning` para avisar) | «Has llegado al límite de uso de Claude; se renueva el …» (`resetsAt`) |
| Turnos agotados | `result.subtype = error_max_turns` | «El trabajo necesitó más pasos de los permitidos.» |
| Timeout | temporizador del runner | `SIGTERM` y, a los 5 s, `SIGKILL` |
| Salida sin JSON / esquema inválido | validador | a `.finhub/cuarentena/` |

El evento `rate_limit_event` llega en cada ejecución con `utilization` por ventana (`five_hour`, `seven_day`). Durante las pruebas, tu ventana de 7 días iba por el 86 %.

## 7. Registro de ejecución (campos disponibles)

`result`: `duration_ms`, `num_turns`, `total_cost_usd`, `usage` (tokens, `server_tool_use`), `modelUsage` (por modelo: tokens, `webSearchRequests`, `costUSD`), `permission_denials`, `terminal_reason`, `is_error`, `subtype`. Las herramientas usadas salen de los bloques `tool_use` de los eventos `assistant` (p. ej. `WebSearch {"query": …}`, `WebFetch {"url": …}`). Con suscripción, `total_cost_usd` es el coste a precio de lista (`costBasis: "list"`), no un cargo.

## 8. Riesgos residuales

1. **Socket de mensajería:** cada `claude -p` abre `/tmp/cc-socks/<pid>.sock` (`messaging_socket_path`). No hay variable para desactivarlo. Las ejecuciones `-p` **no** se registran en `~/.claude/sessions/`, así que no aparecen en la lista de sesiones locales, y el canal es entrante y solo para procesos de tu mismo usuario. Los trabajos no tienen herramientas de mensajería para enviar nada. Riesgo bajo, documentado.
2. **Plugins internos** (`cc-plugin-agents-md`, `-privacy`, `-plugin-authoring`) no se pueden quitar. Con `--setting-sources ""` el canario de AGENTS.md no se leyó. La guardia los lista por nombre y falla cerrado ante cualquier otro.
3. **Cambios de versión:** `--max-turns` está oculto y los flags pueden cambiar. Los tests usan `test/fake-claude.js`. Al arrancar, finhub guarda `claude --version` y, si cambia, la guardia sigue protegiendo, y Ajustes → Seguridad recomienda revisar este documento.
4. **WebFetch resume con otro modelo:** el resultado de WebFetch llega ya resumido. Es texto externo igualmente y se trata como tal.

## 9. Comandos usados (recortados)

```bash
claude --version                    # 2.1.317 (Claude Code)
claude --help
claude auth status                  # authMethod: claude.ai · subscriptionType: max
# sonda: node sonda.mjs <etiqueta> "<prompt>" <flags…>   (cwd vacío nuevo, env -i HOME PATH LANG)
# base:     --model haiku --include-hook-events --max-turns 2
# aislada:  --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources "" --disable-slash-commands
# web:      --tools "WebSearch,WebFetch" --allowedTools "WebSearch WebFetch" --permission-mode dontAsk --permission-prompts none …
# resume:   ejecución en sbx-r1 → --resume <id> desde sbx-r2 (otro dir) → «4242» ✓
```

Los transcripts de las sondas se borraron de `~/.claude/projects/` al terminar.
