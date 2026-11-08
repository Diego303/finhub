# Arquitectura de finhub

Cómo está hecho, para quien quiera leer o cambiar el código. Qué hace y por qué: [PLAN.md](PLAN.md). Decisiones de cada fase: [DECISIONES.md](DECISIONES.md).

## Principios
- **Tus datos son Markdown** en una carpeta que eliges ([FORMATOS.md](FORMATOS.md)). No hay base de datos. El estado de la app sale de leer esos ficheros.
- **Cero dependencias de runtime.** Node ≥ 20 y el navegador. Sin build: los módulos ES se sirven tal cual. Solo `@playwright/test` como devDependency (e2e y capturas).
- **Un núcleo isomórfico.** `src/core/` se ejecuta igual en el servidor y en el navegador (que lo carga desde `/core/`). Los cálculos se hacen una vez y se prueban una vez.
- **El código calcula, Claude narra.** Las cifras salen de `src/core/`. Claude interpreta, cita y propone, siempre aislado (regla R1).
- **Nada se pierde.** Cada cambio tiene inversa exacta, papelera de 30 días y copia diaria. Un fichero que no se puede leer nunca se trata como vacío.

## Mapa del código
```
bin/finhub.js            CLI (→ src/cli/)
src/
├── core/                isomórfico (servidor y navegador)
│   ├── formato/         parsear y serializar cada fichero (ida y vuelta exacta, esquema, migraciones)
│   ├── ops/             operaciones puras con inversa exacta (OPERACIONES.md)
│   ├── modelo.js        textos de la carpeta → modelo de solo lectura para las vistas
│   ├── dinero.js · fechas.js · ids.js · prng.js     céntimos, puntos básicos, mes financiero, ids, PRNG con semilla
│   └── mes · cartera · rentabilidad · reparto · metas · proyeccion · herramientas · panel · resumen
│       · conocimiento · descubrimientos · tu-ano · rex · inicio …   los cálculos de cada pestaña
├── server/              solo Node
│   ├── app.js           App: carpeta, cola de operaciones, deshacer, papelera, copias, candado, SSE y API HTTP
│   ├── almacen.js       índice en memoria de la carpeta, sondeo, escritura atómica, conflictos, «nube»
│   ├── http.js          seguridad (Host, Origin, CSP, límite de cuerpo) y estáticos
│   ├── carpeta.js · config.js · rutas.js   elegir, validar, copiar o mover la carpeta; ~/.config/finhub; Windows ↔ WSL
│   ├── candado.js · papelera.js · copias.js · deshacer.js · conflictos.js · sse.js
│   └── claude.js        servicio de trabajos de Claude (monta parámetros, lanza, guarda el resultado como propuesta)
├── claude/              motor de Claude Code aislado (CLAUDE-CLI.md)
│   ├── trabajos/        los 9 trabajos declarativos: herramientas, banderas R1, esquema, entrada
│   ├── r1.js · guardia.js · runner.js · motor.js   regla R1, guardia del init, proceso aislado, ejecución completa
│   ├── contexto.js      selección de notas y prompt por bloques con nivel (privado, metadato, público, externo)
│   └── validar.js · verificador.js · registro.js · tareas.js   esquemas, cifras y citas, registro y cuarentena, tareas y roles
└── cli/                 start, stop, status, carpeta, arranque; --ejemplo
web/                     interfaz (ES modules, sin framework)
├── app.js · estado.js · api.js · acciones.js · esc.js   pestañas, estado y SSE, cliente API, delegación de eventos, HTML escapado
├── vistas/              una por pestaña (+ inicio: la primera vez)
├── componentes/         cabecera, guardado, modal, toast, Pendientes, R1, Rex, ajustes, papelera, conflictos…
└── graficos/            SVG por código (línea, sankey, barras, rango, treemap, línea de tiempo)
semilla/                 Base, plantillas de cartera, roles, tareas y manifiesto de Datos (públicos, sin datos tuyos)
ejemplo/                 carpeta de ejemplo (datos inventados, generada por scripts/generar-ejemplo.js)
scripts/                 test, check, ejemplo, capturas, iconos, probar-claude, validar-base
test/                    unitarios, servidor, R1, propiedades y e2e
```

## Flujo de datos
```
tu carpeta (Markdown) ──lee──▶ Almacen (índice en memoria) ──/api/datos──▶ navegador: construirModelo() ──▶ vistas
        ▲                                                                              │
        │ escritura atómica (temporal + fsync + renombrar)                             │ acción del usuario
        │                                                                              ▼
   App.aplicar() ◀── cola ◀── POST /api/ops {op, args, base} ◀── api.op() ── indicador de guardado
        │
        └─▶ SSE «version» ──▶ el navegador recarga los datos (también si el cambio vino de fuera)
```
1. **Arranque.** `Almacen.cargar()` recorre la carpeta y clasifica cada fichero: dato, `CONTEXTO/`, temporal huérfano (se limpia), copia en conflicto o ajeno. Lee los datos en paralelo y nunca vacía uno ilegible: lo marca «nube» o «ilegible».
2. **Lectura.** La web pide `/api/datos` (todos los textos con su versión) y construye el modelo con el mismo `src/core/` del servidor. Cada vista calcula lo suyo; el peor repintado con 5 años de datos es de unos 70 ms (`test/e2e/rendimiento.test.js`).
3. **Escritura.** Una acción llama a `api.op(nombre, args)`.
   - El servidor encola la operación y la aplica sobre los textos actuales con `aplicarOp`. Relee el candado, comprueba las versiones y el disco (409) y escribe cada fichero de forma atómica (si falla a mitad, deshace).
   - Guarda la inversa para deshacer y avisa por SSE.
   - El **indicador de guardado** (`web/componentes/guardado.js`) sigue cada petición que escribe: guardando… → guardado (con los ficheros), o «no se guardó», «sin conexión» y «solo lectura».
