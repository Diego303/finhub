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

## F6 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Progreso de una meta** | Cuenta → su saldo hoy; grupo → lo apartado en ese grupo (los movimientos, con el signo cambiado) hasta hoy; manual → el importe escrito. Una meta «cumplida» cuenta como llena. Si ya llegas y sigue activa, se ofrece «¡cumplida!». |
| 2 | **Aportación «media3m»** | Media de los 3 meses financieros completos anteriores al actual: neto que entra en la cuenta (o lo apartado en el grupo). Con «manual» no tiene sentido y se avisa. Fecha estimada = hoy + ⌈falta ÷ aportación⌉ meses; con fecha deseada se dice si llegas y, si no, cuánto haría falta al mes. |
| 3 | **Proyección por bootstrap** | Rentabilidades mensuales de la mezcla (reequilibrada cada mes) en los meses en que todas sus series tienen dato; cada año del camino es un bloque de 12 meses consecutivos al azar; 2.000 caminos; aportación al final de cada mes; semilla fija `finhub-proyeccion-v1` (mulberry32) → mismo resultado en Node y en el navegador (probado en el e2e). Percentiles con interpolación lineal. Parte del valor de tu cartera hoy. |
| 4 | **Mezcla de un perfil** | Clase → su índice, o el de su clase «parecida». Efectivo sin índice → tipo del BCE (`bce-deposito`) ÷ 12 si existe; si no, 0. Otro activo sin índice → 0 con aviso. Perfiles: «tu objetivo» (objetivo.md) y las plantillas de la carpeta (o las del repo). |
| 5 | **Real / nominal** | Real: cada mes se descuenta el IPC del MISMO mes del bloque (`ipc-espana`), así se conserva la relación entre inflación y mercado. Sin serie de IPC se avisa y se muestra nominal. |
| 6 | **Modo manual** (`proyeccion: manual`) | Normal mensual con los supuestos de Ajustes (reales): media y volatilidad ponderadas por peso, como si las clases estuvieran perfectamente correlacionadas (prudente); mixto = mitad rv, mitad rf. Nominal = real + inflación media de la serie de IPC (o 2 %). Caída mensual limitada a −95 %. |
| 7 | **Libertad financiera** | Objetivo = consumo de los 12 meses financieros completos anteriores × `libertad_multiplicador` (25 → «regla del 4 %»). Con menos de 12 meses se anualiza la media y se dice con cuántos. Año = el primero en que la mediana lo supera; si no, «más de N años». |
| 8 | **Decisiones** | Fichero `decisiones/AAAA-MM-DD-<slug>.md`; las secciones se guardan en el orden del formato y las vacías se quitan. Las «Preguntas de Rex» las escribe Rex en F10; aquí se muestran si existen. |
| 9 | **Hitos** | Se editan desde la pestaña Metas (caja «Hitos»). En F7 también desde la línea de tiempo del Panel. Gestión → Metas lleva a la pestaña Metas. |
| 10 | **Dos fallos de la web arreglados** (salían en los e2e con carga) | (a) `cargar()` ignoraba una recarga pedida mientras otra estaba en marcha: la pantalla podía quedarse con los datos de antes de un cambio hasta el siguiente sondeo. Ahora se encadena una recarga más. (b) Los editores de grupos y recurrentes se reabrían al terminar la operación, encima de lo que el usuario hubiera hecho mientras (p. ej. cerrarlos con Esc). Ahora vuelven al instante y se repintan al llegar los datos. |
| 11 | **`hora` en el contexto de las operaciones** | El servidor pasa la hora local para calcular «vuelve» de la pausa de 48 h. |

