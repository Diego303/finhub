# Formatos de la carpeta de datos · propuesta F0 (esquema 1)

> Gramática exacta de cada fichero de §3 del plan, con ejemplos válidos e inválidos. F1 la implementa en `src/core/formato/` con tests de ida y vuelta.
> Leyenda de errores: **⚠ aviso** = la línea se conserva y la entidad se usa · **✗ imposible** = la línea se conserva tal cual, se marca ⚠ en la interfaz y la entidad **no** entra en los cálculos · **⛔ fichero** = el fichero no se puede interpretar: error visible, nunca se trata como vacío.
> Las propuestas que **amplían o cambian** el plan llevan 🆕 y se recogen al final (§6).

## 1. Gramática común

```ebnf
fichero      = titulo NL [ esquema NL ] { cabecera NL } { linea NL } ;
titulo       = "# " texto ;
esquema      = "esquema: " entero ;                          (* si falta: ⚠ y se asume 1; se escribe al guardar *)
cabecera     = clave ": " valor ;                            (* solo antes de la primera sección o entidad *)
linea        = seccion | entidad | bloque | vacia | desconocida ;
seccion      = "## " texto ;                                 (* sin " · " *)
bloque       = "## " id " · " texto NL { "- " clave ": " valor NL } [ cuerpo ] ;
cuerpo       = { linea_libre NL } ;                          (* texto libre hasta la siguiente "## " *)
entidad      = "- " celda { " | " celda } [ comentario ] ;
celda        = posicional | clave ": " valor | bandera | etiqueta { " " etiqueta } ;
etiqueta     = "#" letra { letra | digito | "-" | "_" } ;    (* "#" pegado a la palabra *)
comentario   = espacio espacio { espacio } "# " texto ;      (* "# " con espacio = comentario; "#x" = etiqueta *)
clave        = minuscula { minuscula | digito | "_" } ;
bandera      = clave ;                                       (* p. ej. "colchon": vale sí *)
desconocida  = cualquier línea que no encaje ;                (* se conserva en su sitio y se marca ⚠ *)
```

- **Separador:** ` | ` (barra con espacios). Una `|` literal en un texto se escribe `\|`, y una `#` literal precedida de espacio, `\#`.
- **Codificación:** UTF-8 sin BOM, `\n`. Al leer se aceptan BOM y CRLF; se escribe en canónico (§3.1). Texto normalizado a **NFC**.
- **Ida y vuelta:** `serializar(parsear(x))` es estable. Los comentarios de fin de línea y las líneas desconocidas se conservan en su posición. Serializar dos veces da los mismos bytes.
- **Orden canónico** de las celdas `clave: valor` de una entidad: el del esquema de cada fichero. Las claves desconocidas van al final, en su orden original (⚠).
- **Cabeceras desconocidas** y **secciones desconocidas**: se conservan intactas (⚠).
- **Esquema mayor que el soportado** → ⛔ el fichero se abre en **solo lectura** con el aviso «este fichero es de una versión más nueva de finhub».

### 1.1 Tipos

| Tipo | Entrada aceptada | Canónico | Interno |
|---|---|---|---|
| `importe` | `1234,56` · `1.234,56` · `-12,5` · `−12,5` (U+2212) · `12.5` · `+24` · `1 234,56` (espacio fino o normal) | `-1.234,56` (siempre 2 decimales, punto de miles, guion) | **céntimos enteros** (`Number.isSafeInteger`) |
| `porcentaje` | `19` · `0,12` · `0.12` · `2,5 %` | `0,12` (mínimo de decimales, sin `%`) | **puntos básicos** enteros (0,12 → 12) |
| `cantidad` | como importe, hasta 6 decimales (`15,2310`) | sin ceros finales: `15,231` | entero ×10⁶ |
| `nivel` (series) | como cantidad, hasta 6 decimales | igual | entero ×10⁶ |
| `fecha` | `AAAA-MM-DD`, que exista en el calendario | igual | cadena ISO (sin horas ni zona, §9.21) |
| `mes` | `AAAA-MM` | igual | cadena |
| `hora` | `HH:MM` 00:00–23:59 | igual | cadena |
| `id` | `[a-z0-9]+(-[a-z0-9]+)*`, ≤ 40, único en su ámbito | igual | cadena; comparación sin mayúsculas (`D:` no las distingue) |
| `lista` | `a, b , c` | `a, b, c` | array |
| `bool` | `sí` · `si` · `no` | `sí` / `no` | boolean |
| `duracion` | `180d` · `12m` · `2a` | igual | días |

