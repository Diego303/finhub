# finhub 🦖

Tu dinero en local: gastos, cartera, metas, herramientas, descubrimientos y una base de conocimiento financiero en Markdown, todo en **una carpeta** que puedes sincronizar (OneDrive). Con Rex y Claude Code, que solo actúa cuando tú le das luz verde.

> Estado: en desarrollo. Especificación en [`docs/PLAN.md`](docs/PLAN.md) · maqueta en [`docs/maquetas/finhub.html`](docs/maquetas/finhub.html).

## Qué hace
- **Mes:** anotas entradas y gastos a mano, con grupos, etiquetas y naturaleza (consumo, inversión, ahorro…), presupuestos, recurrentes, cierre de mes editable y mapa del dinero.
- **Cartera:** posiciones y operaciones a mano, «Generar cartera base», TWR y TIR, comparativa con índices usando tus mismas aportaciones, reparto de la aportación y exposición real.
- **Metas:** progreso, proyección con históricos, libertad financiera y diario de decisiones.
- **Herramientas:** prueba de crisis, IPC personal, coste de oportunidad, comparador de fondos, escenarios de vida, calculadoras y suscripciones.
- **🔭 Descubrimientos:** investiga en internet ideas nuevas o qué puede salir beneficiado o perjudicado por las noticias de tus pulsos; luego mira, sin internet, cómo encajaría con tu cartera y pruébalo en el simulador. Para informarte: los cambios los haces tú.
- **Conocimiento:** Base, Datos, pulsos de noticias y tus fuentes (canales, podcasts, prensa) con mezclas, postura y acierto.
- **Rex:** chat, «¿qué opinan mis canales?», pausa de 48 h, resumen semanal y quiz.

## Seguridad: regla R1
**Ningún trabajo de Claude junta a la vez tus datos privados, texto externo y salida a internet.** Así, un texto con instrucciones escondidas no puede sacar tus cifras. Cada trabajo de Claude corre aislado, sin acceso a disco ni a terminal, y queda registrado.

## Uso previsto
```bash
pnpm install && pnpm link --global
finhub                    # servidor en localhost:4747 y abre el navegador
finhub carpeta "D:\GoogleDrive\FINANZAS" --crear   # la primera vez (o --usar si ya tiene datos)
finhub carpeta "E:\Otra" --mover | --copiar | --usar # cambiarla cuando quieras
finhub --ejemplo          # prueba con datos inventados (copia temporal)
finhub stop | status
```

## Desarrollo
Node ≥ 20 y **pnpm**, sin dependencias de runtime.
```bash
pnpm test        # node:test (solo *.test.js) · ningún test llama al Claude real
pnpm check       # sintaxis, imports solo node:/relativos, sin dependencias, HTML solo vía esc()
pnpm dev         # finhub --ejemplo --primer-plano (datos inventados; Ctrl+C para parar)
pnpm ejemplo     # regenera ejemplo/ (determinista, datos inventados y series sintéticas)
pnpm test:e2e    # solo los e2e (Chromium con Playwright) · #muestrario: componentes y gráficos
```
Verificaciones de F0: [`docs/CLAUDE-CLI.md`](docs/CLAUDE-CLI.md) (aislamiento de Claude Code) y [`docs/SINCRONIZACION.md`](docs/SINCRONIZACION.md) (carpeta sincronizada desde WSL).

## Tus datos
Carpeta de Markdown legible y editable a mano. El repo no contiene nunca datos personales ni valores de índices con licencia; solo `ejemplo/` con datos inventados.

No es asesoramiento financiero.
