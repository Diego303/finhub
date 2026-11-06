# finhub 🦖

Tu dinero en local: gastos, cartera, metas, herramientas, descubrimientos y una base de conocimiento financiero, todo en **una carpeta de Markdown** que puedes leer, editar a mano y sincronizar (Google Drive, OneDrive…). Con Rex y Claude Code, que **solo actúa cuando tú le das luz verde**.

No es asesoramiento financiero. Los cambios en tu cartera los haces tú.

![Panel de finhub con datos de ejemplo](docs/capturas/01-panel.png)

> Todas las capturas usan la carpeta de **ejemplo** (datos inventados). Se regeneran con `pnpm capturas`.

**¿Primera vez?** Sigue [INSTRUCCIONES.md](INSTRUCCIONES.md): instalar, elegir dónde se guardan tus datos y empezar.

## Qué hace
- **Mes:** anotas entradas y gastos a mano, con grupos, etiquetas y naturaleza (consumo, inversión, ahorro…), presupuestos, recurrentes, cierre de mes editable y mapa del dinero.
- **Cartera:** posiciones y operaciones, «Generar cartera base», TWR y TIR, comparativa con índices usando tus mismas aportaciones, reparto de la aportación, exposición e impuesto si vendieras hoy.
- **Metas:** progreso, proyección con históricos, libertad financiera y diario de decisiones.
- **Herramientas:** prueba de crisis, IPC personal, coste de oportunidad, comparador de fondos, escenarios de vida, calculadoras y suscripciones.
- **Análisis:** escenarios a 12 meses (probabilidades de Claude, rangos del código), ideas, abogado del diablo y calibración.
- **🔭 Descubrimientos:** investiga en internet ideas nuevas o qué puede salir beneficiado o perjudicado por las noticias; mira, sin internet, cómo encajaría con tu cartera; pruébalo en el simulador; síguelo y revísalo.
- **Conocimiento:** la Base de finhub (~200 notas con fuente), Datos (series que se crean en tu equipo), pulsos de noticias y tus fuentes (canales, podcasts, prensa) con mezclas, postura y acierto.
- **Rex:** chat, «¿qué opinan mis canales?», pausa de 48 h, resumen semanal y quiz; su guarida con la hucha de tus metas, su humor según tu ahorro y accesorios que se desbloquean.
- **Tu año:** tarjetas y gráfico, exportable a PNG.

## Capturas

| | |
|---|---|
| ![Mes](docs/capturas/02-mes.png) **Mes** · movimientos, presupuestos, recurrentes y mapa del dinero | ![Cartera](docs/capturas/03-cartera.png) **Cartera** · rentabilidad, reparto de la aportación y exposición |
| ![Metas](docs/capturas/04-metas.png) **Metas** · progreso, proyección y libertad financiera | ![Herramientas](docs/capturas/05-herramientas.png) **Herramientas** · prueba de crisis y seis más |
| ![Análisis](docs/capturas/06-analisis.png) **Análisis** · tareas, roles y mezclas de fuentes | ![Descubrimientos](docs/capturas/07-descubrimientos.png) **🔭 Descubrimientos** · mapa de efectos y lista |
| ![Simulador](docs/capturas/11-simulador.png) **Simulador** · qué pasaría con un X % (sin IA, no toca tu cartera) | ![Conocimiento](docs/capturas/08-conocimiento.png) **Conocimiento** · fuentes, notas, pulsos y predicciones |
| ![Rex](docs/capturas/09-rex.png) **Rex** · guarida (hucha, humor, accesorios) y chat | ![Tu año](docs/capturas/10-tu-ano.png) **Tu año** · resumen exportable a PNG |
| ![Regla R1](docs/capturas/12-regla-r1.png) **Regla R1** · qué ve cada trabajo de Claude | ![Guardado](docs/capturas/13-guardado.png) **Indicador de guardado** · qué se ha guardado y dónde |
| ![Ajustes](docs/capturas/14-ajustes.png) **Ajustes** · carpeta, impuestos, Pendientes, Rex, Claude… | ![Primera vez](docs/capturas/16-primera-vez.png) **Primera vez** · asistente en una carpeta nueva |
| ![Tema oscuro](docs/capturas/15-oscuro.png) **Tema oscuro** (o automático) | |

## Seguridad: regla R1
**Ningún trabajo de Claude junta a la vez tus datos privados, texto externo y salida a internet.** Así, un texto con instrucciones escondidas (una web, un documento) no puede sacar tus cifras.

- Cada trabajo corre aislado: sin disco, sin terminal, sin MCP y en un directorio vacío.
- Queda registrado y su salida se valida: si no cumple, va a cuarentena y no toca tus datos.
- Lo que Claude propone se aplica solo si lo confirmas.
- La barra R1 de abajo enseña la matriz y el registro de hoy.

El servidor escucha solo en `127.0.0.1`, comprueba Host y Origin, no tiene CORS y no usa dependencias de terceros en tiempo de ejecución. Detalle: [`docs/CLAUDE-CLI.md`](docs/CLAUDE-CLI.md).

