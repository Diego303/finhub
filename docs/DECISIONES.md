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

## F3 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Contraste AA en el tema claro** | Dos colores de la maqueta no llegaban a 4,5:1 con texto pequeño: `--text-muted` #888780 → **#71706a** (3,3 → 4,5) y el fondo de los botones principales #D85A30 → **#c5522c** con texto blanco (3,87 → 4,55). El naranja de la maqueta se mantiene en pestañas, gráficos y Rex. El tema oscuro ya cumplía. |
| 2 | **Playwright** instalado (`@playwright/test`, solo en `test/e2e/`) | Los e2e forman parte de `pnpm test` y se saltan con aviso si no hay Chromium. `pnpm test:e2e` los lanza solos. |
| 3 | **Vistas pendientes en `web/vistas/basicas.js`** | Cada pestaña muestra su marco con datos reales y qué llega y en qué fase. Cada fase sacará su vista a su propio fichero (`vistas/mes.js` en F4…). |
| 4 | **`#muestrario`** (ruta oculta, no es una pestaña) | Para comparar gráficos, Rex y componentes con la maqueta. Datos de muestra, marcados como tales. |
| 5 | **Lógica en `core`** | `core/resumen.js` (Pendientes hoy), `core/recurrentes.js` (calendario), `core/modelo.js` (modelo de la carpeta para la web) y `core/graficos/geometria.js`. Todo con tests. |
| 6 | **Matriz R1 con los 9 trabajos del plan** | La maqueta enseña 7 filas; manda el plan (§0.2). «Texto externo: normalizado*» en los trabajos sin internet que leen notas de fuera. |

## F4 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Signo al anotar** | Si escribes el importe sin signo, lo pone la naturaleza del grupo: consumo, inversión y ahorro → negativo; ingreso → positivo; una devolución que «compensa» → positiva. Con «+» o «−» manda lo que escribes. |
| 2 | **Cuenta por defecto** | Un movimiento sin «cuenta:» cuenta en la primera cuenta corriente activa (o la primera activa). Movimientos con una cuenta que no existe: aviso, no suman. |
| 3 | **Cuentas de deuda** | El saldo inicial de una cuenta de deuda es lo que debes (en positivo) y resta del patrimonio; pagarla con «a: tarjeta» reduce la deuda. |
| 4 | **Valor de la cartera en el cierre (provisional hasta F5)** | Última foto de cada activo hasta la fecha, sin los activos archivados (traspasados o vendidos del todo). Reproduce al céntimo los 11 cierres del ejemplo. F5 añade las operaciones posteriores a la última foto. |
| 5 | **Reabrir quita la foto** | Se rehace al volver a cerrar (es lo que dice la inversa de la tabla de operaciones). |
| 6 | **Editar un mes cerrado** | La web pregunta antes de enviar; el servidor sigue protegiendo con 409 «mes_cerrado». Al confirmar: «editado_tras_cierre: sí» y se recalculan la foto de ese mes y la de los meses cerrados siguientes (solo se marca el editado). Editar el saldo inicial de una cuenta también recalcula todos los cierres. |
| 7 | **Cambiar el mes financiero** | Reparte todos los movimientos por su fecha; presupuestos, marcas de recurrentes y cierres se quedan en el fichero del mes con el mismo nombre. Los meses cerrados afectados quedan «editados tras cierre» con la foto recalculada. Una sola operación: se deshace de una vez. |
| 8 | **Cambiar la naturaleza de un grupo «solo para lo nuevo»** | Los movimientos ya anotados que heredaban la naturaleza la conservan escrita («naturaleza: consumo»). |
| 9 | **Borrar un grupo** | Con destino: se reasignan sus movimientos, devoluciones y recurrentes. Sin destino: quedan «sin grupo» (§9.2), con aviso. |
