# Instrucciones · instalar finhub y elegir dónde se guardan tus datos

Esta guía va paso a paso: instalar, probar con datos inventados, **elegir la carpeta donde vivirán tus datos de verdad** (y cambiarla cuando quieras), la primera vez en el navegador, Claude, arrancar con Windows, copias y problemas frecuentes.

> **Idea clave:** todo finhub vive en **una carpeta de ficheros Markdown** que eliges tú. El programa (este repositorio) y tus datos están separados: puedes actualizar, mover o reinstalar finhub sin tocar tu carpeta, y abrir tu carpeta con cualquier editor de texto.

---

## 1. Requisitos

| Qué | Para qué | Cómo comprobarlo |
|---|---|---|
| **Windows 10/11 con WSL 2** (Ubuntu) | finhub corre en WSL y lee carpetas de Windows (`D:\…`) | en PowerShell: `wsl -l -v` |
| **Node.js 20 o superior** (dentro de WSL) | el servidor local | `node -v` |
| **pnpm** | instalar y lanzar los scripts | `pnpm -v` |
| **git** | descargar y actualizar finhub | `git --version` |
| **Chrome o Edge** | la interfaz (y «Instalar app») | — |
| *Opcional:* **Claude Code** con tu sesión iniciada | pulso, análisis, Rex, descubrimientos… | `claude --version` |

