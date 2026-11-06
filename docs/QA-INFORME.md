# Informe de QA de finhub

Plan e inventario: [QA-PLAN.md](QA-PLAN.md). Lista manual: [QA-CHECKLIST.md](QA-CHECKLIST.md). Etiqueta de partida: `qa-inicio` (`558ffe4`).

## Resumen

| | |
|---|---|
| **`pnpm test:todo`** | **720 pruebas, en verde tres veces seguidas** (650 sin navegador + 70 de navegador) |
| **Cobertura de líneas** | `src/core` 99,1 % (objetivo 95) · `src/claude` 98,8 % y `src/server` 98,0 % (objetivo 85) · `src/cli` 85,4 % |
| **Sesión prolongada** (`pnpm test:larga`, aparte) | 30 minutos, 15.976 operaciones: sin fugas |
| **`~/.config/finhub/config.json`** | igual que al empezar: no existe. Ninguna prueba ha tocado tu carpeta ni ha llamado al Claude real |
| **Bugs críticos o altos abiertos** | ninguno conocido |
| **Oráculos** | 132 casos dorados y el diferencial con `src/core`, en cuatro zonas horarias |

**Un fallo intermitente sin explicar:** ver «Riesgos».

57 bugs: 14 críticos, 20 altos, 13 medios y 10 bajos. Todos arreglados, cada uno con su prueba que fallaba antes.

**QA9, con tu permiso:**
- **Prueba real con Claude Code 2.1.319** (`pnpm qa:humo -- --si`, 2026-11-07): 9 de 9 trabajos correctos, 0,11 USD, con haiku. Herramientas exactas, sin MCP, hooks, skills ni plugins globales, y nada tuyo en los trabajos sin privado. Detalle en [CLAUDE-CLI.md](CLAUDE-CLI.md).
- **`pnpm qa:validar`** sobre `D:\\GoogleDrive\\Vida-Diego\\FINANZAS`: la carpeta estaba vacía, sin nada que validar. Hay que repetirlo cuando tenga datos.
- **Recorrido real** en `FINANZAS-PRUEBAS`, con navegador automático y el servidor de verdad (2026-11-07): asistente, Mes, Cartera, Metas y todas las pestañas, sin errores. Una edición a mano se ve en la web en 1,1–1,8 s.

## Estado de R1

«Ningún trabajo de Claude junta a la vez datos privados, texto externo y salida a internet.» Se cumple en todos los casos probados, con Claude simulado en las baterías y con el **real** en la prueba de humo de QA9.

| § 0.3 | Garantía | Test | Resultado |
|---|---|---|---|
| 1 | Sin herramientas de disco ni terminal; el servidor es el único que escribe | `test/r1/aislamiento.test.js` (spec, flags), `test/r1/r1.test.js` | ✓ |
| 2 | Aislado de tu configuración global | `test/r1/aislamiento.test.js` (flags por trabajo) | ✓, también con el Claude real (`pnpm qa:humo`) |
| 3 | Guardia en tiempo de ejecución | `test/r1/aislamiento.test.js`, `QA-003`, `QA-004`, `QA-006`, `test/r1/ataques.test.js` | ✓ |
| 4 | `cwd` vacío, nuevo y borrado, también con error, timeout y cancelación | `test/r1/aislamiento.test.js`, `QA-021` | ✓ |
| 5 | Entorno mínimo sin rutas de tus datos | `test/r1/canarios.test.js` (env en el proceso real), `test/r1/r1.test.js` | ✓ |
| 6 | Spec declarativo; el test R1 falla de verdad si se rompe | `test/r1/aislamiento.test.js` («en una copia con un trabajo roto, falla») | ✓ |
| 7 | Sin blanqueo: privado y encaje no escriben en `conocimiento/`; rex-web y pulso no leen lo tuyo | `test/r1/canarios.test.js` (≥ 200 modelos), `test/r1/ataques.test.js`, `test/conocimiento/qa5.test.js`, `QA-001`, `QA-002`, `QA-016`, `QA-018` | ✓ |
| 8 | Sesiones separadas: todas las parejas | `test/r1/aislamiento.test.js` | ✓ |
| 9 | Texto externo = datos; etiquetas escapadas | `test/r1/ataques.test.js`, `test/r1/descubrir.test.js` | ✓ |
| 10 | Validación y cuarentena con motivo | `test/r1/tablas.test.js`, `test/r1/ataques.test.js`, `QA-009` a `QA-013`, `QA-022` | ✓ |
| 11 | Claude nunca cambia tus datos financieros | `test/r1/nada-automatico.test.js` (huella antes y después) | ✓ |
| 12 | Registro de cada ejecución, también fallidas y canceladas | `test/r1/aislamiento.test.js`, `QA-014`, `QA-015` | ✓ |
| 13 | Tests de ataque en `test/r1/` | `test/r1/ataques.test.js`: 10 textos trampa × 5 trabajos, 5 herramientas, JSON trampa, rutas | ✓ |
| 14 | Modo web de Rex con aviso; historial aparte | `test/e2e/ia.test.js`, `test/conocimiento/qa5.test.js` | ✓ |

