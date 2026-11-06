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

## F8 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Tu mezcla = `activa_por_defecto`** | La mezcla activa se guarda en `_fuentes.md` (campo que ya existía): la casilla de cada fuente, «añadir/quitar todos», «todas», «ninguna» (Base y Datos) y «usar» una mezcla guardada la cambian con una sola operación. El chip dice el nombre de la mezcla guardada que coincide, o «personalizada». |
| 2 | **Selectores dinámicos** | `@postura` usa la postura media (−1…1), `@acierto` el % de acierto (las fuentes sin 5 resueltas no entran), `@familia` la familia. Se resuelven cada vez con los datos del momento. |
| 3 | **Postura** | Media de las notas con postura (alcista 1, neutral 0, bajista −1) ponderada por 0,5^(días/90) a fecha de hoy; las de fecha futura no cuentan. La ficha la dibuja desde el primer mes con postura. |
| 4 | **Caducidad** | La de la nota («caduca:»), o fecha + caducidad de su fuente, o de su familia. Las caducadas se ven atenuadas y se pueden excluir del buscador; no entrarán en los análisis (F10). |
| 5 | **Predicciones** | `medir` en %: variación desde el cierre del mes anterior a «desde» hasta el último mes del periodo; caída y subida máximas dentro del periodo; nivel = último valor; `cartera twr` con las fotos. Se resuelven al terminar el periodo con datos de su último mes; una caída/subida máxima que ya pasó el umbral se resuelve antes. «Resolver automáticamente» es un botón (tu luz verde), también desde Pendientes. Manual: ✓, ✗, «no medible» y reabrir. |
| 6 | **Calibración de finhub** | % de las predicciones de rango de finhub (`… en a…b`) resueltas que contuvieron el valor real. |
| 7 | **Deduplicación de Mundo** | `duplicadoDe()` (misma URL, o Jaccard ≥ 0,6 de los títulos normalizados, palabras de más de 2 letras, a ±1 día) queda en core para el pulso de F10. |
| 8 | **Base de finhub** | `semilla/base/*.md`, ids B-1001…B-1599 por tema (no chocan con las del ejemplo, B-0xxx). Escrita investigando en la web, solo hechos, datos y consenso, con «origen» (organización · documento · URL · fecha de consulta), parafraseada y sin comillas; las de fiscalidad con `verificar: 2026`. `scripts/validar-base.js` y un test lo comprueban. En la app: «La Base tiene N notas nuevas · revisar e importar» (op `base.importar`, que solo añade ids que no tienes). El onboarding de F12 la copiará al crear la carpeta. |
| 9 | **Manifiesto de Datos** | `semilla/datos-manifiesto.md`: id, qué es, unidad, proxy (ETF UCITS de acumulación o INE/BCE) y método de cada serie; ISIN orientativos que el trabajo `datos` (F9) verificará; nunca valores. |
| 10 | **Visor de series** | En Conocimiento → Datos: meses, rango, huecos (que se interpolan), aproximados, fuente, método y avisos del formato (saltos > 40 % sin nota, duplicados); gráfico de 5 años, 10 años o todo. |
| 11 | **Controles dentro de filas clicables** | `acciones.js` deja pasar el clic a una casilla, select o etiqueta dentro de un elemento con `data-accion` (antes el `preventDefault` de la fila impedía marcar la casilla). |
| 12 | **ARIA con booleanos** | La plantilla `html` pinta `false` como vacío: `aria-pressed/expanded/selected` se escriben siempre como `'true'`/`'false'` explícitos (corregido también en Mes, Cartera, Metas y Herramientas). |
| 13 | **Ejemplo coherente** | PR-0012 pasa a «sube más de un 15 %» para que su estado (fallida) coincida con la resolución automática sobre la serie sintética (test). |
| 14 | **Base: 208 notas y sus cautelas** | Conceptos 38 · índices 36 · crisis 34 · comportamiento 32 · fiscalidad 34 (cifras del ejercicio 2025, solo AEAT y BOE) · renta fija y ahorro 34. Sin cifras SPIVA (la web de S&P DJI no se dejó abrir). Las cifras de fichas (pesos, nº de valores, tipo del BCE del 2,50 %) llevan su fecha y caducan: conviene revisarlas. Dos notas de comportamiento citan la información divulgativa oficial del Nobel publicada por la Real Academia Sueca (kva.se) en lugar de nobelprize.org, que no se dejó abrir. |

