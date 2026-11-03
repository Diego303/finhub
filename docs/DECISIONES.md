# Decisiones tomadas por fases

## F0 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Playwright** aprobado como única devDependency (e2e) | Se añade cuando se escriba el primer e2e (F3), no antes. |
| 2 | **Modelo por trabajo** (`claude_modelo` en `ajustes.md`, editable) | `pulso`: **sonnet** (tiene que juzgar qué es importante del día) · `precios`, `datos`: **haiku** · `ingesta`, `conocimiento`, `rex-web`: **sonnet** · `privado`, `encaje`, `descubrir`: **opus**. Sin `--model`, Claude Code usaría opus en todo (no se cargan tus settings). |
| 3 | **Novedades de formato** de `docs/FORMATOS.md` §6 aprobadas | `id: xxxx` en movimientos · Mundo `M-AAMMDD-NN` · Datos `DT-` · Mis notas `N-` · formatos de los ficheros que el plan no fijaba. |
| 4 | **Sondeo** | Conjunto caliente + carpetas cada 2 s; barrido completo concurrente cada 30 s y al recuperar el foco (`docs/SINCRONIZACION.md` §3). |
| 5 | **Varios equipos**: sí | El candado y los conflictos son prioritarios. Los nombres de las copias en conflicto de Google Drive se verificarán en F12 con dos equipos. |
| 6 | Carpeta de datos dentro de `D:\GoogleDrive` | Ruta exacta en F12. No OneDrive ni `G:`. |
| 7 | Aislamiento de Claude Code | Flags y entorno de `docs/CLAUDE-CLI.md` §1. `--system-prompt` en vez de `--append-system-prompt`. |
| 8 | `PROMPT-claude-code.md` **no se versiona** | — |

## F2 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Inversa = restauración exacta** | La inversa de cada operación es `ficheros.restaurar` con el contenido anterior de los ficheros que tocó, y solo se aplica si siguen como los dejó la operación (si no: «cambió después», 409). Garantiza el «deshacer byte a byte» del §11 incluso cuando la operación asigna ids a movimientos escritos a mano. Restaurar desde la papelera (días después) es semántico (`papelera.restaurar`). |
| 2 | **Operaciones serializadas** | Una cola global en el servidor: dos operaciones nunca se pisan. Además, cola por fichero en las escrituras. El 409 es para el estado viejo del navegador (`versiones`). |
| 3 | **`--primer-plano`** (opción nueva de la CLI) | Para `pnpm dev` y los tests: el servidor no se separa de la terminal y Ctrl+C lo para limpio. Sin ella, `finhub` arranca en segundo plano como pide §2.3. |
| 4 | **Patrones de conflicto por defecto** | `nombre-EQUIPO.md` (y `-2`), `nombre (1).md` (marcado «posible copia»), `(conflicted copy …)` y `.sync-conflict-`. Solo cuentan si existe el original. Los de Google Drive se confirmarán en F12 con dos equipos. |
| 5 | **Papelera del sistema al «mover»** | En `/mnt/x/…`, la Papelera de reciclaje de Windows (PowerShell + `Microsoft.VisualBasic`); en WSL, la de freedesktop (`~/.local/share/Trash`). Nunca se borra directamente, y solo con confirmación. |
| 6 | **API para el navegador** | `GET /api/datos` devuelve los textos y el navegador los parsea con `/core/` (isomórfico). Las escrituras van siempre por `POST /api/ops`. |
