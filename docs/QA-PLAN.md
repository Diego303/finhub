# Plan de QA de finhub

Misión: demostrar con pruebas que finhub **calcula bien**, **nunca pierde ni corrompe datos** y **cumple R1 en todos los casos**. Referencias: [PLAN.md](PLAN.md) (manda en comportamiento, datos, cálculos y seguridad), la maqueta (manda en lo visual), [CLAUDE-CLI.md](CLAUDE-CLI.md) y [SINCRONIZACION.md](SINCRONIZACION.md). Resultado de cada fase: [QA-INFORME.md](QA-INFORME.md).

## Reglas del entorno
- **Datos reales intocables.** `scripts/test.js` lanza todos los procesos con `HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` y `XDG_DATA_HOME` en un temporal, y comprueba al final el hash de `~/.config/finhub/config.json`.
- **Trampa de rutas** (`test/qa/trampa-rutas.js`, con `--import` en todos los procesos Node): cualquier escritura fuera de `os.tmpdir()` o de `test/` hace fallar el test y queda anotada aunque el código se trague el error.
- **Ningún test llama al Claude real.** El primer `claude` del `PATH` es un falso que da la alarma; los tests usan `test/fake-claude.js`.
- **Servidores de prueba:** `test/qa/entorno.js` (puerto libre, solo se para su pid).

## Inventario
### Interfaz (`web/`)
| Zona | Dónde | Plan |
|---|---|---|
| Cabecera, ruta y estado, indicador de guardado, Gestión ▾ | `componentes/cabecera.js`, `guardado.js`, `gestion.js` | §5 Global |
| Pendientes hoy y Próximos (9 + 2 elementos) | `componentes/pendientes.js`, `core/resumen.js` | §4.8 |
| Barra y modal R1, registro | `componentes/r1.js` | §0, §5 |
| Primera vez (carpeta vacía) | `vistas/inicio.js` | §14.1 |
| Panel · Mes · Cartera · Metas · Herramientas · Análisis · 🔭 Descubrimientos · Conocimiento · Rex · Tu año | `vistas/*.js` | §5 |
| Modales: Ajustes (8 secciones), papelera y cuarentena, conflictos, roles y tareas, pulso, ingesta, datos, valores, recurrentes, cierre, activos y objetivo, generar cartera, meta, decisión, hito, nota, ficha de fuente, mezcla, informe, simulador, encaje, precios de seguimiento, estado de guardado | `componentes/*`, `vistas/*` | §5, §14 |
| Gestión: cuentas, grupos, etiquetas, presupuestos, recurrentes, activos y objetivo, metas, conocimiento, roles, tareas, ajustes, seguridad, papelera | `componentes/gestion.js`, `editores.js` | §14.4 |
| Acciones de Pendientes: pulso, movimientos, recurrentes, valores, datos, cierre, pausas, predicciones, contexto, descubrimientos, seguimiento | `web/app.js` (`accion('pendiente')`) | §4.8, §4.9 |

### Operaciones (`src/core/ops/`, 74)
Catálogo completo en [OPERACIONES.md](OPERACIONES.md). Se comprueba además contra el registro real (`operaciones()`).

### API (`src/server/app.js`)
`GET /api/salud`, `version`, `estado`, `datos`, `fichero`, `papelera`, `conflicto`, `semilla`, `claude`, `claude/datos`, `claude/ejecucion`, `claude/registro`, `claude/tareas`, `claude/cuarentena`, `claude/cuarentena/ver`, `carpeta`, `eventos` · `POST /api/ops`, `deshacer`, `papelera/restaurar`, `conflicto/resolver`, `candado/tomar`, `claude/ejecutar`, `claude/cancelar`, `contexto/procesado`, `carpeta/validar`, `carpeta/cambiar`.

### CLI (`src/cli/`)
`start`, `stop`, `status`, `carpeta [ruta] --usar|--copiar|--mover|--crear|--si`, `arranque activar|desactivar|estado`; opciones `--datos`, `--puerto`, `--silencioso`, `--ejemplo`, `--primer-plano`.

### Ficheros de §3 (`src/core/formato/`, 31 formatos)
ajustes, cuentas, grupos, etiquetas, recurrentes, hitos, mes, metas, decisión, activos, operaciones, objetivo, clases, valores, plantilla, borrador, familias, fuentes, mezclas, predicciones, notas, semana, serie, descubrimiento, rol, tarea, análisis, encaje, chat, quiz, tu año.

### Trabajos de Claude (`src/claude/trabajos/`)
pulso, precios, datos, ingesta, conocimiento, privado, encaje, rex-web, descubrir.