## F9 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Entrada por niveles** | Cada bloque `<datos>` lleva su nivel (§0.1): privado, metadato, público o externo. Además de la matriz R1 de cada trabajo, el motor comprueba la ENTRADA montada: un trabajo con internet que reciba algo privado o Mis notas no llega a ejecutarse (`rechazado`), y los metadatos (nombres de tus activos o clases) solo van si lo activas en esa ejecución. Precios lleva los ISIN siempre, porque son la petición misma. |
| 2 | **Texto escapado** | Todo lo que va dentro de `<tarea>`, `<cifras>`, `<datos>` y `<pregunta>` se escapa (`&lt;`, `&gt;`): un texto de fuera no puede cerrar su bloque ni abrir otro (test). |
| 3 | **Selección de notas** | Por relevancia (temas y activos ×3, más recencia con vida media de 90 días), sin caducadas, recortada a `contexto_max` (60 notas o 60.000 caracteres). Las privadas solo entran en trabajos `privado`/`encaje`. |
| 4 | **Claude propone, tú confirmas** | El motor nunca escribe en tus datos: devuelve una propuesta; la aplica una operación que lanzas tú (en F9, `datos.aplicar`). Solo escribe registro y cuarentena en `.finhub/`. |
| 5 | **Trabajo «datos»** | El servidor monta la lista de series a partir del manifiesto y de lo que tienes; nunca completa series sintéticas (las del ejemplo). Las filas propuestas se revisan por código (meses nuevos y completos, sin repetidos, sin saltos de más del 40 %, valores posibles) antes de enseñártelas. |
| 6 | **Normalización de temas** | La única transformación de la salida antes de validar: los `temas` pasan a id (minúsculas, sin tildes, guiones). Es determinista y no añade información. El resto del esquema es estricto: una clave no declarada → cuarentena. |
| 7 | **Ayuda por campo en el esquema** | El prompt describe cada campo con un ejemplo (id de fuente frente a id de nota, nombre corto…). Lo pidió la prueba real: sin ella, el modelo confundía ids. |
| 8 | **Verificador** | Cifras: en los trabajos sin internet, cada número del texto debe estar en `<cifras>`, en `<datos>` o ser una probabilidad; si no, aviso «cifra no verificada» (no bloquea). Los enteros del 0 al 12 se aceptan (enumeraciones, meses). Citas inexistentes: se quitan y se avisa. Lenguaje de compra/venta: aviso registrado. Probabilidades fuera de regla: un reintento y, después, cuarentena. |
| 9 | **Rex y el progreso** | Los eventos del runner llegan por SSE (`claude`): inicio → piensa, texto → habla, fin → feliz o preocupado. La barra R1 solo se repinta si cambia lo que muestra (evita perder clics al cargar). |
| 10 | **Prueba real con haiku** | `pnpm claude:probar --real` ejecutó los 9 tipos con la carpeta de ejemplo en memoria y `--model haiku` para gastar poco de tu cuota: 9/9 válidos tras dos ajustes de formato (ayudas del esquema y longitud de nombres). Con `--modelo config` usa los modelos de `claude_modelo`. |