**Nada automático:** con relojes simulados (40 días, varios cambios de mes) y todas las lecturas de la API, 0 procesos de Claude sin un POST explícito (`test/r1/nada-automatico.test.js`).

## Bugs

Gravedades: crítico (R1, seguridad, pérdida o corrupción) · alto (cifra incorrecta o funcionalidad rota) · medio · bajo.

| Id | Gravedad | Qué pasaba | Causa raíz | Arreglo (commit) | Test |
|---|---|---|---|---|---|
| QA-001 | crítico | Una nota de `Mis notas` con `fuente: base` en su campo llegaba a los trabajos con internet. | El índice de notas creía al campo de la nota y no a su carpeta. | La fuente es la carpeta; el campo no manda. (`6041433`) | `test/qa/regresiones/QA-001.test.js` |
| QA-002 | crítico | Con `mias` declarada sin `privada: sí` en `_fuentes.md`, Mis notas dejaban de ser privadas. | La privacidad salía solo de la ficha de la fuente. | `esFuentePrivada`: `mias` lo es siempre. (`448ea1a`) | `test/qa/regresiones/QA-002.test.js` |
| QA-003 | crítico | Un proceso que acababa bien sin evento `init` daba una salida válida. | La guardia solo actuaba cuando llegaba el evento. | Sin `init`, código `sin_init`: no se usa la salida. (`fc95b5e`) | `test/qa/regresiones/QA-003.test.js` |
| QA-004 | crítico | Un `init` malformado (sin lista de herramientas, tipos raros) pasaba como bueno. | `revisarInit` comprobaba solo lo que encontraba. | Falla cerrado: lo que no se puede comprobar aborta. (`fda5a7c`) | `test/qa/regresiones/QA-004.test.js` |
| QA-005 | alto | Una línea `null` o un número en el stream tiraba el servidor. | Se leían propiedades de cualquier JSON. | Lo que no es un objeto es ruido y se ignora. (`b6d3d47`) | `test/qa/regresiones/QA-005.test.js` |
| QA-006 | crítico | Un `tool_use` prohibido en el stream parcial o antes del `init` no se detectaba. | Solo se miraban los mensajes completos. | Se comprueba en cuanto se anuncia, también en `stream_event`. (`c9c8514`) | `test/qa/regresiones/QA-006.test.js` |
| QA-007 | alto | Cancelar, el timeout o la guardia dejaban vivos a los hijos de Claude. | Se mataba el proceso, no su grupo. | `detached` y señal al grupo; SIGKILL al cerrar. (`ac437c5`) | `test/qa/regresiones/QA-007.test.js` |
| QA-008 | alto | Una salida enorme agotaba la memoria. | Sin límite en lo acumulado. | `MAX_SALIDA` de 64 MB con error claro. (`e087975`) | `test/qa/regresiones/QA-008.test.js` |
| QA-009 | alto | Claves `constructor` o `__proto__` en el JSON hacían reventar el validador. | Búsqueda con `in` sobre objetos normales. | `Object.hasOwn`: van a cuarentena. (`c95a8f1`) | `test/qa/regresiones/QA-009.test.js` |
| QA-010 | alto | Cifras inventadas fuera de `respuesta_md` no se señalaban; los números de ids y URL daban falsos positivos. | El verificador miraba un solo campo. | Revisa todos los textos que ve el usuario y quita ids y URL antes de medir. (`7bcd8fd`, `f7d703f`) | `test/qa/regresiones/QA-010.test.js` |
| QA-011 | alto | Citas inventadas en campos anidados se guardaban; una URL valía de cita en un trabajo sin internet. | Limpieza solo en el primer nivel. | `limpiarCitas` recursivo y `urls` según `trabajo.internet`. (`4914085`) | `test/qa/regresiones/QA-011.test.js` |
| QA-012 | alto | En el encaje valían cifras del informe externo o de la cartera. | Las cifras permitidas incluían todos los bloques. | `cifrasEstrictas`: solo las de `<cifras>`. (`20c07aa`) | `test/qa/regresiones/QA-012.test.js` |
| QA-013 | medio | Falsos positivos y negativos con 57,371.20, con redondeos y con enteros con unidad. | Una sola lectura del número y tolerancia fija. | Lecturas es-ES y en-US, tolerancia por decimales y reglas para años y enteros. (`2466344`) | `test/qa/regresiones/QA-013.test.js` |
| QA-014 | medio | El registro no llevaba destino, uso, ids de entrada ni código de error. | Línea mínima. | Campos añadidos. (`a00e500`) | `test/qa/regresiones/QA-014.test.js` |
| QA-015 | alto | Una ejecución rechazada o que fallaba antes de lanzarse no dejaba línea; dos simultáneas podían pisarse. | Escritura leer-añadir-escribir sin cola y salidas tempranas. | Cola por servicio; `try/catch` en toda la ejecución. (`3bf9450`) | `test/qa/regresiones/QA-015.test.js` |
| QA-016 | crítico | Borradores, análisis e ideas enviados desde el navegador podían llegar a trabajos sin privado. | El servidor aceptaba `bloquesExtra` tal cual. | Solo el trabajo privado, y con nivel privado. (`b8893c9`) | `test/qa/regresiones/QA-016.test.js` |
| QA-017 | alto | Parar el servidor o cambiar de carpeta dejaba trabajos en marcha que terminaban en la carpeta nueva. | Nadie los cancelaba. | `cancelarTodos`. (`0efa94d`) | `test/qa/regresiones/QA-017.test.js` |
| QA-018 | crítico | Mover una nota de Mis notas a una fuente pública la blanqueaba hacia internet. | `nota.mover` no miraba la privacidad. | Rechazado con explicación. Ver decisiones dudosas. (`1e36d6f`) | `test/qa/regresiones/QA-018.test.js` |
| QA-019 | alto | El navegador podía mandar parámetros arbitrarios a un trabajo (temas, fuentes, modos). | Sin validar en el servidor. | Validación de `rex-web`, `pulso` y `temasValidos`. (`ac8ad56`) | `test/qa/regresiones/QA-019.test.js` |
| QA-020 | medio | Un proceso muerto por señal o por el límite parecía un éxito vacío. | Solo se miraba el código de salida. | `close(codigo, senal)` y detección de límite. (`04052a5`) | `test/qa/regresiones/QA-020.test.js` |
| QA-021 | medio | Sandboxes de un servidor muerto quedaban para siempre. | Nadie los limpiaba. | Limpieza al arrancar, solo de procesos muertos. (`90fec99`) | `test/qa/regresiones/QA-021.test.js` |
| QA-022 | crítico | Un importe en euros en cualquier campo de un descubrimiento pasaba, salvo en la tesis. | La comprobación miraba solo algunos campos. | Se revisan todos los textos: cuarentena. (`6fd6dae`) | `test/qa/regresiones/QA-022.test.js` |
| QA-023 | medio | La copia del día podía llevar ya el cambio; parar a media copia dejaba una carpeta temporal para siempre. | Foto tras varios `await`; sin esperar al cerrar. | Foto síncrona, se espera al parar y se limpian las huérfanas. (`4998b05`) | `test/qa/regresiones/QA-023.test.js` |
| QA-024 | crítico | Editar a mano un fichero y hacer una operación antes del sondeo (hasta 30 s) pisaba la edición. | `escribir` confiaba en el índice. | `comprobarDisco`: si cambió, recarga y 409, sin escribir nada. (`6413e65`) | `test/qa/regresiones/QA-024.test.js` |
| QA-025 | crítico | Dos pestañas: la de datos viejos operaba sin enterarse del cambio de la otra. | La web nunca mandaba versión. | Cada operación lleva `base`; 409 si el fichero cambió después. Operaciones en fila por pestaña. (`b9b832d`) | `test/qa/regresiones/QA-025.test.js` |
| QA-026 | crítico | Un marcador de 0 bytes se leía como fichero vacío y se podía reescribir; un `stat` fallido lo trataba como inexistente. | `leerDisco` solo sospechaba si el tamaño era mayor que 0. | 0 bytes y `stat` fallido: nube o ilegible, nunca vacío. (`963ac87`) | `test/qa/regresiones/QA-026.test.js` |
| QA-027 | alto | La segunda instancia borraba los temporales de la primera, a mitad de escritura, y purgaba la papelera. | La limpieza iba antes de mirar el candado. | Solo se limpia con el candado. (`ddd92ec`) | `test/qa/regresiones/QA-027.test.js` |
| QA-028 | alto | Hasta 30 s después de perder el control se seguía escribiendo. | El candado solo se leía en el latido. | `verificar` antes de cada escritura. (`d142ddc`) | `test/qa/regresiones/QA-028.test.js` |
| QA-029 | medio | Un deshacer de hace horas funcionaba. | Las inversas no caducaban. | 10 s + 5 de gracia. (`d8edfca`) | `test/qa/regresiones/QA-029.test.js` |
| QA-030 | bajo | Operación desconocida: 400 en vez de 422. | Mismo código que «inválida». | Código `desconocida`. (`07e40cc`) | `test/qa/regresiones/QA-030.test.js` |
| QA-031 | bajo | Argumentos de otro tipo daban 500 sin explicación. | `TypeError` sin capturar en las operaciones. | Se convierte en «los datos de … no son válidos». (`0a62494`) | `test/qa/regresiones/QA-031.test.js` |
| QA-032 | bajo | Si no se podía crear la carpeta, 500 sin explicación. | `mkdir` fuera del `try`. | Dentro, con el código de error. (`0d14aed`) | `test/qa/regresiones/QA-032.test.js` |
| QA-033 | alto | «Editar recurrente → también este mes» sobre un mes cerrado cambiaba el movimiento sin confirmar ni recalcular: el cierre dejaba de cuadrar. | `cadaMovimiento` no mira el estado del mes. | Pide confirmación, marca y recalcula. (`0b1cee8`) | `test/qa/regresiones/QA-033.test.js` |
| QA-034 | crítico | Tras cortar «copiar» o «mover», la carpeta a medias parecía de finhub y «usar» la aceptaba: abrías la mitad de tus datos. | `ajustes.md` se copiaba pronto (por orden alfabético de otras carpetas). | `ajustes.md`, el último. (`7e7eca1`) | `test/qa/regresiones/QA-034.test.js` |
| QA-035 | alto | Si la papelera del sistema fallaba al mover, el servidor se quedaba sin carpeta hasta reiniciar. | Se cerraba antes y el fallo salía por arriba. | Se avisa y se abre la nueva; si abrir falla, se vuelve a la anterior. (`626b8ff`) | `test/qa/regresiones/QA-035.test.js` |
| QA-036 | alto | Fusionar un conflicto con el mismo movimiento cambiado en los dos lados se rechazaba entero. | Fusión por líneas. | Deduplica por id, conserva el tuyo y lista lo ignorado; la otra versión queda en la papelera. (`0b142eb`) | `test/qa/regresiones/QA-036.test.js` |
| QA-037 | medio | El aviso de conflicto no salía en Pendientes (§2.6). | Solo se pintaba en la banda y en Ajustes. | Elemento en Pendientes con «Resolver». (`fad9a42`) | `test/qa/regresiones/QA-037.test.js` |
| QA-038 | alto | Cambiar de carpeta justo tras la primera escritura del día fallaba con ENOENT y podía llevarse temporales. | Listaba la copia del día mientras se hacía. | Espera a la copia y omite las copias a medias. (`370ebb7`) | `test/qa/regresiones/QA-038.test.js` |
| QA-039 | alto | `conocimiento/../../x.md` pasaba por dato (lo paraba el almacén, con 500); `..` como nombre en CONTEXTO apuntaba a la carpeta entera. | `detectar` y `archivarContexto` no miraban los segmentos. | Fuera en la entrada, con 4xx. (`dadb850`) | `test/qa/regresiones/QA-039.test.js` |
| QA-040 | medio | Una fuente o decisión llamada CON, NUL, AUX… daba un nombre reservado de Windows. | `slug` no los conocía. | `esReservado` en `slug`, `detectar` y `rutaSegura` (mismo commit que QA-039). (`dadb850`) | `test/qa/regresiones/QA-040.test.js` |
| QA-041 | crítico | Un enlace simbólico que sale de la carpeta se leía como dato (y podía acabar en un trabajo) y por una carpeta enlazada se escribía fuera. | `recorrer` y `escribir` seguían los enlaces. | Enlaces que salen: ajenos; escribir por ellos, rechazado. (`87a3904`) | `test/qa/regresiones/QA-041.test.js` |
| QA-042 | alto | Cualquier recarga (otra pestaña, edición a mano, sincronización) borraba lo que escribías en un formulario. | `repintarModal` y `render` sustituyen el HTML. | `conservarEscrito` guarda lo tocado; lo enviado no vuelve. (`50019ea`) | `test/e2e/formularios.test.js` |
| QA-043 | alto | 300,01 € sobre 300,00 € salía en ámbar; apenas por encima del 90 %, en verde. | Color decidido con el porcentaje ya redondeado. | Se compara con céntimos. (`092b089`) | `test/qa/regresiones/QA-043.test.js` |
| QA-044 | alto | La caída máxima de una crisis se medía desde el inicio: subir y caer enseñaba una caída menor que la real. | Mínimo sobre el valor inicial. | Desde el pico; lo detectó el oráculo. (`ba48da9`) | `test/qa/regresiones/QA-044.test.js` |
| QA-045 | bajo | Medias de céntimos con 1 céntimo de diferencia en los medios exactos. | `Math.round` en vez de redondeo bancario. | `dividirRedondeo`. (`9089f35`, `638f125`) | `test/qa/regresiones/QA-045.test.js` |
| QA-046 | medio | Textos de color, filas archivadas y accesorios bloqueados por debajo de AA. | Colores de la maqueta pensados para gráficos. | Paleta de texto `--t-*`; también la tabla del mapa, que se salía 3 px con zoom 200 %. (`052d38d`) | `test/qa/regresiones/QA-046.test.js` |
| QA-047 | bajo | Enviar el chat con Rex trabajando daba un error de página (lo halló el mono, forzando el envío). | El campo desactivado no viene en el formulario. | `?.trim()`. (`cb04abd`) | `test/e2e/mono.test.js` |
| QA-048 | bajo | Un salto del reloj de WSL (medidos: pasos de 500 ms y saltos de varios segundos) podía caducar un deshacer al momento o dar una duración negativa en el registro. También hacía fallar pruebas a ratos. | Tiempo transcurrido medido con el reloj de pared. | Reloj monótono. (`edbc438`) | `test/qa/regresiones/QA-048.test.js` |
| QA-049 | crítico | Quitar «privada» a una fuente con notas, o sacarla de la familia `mias`, las hacía públicas: la misma fuga que QA-018 por otro camino. | `lista.editar` no miraba la privacidad. | Rechazado si tiene notas. (`ebbc254`) | `test/qa/regresiones/QA-049.test.js` |
| QA-050 | medio | Reabrir un mes borraba su lección y lo escrito a mano en esa sección; pasados 10 s no se recuperaba. | Se quitaba la sección entera. | Se conservan; solo se quita la foto. (`259657a`) | `test/qa/regresiones/QA-050.test.js` |
| QA-051 | medio | Cambiar la naturaleza de un grupo o borrarlo alteraba totales de meses cerrados sin marcarlos. | Las operaciones de catálogo no miran el estado del mes. | Marca «editado tras cierre». (`0f0e108`) | `test/qa/regresiones/QA-051.test.js` |
| QA-052 | bajo | No se podían vaciar los sectores del mapa ni los filtros de Descubrimientos. | El tipo no admitía lista vacía. | Se admite; sin la clave, las de serie. (`1e80dfe`) | `test/qa/regresiones/QA-052.test.js` |
| QA-053 | medio | «Meses en recuperar» medía la vuelta al inicio, no al pico: tras subir y caer un 25 % decía 0 meses. | No se cambió al medir la caída desde el pico (QA-044). | Recuperar es volver al pico. (`69c12df`) | `test/qa/regresiones/QA-053.test.js` |
| QA-054 | bajo | Igualar el objetivo de libertad contaba como alcanzarlo; §4.4 dice «supera». | `>=`. | `>`. (`f72e238`) | `test/qa/regresiones/QA-054.test.js` |
| QA-055 | bajo | El impuesto podía diferir 1–2 céntimos. | Se redondeaba en cada tramo. | Se redondea una vez, al final. (`de3c6a8`) | `test/qa/regresiones/QA-055.test.js` |
| QA-056 | medio | Un clic se perdía sin avisar si los datos se recargaban justo entre pulsar y soltar. Salió como fallo intermitente de una prueba. | El repintado sustituye el botón: el navegador no ve el clic. | El repintado espera a que sueltes. (`77580a0`) | `test/e2e/formularios.test.js` |
| QA-057 | bajo | Por debajo de mil euros, el eje de la línea de tiempo decía «0k, 0k, 0k»; y «no concluyente» salía en verde, como si fuera bueno. Lo encontró la prueba real con tus datos de prueba. | Etiqueta siempre en miles enteros; color fijo. | `etiquetaMiles` y gris cuando no hay dato. | `test/qa/regresiones/QA-057.test.js` |