**Reglas de ambigüedad del importe:**
1. Si hay **coma**, es el decimal, y los puntos deben formar grupos de 3 (`1.234,5` ✓; `12.34,5` ✗).
2. Sin coma, **un solo punto seguido de 1–2 dígitos** finales es decimal (`12.5`, `12.50`).
3. Sin coma, puntos seguidos de **grupos de 3** son miles (`1.234` = 1.234,00 €; `1.234.567`). ⚠ «¿querías 1,234?» solo si el fichero está escrito a mano y el valor es atípico para el grupo.
4. Más de 2 decimales en un importe → ✗ imposible (`12,345`).
5. Fuera de ±10¹³ céntimos → ✗.

### 1.2 Ids (§2.5)
- **Slugs** de entidades con nombre (`cuentas`, `grupos`, `activos`, `metas`, `fuentes`…): generados del nombre (`Hucha Japón` → `hucha-japon`), **no cambian al renombrar**. Si chocan: `-2`, `-3`.
- **Correlativos** con prefijo: operaciones `OP-0042`, predicciones `PR-0019`, hitos `H-0001`, descubrimientos `D-007`.
- 🆕 **Movimientos:** el plan no les da id, pero editar, deshacer y la referencia `op ↔ mov` lo necesitan. Propuesta: celda `id: a3f9` (4 caracteres base36, única dentro del fichero del mes), referencia global `2026-11/a3f9`. finhub la añade a las líneas escritas a mano **la primera vez que guarda ese mes por otro motivo**, nunca solo por añadir ids (§2.6, no reescribir si no cambió).
- **Notas:** `B-0001` (Base), 🆕 `DT-0001` (Datos; la maqueta cita `[D-0004]`, que choca con los descubrimientos `D-007`), 🆕 `M-261103-01` (Mundo, con año: `M-1103-01` se repetiría cada año; la interfaz puede mostrar la forma corta), `<PREFIJO>-0001` por fuente (`P-0019` pizarra, `IND-0031` indexado; el prefijo se fija al crear la fuente), 🆕 `N-0001` (Mis notas), `D-007` (descubrimientos).

## 2. Ficheros de configuración y mes

### `ajustes.md`
Cabecera `# Ajustes`, `esquema: 1` y una lista `- clave: valor`. Claves (todas opcionales, con valor por defecto):

| clave | tipo / gramática | defecto |
|---|---|---|
| `moneda` | `EUR` (única soportada) | `EUR` |
| `mes_inicio_dia` | entero 1–28 | `1` |
| `tema` | `claro` \| `oscuro` \| `auto` | `auto` |
| `puerto` | entero 1024–65535 | `4747` |
| `impuestos_ahorro` | tramos `desde-hasta:porcentaje` separados por ` \| `; el último `desde-:p` | tramos del plan, con `verificar: AAAA` 🆕 |
| `impuestos_verificado` 🆕 | año (`2026`) | — |
| `proyeccion` | `datos` \| `manual` | `datos` |
| `proyeccion_manual` | `clase real · volatilidad` separados por ` \| ` | del plan |
| `libertad_multiplicador` | entero | `25` |
| `pendientes` | lista de `elemento [frecuencia]` separada por ` \| ` | del plan |
| `rex_humor`, `accesorios` | como el plan | del plan |
| `copias` | `carpeta` \| `local` | `carpeta` |
| `conflictos` 🆕 | patrones separados por ` \| ` | patrones genéricos (§2.6) + los de Google Drive cuando se verifiquen |
| `claude_modelo` 🆕 | `trabajo=modelo` separados por `, ` (modelo: `opus` \| `sonnet` \| `haiku` \| nombre completo) | `pulso=sonnet, precios=haiku, datos=haiku, ingesta=sonnet, conocimiento=sonnet, rex-web=sonnet, privado=opus, encaje=opus, descubrir=opus` |
| `nombre` 🆕 | texto (para el saludo del resumen al abrir) | — |
| `contexto_max` | `60 notas · 60000 car.` | del plan |

