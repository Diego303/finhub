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

## F5 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Valor de un activo** | Última foto hasta la fecha + las operaciones posteriores a esa foto (aportaciones y traspasos de entrada suman; ventas y traspasos de salida restan; dividendos y comisiones no cambian el valor). Si hay operaciones tras la foto: aviso «faltan valores». Sin ninguna foto: cuenta por lo aportado («sin valorar», §9.5). Esto sustituye al cálculo provisional de F4 en los cierres; los 11 cierres del ejemplo siguen cuadrando. |
| 2 | **Posición cerrada** | Un activo con aportaciones, coste 0 y operaciones posteriores a su última foto se considera vendido o traspasado entero: vale 0 (no se arrastra la foto vieja). Los activos archivados sin coste no se listan. |
| 3 | **Coste fiscal** | Con participaciones, FIFO. Sin ellas, coste proporcional (venta de x € sobre un valor estimado) y «coste aproximado». La comisión suma al coste; el ajuste lo corrige; el dividendo no lo cambia. El traspaso mueve el coste proporcional al origen y deja el destino con participaciones desconocidas (coste aproximado). |
| 4 | **TWR y TIR** | TWR por Dietz modificado encadenado entre fotos («aprox.» con menos de 4 fotos o huecos de más de 62 días). TIR (XIRR) con Newton y bisección; si la rejilla de signos muestra 0 o varias raíces, «no concluyente» (§9.7). La ventana «12 meses» empieza en la foto más cercana a hace un año (la etiqueta muestra desde cuándo). |
| 5 | **Comparativa y «hoy tendrías»** | Cada flujo compra unidades del índice al cierre de su mes; el valor de partida es el de la cartera al inicio de la ventana. Meses sin dato entre dos conocidos: interpolados y marcados (*). Índice propio: pesos objetivo → índice del activo, o de su clase, o de la clase «parecida»; sin índice, rentabilidad 0. |
| 6 | **Reparto de la aportación** | Primero cubre déficits frente al objetivo, por restos mayores en múltiplos del redondeo (10 € por defecto); nunca negativo; el resto al de más peso. Respeta el «minimo» por activo. Aportación por defecto: la suma de los recurrentes mensuales de grupos de inversión. Si los pesos no suman 100 no se calcula y se dice por qué. |
| 7 | **Generar cartera base sin IA** | Plantillas de `cartera/plantillas/` (o, si la carpeta no las tiene, las del repo en `semilla/plantillas-cartera/`, servidas por `GET /api/semilla`). Sin ISIN: los añades al elegir el fondo. Se crea un borrador; aceptarlo crea los activos que falten y fija el objetivo; operaciones y valores no se tocan. La revisión con Claude llega en F10 (interruptor desactivado). |
| 8 | **Inversión anotada en Mes** | Al anotar un movimiento de un grupo de inversión, la web pregunta si registras la operación; si sí, abre el formulario relleno y quedan enlazados (`op:` en el movimiento, `mov:` en la operación). Borrar la operación quita el enlace del movimiento. |
| 9 | **Avisos en el mismo toast que «deshacer»** | Antes se enseñaban en un segundo toast a los 3,3 s, que tapaba el botón «deshacer» antes de sus 10 s (salía en los e2e con carga). Ahora `op()` los añade al mismo toast. |
| 10 | **e2e en serie** | `pnpm test` lanza primero los tests sin navegador (en paralelo) y después los e2e de uno en uno (`--test-concurrency=1`). |
| 11 | **Impuesto «si vendieras hoy»** | Plusvalía total por los tramos de `ajustes.md` (base del ahorro), siempre como estimación con el año de verificación de los tramos. |

