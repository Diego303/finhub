# finhub 🦖

Tu dinero en local: gastos, cartera, metas, herramientas, descubrimientos y una base de conocimiento financiero, todo en **una carpeta de Markdown** que puedes leer, editar a mano y sincronizar (Google Drive, OneDrive…). Con Rex y Claude Code, que **solo actúa cuando tú le das luz verde**.

No es asesoramiento financiero. Los cambios en tu cartera los haces tú.

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

## Seguridad: regla R1
**Ningún trabajo de Claude junta a la vez tus datos privados, texto externo y salida a internet.** Así, un texto con instrucciones escondidas (una web, un documento) no puede sacar tus cifras. Cada trabajo corre aislado (sin disco, sin terminal, sin MCP, en un directorio vacío), queda registrado y su salida se valida: si no cumple, va a cuarentena y no toca tus datos. Lo que Claude propone se aplica solo si lo confirmas. La barra R1 de abajo enseña la matriz y el registro de hoy.

El servidor escucha solo en `127.0.0.1`, comprueba Host y Origin, no tiene CORS y no tiene dependencias de terceros en tiempo de ejecución.

## Instalar y empezar
Requisitos: Windows con WSL (o Linux), **Node ≥ 20**, **pnpm** y, para las funciones con IA, [Claude Code](https://docs.claude.com/claude-code) con tu sesión iniciada (`claude`).

```bash
git clone … finhub && cd finhub
pnpm install && pnpm link --global   # instala el comando «finhub»
finhub                                # la primera vez te pregunta dónde guardar tus datos
```
La primera vez, finhub sugiere una carpeta dentro de tu Google Drive u OneDrive (si los encuentra), la crea cuando lo confirmas y abre el navegador con un asistente: tu nombre y tu mes financiero, tus cuentas con su saldo, los grupos, los recurrentes, la cartera (vacía o «Generar cartera base»), copiar la Base y, si quieres, crear los datos de mercado con Claude.

¿Solo quieres verlo? `finhub --ejemplo` usa una copia temporal de datos inventados.

### Comandos
```bash
finhub                       # arranca en 127.0.0.1:4747 y abre el navegador
finhub stop | status         # parar o ver el estado
finhub carpeta               # dónde están tus datos
finhub carpeta "D:\GoogleDrive\FINANZAS" --crear | --usar
finhub carpeta "E:\Otra" --mover | --copiar          # cambiarla (copia verificando cada fichero)
finhub arranque activar | desactivar | estado         # arrancar con Windows, sin ventana
finhub --ejemplo             # datos inventados, en una copia temporal
```
- **App instalable:** en Chrome o Edge, el icono «Instalar» de la barra de direcciones la abre en su propia ventana. No guarda nada en el navegador: siempre lee tu carpeta.
- **Arrancar con Windows:** `finhub arranque activar` deja un único `finhub.vbs` en tu carpeta Inicio (Win+R → `shell:startup`) que lanza finhub en WSL sin ventana. `finhub arranque desactivar` lo quita. Plantilla manual en `scripts/windows/finhub-arranque.vbs`.

## Tu carpeta
- Markdown legible y editable a mano: `mes/2026-11.md`, `cartera/operaciones.md`, `conocimiento/…`. Si lo editas con la web abierta, la web se entera sola (y si chocan, avisa en vez de pisar).
- **Sincronizada:** déjala «disponible siempre en este equipo». Si dos equipos guardan a la vez, finhub detecta la copia en conflicto y te deja quedarte con una, fusionar por entidades o arreglarlo a mano. Abierta en dos equipos, el segundo entra en solo lectura hasta que tomas el control.
- **Nada se borra de verdad sin avisar:** la papelera guarda 30 días; cada cambio se puede deshacer durante unos segundos desde el aviso.
- `.finhub/` guarda la papelera, las copias diarias, el registro de Claude y la cuarentena.
- Los **datos de índices** no vienen con finhub (licencias): se crean en tu equipo con fuentes gratuitas (trabajo «datos»), solo si lo lanzas.

## Desarrollo
Node ≥ 20 y **pnpm**, sin dependencias de runtime (solo `@playwright/test` para los e2e). Sin build: módulos ES servidos tal cual; `src/core/` es el mismo código en el servidor y en el navegador.
```bash
pnpm test           # unitarios, servidor y e2e (Chromium) · ningún test llama al Claude real
pnpm check          # sintaxis, imports, sin dependencias, HTML solo vía esc()
pnpm dev            # finhub --ejemplo --primer-plano
pnpm ejemplo        # regenera ejemplo/ (determinista, datos inventados, series sintéticas)
pnpm claude:probar --real   # prueba REAL de los trabajos de Claude con datos de ejemplo (gasta tu cuota)
node scripts/generar-iconos.js   # iconos PNG de la app instalable
```
Documentación: [`docs/PLAN.md`](docs/PLAN.md) (especificación), [`docs/FORMATOS.md`](docs/FORMATOS.md), [`docs/OPERACIONES.md`](docs/OPERACIONES.md), [`docs/DECISIONES.md`](docs/DECISIONES.md), [`docs/CLAUDE-CLI.md`](docs/CLAUDE-CLI.md) (aislamiento de Claude Code), [`docs/SINCRONIZACION.md`](docs/SINCRONIZACION.md) y [`docs/CHECKLIST.md`](docs/CHECKLIST.md) (casos límite con su prueba). Maqueta: [`docs/maquetas/finhub.html`](docs/maquetas/finhub.html).

El repo no contiene nunca datos personales ni valores de índices con licencia; solo `ejemplo/` con datos inventados.