4. **Cambios de fuera.**
   - Cada 2 s, sondeo rápido (las carpetas y los ficheros «calientes»); cada 30 s, barrido completo. No se usa `fs.watch`: no funciona en las unidades de Windows vistas desde WSL ([SINCRONIZACION.md](SINCRONIZACION.md)).
   - Lo que cambia llega por SSE con `origen: disco` y la web lo enseña («↻ actualizado»).
5. **Varios equipos.**
   - `.finhub/abierto.lock` (latido cada 30 s): el segundo equipo abre en solo lectura (423 al escribir) hasta «tomar el control».
   - Las copias en conflicto del servicio de sincronización se detectan por patrones (de serie y los tuyos en `conflictos`) y se resuelven en `conflictos.js`, sin perder nada.

## Motor de Claude
```
Pendientes / vista ──▶ POST /api/claude/ejecutar {trabajo, params, desclasificar}
   ServicioClaude.parametros()      el servidor (no el navegador) monta los datos del trabajo
   trabajo.entrada()                bloques <datos nivel="…">, <cifras> del código, tarea y pregunta
   problemasR1() · problemasEntrada()   ningún trabajo junta privado + externo + internet; nada privado hacia internet
   runner: claude -p --tools … --strict-mcp-config --setting-sources "" --permission-mode dontAsk …
           en un sandbox vacío, con entorno mínimo y guardia del init y de cada herramienta
   validar (esquema) · comprobar (reglas del trabajo) · verificador (cifras, citas, probabilidades, recomendaciones)
   ok → propuesta (la confirmas con una operación) · mal → .finhub/cuarentena/ · siempre → .finhub/registro/
```
Los trabajos son declarativos (`src/claude/trabajos/*.js`): herramientas, banderas R1, esquema de salida, modelo y entrada. Las tareas y los roles (`semilla/` y tu carpeta) solo ponen texto; el trabajo y el esquema los fija el código. Detalle y verificación: [CLAUDE-CLI.md](CLAUDE-CLI.md).

## Seguridad
- **HTTP:**
  - solo `127.0.0.1`;
  - Host y Origin comprobados, `Sec-Fetch-Site` y JSON obligatorio en las escrituras;
  - límite de cuerpo, sin CORS;
  - CSP estricta (`script-src 'self'`, sin `inline`);
  - todo el HTML pasa por `html\`…\`` / `esc()`, nunca `innerHTML` con texto sin escapar (`pnpm check` lo vigila).
- **Rutas:** ninguna operación sale de la carpeta (`rutaSegura`). El navegador nunca manda rutas del sistema.
- **Claude:** regla R1, aislamiento verificado, cuarentena y registro.
- **Service worker:** no guarda nada en caché. Tus datos no se copian a ningún almacén del navegador.

## Tests
| Carpeta | Qué prueba |
|---|---|
| `test/core/` | cálculos con valores hechos a mano, propiedades (dinero, reparto, TWR = TIR, mes financiero), formatos y operaciones con inversa exacta |
| `test/propiedades/` | ida y vuelta de todos los formatos con datos generados (PRNG con semilla) |
| `test/server/` | API por HTTP real, almacén, carpeta, candado, papelera, copias y conflictos, con carpetas temporales |
| `test/r1/` | regla R1, aislamiento, guardia, ataques (textos y webs trampa) con `test/fake-claude.js` |
| `test/e2e/` | flujos completos en Chromium: cada pestaña, IA con el Claude falso, accesibilidad, rendimiento (5 años), guardado, XSS en todo |
| `test/integridad/` · `test/sincronizacion/` · `test/seguridad/` · `test/conocimiento/` | baterías de QA: ida y vuelta de cada fichero, secuencias de operaciones, SIGKILL, fallos de disco, nube, conflictos, candado, cada ruta de la API, CLI |
| `test/oraculos/` | cálculos frente a una implementación independiente escrita solo desde el plan |
| `test/qa/` | entorno aislado, trampa de rutas, ayudas y una prueba de regresión por cada bug (`regresiones/QA-NNN.test.js`) |
| `test/visual/` · `test/larga/` | contraste AA, desbordes y capturas · sesión prolongada de 30 minutos (`pnpm test:larga`) |

`pnpm test` lanza todo lo que no es navegador ni largo; `pnpm test:e2e` y `pnpm test:visual`, los de Chromium; `pnpm test:todo`, todo en orden con las baterías enteras. Cada ejecución va en un entorno aislado (`scripts/test.js`: HOME y XDG temporales, un `claude` falso que da la alarma y una trampa que hace fallar cualquier escritura fuera de los temporales), con `TZ=Europe/Madrid` (los casos de zona horaria cambian `TZ` dentro de su test). **Ningún test llama al Claude real ni toca una carpeta real.** La lista de casos límite con su prueba está en [CHECKLIST.md](CHECKLIST.md).