En Linux sin WSL funciona igual; solo cambian las rutas (no hay `D:\`).

**Si te falta algo (dentro de WSL):**
- **Node.js:** con [nvm](https://github.com/nvm-sh/nvm): instala nvm y después `nvm install --lts`.
- **pnpm:** `npm install -g pnpm`. Después, una sola vez, ejecuta `pnpm setup` y abre una terminal nueva: así `pnpm link --global` deja el comando `finhub` en tu PATH.
- **Claude Code:** sigue la [documentación oficial](https://docs.claude.com/claude-code). Después ejecuta `claude` una vez para iniciar sesión. finhub usa tu cuenta: cada trabajo gasta de tu cuota y lo ves en el registro (barra R1).

---

## 2. Instalar

```bash
cd ~                                   # o donde guardes tus repositorios (p. ej. /mnt/d/GitHub)
git clone <url-del-repo> finhub
cd finhub
pnpm install                           # sin dependencias de runtime; solo herramientas de desarrollo
pnpm link --global                     # crea el comando «finhub»
finhub --help                          # comprueba que responde
```

¿Prefieres no instalar el comando global? Todo funciona igual con `node bin/finhub.js …` desde la carpeta del repositorio.

---

## 3. Probar con datos inventados (sin tocar nada tuyo)

```bash
finhub --ejemplo
```
Abre el navegador con una **copia temporal** de `ejemplo/` (un año de datos inventados). La cabecera dice «ejemplo · datos inventados». Al parar (`finhub stop`), la copia se borra. Puedes tocarlo todo sin miedo.

---

## 4. Elegir dónde se guardan tus datos (tu carpeta real)

### 4.1 Qué carpeta elegir
- **Una carpeta vacía** (o que aún no exista) solo para finhub. Por ejemplo: `D:\GoogleDrive\FINANZAS`.
- **Si quieres tenerla en varios equipos o con copia en la nube:** ponla dentro de tu carpeta sincronizada.
  - **Google Drive para escritorio:** usa una carpeta **local** que el cliente replica (modo «Replicar archivos»), por ejemplo dentro de `D:\GoogleDrive`. **No uses la unidad virtual `G:\`** (modo «Transmitir archivos»): WSL no la ve.
  - **OneDrive:** dentro de tu carpeta de OneDrive, marcada con clic derecho como «Mantener siempre en este dispositivo».
- **Su carpeta «madre» tiene que existir.** Para `D:\GoogleDrive\FINANZAS` tiene que existir `D:\GoogleDrive`. `FINANZAS` la crea finhub.

### 4.2 Cómo escribir la ruta
finhub entiende rutas de Windows y de WSL. Con espacios o tildes, ponla **entre comillas**:

| Escribes | Es |
|---|---|
| `"D:\GoogleDrive\FINANZAS"` o `D:/GoogleDrive/FINANZAS` | la carpeta de Windows `D:\GoogleDrive\FINANZAS` (en WSL, `/mnt/d/GoogleDrive/FINANZAS`) |
| `/mnt/d/GoogleDrive/FINANZAS` | la misma, escrita como en WSL |
| `"C:\Users\Ana\OneDrive\Mis cosas\FINANZAS"` | con espacios: entre comillas |
| `~/FINANZAS` | una carpeta dentro de WSL (sin sincronizar) |

No se admiten rutas de red (`\\servidor\…`).

### 4.3 Opción A · que te lo pregunte (la más sencilla)
```bash
finhub
```
La primera vez, sin carpeta elegida, finhub pregunta en la terminal:
```
Bienvenido a finhub. Todo se guarda en una carpeta de Markdown que puedes sincronizar.
Sugerencias:
  D:\GoogleDrive\FINANZAS
  /home/ana/FINANZAS
¿Dónde guardo tus datos? [D:\GoogleDrive\FINANZAS]
```
- Pulsa **Enter** para aceptar la sugerencia o **escribe la ruta que quieras**.
- Confirma con **s**.
- finhub la crea, la recuerda y abre el navegador con el asistente de la primera vez (sección 5).

Las sugerencias salen de comprobar si existen `D:\GoogleDrive`, `D:\Google Drive` u OneDrive. Solo se comprueba; no se crea nada hasta que confirmas.

### 4.4 Opción B · con un comando
```bash
finhub carpeta "D:\GoogleDrive\FINANZAS" --crear
finhub
```
- `--crear` **empieza de cero** en esa carpeta. Solo escribe un `ajustes.md`; lo demás lo hace el asistente.
- Si la carpeta tiene ficheros que no son de finhub, te avisa y pregunta. Con `--si` no pregunta.
- Si ya es una carpeta de finhub (de otro equipo o de antes), usa `--usar`:
  ```bash
  finhub carpeta "D:\GoogleDrive\FINANZAS" --usar
  ```

### 4.5 Comprobar dónde está
```bash
finhub carpeta      # → carpeta de datos: D:\GoogleDrive\FINANZAS  (WSL: /mnt/d/GoogleDrive/FINANZAS)
finhub status       # si está en marcha, en qué carpeta y cuántos ficheros
```
En el navegador, la ruta aparece arriba a la izquierda. Al pulsarla se abren **Ajustes → Carpeta**. Arriba a la derecha, el **indicador de guardado** te dice si todo está guardado (sección 6).

finhub recuerda la ruta en `~/.config/finhub/config.json`, dentro de WSL y **fuera** de tu carpeta. Ese fichero también guarda las carpetas recientes.

### 4.6 Cambiarla más tarde
Desde la terminal o desde **Ajustes → Carpeta** en la web, con el mismo resultado:

| Quieres… | Comando | Qué pasa |
|---|---|---|
| llevar tus datos a otro sitio | `finhub carpeta "E:\Nueva" --mover` | copia cada fichero, comprueba que es idéntico y, **solo si confirmas**, manda la antigua a la Papelera de reciclaje de Windows. Si algo falla, la antigua queda intacta |
| una copia en otro sitio y seguir allí | `finhub carpeta "E:\Nueva" --copiar` | copia y verifica; la antigua se queda como está |
| apuntar a una carpeta que ya es de finhub | `finhub carpeta "E:\Otra" --usar` | no copia nada |
| empezar de cero en otra | `finhub carpeta "E:\Otra" --crear` | carpeta nueva y vacía; la anterior no se toca |
| usar otra carpeta **solo una vez** | `finhub stop && finhub --datos "E:\Prueba"` | no cambia la que tienes guardada |

finhub te frena, con un mensaje claro, si eliges la misma carpeta, una que está dentro de la actual (o al revés), una ruta que es un fichero, una carpeta sin permisos o una cuya carpeta madre no existe. También te avisa si la nueva está en otra unidad.

**Olvidar la carpeta** (para que la próxima vez vuelva a preguntar): `finhub stop` y borra `~/.config/finhub/config.json`. Tus datos no se tocan.

### 4.7 Qué hay dentro de tu carpeta
```
FINANZAS/
├── ajustes.md  cuentas.md  grupos.md  etiquetas.md  recurrentes.md  metas.md  hitos.md
├── mes/2026-11.md …          ← tus movimientos, un fichero por mes financiero
├── cartera/                  ← activos, operaciones, objetivo, valores/, plantillas/, borradores/
├── conocimiento/             ← base/, mundo/ (pulsos), datos/series/, tus fuentes, descubrimientos/, predicciones.md
├── analisis/  decisiones/  chat/  quiz/  tu-ano/  roles/  tareas/
├── CONTEXTO/                 ← déjale aquí textos (transcripciones…) para procesarlos con tu luz verde
└── .finhub/                  ← papelera (30 días), copias diarias (14), registro de Claude, cuarentena, candado
```
Puedes **editar cualquier `.md` a mano**, incluso con finhub abierto: la web se entera sola. Si una línea está mal escrita, se conserva y se marca. Formato de cada fichero: [docs/FORMATOS.md](docs/FORMATOS.md).

### 4.8 Varios equipos
1. Instala finhub en cada equipo (pasos 1 y 2).
2. En cada uno, apunta a la **misma** carpeta sincronizada con `--usar`.
3. Si está abierta en los dos, el segundo entra en **solo lectura** y lo indica arriba. Con «Tomar el control», el otro pasa a solo lectura.
4. Si los dos guardaron el mismo fichero a la vez, el servicio de sincronización deja una «copia en conflicto». finhub lo avisa con una banda y te deja:
   - quedarte con tu versión o con la otra;
   - **fusionar por entidades**;
   - o arreglarlo a mano.

   Lo descartado va a la papelera. Si tu servicio nombra las copias de otra forma, añade su patrón en **Ajustes → Más**, por ejemplo `{nombre} (conflicto *).md`.

---

## 5. La primera vez en el navegador

Con una carpeta nueva, en vez de las pestañas aparece un asistente de cinco pasos:
1. **Tú:** nombre (para el saludo), **mes financiero** (natural, o del día que cobras al anterior) y tema.
2. **Cuentas:** nombre, tipo y **saldo de hoy**. Marca cuál es tu colchón (fondo de emergencia).
3. **Grupos:** qué es consumo, ingreso, inversión, ahorro o traspaso. Puedes quitar y añadir después.
4. **Recurrentes:** nómina, alquiler, suscripciones… (positivo si entra, negativo si sale). Es opcional.
5. **Cartera y conocimiento:**
   - la cartera, vacía o con «Generar cartera base» (un borrador que revisas tú);
   - copiar la **Base** (~200 notas con fuente);
   - y, si quieres, crear los **datos de mercado** con Claude.

«Crear mi carpeta» lo guarda todo de una vez, y se puede deshacer desde el aviso. Después, todo se cambia en **Gestión ▾** (cuentas, grupos, recurrentes, activos, roles, tareas, ajustes, papelera…).

---

## 6. Uso diario
- **Pendientes hoy** (columna derecha): lo que toca hoy. Nada se ejecuta solo; cada botón es tu luz verde.
- **Indicador de guardado** (arriba a la derecha):

  | Ves | Significa |
  |---|---|
  | `✓ todo guardado` / `✓ guardado 12:04` | todo está escrito en tu carpeta; al pulsarlo, qué ficheros se tocaron en esta sesión |
  | `guardando…` | escribiendo en este momento (no cierres la pestaña; si lo haces, el navegador te avisa) |
  | `⚠ no se guardó` | el último cambio no se pudo escribir (disco, fichero bloqueado…); tus ficheros siguen como antes de ese cambio |
  | `⚠ sin conexión` | el servidor no responde (`finhub status`); lo que hagas no se guardará |
  | `🔒 solo lectura` | finhub está abierto en otro equipo; «Tomar el control» en la banda |
  | `↻ actualizado` | algo cambió fuera de finhub (otro equipo, una edición a mano) y ya lo estás viendo |
  | `⚠ ficheros sin leer` | algún fichero solo está en la nube o bloqueado; no se sobrescribe hasta poder leerlo |
- **Deshacer:** cada cambio se deshace durante 10 s desde su aviso. Lo borrado va a la **papelera** (Gestión ▾ → Papelera y cuarentena) 30 días.

---

## 7. Claude (opcional)
- **Sin Claude Code, finhub funciona igual** en todo lo que es cálculo: mes, cartera, metas, herramientas, Pendientes… Las funciones con IA dicen claramente si falta instalarlo o iniciar sesión.
- Cada trabajo de Claude está **aislado**. Ninguno junta a la vez tus datos privados, texto externo e internet (regla R1, barra de abajo). Lo que propone solo se guarda si lo confirmas.
- El modelo de cada trabajo se elige en **Ajustes → Claude**.

---

## 8. Arrancar con Windows y app instalable
```bash
finhub arranque activar      # finhub arranca al iniciar sesión en Windows, sin ventana
finhub arranque estado
finhub arranque desactivar   # lo quita
```
Deja un único fichero, `finhub.vbs`, en tu carpeta Inicio (Win+R → `shell:startup`). Solo borra el suyo. Si prefieres hacerlo a mano, tienes la plantilla en `scripts/windows/finhub-arranque.vbs`.

**App instalable:** con finhub abierto en Chrome o Edge, usa el icono «Instalar» de la barra de direcciones (o el menú ⋮ → «Instalar finhub»). Se abre en su propia ventana y no guarda tus datos en el navegador.

---

## 9. Copias de seguridad
- **Copia diaria automática** en `.finhub/copias/` (las 14 últimas). Si prefieres que no se sincronice, en **Ajustes → General → Copias diarias** elige «solo en este equipo».
- **Papelera** de 30 días y **deshacer** de cada cambio.
- **Historial de tu servicio de sincronización** (Google Drive y OneDrive guardan versiones anteriores de cada fichero).
- Para una copia «a mano», comprime la carpeta entera de vez en cuando.

---

## 10. Actualizar, parar y desinstalar
```bash
cd ~/finhub && git pull && pnpm install    # actualizar (tus datos no se tocan)
finhub stop                                # parar
pnpm remove --global finhub                # quitar el comando «finhub»
```
Cada fichero de tu carpeta lleva `esquema:`. Si un fichero es de una versión más nueva de finhub, se abre en **solo lectura** en vez de estropearlo. Desinstalar no borra tu carpeta.

---

## 11. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| `finhub: command not found` | `pnpm setup`, abre una terminal nueva y repite `pnpm link --global`; o usa `node bin/finhub.js` |
| No se abre el navegador | abre a mano la dirección que imprime (`http://127.0.0.1:4747/`) |
| El puerto 4747 está ocupado | finhub prueba el siguiente libre; o `finhub --puerto 4800`; o fija `puerto` en Ajustes → General |
| «no existe la carpeta que la contendría» | crea antes la carpeta madre (p. ej. `D:\GoogleDrive`) o revisa la ruta y las comillas |
| No ves `G:\` desde WSL | es la unidad virtual de Google Drive: usa una carpeta local replicada (sección 4.1) |
| Banda «ficheros solo en la nube» | marca la carpeta «disponible sin conexión / mantener siempre en este dispositivo» |
| Banda «solo lectura» | finhub está abierto en otro equipo: ciérralo allí o «Tomar el control» |
| Banda «conflicto» | pulsa «ver»: elige versión, fusiona o arréglalo a mano (sección 4.8) |
| Claude «no instalado» o «sin sesión» | instala Claude Code y ejecuta `claude` una vez para iniciar sesión |
| Algo raro en el servidor | `finhub status`; registro en `~/.cache/finhub/servidor.log` |

¿Algo más? La especificación completa está en [docs/PLAN.md](docs/PLAN.md) y cómo está hecho en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