Dos incidencias del propio proceso, sin reescribir el historial, como pediste: QA-010 se commiteó en `7bcd8fd` con su prueba aún en rojo y se corrigió en `f7d703f`; QA-040 comparte commit con QA-039 porque tocan las mismas líneas.

## Decisiones dudosas

Pediste aplicar en cada una la opción recomendada. El detalle de cada decisión está en [DECISIONES.md](DECISIONES.md), «QA · decisiones dudosas resueltas».

**Han cambiado el código:** una fuente privada con notas no puede dejar de serlo (QA-049) · reabrir conserva la lección (QA-050) · cambiar o borrar un grupo marca los meses cerrados (QA-051) · listas vacías en ajustes (QA-052) · recuperar una crisis es volver al pico (QA-053) · libertad: superar, no igualar (QA-054) · el impuesto se redondea al final (QA-055) · el aviso de la nube dice también «vacíos».

**Se quedan como estaban, por ser lo recomendado:** no mover Mis notas a una fuente pública, el atributo `nivel` en `<datos>`, 0 bytes como «solo en la nube», el barrido de 30 s, saldo inicial con fecha, cuenta por defecto, venta a coste proporcional, mínimo por fondo, XIRR > 1.000 % no concluyente, colores de la maqueta en gráficos, rutas de la API, sandbox fuera de la carpeta, carpeta elegida en la terminal, ancho en 1920 px.