## F10 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Tareas y roles: texto en Markdown, contrato en código** | `tareas/*.md` y `roles/*.md` (los de `semilla/` y los de tu carpeta, que mandan) ponen la instrucción y el rol. El trabajo y el esquema de salida de las tareas conocidas los fija `src/claude/tareas.js`: una tarea no puede cambiar las banderas R1 ni su contrato. Una tarea tuya que el código no conoce usa el esquema por defecto de su trabajo (chat en privado). |
| 2 | **Parámetros los monta el servidor** | El navegador elige tarea, rol y mezcla; los datos (rangos de la mezcla, cifras de Tu año, borrador, análisis previo, texto de CONTEXTO) los pone el servidor. La ingesta lee el fichero de CONTEXTO en el servidor y lo pasa a `CONTEXTO/procesados/<fuente>/` al guardar (nunca se borra). |
| 3 | **Escenarios** | Las probabilidades las pone Claude (enteras, 5–90, suman 100); los rangos (p5–p25, p25–p75, p75–p95) y el peor caso los calcula el código. El rango base se registra como predicción de finhub (`cartera twr hoy→+1 año en a…b`) para la calibración. |
| 4 | **Comparar mezclas** | Dos ejecuciones seguidas con la misma tarea (una con tu mezcla y otra con la elegida); se enseñan lado a lado con el cambio del escenario pesimista. |
| 5 | **Chat de Rex** | Cada conversación es un fichero en `chat/privado/` o `chat/web/` con su `sesion`; al reanudar, el servidor comprueba el par sesión→trabajo. Si la sesión ya no vale (otro equipo, caducada), se empieza una nueva y el historial sigue en el fichero. El modo web lleva el aviso fijo y solo ve la base pública. Las citas pueden ser ids de nota o, en el modo web, URL. |
| 6 | **Explícame** | El «?» abre Rex «Mis finanzas» con la cifra; «Explícamelo con mis números» crea una conversación con la tarea `explicame`. |
| 7 | **Pausa de 48 h** | Rex (privado) escribe 3–5 preguntas; la decisión se guarda en el diario con «estado: pausa-48h», «vuelve» en 48 h y «## Preguntas de Rex». Vuelve sola a Pendientes. |
| 8 | **Resumen semanal y quiz** | `conocimiento` (sin internet ni Mis notas): el resumen agrupa las notas de Mundo de la semana ISO y se guarda en `conocimiento/mundo/semana-AAAA-Www.md`; el quiz sale de notas de la Base barajadas con la semilla del día y cada respuesta va a `quiz/progreso.md`. |
| 9 | **Precios** | Claude propone el último precio por ISIN; si conoces las participaciones (FIFO completo) y la divisa es la del activo, finhub calcula el valor; si no, te enseña el precio y escribes tú el valor. Nada se guarda sin pulsar «Guardar valores» (origen «precio AAAA-MM-DD · Claude» si no lo cambias). |
| 10 | **Revisión de la cartera base** | Opcional al crear el borrador: un análisis privado (`analisis/…-revisar-cartera-base.md`) enlazado desde `revisado_claude: sí · <ruta>`; no cambia pesos. Se ve al abrir el borrador. |
| 11 | **El Claude falso elige respuesta por trabajo y tarea** | El sistema empieza por `[finhub:<trabajo>:<tarea>]` (sin datos); `test/fake-claude.js --respuestas <dir>` usa `<trabajo>-<tarea>.txt`. Así cada flujo se prueba de punta a punta. |
| 12 | **Prueba real** | `pnpm claude:probar --real --tareas …` con haiku: las 10 tareas nuevas dieron salidas válidas a la primera. |