✓ Válido
```markdown
# Ajustes
esquema: 1
- moneda: EUR
- mes_inicio_dia: 25
- impuestos_ahorro: 0-6000:19 | 6000-50000:21 | 50000-200000:23 | 200000-300000:27 | 300000-:30   # VERIFICAR cada año
- impuestos_verificado: 2026
```
✗ Inválido
```markdown
- mes_inicio_dia: 31        ✗ imposible (máx. 28): se conserva, se usa el defecto y se avisa
- tema: azul                ⚠ valor desconocido → auto
- impuestos_ahorro: 0-6000:19 | 5000-50000:21   ✗ tramos solapados
- puerto 4747               desconocida (falta «:») → se conserva y se marca
```

### `cuentas.md`
`- id | nombre | tipo: <tipo> [| colchon] [| saldo_inicial: <importe> @<fecha>] [| meta: <id-meta>] [| archivada]`
Tipos: `corriente`, `ahorro`, `inversion`, `efectivo`, `deuda`.

✓ `- remunerada | Cuenta remunerada | tipo: ahorro | colchon | saldo_inicial: 3.000,00 @2026-01-01`
✗ `- tarjeta | Tarjeta | tipo: credito` → ⚠ tipo desconocido (se trata como `corriente` y se avisa) · `- corriente | Otra | tipo: ahorro` → ✗ id duplicado · `- x | X | saldo_inicial: 100 @2026-13-01` → ✗ fecha imposible

### `grupos.md`
`- id | nombre | naturaleza: ingreso|consumo|inversion|ahorro|traspaso [| presupuesto: <importe>] [| ipc: <componente>] [| cuenta: <id>] [| archivado]`

✓ `- ocio | Ocio | naturaleza: consumo | presupuesto: 150 | ipc: ocio-cultura`
✗ `- ocio | Ocio` → ✗ sin naturaleza · `- comida | Comida | naturaleza: gasto` → ✗ naturaleza desconocida (los movimientos van a «sin grupo» con ⚠, §9.2)

### `etiquetas.md` 🆕 (el plan solo lo nombra)
`- <etiqueta-sin-#> | descripción [| color: <#hex>]`. Las etiquetas existen aunque no estén aquí: este fichero solo da descripción y orden, y sirve para renombrarlas.

✓ `- suscripción | Pagos recurrentes de servicios`
✗ `- #social | …` → ⚠ se quita la `#` al guardar

### `recurrentes.md`
`- id | concepto | importe | grupo | cuenta: <id> | cada: mes|bimestre|trimestre|semestre|año | dia: <D>|<DD-MM> [| desde: <mes>] [| hasta: <mes>] [| #etiquetas] [| uso: sí|no [desde <mes>]] [| pausado: sí|no]`
- `dia: 5` (mensual: día del mes; si no existe, el último del mes) · anual: `dia: 14-11`.
- Bimestral, trimestral y semestral necesitan `desde: AAAA-MM` como ancla (🆕, el plan no dice cómo).

✓ `- seguro-coche | Seguro coche | -320,00 | transporte | cuenta: corriente | cada: año | dia: 14-11`
✓ `- agua | Agua | -45,00 | vivienda | cuenta: corriente | cada: bimestre | dia: 10 | desde: 2026-01`
✗ `- agua | Agua | -45,00 | vivienda | cada: bimestre | dia: 10` → ⚠ sin ancla: se asume el mes de creación · `… | cada: semana` → ✗ frecuencia no soportada · `… | dia: 31-02` → ✗ fecha imposible