### Ajustes (`src/core/formato/config.js`)
nombre, moneda, mes_inicio_dia, tema, puerto, impuestos_ahorro, impuestos_verificado, proyeccion, proyeccion_manual, libertad_multiplicador, pendientes, rex_humor, accesorios, copias, conflictos, claude_modelo, contexto_max, umbral_desviacion, sectores_efectos, crisis_periodos, descubrir_sin_cambios, descubrir_filtros.

## Matriz funcionalidad × tipo de prueba
U = unitaria · P = propiedad · D = diferencial (oráculo) · A = API/proceso real · E = e2e · M = manual

| Funcionalidad | U | P | D | A | E | M | Fase |
|---|---|---|---|---|---|---|---|
| Regla R1: spec de trabajos, canarios, aislamiento, guardia | ● | ● | | ● | | | QA1 |
| Ataques y salidas trampa, validador y verificador | ● | | | ● | | | QA1 |
| Ciclo de vida de Claude (cancelar, timeout, zombis, nada automático) | ● | | | ● | ● | | QA1 |
| Humo real de Claude Code | | | | | | ● (permiso) | QA9 |
| Formatos: ida y vuelta, entradas hostiles, importes | ● | ● | | | | | QA2 |
| Operaciones y deshacer (secuencias aleatorias) | ● | ● | | ● | | | QA2 |
| Meses, recurrentes, IDs estables, papelera | ● | ● | | ● | ● | | QA2 |
| Escritura atómica bajo SIGKILL y errores de disco, copias, concurrencia | | ● | | ● | | | QA2 |
| Carpeta sincronizada: nube, conflictos, candado, cambio de carpeta | ● | | | ● | ● | Windows real | QA3 |
| Cálculos financieros | ● | ● | ● | | | | QA4 |
| Conocimiento, mezclas, calibración, descubrimientos, flujos de IA | ● | ● | ● | ● | ● | | QA5 |
| API, red, path traversal, XSS, CLI | ● | | | ● | ● | | QA6 |
| Interfaz de punta a punta | | | | | ● | | QA7 |
| Rendimiento, uso prolongado, aspecto, contraste | | | | ● | ● | revisión visual | QA8 |
| Windows real, Bloc de notas, Obsidian, OneDrive, reinicio | | | | | | ● | QA9 |

## Riesgos, por gravedad
1. **R1:** un dato privado llega a un trabajo con internet (por la selección de notas, por metadatos, por `--resume`, por la entrada del navegador) o la guardia no salta.
2. **Pérdida o corrupción:** escribir sobre un fichero «solo en la nube» o editado a mano entre la lectura y la escritura; quedar a medias tras un corte; fusión que pierde movimientos; `deshacer` que pisa.
3. **Cifras incorrectas:** céntimos perdidos, TWR/TIR, FIFO, impuestos en los límites de tramo, mes financiero, percentiles.
4. **Seguridad web:** XSS desde datos o salidas de Claude, DNS rebinding, CSRF, salir de la carpeta.
5. **Procesos:** zombis, sandboxes sobrantes, trabajos lanzados solos, fugas en uso prolongado.
6. **Aspecto y accesibilidad.**

## Qué se automatiza y qué no
- **Se automatiza** todo lo anterior salvo lo de abajo: el código es local, determinista y se puede ejercitar con carpetas temporales, relojes simulados y el Claude falso.
- **No se automatiza, con su porqué:**
  - el init real de Claude Code y sus flags (dependen de tu versión y tu cuenta; QA9, con permiso);
  - Google Drive u OneDrive de verdad, dos equipos reales, arranque de Windows y botón «Instalar» (no hay entorno; `docs/QA-CHECKLIST.md`);
  - el juicio visual final (capturas de referencia en `test/visual/`, revisadas a mano).

## Línea base (antes de tocar nada)
Commit `558ffe4`, etiqueta `qa-inicio`, 2026-11-06, con HOME y XDG temporales.
- `node scripts/test.js --cobertura`: **unitarias, R1 y API 252 de 253; e2e 41 de 43**. `pnpm check` limpio.
- Los 3 fallos eran de los tests, no de la app: el de `runner` por la variable `NODE_V8_COVERAGE` que Node añade con cobertura; el de cartera por una fecha fija (2026-11-03); el de «nota movida» no se repite aislado (se vigila en QA7).
- `~/.config/finhub/config.json` no existe al empezar: la carpeta real sigue sin configurar. No había ninguna instancia en marcha.

| Carpeta | Ficheros | Media de líneas cubiertas (solo tests en proceso) |
|---|---|---|
| `src/core` | 51 | 98,8 % |
| `src/claude` | 20 | 98,6 % |
| `src/server` | 14 | 94,2 % |
| `src/cli` | 3 | 83,8 % |
| Total | | 96,57 % de líneas, 84,89 % de ramas, 93,24 % de funciones |