## F11 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Claude propone, tú guardas** | «Investigar con Claude» deja las propuestas en pantalla; cada una se guarda (o no) con «guardar descubrimiento». En seguimiento, «guardar como nueva versión». Nada llega a `conocimiento/descubrimientos/` sin tu clic. |
| 2 | **Cuatro modos, un trabajo** | Pulso (solo notas de Mundo del periodo), nuevas ideas y pregunta libre (Mundo del periodo más Base y Datos) y seguimiento (la versión anterior, pública, y las noticias desde su fecha). Las tareas `descubrir-<modo>` ponen el texto; el trabajo, el esquema y las banderas R1 son siempre los de `descubrir`. |
| 3 | **Profundidad** | Rápida, normal o a fondo cambian `--max-turns` (12, 24 o 40), el número de fuentes web que se piden (3, 6 o 10) y de notas (20, 40 o 60); a fondo amplía el tiempo a 10 min. Las herramientas y el aislamiento no cambian. El motor acepta `maxTurns` y `timeoutMs` de la entrada (con un tope de 60 turnos). |
| 4 | **Nombres de tus clases** | La casilla manda los nombres (sin pesos ni importes) como `metadato`, y la ejecución va con tu luz verde (`desclasificar`); sin ella, el motor la rechaza antes de llamar a Claude (test). Los filtros se mandan como dato público. |
| 5 | **ISIN roto frente a importes** | Un vehículo con ISIN no válido no invalida el descubrimiento: la operación lo descarta con aviso (§9.25). Un importe en euros en la salida sí: va a cuarentena (no puede venir de fuentes públicas sin haberse colado algo tuyo), y la operación lo vuelve a comprobar. En seguimiento, otro id → cuarentena. |
| 6 | **Rendimiento desde el descubrimiento** | Variación de la referencia desde el cierre del mes anterior a «descubierto» (las series son de fin de mes) hasta su último dato, frente a «vs» (MSCI World por defecto) en los mismos meses. La referencia puede ser un id de Datos o un ISIN: sus precios se guardan como serie `<isin en minúsculas>` con el trabajo `precios` (solo los ISIN) desde Pendientes («Precios de lo que sigues», cuando falta el cierre del mes pasado). Sin datos: «—». |
| 7 | **Simulador (código, no toca tu cartera)** | Con tus pesos actuales (no el objetivo): sacar de todo en proporción, de un activo o solo de nuevas aportaciones (equivale en pesos a sacar en proporción; se dice cuántos meses hacen falta o hasta dónde llegas en 12). Recalcula clases, exposición por región, TER (el del vehículo si viene «TER x %», si no cuenta 0 y se avisa), caída en cada crisis de `crisis_periodos` y el último año (con la serie de referencia; sin ella, el nuevo cuenta como si no se moviera, con aviso). |
| 8 | **Encaje** | Variante privada sin internet ni herramientas: recibe el informe ya validado (como `externo`), tu cartera (`privado`) y como `<cifras>` la exposición por región y sector y lo que diga el simulador con el % que tengas puesto. Se guarda solo en `analisis/encajes/` (nunca junto al descubrimiento). Desde ahí: pausa de 48 h (Rex) o al diario de decisiones (`estado: lista`, revisar en 30 días). |
| 9 | **Mapa de efectos** | Sectores de `sectores_efectos` × 4 semanas ISO; cada celda suma el «efectos» que el pulso dio a cada nota: ▲ si (a favor − en contra) ≥ 2, ▼ si ≤ −2, • si no llega, vacío sin notas. Clic: las notas. La lectura de la fila («tendencia favorable», «noticias recientes en contra», «sin dirección clara») sale de contar celdas, igual que en la maqueta. Sectores y filtros se editan desde la propia pestaña (`ajustes.md`). |
| 10 | **Calibración aparte** | Las predicciones de los descubrimientos llevan `fuente: finhub-descubrir` y `descubrimiento: D-NNN`; su acierto se muestra en Descubrimientos, no en la tabla de tus fuentes. |
| 11 | **Lupa de Rex** | Accesorio temporal mientras corre `descubrir` (con el evento SSE del trabajo); los accesorios fijos llegan en F12. |
| 12 | **Ejemplo** | D-007 apuntaba al ISIN de tu propio fondo mundial; ahora usa un ISIN ficticio (`IE00FHINFRA9`) con una serie sintética derivada del índice mundial, sin tocar el PRNG (el resto del ejemplo no cambia). |
| 13 | **Repintados reentrantes** | Al sustituir un `innerHTML`, el campo con el foco dispara `blur`/`change`; si su manejador repintaba, el navegador fallaba («the node to be removed is no longer a child»). `pintar()` aplaza ahora un repintado que llega en medio de otro (lo destapó el e2e del simulador). |
| 14 | **Prueba real** | `pnpm claude:probar --real --casos descubrir-pulso,descubrir-nuevas,descubrir-seguimiento,encaje` (haiku, carpeta de ejemplo en memoria, sin transcripts): 4/4 válidos a la primera. «Nuevas ideas» dio un aviso de lenguaje de recomendación («compra»), que se enseña y se registra; seguimiento sin novedades devolvió «sin_cambios». |