### `mes/AAAA-MM.md`
```ebnf
mes = "# " nombre_mes " " año NL "esquema: 1" NL
      "periodo: " fecha " → " fecha NL
      "estado: " ( "abierto" | "cerrado " fecha | "reabierto" ) NL
      "## Movimientos" NL { movimiento NL }
      [ "## Presupuestos" NL { "- " id_grupo ": " importe NL } ]
      [ "## Recurrentes" NL { "- " id_rec ": " ( "confirmado" | "saltado" ) NL } ]   (* 🆕 *)
      [ "## Cierre" NL { "- " clave ": " valor NL } ] ;
movimiento = "- " fecha " | " concepto " | " importe " | " ( id_grupo | "—" )
             { " | " ( "cuenta: " id | "a: " id | "naturaleza: " nat | "compensa: " id_grupo
                     | "rec: " id | "op: " id_op | "ajuste" | "id: " id4 | etiquetas ) } ;
```
- El nombre del fichero es el mes que **termina** (§4.1); `periodo` debe ser coherente con `mes_inicio_dia`. Si no lo es: ⚠ y se recalcula al guardar.
- `a: <cuenta>` = traspaso entre cuentas en una sola línea. `—` = sin grupo (⚠).
- Cierre: `fecha`, `saldos` (`id importe · id importe`), `cartera`, `patrimonio`, `leccion`, `editado_tras_cierre: sí|no`.

✓
```markdown
# Noviembre 2026
esquema: 1
periodo: 2026-11-01 → 2026-11-30
estado: abierto
## Movimientos
- 2026-11-01 | Nómina | 2.850,00 | sueldo | cuenta: corriente | rec: nomina | id: k2p0 | #fijo
- 2026-11-14 | Bizum de Pablo (cena) | 24,00 | devoluciones | compensa: ocio | id: 9xa1 | #social
- 2026-11-20 | A la remunerada | -300,00 | — | cuenta: corriente | a: remunerada | id: 0b7c
## Presupuestos
- ocio: 200
```
✗
```markdown
- 2026-11-31 | Cena | -40,00 | ocio              ✗ fecha imposible: se conserva, no suma
- 2026-12-02 | Cena | -40,00 | ocio              ⚠ fuera del periodo: «¿mover a diciembre?»
- 2026-11-05 | Cena | 40 € | ocio                ✗ importe ilegible («€» no se acepta dentro)
- 2026-11-05 | Cena | -40,00 | grupo-borrado     ⚠ grupo inexistente → «sin grupo» (§9.2)
- 2026-11-05 | Cena | -40,00 | ocio | id: k2p0   ✗ id repetido en el mes → se le asigna otro con aviso
estado: cerrado                                   ✗ falta la fecha de cierre
```

### `metas.md` (bloques)
`## id · nombre` + `objetivo` (importe), `fecha_deseada` (fecha, opcional), `se_alimenta_de` (`cuenta <id>` \| `grupo <id>` \| `manual <importe>`), `aportacion` (`<importe>/mes` \| `media3m`), `estado` (`activa` \| `pausada` \| `cumplida <fecha>` \| `archivada`).

✓ el ejemplo de §3.2 · ✗ `- objetivo: -4.000,00` → ✗ objetivo no positivo · `- se_alimenta_de: hucha` → ⚠ origen sin tipo; se busca una cuenta con ese id

### `hitos.md` 🆕
`- H-0001 | fecha | texto | tipo: mio|mundo [| nota: <id-nota>]`
✓ `- H-0004 | 2026-09-12 | Corrección −8 % | tipo: mundo | nota: M-260912-02`
✗ `- H-0005 | sept 2026 | …` → ✗ fecha imposible

## 3. Cartera