## F7 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **«?» Explícame en blanco** | Abre Rex «Mis finanzas» con la cifra y su contexto en una banda; la explicación la escribe Claude en F10 (trabajo `privado`). |
| 2 | **KPI del Panel** | Patrimonio = cuentas + cartera (F5) hoy, y su variación frente al fin del mes anterior. Colchón = cuentas «colchon» ÷ consumo medio de los 6 últimos meses cerrados; «meta N» sale de la meta que se alimenta de esa cuenta. Tasa: la del mes en curso y la agregada de los últimos 12 meses cerrados. Cartera: TWR 12 m (igual que en Cartera) e índice propio en la MISMA ventana. |
| 3 | **Línea de tiempo** | Patrimonio a fin de cada uno de los últimos 12 meses financieros (hoy en el actual). «Lo que has puesto» = patrimonio inicial + Σ (entradas − consumo); lo demás es el mercado. El patrimonio de cada fin de mes coincide con la foto del cierre (test). Los hitos se crean con «+ hito» y se editan pulsándolos (también con teclado). |
| 4 | **Prueba de crisis** | Periodos en `ajustes.md` → `crisis_periodos` (clave nueva, editable desde la propia herramienta). Pesos: tu objetivo (o, sin objetivo, tus pesos actuales), reequilibrio mensual. Si un índice no tiene datos en el periodo, se usa el de la clase «parecida» y se indica; si tampoco, cuenta como quieto y se avisa. «Recuperar sin aportar» = volver a 100; «aportando» = que el valor vuelva a cubrir todo lo puesto (por eso suele ser antes). Se dibuja hasta 6 meses después de recuperarse. «Efecto en metas»: las metas que se alimentan de cuentas de inversión lo notan; el retraso de la libertad ≈ los meses de recuperación aportando. |
| 5 | **Rangos a 12 meses** (§4.5) | Se calculan ya (rentabilidades móviles de 12 meses de tu mezcla: p5–p25, p25–p75, p75–p95 y mínimo) y se enseñan en la prueba de crisis; Análisis (F10) los reutilizará. |
| 6 | **IPC personal** | Pesos = consumo de los 12 meses financieros completos anteriores por grupo; tasas = interanual de cada componente en el último mes del IPC general. Los grupos sin `ipc:` se excluyen, se dice qué parte de tu consumo queda fuera y se les puede asignar componente desde la herramienta (se guarda en `grupos.md`). Se compara con el IPC general (no hay pesos oficiales en los Datos). |
| 7 | **Interés compuesto mensual** | Coste de oportunidad, calculadoras y comparador de fondos capitalizan cada mes con la tasa equivalente ((1+r)^(1/12) − 1), no r/12. |
| 8 | **Escenarios de vida** | El cambio neto mensual (ingresos − gasto) va a, o sale de, tu aportación a la cartera; las metas conservan su aportación salvo durante la pausa (que las retrasa N meses y para también la cartera); el gasto puntual sale de la cartera; el gasto mensual sube el objetivo de libertad. La libertad se busca con la proyección de Metas a 40 años (semilla fija). |
| 9 | **«Guardar como escenario»** | No hay formato propio de escenarios en el plan: se guarda en el **diario de decisiones** (`decisiones/…`), sin estado (no es una pausa ni aparece en Pendientes), con `origen: herramientas · …` y los supuestos y resultados en «Qué». «Crear meta» (calculadora de meta) usa `meta.crear`. |
| 10 | **Alquilar o comprar** | Los dos gastan lo mismo cada mes y quien paga menos invierte la diferencia; quien alquila invierte desde el inicio la entrada y los gastos de compra. Supuestos editables en la propia calculadora. Sin costes de venta ni impuestos de la plusvalía (se dice). |
| 11 | **Radar de suscripciones** | Recurrentes con `#suscripción` que siguen vigentes. «¿La usas?» edita `uso:` en recurrentes.md («no desde» el mes actual); «cancelar» solo marca para el cálculo (por defecto, las que no usas). Coste de oportunidad: 20 años al 4 % real. |
| 12 | **Tu año** | Meses financieros del año hasta hoy. «Grupo que más bajó»: frente a los MISMOS meses del año anterior (≥ 3 meses comparables); si no los hay, «—» y se dice. «Fuente más acertada»: ≥ 5 predicciones resueltas (§4.7), si no «—». Cartera: TWR desde la última foto del año anterior. Las 8 tarjetas salen de una sola función de core, la misma para la web y para el PNG. |
| 13 | **PNG de Tu año** | Dibujado en `<canvas>` por código (1200 × 860, tema claro siempre), descargado como `finhub-tu-AAAA.png`. El e2e comprueba la firma y el tamaño del PNG. |
| 14 | **Activar con teclado elementos que no son botones** | `acciones.js` dispara la acción con Enter o espacio en cualquier `[data-accion][role=button]` (los hitos del gráfico). |