## F12 · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Primera vez en dos pasos** | La carpeta se elige en la terminal (la web necesita una carpeta para arrancar): `finhub` sin carpeta pregunta dónde, sugiere `…\GoogleDrive\FINANZAS` u OneDrive si existen (solo comprueba que existan) y la crea cuando confirmas. Lo demás lo hace el asistente de la web, que aparece mientras la carpeta no tenga cuentas, meses ni activos: tú, cuentas, grupos, recurrentes, cartera, Base y Datos, en una sola operación con deshacer. |
| 2 | **Ajustes por secciones** | Carpeta, general, impuestos, proyección, Pendientes, Rex, Claude y más. Cada sección se guarda de una vez (`ajustes.textos`); un campo vacío vuelve al valor por defecto; lo que tiene gramática propia se valida al guardar. El mes financiero sigue con su confirmación y reparto. Pulsar la ruta de la carpeta abre directamente la sección Carpeta, con el progreso de «Mover/Copiar». |
| 3 | **Pendientes configurable** | Casillas por elemento y su frecuencia como texto (`pendientes`). «Descubrimientos para revisar» y «Precios de lo que sigues» salen siempre que toca. La frecuencia se guarda y se enseña; los cálculos de cada elemento son los de §4.8. |
| 4 | **Guarida de Rex** | Hucha = progreso medio de las metas activas y cumplidas (cada una como mucho 100 %). Humor = reglas `rex_humor` sobre la tasa de ahorro del mes (o del anterior si este aún no tiene entradas). En reposo, Rex está «preocupado» si el humor lo es. Accesorios por reglas (`mes-tasa>=N`, `meta(id)=N`, `libertad`), dibujados en el sprite cuando se consiguen; la lupa es temporal mientras corre `descubrir`. Se calcula una vez por carga, no en cada repintado. |
| 5 | **Conflictos de sincronización** | Diferencias por sección (entidades: cada línea de una lista o de un bloque). Fusionar = tu versión más lo que solo está en la otra; si una misma clave tiene dos valores, se queda el tuyo y se avisa; si el resultado no es un fichero válido (la misma entidad cambiada en los dos lados), no se fusiona: a mano. Nada se pierde: lo descartado va a la papelera como «copia en conflicto» y al restaurarlo vuelve a aparecer el conflicto. |
| 6 | **Papelera y cuarentena** | Pantalla con búsqueda, vista previa y días que quedan; la cuarentena se puede ver (texto de Claude y motivo) sin tocar tus datos. Restaurar notas de una fuente borrada restaura también la fuente si está en la papelera; si no, lo explica (§9.22). |
| 7 | **Roles y tareas propios** | Gestión → Roles / Tareas: editar crea tu versión en tu carpeta (manda sobre la de finhub), «restaurar el de finhub» la manda a la papelera, «nuevo» crea uno. Se valida el formato; el trabajo y el esquema siguen fijados por el código (R1). |
| 8 | **Accesibilidad** | «Saltar al contenido» (botón: el hash ya se usa para las pestañas), `main` enfocable, flechas/Inicio/Fin en las pestañas, nombres accesibles en todo control. Un e2e audita cada pestaña y los modales principales (con autocomprobación del auditor). |
| 9 | **Rendimiento** | Carpeta de prueba con 5 años (≈ 3.000 movimientos, 600 operaciones, 2.000 notas más): el peor repintado medido es ≈ 70 ms (Cartera), sin optimizaciones nuevas. |
| 10 | **App instalable** | Manifiesto, iconos PNG dibujados por código (sin dependencias) y un service worker que **no guarda nada en caché**: tus datos no se copian a ningún almacén del navegador. |
| 11 | **Arranque con Windows** | `finhub arranque activar` escribe un único `finhub.vbs` (con una marca) en la carpeta Inicio, que lanza `wsl.exe -d <distro> -- node bin/finhub.js --primer-plano --silencioso` sin ventana (en primer plano para que WSL no lo corte). Solo borra el suyo; uno ajeno con el mismo nombre no se toca. |
| 12 | **Toast y barra R1** | La barra R1 queda fija abajo (sticky) y los avisos salen por encima: ya no la tapan durante el deshacer de 10 s (pendiente desde F10). |
| 13 | **Tramos de otro año** | Si `impuestos_verificado` es de un año anterior, Cartera avisa «verifica los de AAAA» (§9.19). |
| 14 | **Celebración de aciertos** | Cuando una predicción de un descubrimiento pasa a «acertada» (a mano o sola), Rex se alegra con un aviso (§14.18). |
| 15 | **Textos de «llega en la fase…»** | Se quitaron los que quedaban (Pendientes, Panel, Metas, Gestión). |