### `cartera/activos.md` (bloques)
`## id · nombre` + `isin` (12 caracteres con **dígito de control válido**, o `—`), `tipo` (`fondo|etf|plan|accion|efectivo|otro`), `clase` (id de `clases.md`), `divisa` (ISO 4217), `ter` (porcentaje), `indice` (id de serie), `exposicion` (`region A n · B n | sector … | divisa … @AAAA-MM`; los pesos son porcentajes y cada dimensión debe sumar 100 ± 1, si no ⚠), `traspasable` (bool), `archivado` (bool).

✗ `- isin: IE00BYX5NX34` → ⚠ dígito de control incorrecto (se conserva y se avisa) · `- clase: rv-marte` → ⚠ clase inexistente

### `cartera/operaciones.md`
`- OP-NNNN | fecha | tipo | activo [→ activo] | importe [| participaciones: cantidad] [| mov: AAAA-MM/id4] [| nota: texto]`
Tipos: `aportacion`, `venta`, `traspaso` (con `origen → destino`), `dividendo`, `comision`, `ajuste`. Signos: los importes son **positivos** salvo `comision` y `ajuste`, que admiten signo.

✓ `- OP-0050 | 2026-10-15 | traspaso | sp500 → msci-world | 1.000,00`
✗ `- OP-0051 | 2026-09-01 | venta | etf-ndx | -500,00` → ⚠ signo: se interpreta 500 y se avisa · `- OP-0052 | 2026-06-30 | traspaso | sp500 | 100,00` → ✗ traspaso sin destino · `- OP-0042 | …` repetido → ✗ id duplicado

### `cartera/objetivo.md` 🆕
```markdown
# Objetivo
esquema: 1
redondeo: 10,00
umbral_desviacion: 1
- msci-world | 50 | minimo: 50,00
- emergentes | 10
```
`- activo | porcentaje [| minimo: importe]`. La suma debe ser 100 (✗ si no: el reparto avisa y no calcula).

### `cartera/clases.md` 🆕
`- id | nombre | indice: <id-serie> | grupo: rv|rf|efectivo|mixto [| parecida: <id-clase>]` (`parecida` sirve para aproximar en la prueba de crisis, §4.5).

### `cartera/valores/AAAA-MM-DD.md`
`# Valores AAAA-MM-DD`, `esquema: 1`, `- activo | importe | origen: manual | precio <fecha> (claude, confirmado)`. La fecha del nombre manda.
✗ `- activo-inexistente | 100,00 | origen: manual` → ⚠ se conserva y no suma · nombre `valores/2026-02-30.md` → ⛔ el fichero se ignora con aviso visible

### `cartera/plantillas/<perfil>.md` y `cartera/borradores/<fecha>-<perfil>.md` 🆕
```markdown
# Plantilla · Crecimiento 90/10
esquema: 1
perfil: crecimiento
- msci-world | Fondo MSCI World | 65 | clase: rv-desarrollados | isin: IE00BYX5NX33 | ter: 0,12
```
Los borradores añaden las cabeceras `origen: plantilla crecimiento`, `estado: borrador|aceptado|descartado` y `revisado_claude: no|<ruta del análisis>`. La suma ≠ 100 → ✗.

## 4. Metas, decisiones y conocimiento

### `decisiones/AAAA-MM-DD-<slug>.md`
Cabeceras `fecha`, `estado` (`pausa-48h` \| `lista` \| `decidida` \| `descartada`), `vuelve` (fecha y hora, solo en pausas), `revisar` (fecha); secciones `## Qué`, `## Por qué`, `## Alternativas`, `## Preguntas de Rex`, `## Resultado de la revisión` (texto libre).
✗ `estado: pendiente` → ⚠ se trata como `lista`