La cobertura alta de partida no significa que lo importante esté probado: los sospechosos de abajo están en líneas «cubiertas».

## Revisión estática: sospechosos
Lista de partida, sin arreglar todavía. Cada uno se confirma con un test o se descarta en su fase (el resultado está en QA-INFORME.md).

| # | Dónde | Sospecha | Fase |
|---|---|---|---|
| S1 | `core/conocimiento.js` `indiceNotas` | el campo `fuente:` de una nota manda sobre su carpeta: una nota de `mias/` con `fuente: mundo` se trataría como pública | QA1 |
| S2 | `core/conocimiento.js` `resumenFuentes` | `mias` solo es privada si `_fuentes.md` lo dice o por familia: sin entrada o editada, deja de serlo | QA1 |
| S3 | `claude/runner.js` | sin evento `init` y con salida rápida, la ejecución acaba «ok» sin pasar la guardia | QA1 |
| S4 | `claude/guardia.js` | `tools` o `mcp_servers` ausentes o con otro tipo pasan la guardia | QA1 |
| S5 | `claude/runner.js` `linea` | una línea JSON `null` o un `content` que no es lista lanza dentro del manejador de stdout (caída del servidor) | QA1 |
| S6 | `claude/runner.js` | `tool_use` solo se mira en `assistant`, no en el `stream_event` que llega antes | QA1 |
| S7 | `claude/runner.js` | `kill` solo al hijo directo (nietos huérfanos); salida sin límite de tamaño (memoria) | QA1 |
| S8 | `claude/validar.js` | `k in esq.props` acepta `constructor` y `__proto__` y revienta en vez de ir a cuarentena | QA1 |
| S9 | `claude/motor.js` | el verificador solo mira una lista de campos: `porque`, `texto`, `texto_md`… sin revisar | QA1 |
| S10 | `claude/motor.js` | citas inventadas solo se quitan a primer nivel, no en `escenarios[]`, `ideas[]` ni `descubrimientos[]`; URL en citas de trabajos sin internet | QA1 |
| S11 | `claude/verificador.js` | en `encaje` valen números de `<datos>`, y el plan pide «solo de `<cifras>`» | QA1 |
| S12 | `claude/motor.js`, `registro.js` | si `entrada()` lanza no hay línea de registro; `registrar` lee y reescribe sin cola; faltan `destino`, uso e ids | QA1 |
| S13 | `server/claude.js` | `borrador` e `idea` entran como «público» en `conocimiento`; `parametros` deja pasar lo demás sin validar (pulso sin fecha) | QA1 |
| S14 | `server/app.js` `parar` | parar el servidor no cancela los trabajos en marcha | QA1 |
| S15 | `core/ops/conocimiento.js` `nota.mover` | mover una nota de Mis notas a una fuente pública la blanquea | QA1 |
| S16 | `web/api.js` | la web nunca manda versión: el 409 no protege nada desde la interfaz | QA2 |
| S17 | `server/almacen.js` `escribir` | no comprueba el disco: una edición a mano sin detectar (hasta 30 s) se pisa | QA2 |
| S18 | `server/almacen.js` | un fichero de 0 bytes se lee como vacío; un `stat` que falla deja el fichero fuera del índice y se trataría como inexistente | QA3 |
| S19 | `server/app.js`, `almacen.js` | la segunda instancia (solo lectura) limpia temporales y purga la papelera al abrir | QA3 |
| S20 | `server/candado.js` | entre latidos (30 s), el que perdió el control sigue escribiendo | QA3 |
| S21 | `server/conflictos.js` | la fusión es por líneas: la misma entidad en los dos lados la rechaza entera en vez de deduplicar por id | QA3 |
| S22 | `server/almacen.js` `recorrer` | sigue enlaces simbólicos que salen de la carpeta | QA6 |
| S23 | `server/copias.js` | la foto se toma tras un `await`: la copia del día puede incluir ya el cambio; carpeta temporal huérfana tras un corte | QA2 |
| S24 | `server/deshacer.js` | no caduca a los 10 s en el servidor | QA2 |
| S25 | `core/ops/motor.js` | operación desconocida responde 400 (se pide 422) | QA6 |
| S26 | `claude/runner.js` | sandboxes huérfanos si el servidor muere (nadie los limpia) | QA1 |

Otros resultados de la revisión: `innerHTML` solo en `web/esc.js` (`pintar`, con escapado); ningún renderizado de Markdown ni enlaces dinámicos salvo uno en `vistas/cartera.js`; `new Date()` en core solo en los valores por defecto de `fechaLocal` y `horaLocal`; importes como enteros, sin `parseFloat` ni `toFixed` en cálculos de dinero; todas las escrituras de datos pasan por `Almacen.escribir`; `spawn` de Claude solo en `runner.js`.