## Después de F12 · pulido y documentación · 2026-11-03
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Indicador de guardado** | Arriba a la derecha, siempre visible. Sigue cada petición que escribe en la carpeta (`api.pedir`) y enseña, por prioridad: sin conexión, guardando…, no se guardó, solo lectura, ficheros sin leer, actualizado (cambio de fuera), guardado HH:MM. «Guardando…» se ve al menos 350 ms (sin parpadeos). Un rechazo 4xx no escribe nada y no cuenta como error de guardado. Al pulsarlo: dónde se guarda, cómo (temporal + fsync + renombrar), qué no puede saber (si la nube ya subió) y el historial de la sesión con sus ficheros. Cerrar la pestaña con un guardado a medias pide confirmación. Los errores se anuncian a lectores de pantalla. |
| 2 | **Ajustes que no hacían nada** | El repaso encontró dos: `conflictos` (los patrones no llegaban al almacén) y `puerto` (la CLI usaba siempre 4747). Ahora los patrones `{nombre} (conflicto *).md` se validan al guardar y se aplican en caliente, y `finhub` arranca en el `puerto` de ajustes.md si no pasas `--puerto`. |
| 3 | **Capturas reproducibles** | `pnpm capturas` levanta finhub con el ejemplo en una copia temporal y fotografía las 10 pestañas, 4 modales, el tema oscuro y la primera vez. Escribe solo en `docs/capturas/`. La ruta del temporal se enseña como `D:\GoogleDrive\FINANZAS`; la cabecera sigue diciendo «ejemplo · datos inventados». |
| 4 | **Documentación** | `INSTRUCCIONES.md` (instalar, elegir y cambiar tu carpeta, primera vez, uso diario, Claude, arranque, copias, actualizar, problemas), `docs/ARQUITECTURA.md` (mapa del código y flujos), `docs/README.md` (índice), `OPERACIONES.md` reescrito desde el registro real de operaciones (la propuesta de F0 tenía nombres que nunca existieron) y `FORMATOS.md` §5 corregido (cuarentena en JSON, campos reales del registro y de la papelera). README con galería de capturas. |
| 5 | **Sectores con nombre** | El mapa de efectos enseña «Consumo básico», «Tecnología»… en vez de los ids. |