**Tres avisos que debes conocer:**
1. **QA-052 toca el formato de `ajustes.md`**, algo que pediste consultar antes. Lo he hecho porque pediste corregirlo todo: es compatible hacia atrás, solo admite una lista vacía.
2. **Las migraciones de esquema no están conectadas al servidor.** Con el esquema 1 no hay nada que migrar; al subir a esquema 2 habrá que conectarlas, con su copia previa.
3. **`PROMPT-claude-code.md` y las capturas:** el primero está en `.git/info/exclude`, solo en tu copia local. Las capturas (108 imágenes, 13 MB) ya están en el historial, que no reescribo; se regeneran con `FINHUB_CAPTURAS=1 pnpm test:visual`.

## Riesgos restantes y lo no automatizable

- **Fallo intermitente sin explicar.** `test/e2e/descubrimientos.test.js`, «simulador → encaje → … → diario de decisiones», falló en 2 ejecuciones completas seguidas (en ambas, «no se cumplió: decisión creada», y la prueba siguiente, en cascada). No se pudo reproducir: pasó en repeticiones sueltas, también con toda la CPU ocupada, y en las 4 ejecuciones completas posteriores. Esas 2 ejecuciones no dejaron datos, porque el diagnóstico se añadió después. La hipótesis del clic perdido (QA-056) era un bug real, pero **no** explica este fallo: tras arreglarla volvió a fallar. Puede seguir ahí. Si reaparece, el error dirá qué respondió el servidor y qué enseñaba la página. Efecto si fuera un fallo de la app: «Añadir al diario» no crea la decisión; no se ha visto ningún dato perdido.
- **Claude de verdad, una sola pasada.** Los ataques y las baterías de R1 se han probado con el Claude simulado; con el real, 9 ejecuciones normales con haiku, sin textos trampa. Si una versión nueva de Claude Code cambia los flags o el evento `init`, la guardia falla cerrada; conviene repetir `pnpm qa:humo -- --si` tras actualizar.
- **Sistema de ficheros real.** SIGKILL, fallos de disco, nube, conflictos y candado se han repetido en `D:` (9P sobre NTFS) el 2026-11-07, en una carpeta temporal fuera de Drive ya borrada: 60 SIGKILL sin ningún fichero truncado, y escrituras en 68 ms. Sin probar allí: los permisos (`chmod` no tiene efecto en esa unidad, y 3 pruebas fallan por eso) y un corte de luz de verdad.
- **Papelera de Windows, probada de verdad por accidente.** Una prueba pensada para `/tmp`, al ejecutarse en `D:`, mandó una carpeta de prueba `FINANZAS vieja` (solo un `ajustes.md`) a tu Papelera de reciclaje. Funciona, pero esa carpeta no es tuya: puedes vaciarla.
- **Sincronización simulada.** Los patrones de Google Drive para copias en conflicto siguen sin verificar (`docs/SINCRONIZACION.md` §4 y §7): punto 15 de la lista manual.
- **Windows:** acceso directo, app instalada, arranque con el sistema, Bloc de notas, Obsidian y dos PC: solo manual.
- **Revisión visual.** Las capturas las he revisado en hojas de contacto, por grupos, no una a una a tamaño completo; lo medible (contraste y desbordes) sí se comprueba en cada una. Comparación con la maqueta: sin diferencias que afecten al uso, aparte de las anotadas arriba.
- **Oráculos:** no se ha comprobado con mutaciones que los dorados detecten fallos introducidos a propósito. `alquilar o comprar` y los escenarios de vida no tienen comparación completa porque el plan solo enumera los supuestos.
- **Prueba larga:** 30 minutos con 15.976 operaciones, antes de los últimos arreglos: heap de 18 a 21 MB (crecen los datos), sin SSE ni temporizadores acumulados.