### `conocimiento/_familias.md` 🆕 · `_fuentes.md` · `_mezclas.md`
- Familias: `- id | nombre [| caducidad: duracion] [| plegada: bool]`
- Fuentes: `- id | nombre | familia: id | prefijo: P | privada: bool | caducidad: duracion | activa_por_defecto: bool`. `base`, `datos`, `mundo` y `mias` son **fijas** (no se borran).
- Mezclas: `- id | nombre | fuente, fuente, @selector…` con selectores `@postura<=-0,3`, `@familia=yt`, `@acierto>=65` (operadores `= != < <= > >=`).

✗ `- yo | Yo | familia: mias | privada: no` → ⚠ la familia `mias` fuerza `privada: sí` · mezcla con `@humor>3` → ✗ selector desconocido (la mezcla avisa) · fuente que ya no existe → ⚠ «la mezcla usa una fuente borrada» (§9.10)

### `conocimiento/predicciones.md`
`- PR-NNNN | fuente: id | (nota: id | análisis: ruta | descubrimiento: D-NNN) | «texto» | medir: <expresión> | estado: pendiente|acertada|fallida|no-medible [| resuelta: fecha] [| valor: nivel]`
`medir = serie " " ("caída-max"|"subida-max"|"variacion"|"twr"|"nivel") " " fecha "→" fecha " " op " " numero` (cartera: `cartera twr …`).
✗ `medir: sp500 baja mucho` → ⚠ no medible automáticamente (resolución manual)

### Notas (`base/*.md`, `<fuente>/AAAA-MM-DD-<slug>.md`, `mundo/AAAA-MM-DD.md`, `mias/*.md`)
Uno o varios bloques `## <id-nota> · título` + campos: `tipo` (`dato|hecho|consenso|opinión|especulación`), `fecha`, `fuente`, `origen`, `temas` (lista), `activos` (lista), `postura` (`alcista|neutral|bajista`), `efectos` 🆕 (`sector:▲, sector:▼, sector:•`, solo en Mundo), `caduca`, `pulso` (hora), `hash`, `editada` (bool), `verificar` (año, obligatorio en fiscalidad), y un **cuerpo** de 2–6 líneas.
✗ nota de Base con `tipo: opinión` → ⚠ «Base solo admite hechos, datos y consenso» · nota sin cuerpo → ⚠ · `postura: muy alcista` → ✗ · id repetido en la carpeta → ✗ (la segunda se marca)

### `conocimiento/mundo/semana-AAAA-Www.md`
`# Semana AAAA-Www`, `esquema`, `periodo`, `pulsos`, `noticias`, y secciones `## <tema>` con texto y citas `[M-…]`.

### `conocimiento/datos/series/<id>.md` 🆕
```markdown
# Serie · MSCI World NR EUR
esquema: 1
id: msci-world-nr-eur
unidad: indice          # indice | porcentaje | tipo-cambio
frecuencia: mensual
fuente: ETF UCITS de acumulación (proxy) · https://…
metodo: cierre mensual del valor liquidativo, en EUR, con dividendos
actualizado: 2026-11-03
sintetica: no
## Filas
- 2026-09 | 112,4512
- 2026-10 | 113,0207 | aproximación
```
✗ dos filas con el mismo mes → ✗ (§7.3) · salto > 40 % sin `| nota: …` → ⚠ · mes inexistente → ✗

### `conocimiento/descubrimientos/D-NNN.md`
Como §3.2 del plan: cabeceras `tipo`, `estado`, `postura`, `confianza`, `origen`, `descubierto`, `revisar`, `referencia`, `vs`, y versiones `## vN · fecha` con `cambios`, `tesis`, `saldria_bien_si`, `la_invalidaria`, `riesgos`, `vehiculos`, `citas`, `predicciones`, `afirmaciones` (`[tipo] texto · [tipo] texto`). Las versiones van de la más nueva a la más antigua.
✗ vehículo con ISIN de control inválido → se descarta ese vehículo con aviso (§9.25) · `## v3` sin fecha → ✗ · **cualquier importe en euros en el texto** → la salida de `descubrir` va a cuarentena (§9.25)