## QA · decisiones dudosas resueltas · 2026-11-06
El usuario pidió aplicar en cada una la opción recomendada. Detalle y bugs en [QA-INFORME.md](QA-INFORME.md).
| # | Decisión | Detalle |
|---|---|---|
| 1 | **Mover a una fuente pública** | Se sigue rechazando (QA-018): gana R1. Para publicar una nota, se copia su texto. |
| 2 | **Quitar «privada» a una fuente con notas** | Rechazado por R1 (QA-049). Vacía, sí. |
| 3 | **`<datos origen nivel>`** | Se queda: `nivel="externo"` en su atributo, `origen` dice de dónde viene. Mismo efecto que el `origen="externo"` del plan. |
| 4 | **Fichero de 0 bytes** | Se trata como «solo en la nube», nunca como vacío: lo prudente. El aviso ya dice «o están vacíos». |
| 5 | **Lección al reabrir** | Se conserva (QA-050). `## Cierre` puede quedar en un mes reabierto solo con `leccion`. |
| 6 | **Grupos y meses cerrados** | Cambiar la naturaleza aplicándola, o borrar el grupo, marca «editado tras cierre» sin preguntar (QA-051): es una acción explícita sobre todo el catálogo. Renombrar etiquetas no marca: no cambia cifras. |
| 7 | **Listas vacías en ajustes** | `sectores_efectos` y `descubrir_filtros` admiten `- clave:` vacío (QA-052). Sin la clave, las de serie. Único cambio de formato, compatible hacia atrás. |
| 8 | **Conflicto con la misma entidad** | Fusionar deja la tuya y avisa; la otra versión va a la papelera (QA-036). |
| 9 | **Edición a mano de un fichero poco usado** | Se ve en el barrido (hasta 30 s), como dice el plan. No se pierde: QA-024 da 409 si operas antes. |
| 10 | **Saldo inicial** | Los movimientos anteriores a su fecha no cuentan: si no, se contarían dos veces. |
| 11 | **Movimiento sin cuenta** | A la cuenta por defecto (la primera corriente activa). |
| 12 | **Venta sin participaciones** | Reduce el coste en proporción al valor estimado: es lo que significa «reembolsos a coste». |
| 13 | **Crisis** | La caída se mide desde el pico (QA-044) y recuperar es volver a ese pico (QA-053). «Aportando» compara con lo que llevas puesto, como dice la interfaz. |
| 14 | **Libertad financiera** | Superar, no igualar (QA-054). |
| 15 | **Impuesto** | Se redondea una vez, al final (QA-055). |
| 16 | **Mínimo por fondo** | Quien no llega recibe 0 y su parte va a los demás: nunca se invierte de más de lo que pones. |
| 17 | **XIRR > 1.000 % anual** | «No concluyente»: anualizar un 1 % de un día no dice nada útil. |
| 18 | **Colores** | Los de la maqueta, en gráficos; un poco más oscuros en texto para llegar a AA (QA-046). El ■ de «Queda» se queda como en la maqueta: el dato está escrito al lado. |
| 19 | **Rutas de la API** | `/api/claude/ejecutar` y `/api/eventos`: un solo canal SSE con todos los trabajos, en vez del `/api/trabajos/:runId/eventos` del plan. |
| 20 | **Sandbox** | Fuera de la carpeta (§2.6), no en `.finhub/sandbox/` (§0.3.4): el plan se contradice y fuera no se sincroniza. |
| 21 | **Primera vez** | La carpeta se elige en la terminal, porque el servidor la necesita para arrancar; luego se cambia desde Ajustes. |
| 22 | **Ancho en 1920 px** | A la izquierda con el ancho máximo, como la maqueta. |
| 23 | **Migraciones** | El mecanismo está probado, pero no conectado al servidor: con el esquema 1 no hay nada que migrar. Al subir a esquema 2 hay que conectarlo, con su copia previa. |

