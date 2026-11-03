# Carpeta sincronizada desde WSL · verificación F0

> Medido el 2026-11-03 en WSL2 (Ubuntu 22.04, kernel 6.18), Node 24.21.0.
> **Caso objetivo:** la carpeta de datos estará dentro de `D:\GoogleDrive` (carpeta local de `D:` sincronizada con Google Drive para escritorio). La ruta exacta la eliges tú: [INSTRUCCIONES.md §4](../INSTRUCCIONES.md).
> Pruebas hechas **solo** en una carpeta nueva y vacía, `D:\GoogleDrive\finhub-prueba-F0`, creada por el banco y borrada al terminar con un borrado que solo quitaba, uno a uno, los ficheros con nombres creados por las pruebas (614 ficheros, 10 carpetas, 0 inesperados). No se leyó nada más de `D:\GoogleDrive`. OneDrive no se tocó.

## 1. Cómo se ve desde WSL

- `D:\GoogleDrive` → `/mnt/d/GoogleDrive`. Montaje `drvfs` por **9p** (`cache=0x5`, sin `metadata`). No hay que montar nada.
- `wslpath -w` / `wslpath -u`: ida y vuelta exacta, también con espacios y tildes (probado con el banco en las tres ubicaciones).
- Google Drive para escritorio está en marcha (`GoogleDriveFS.exe`) y además expone la unidad virtual `G:`, que **WSL no monta**. finhub **no la usa**: tu carpeta está en `D:`.
- `wslview` no está instalado. Para abrir el navegador: `explorer.exe` + `wslpath -w` (plan §2.3).

## 2. Resultados (600 ficheros Markdown de ~1 KB en 5 subcarpetas)

| Medida | WSL ext4 | `D:` (repo) | `D:\GoogleDrive` |
|---|---|---|---|
| Escritura atómica (tmp en la misma carpeta + `fsync` + `rename`), mediana | 7,9 ms | 28,9 ms | 26,5 ms |
| **Sondeo completo** (readdir recursivo + `stat` secuencial de todo) | 7 ms | **5.313 ms** | **5.176 ms** |
| Leer todo, secuencial | 11 ms | 6.786 ms | 6.616 ms |
| readdir recursivo (10 carpetas) | — | 92 ms | 112 ms |
| `stat` de las 10 carpetas | — | 47 ms | 55 ms |
| `stat` concurrente ×64 (614 ficheros) | — | 378 ms | 381 ms |
| `readFile` concurrente ×64 | — | 453–663 ms | 687 ms |
| `cmd.exe dir /s /b` (lado Windows, solo rutas) | — | 277 ms | 249 ms |
| PowerShell `Get-ChildItem` (rutas + tamaño + mtime) | — | 1.249 ms | — |
| `rename` sobre fichero existente, 30 seguidos | 30/30 | 30/30 | 30/30 |
| **`rename` durante la sincronización** (79 reescrituras en 25 s mientras subía los 600) | — | — | **79/79, 0 fallos, ninguna > 200 ms** |
| Ficheros añadidos por el cliente (conflictos, `desktop.ini`, temporales…) | — | — | **ninguno** |
| `fs.watch` recibe el cambio | sí | **no** | **no** |
| Distingue mayúsculas (`Caso.md` ≠ `caso.md`) | sí | **no** | **no** |
| mtime cambia en cada escritura | sí (µs) | sí | sí (ms) |

**mtime de las carpetas en `D:\GoogleDrive`:** cambia al **crear, borrar o hacer `rename`** dentro de ella, pero **no** al editar un fichero en sitio (como hace un editor de texto o, quizá, el propio cliente al descargar). Tampoco se propaga a la carpeta padre.

## 3. Consecuencias para el diseño

1. **El sondeo de 2 s del plan (§2, §2.6) no puede hacer `stat` de todo.** Con 5 años de datos (estimación: 60 meses, ~260 fotos de valores, ~1.800 pulsos diarios, notas, chats…) habrá **2.000–3.500 ficheros**. Un barrido secuencial tardaría 20–30 s, y uno concurrente ×64, unos 1,5–2 s. **Propuesta para F2:**
   - el servidor mantiene el modelo en memoria y un índice `{ruta → tamaño, mtime}`;
   - **cada 2 s:** `stat` de todas las carpetas (≈ 50–100 ms; detecta altas, bajas y `rename`) más `stat` concurrente del **conjunto caliente**: `ajustes.md`, el candado, los ficheros de la vista abierta y los modificados en las últimas 24 h (≈ 20–60 ficheros, < 100 ms);
   - **cada 30 s y al recuperar el foco la pestaña:** barrido completo concurrente en segundo plano, sin bloquear;
   - `GET /api/version` devuelve la versión del índice en memoria, sin E/S.
2. **Arranque en frío:** leer 3.000 ficheros concurrentemente ≈ 3–4 s. Para cumplir «< 200 ms por vista»:
   - caché de parseo en `~/.cache/finhub/cache/` (fuera de la carpeta sincronizada), indexada por `(ruta, tamaño, mtime)`;
   - carga perezosa de `conocimiento/` (sobre todo `mundo/`), con lo esencial primero (ajustes, cuentas, grupos, mes actual y 12 anteriores, cartera, metas).