### `roles/*.md` y `tareas/*.md`
`# Rol · nombre` / `# Tarea · nombre`, `esquema`, `trabajo: privado|conocimiento|rex-web|descubrir|encaje|…`, secciones `## Rol`, `## Reglas`, `## Formato de salida` (con un bloque ```json del esquema) y `## Trabajo`. ✗ Un `trabajo:` que no existe → ✗ la tarea no se ofrece. **El `trabajo` de una tarea no puede cambiar sus banderas R1**: las banderas viven en `src/claude/trabajos/`, no en el Markdown.

### `analisis/AAAA-MM-DD-<tarea>.md` y `analisis/encajes/D-NNN-AAAA-MM-DD.md` (PRIVADO)
Cabeceras `fecha`, `tarea`, `rol`, `mezcla` (lista resuelta de fuentes), `ejecucion` (runId), `modelo`, y secciones `## Cifras (código)` (las que se dieron a Claude), `## Resultado` (Markdown mostrado), `## JSON` (bloque validado), `## Avisos` (cifras no verificadas, citas quitadas).

### `chat/privado/*.md` y `chat/web/*.md`
```markdown
# Conversación · ¿Voy bien contra el MSCI World?
esquema: 1
modo: privado            # privado | web
trabajo: privado
sesion: 3f2a… @SOBREMESA # solo se reanuda en ese equipo (§2.6)
mezcla: base, datos, indexado
## Tú · 2026-11-03 01:29
¿Voy bien contra el MSCI World?
## Rex · 2026-11-03 01:29
A 12 meses tu cartera hace +12,4 % …
```
Una línea del cuerpo que empiece por `## ` se escribe `\## ` para no romper los turnos.
✗ `modo: web` en un fichero dentro de `chat/privado/` → ⛔ conflicto de modo: no se reanuda y se avisa (R1)

### `quiz/progreso.md` y `tu-ano/AAAA.md`
- Quiz: `- fecha | id-nota | acierto|fallo`.
- Tu año: cabeceras con las cifras calculadas y una sección `## Rex dice` (texto de `privado`, opcional).

## 5. Ficheros de servicio

| Fichero | Formato |
|---|---|
| `.finhub/registro/AAAA-MM.jsonl` | una línea JSON por ejecución: `{runId, trabajo, inicio, duracion_ms, estado, herramientas:{WebSearch:6}, entradas:[ids], destino, coste_usd, tokens, version_claude, motivo?}`. Nunca el texto del prompt. |
| `.finhub/abierto.lock` | JSON `{equipo, pid, inicio, latido, version}` |
| `.finhub/papelera/_indice.jsonl` + `.finhub/papelera/AAAA-MM-DD/<ruta original>` | `{id, que, ruta, fragmento, borrado, expira}` |
| `.finhub/cuarentena/AAAA-MM-DD-<trabajo>-<runId>.md` | motivo, validaciones fallidas y salida bruta **dentro de un bloque de código** (nunca se interpreta como datos) |
| `.finhub/copias/AAAA-MM-DD/` | copia del día (14 últimas) |
| `~/.config/finhub/config.json` | `{"esquema":1,"carpeta":"/mnt/d/GoogleDrive/FINANZAS","recientes":[…]}` (fuera de la carpeta) |

## 6. Novedades respecto al plan (aprobadas en F0, ver `docs/DECISIONES.md`)
1. `id: xxxx` en los movimientos (§1.2).
2. Ids de Mundo con año (`M-261103-01`), Datos `DT-`, Mis notas `N-`.
3. Sección `## Recurrentes` en el mes, para registrar «confirmado» o «saltado».
4. Formatos que el plan no fija: `etiquetas`, `hitos`, `objetivo`, `clases`, `_familias`, plantillas y borradores, series, chats, quiz.
5. Recurrentes no mensuales con ancla `desde:`.
6. `efectos` en las notas de Mundo como lista `sector:▲`.
7. Cabeceras nuevas en ajustes: `impuestos_verificado`, `conflictos`, `claude_modelo`.