## Instalar y empezar
Requisitos: Windows con WSL (o Linux), **Node ≥ 20**, **pnpm** y, para las funciones con IA, [Claude Code](https://docs.claude.com/claude-code) con tu sesión iniciada. Paso a paso, con la elección de la carpeta de tus datos: **[INSTRUCCIONES.md](INSTRUCCIONES.md)**.

```bash
git clone <repo> finhub && cd finhub
pnpm install && pnpm add -g "link:$PWD"   # instala el comando «finhub»
finhub --ejemplo                     # pruébalo con datos inventados (copia temporal)
finhub carpeta "D:\GoogleDrive\FINANZAS" --crear    # tu carpeta real (la ruta la eliges tú)
finhub                               # arranca y abre el navegador
```

### Comandos
```bash
finhub                       # arranca en 127.0.0.1:4747 y abre el navegador (la 1.ª vez pregunta la carpeta)
finhub stop | status         # parar o ver el estado
finhub carpeta               # dónde están tus datos (y las carpetas recientes)
finhub carpeta "<ruta>" --crear | --usar           # empezar en una carpeta nueva o usar una que ya es de finhub
finhub carpeta "<ruta>" --mover | --copiar         # cambiarla (copia verificando cada fichero)
finhub arranque activar | desactivar | estado      # arrancar con Windows, sin ventana
finhub --ejemplo             # datos inventados, en una copia temporal que se borra al parar
finhub --datos "<ruta>"      # usar otra carpeta solo esta vez
```
- **App instalable:** en Chrome o Edge, «Instalar finhub» (icono de la barra de direcciones) la abre en su propia ventana. No guarda nada en el navegador: siempre lee tu carpeta.
- **Arrancar con Windows:** `finhub arranque activar` deja un único `finhub.vbs` en tu carpeta Inicio (Win+R → `shell:startup`) que lanza finhub en WSL sin ventana. `finhub arranque desactivar` lo quita.

## Tu carpeta y el guardado
- **Markdown legible y editable a mano:** `mes/2026-11.md`, `cartera/operaciones.md`, `conocimiento/…`. Formato de cada fichero en [`docs/FORMATOS.md`](docs/FORMATOS.md).
- **Guardado al momento:** cada cambio se escribe enseguida en su fichero. Primero va a un temporal, se fuerza a disco y se renombra, así que nunca queda a medias.
- **Indicador de guardado (arriba a la derecha):** dice si está todo guardado, guardando…, si algo no se pudo guardar, si no hay conexión, si estás en solo lectura o si algo cambió fuera (otro equipo, una edición a mano). Al pulsarlo, ves qué ficheros se tocaron en esta sesión.
- **Sincronizada:** la subida a la nube la hace tu servicio (Google Drive, OneDrive…). Déjala «disponible siempre en este equipo».
  - Si dos equipos guardan a la vez, finhub detecta la copia en conflicto y te deja quedarte con una, fusionar por entidades o arreglarlo a mano.
  - Abierta en dos equipos, el segundo entra en solo lectura hasta que tomas el control.
- **Nada se borra de verdad sin avisar:** la papelera guarda 30 días, cada cambio se puede deshacer durante 10 s desde el aviso y hay una copia diaria (las 14 últimas) en `.finhub/copias/`.
- **Datos de índices:** no vienen con finhub (licencias). Se crean en tu equipo con fuentes gratuitas (trabajo «datos»), solo si lo lanzas.

## Desarrollo
Node ≥ 20 y **pnpm**, sin dependencias de runtime (solo `@playwright/test` para los e2e y las capturas). Sin build: módulos ES servidos tal cual; `src/core/` es el mismo código en el servidor y en el navegador. Mapa del código: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
```bash
pnpm test           # unitarios, servidor y e2e (Chromium) · ningún test llama al Claude real ni toca carpetas reales
pnpm check          # sintaxis, imports, sin dependencias, HTML solo vía esc()
pnpm dev            # finhub --ejemplo --primer-plano
pnpm ejemplo        # regenera ejemplo/ (determinista, datos inventados, series sintéticas)
pnpm capturas       # regenera docs/capturas/ con el ejemplo
pnpm iconos         # iconos PNG de la app instalable
pnpm claude:probar --real   # prueba REAL de los trabajos de Claude con datos de ejemplo (gasta tu cuota)
```

## Documentación
| Documento | Qué cuenta |
|---|---|
| [INSTRUCCIONES.md](INSTRUCCIONES.md) | Instalar, elegir y cambiar la carpeta de tus datos, primera vez, Claude, problemas frecuentes |
| [docs/PLAN.md](docs/PLAN.md) | Especificación completa (qué hace y por qué) |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Cómo está hecho: carpetas del código, flujo de datos, guardado, motor de Claude, tests |
| [docs/FORMATOS.md](docs/FORMATOS.md) | Cada fichero Markdown de tu carpeta, línea a línea, y todos los ajustes |
| [docs/OPERACIONES.md](docs/OPERACIONES.md) | Todas las operaciones que cambian tus ficheros (con deshacer) |
| [docs/CLAUDE-CLI.md](docs/CLAUDE-CLI.md) | Aislamiento de Claude Code verificado (flags, guardia, sandbox) |
| [docs/SINCRONIZACION.md](docs/SINCRONIZACION.md) | La carpeta sincronizada vista desde WSL: medidas y decisiones |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | Los 26 casos límite del plan, cada uno con su prueba |
| [docs/DECISIONES.md](docs/DECISIONES.md) | Decisiones tomadas en cada fase (F0–F12) |
| [docs/maquetas/finhub.html](docs/maquetas/finhub.html) | La maqueta original |

El repo no contiene nunca datos personales ni valores de índices con licencia; solo `ejemplo/` con datos inventados.