3. **Nada de `fs.watch`** en la carpeta de datos (no funciona en drvfs).
4. **Mayúsculas:** las rutas se comparan normalizadas (minúsculas + NFC). Los ids y slugs se generan siempre en minúsculas, y dos ids que solo difieran en mayúsculas se rechazan.
5. **Escritura segura** confirmada: temporal `.finhub-tmp-<id>` en la misma carpeta + `fsync` + `rename`, sin fallos mientras Google Drive sincronizaba. Se mantienen los reintentos con espera ante `EBUSY`/`EPERM`/`EACCES` (no observados, pero posibles si un antivirus o el cliente tienen el fichero abierto).
6. **Versión de fichero para el 409:** `tamaño + mtimeMs + hash` del contenido leído. El mtime solo tiene resolución de ms en esta carpeta y no basta por sí mismo.
7. **Candado entre equipos** (`.finhub/abierto.lock`, latido cada 30 s): es un fichero que se reescribe y Google Drive lo subirá cada vez. Es aceptable, porque solo pesa unos bytes.

## 4. Pendiente (no reproducible en F0, con un solo equipo)

- **Nombres de las copias en conflicto de Google Drive.** No los he podido provocar sin un segundo equipo y **no los invento**. El plan habla de patrones de OneDrive (`nombre-EQUIPO.md`). Los patrones son **configurables** (ajuste `conflictos`, ver §7). **Sigue pendiente** comprobar con tu carpeta real o con un segundo equipo cómo los nombra tu cliente; si no coincide con ninguno de serie, basta con añadir su patrón.
- Qué hace el cliente con un `.finhub-tmp-*` que quede huérfano (si llega a subirlo). finhub los limpia al arrancar.
- «Archivos a petición»: en una carpeta de `D:` sincronizada los ficheros están siempre en local, así que no aplica a tu caso. Aun así, el código mantiene la regla de §2.6: **un fallo de lectura nunca se trata como fichero vacío** (reintento con espera y aviso).
- Comportamiento si Google Drive está pausado o cerrado: finhub no depende de él. Solo escribe en disco local.

## 5. Scripts usados

En el scratchpad de la sesión, no en el repo: `fsbench.mjs` (banco; aborta si la carpeta ya existe), `fsdesglose.mjs` (desglose de latencias), `estres-sync.mjs` (reescrituras durante la sincronización) y `limpieza-segura.mjs` (borrado solo de nombres conocidos; informa y no borra lo inesperado). En F2 los tests de carpeta y sincronización usarán directorios temporales que simulan estos casos, sin tocar `D:\GoogleDrive`.

## 6. Implementado en F2
- `src/server/almacen.js`: índice en memoria, sondeo rápido cada 2 s (carpetas + conjunto caliente) y barrido completo concurrente cada 30 s; escritura atómica con `.finhub-tmp-*` en la misma carpeta; limpieza de huérfanos al arrancar; reintentos (200, 600 y 1.500 ms) y marca «nube»/«ilegible» sin vaciar nunca el fichero; patrones de conflicto.
- `src/server/candado.js`: `.finhub/abierto.lock` con latido cada 30 s; < 2 min de otro equipo → solo lectura; «tomar el control»; el otro lo detecta en su siguiente latido.
- `src/server/carpeta.js`: validar, crear, usar, copiar y mover (verificado por hash; si se interrumpe, se deshace lo copiado).
- Tests en `test/server/` con directorios temporales que simulan la carpeta sincronizada: conflictos, fichero ilegible, temporal huérfano, dos equipos, mover interrumpido. Ninguno toca `D:\GoogleDrive`.

## 7. Implementado en F12 y después
- **Resolver conflictos** (`src/server/conflictos.js`, banda «Conflicto» o Ajustes → Carpeta):
  - diferencias por entidad (cada línea de una lista o de un bloque) entre tu versión y la copia;
  - cuatro salidas: quedarte con la tuya, con la otra, **fusionar por entidades** (si la misma entidad cambió en los dos lados, no se fusiona sola: a mano) o «ya lo arreglé a mano»;
  - lo descartado va a la papelera como «copia en conflicto», y al restaurarlo vuelve a aparecer el conflicto.
- **Patrones propios** (`conflictos` en ajustes.md): `{nombre} (conflicto *).md | …`. Se suman a los de serie, se validan al guardar y se aplican en caliente (la carpeta se vuelve a clasificar).
- **Indicador de guardado** (arriba a la derecha):
  - dice si todo está en el disco, si se está guardando, si algo no se pudo guardar, si no hay conexión, si estás en solo lectura y qué ha llegado de fuera (lo detecta el sondeo);
  - no puede saber si Google Drive ya lo subió a la nube, y lo dice.
- **Pantalla de carpeta** (Ajustes → Carpeta): validar, crear, usar, copiar o mover, con progreso.
- **Primera vez:** `finhub` sin carpeta sugiere `D:\GoogleDrive\FINANZAS` si existe `D:\GoogleDrive` (solo comprueba que exista). Paso a paso en [INSTRUCCIONES.md](../INSTRUCCIONES.md).
- **Probado** con carpetas temporales que simulan cada caso (`test/server/pulido.test.js`, `test/e2e/pulido.test.js`, `test/e2e/guardado.test.js`).
- **Sin probar todavía:** la carpeta real ni un segundo equipo. Se harán solo con tu permiso.

