# Informe del proyecto de conocimiento

> Estado (2026-11-08, turno 6): **P2 terminada. La Base auditada queda en 170 notas, publicadas en seis lotes, todas con dos pasadas de verificación.** De las 208 originales se han retirado o apartado 38. Las 170 publicadas dan 170/170 sin errores en el validador (`--sin-cache`) y 0 incidencias en el auditor. Quedan P3 a P7: unas 1.900 notas nuevas, la importación y la auditoría final.

## Notas por bloque

| Bloque | Publicadas | Corregidas en la auditoría | Retiradas | Descartadas |
|---|---|---|---|---|
| Base · auditoría (208) | 170 | casi todas reescritas en la pasada 1; unas 70 corregidas en la pasada 2 | 27 retiradas + 11 apartadas (ver abajo) | 0 |
| Base · temática | 0 | — | — | 0 |
| Base · historia anual | 0 | — | — | 0 |
| Mundo 2026 | 0 | — | — | 0 |
| Mundo 2020–2025 | 0 | — | — | 0 |
| Mundo 2000–2019 | 0 | — | — | 0 |

## Línea base: validador provisional sobre la Base actual

`node scripts/conocimiento/validar.mjs --hoy 2026-11-08` sobre `semilla/base/` (los 6 ficheros del zip, sin tocar):

- **208 notas, 0 sin errores.** 620 errores y 8 avisos. El parser da 0 avisos y la ida y vuelta es exacta, igual que en el maestro.

| Regla | Fallos | Qué significa |
|---|---|---|
| `evidencias.falta` | 208 | Ninguna nota tiene registro de evidencias ni segunda verificación. Era lo esperado (maestro §6). |
| `temas.taxonomia` | 174 notas | Usan alguno de los 128 temas libres que no están en la lista cerrada; en total hay 175 temas distintos y 47 están dentro. |
| `origen.guardia-url` | 80 notas | La fuente es de un dominio permitido, pero la regla de «trozo largo» de la guardia no deja abrir la URL (AEAT 23, MSCI 17, CNMV 14, BdE 9, FGD 5, BCE 3…). |
| `origen.dominio` | 78 notas | Fuente fuera de la lista de dominios: gestoras (Vanguard, iShares, BlackRock, J.P. Morgan, Fidelity, SSGA, PIMCO, Invesco, HSBC), `hartfordfunds.com` (9), Wikipedia (4), Bloomberg en `bbhub.io` (5), FCA (3), universidades y blogs varios. |
| `normativa.caduca` | 34 | La fiscalidad lleva `verificar: 2026`, pero no `caduca: 2026-12-31`. |
| `normativa.boe` | 23 | Fiscalidad sin `BOE-A-…`. Solo 11 de las 34 la citan. |
| `vocabulario` | 19 notas (20 casos) | «compra», «vende» y similares de la lista exacta, casi siempre al describir la mecánica. |
| `duplicado.titulo` | 3 | B-1102/B-1103 (0,71), B-1101/B-1109 (0,60) y B-1107/B-1108 (0,67). El último no estaba en el maestro. |
| `duplicado.posible` (aviso) | 8 | Pares entre 0,4 y 0,6, para revisar. |

Otras dos cifras para la P2:
- **Fuentes.** Las 208 notas tienen **una sola fuente** cada una. De esas 208 referencias, solo 50 se pueden abrir hoy con la guardia; 80 las frena la regla de «trozo largo» y 78 están fuera de la lista. Ninguna de las 146 notas con cifras cumple aún la regla de dos fuentes independientes con al menos una primaria.
- **Auditor de coherencia:** 0 a revisar, con poca cobertura, como es lógico en una Base sin historia anual ni Mundo: una decisión del BCE reconocida y 5 conceptos fiscales vigilados con una sola cifra cada uno.

El informe completo, en `.cache/conocimiento/informes/validar-base-actual.json` (fuera de git).

## P2 · preparación sin web de toda la Base (criterio aprobado el 2026-11-08)

Sin abrir ninguna web y sin cambiar ninguna afirmación ni cifra, en los 6 ficheros:

- **Temas.** Las 208 notas, a la taxonomía, solo con lo que respalda su propio texto. Por ejemplo, los años (`2008`, `1929`…) pasan a `historia`; los índices concretos (`sp500`, `msci-world`…), a `indices` o `bolsa`; cada sesgo con nombre, a `sesgos`. Antes había 174 notas con temas fuera de la lista; ahora, 0.
- **Vocabulario.** 19 notas reescritas con otro verbo: «adquirir», «invertir en», «transmitir», «tener en cartera», «poder adquisitivo». Además se quitan dos frases que daban un consejo sin fuente: B-1302 («Regla práctica: decidir si vender…») y B-1309 («La pregunta útil es si hoy volverías a comprar…»). Cada nota conserva 2 líneas.
- **Títulos.** B-1103, B-1108 y B-1109 cambian para deshacer los duplicados por Jaccard. B-1523 deja el imperativo («No inviertas…») por «Banco de España: separar el dinero que se necesitará pronto». B-1309 pasa a «Anclaje al precio pagado».
- **Fiscalidad.** Las 34 notas llevan `caduca: 2026-12-31`.

**Validador tras la preparación:** 208 notas, 310 errores y 16 avisos. Todos los errores necesitan web:

| Regla | Fallos | Qué falta |
|---|---|---|
| `evidencias.falta` | 208 | Pasadas 1 y 2. |
| `origen.dominio` | 73 | Sustituir la fuente. Son gestoras (Vanguard, iShares, BlackRock, J.P. Morgan, Fidelity, SSGA, PIMCO, Invesco, HSBC), `hartfordfunds.com` (9), Wikipedia (4), prensa no de referencia (`ultimahora.es`, `ara.cat`, CNBC, CBS, PBS, Nippon), OCU, World Gold Council, AAII y fuentes académicas o de supervisores (ver decisión 2). |
| `normativa.boe` | 26 | Citar la norma `BOE-A-…`: 23 notas de fiscalidad y 3 del FGD. |
| `normativa.verificar` | 3 | B-1519, B-1520 y B-1521 (FGD) necesitan `verificar: 2026` y su BOE. El validador cuenta ahora el FGD como normativa. |

Avisos:
- 8 pares de títulos parecidos, que no bloquean.
- 8 notas que citan normas sin `verificar`: B-1024, B-1029, B-1030, B-1212, B-1530, B-1532, B-1533 y B-1534. B-1006, sobre los límites legales de comisiones, debería sumarse aunque el patrón no la detecta. En la pasada 1 se decide cuáles son normativa, con su BOE.

Para la pasada 2, ya identificado:
- **Duplicado de contenido:** B-1004 (conceptos) y B-1528 (renta fija) cuentan el mismo hecho, el objetivo de inflación del 2 % del BCE. Se propone retirar B-1528 y conservar B-1004.
- **Vigencia en 2026:**
  - B-1401 y B-1402 describen 2025, y B-1403 dice que en 2026 sigue igual;
  - B-1424, B-1425 y B-1432 dan cifras «en 2025» con `verificar: 2026`.

  Si no consta en el BOE consolidado que sigan vigentes en 2026, se retiran.
- **Valoraciones sin fuente:** B-1112 («la Net es la referencia más realista») y B-1113 («usa la versión de rentabilidad total»). *Resuelto en la pasada 1: las dos frases se quitan.*

## P2 · pasadas 1 y 2 (modo reforzado, 2026-11-08)

Por decisión del usuario se sigue en este entorno, sin hook activo ni agentes limitados (ver INCIDENCIAS, «modo reforzado»). Sin caché, el verificador comprueba él mismo cifras y paráfrasis y lo declara en las evidencias; el validador lo exige con `--sin-cache`.

| Fichero | Notas | Pasada 1 | Pasada 2 | Pasada 3 (`--sin-cache`) | Retiradas |
|---|---|---|---|---|---|
| `indices.md` · **publicado** | 34 | 34 | 34 (B-1120 corregida en la segunda vuelta) | 34/34 sin errores | B-1119, B-1127 |
| `conceptos.md` · **publicado** | 36 | 36 | 36 (12 corregidas) | 36/36 | B-1035, 1036 (B-1002 y 1007, recuperadas tras cambiar la guardia) |
| `renta-fija-y-ahorro.md` · **publicado** | 32 | 32 | 32 (14 corregidas) | 32/32 | B-1528 (duplicado), B-1531 (solo gold.org) |
| `fiscalidad.md` · **publicado** | 23 | 23 | 23 (14 corregidas) | 23/23 | 11 apartadas sin verificar: B-1406, 1409, 1416, 1417, 1418, 1420, 1425, 1426, 1427, 1432, 1433 |
| `crisis.md` · **publicado** | 19 | 19 | 19 (12 corregidas) | 19/19 | 15: B-1202, 1206, 1209, 1210, 1213, 1218, 1220, 1222, 1223, 1224, 1230–1234 |
| `comportamiento.md` · **publicado** | 26 | 26 | 26 (9 corregidas) | 26/26 | 6: B-1317, 1318, 1319, 1321, 1322, 1326 |

Motivos de las retiradas:
- fuentes no válidas sin sustituta (gestoras, Hartford Funds, Wikipedia, PBS, CNBC, OCU, prensa no listada, gold.org);
- notas que publicaban cierres de índices;
- un duplicado;
- dos URL que la guardia bloqueaba (ya recuperadas).

Las 11 apartadas de fiscalidad no tienen ningún error detectado. No se pudieron contrastar con el texto de la ley por los límites del entorno. Todas guardan copia en `reanudar/` para recuperarlas.

Errores de la Base original corregidos en la pasada 1:
- **B-1110:** franjas de cobertura inventadas; ahora 80–90 % (estándar), 65–75 % (grandes) y 98,5–100 % (IMI), según el resumen de metodología GIMI de julio de 2026.
- **B-1102:** el quinto país del MSCI World es Suiza (2,34 %), no Francia.
- **B-1101 a B-1109:** fichas antiguas; ahora con datos a 30-10-2026.
- **B-1016:** decía que la correlación bolsa-bonos se volvió negativa en 2023; las fuentes (BIS, BCE) dicen que fue positiva tras 2022.
- **B-1002:** cifras de Vanguard incoherentes; se sustituyen por el informe de costes de ESMA.
- **B-1006:** el límite legal de comisiones estaba mal contado; ahora con el RD 1082/2012 (BOE-A-2012-9716).
- Normativa con `verificar` y `caduca`: B-1006, B-1024, B-1029 y B-1030 (CELEX 32009L0065 y 32014R1286).

## Calidad de las verificaciones

- **Organización:** en cada fichero hubo lectores de fuentes (pasada 1) y verificadores distintos (pasada 2). Cuando la pasada 2 pidió un cambio, se corrigió la nota y el mismo verificador la volvió a confirmar antes de publicar.
- **Qué se corrigió en la pasada 2:** sobre todo afirmaciones que la fuente no dice o generaliza, atribuciones («según la Fed» en ensayos firmados) y cifras con matiz (periodo de vigencia del cuadro de retenciones de 2026, clases de fondos, grupos de edad).
- **Errores de fondo:**
  - la regla de cotización del Nasdaq-100 (B-1120);
  - la cifra de los solteros en Barber y Odean (B-1304);
  - un rango de rentabilidades de Vanguard (B-1215);
  - la redacción del art. 52 UCITS tras la Directiva 2024/2994 (B-1024).
- **Copia y fuentes:** ningún verificador encontró copia literal larga. Tampoco quedó ninguna cifra sin fuente en las notas publicadas.

## Fuentes

Todas de la lista de dominios. En `indices.md`: MSCI (fichas y metodología), S&P DJI, Nasdaq, LSEG FTSE Russell, STOXX, Bloomberg Index (`assets.bbhub.io`), CNMV y Tesoro. En `conceptos.md`, además: ESMA, BOE, EUR-Lex, BIS, BCE, Fed, SSRN, RePEc, CFA Institute y FCA. Evidencias por nota y URL en `docs/conocimiento/evidencias/`.

## Resultados de la pasada 3, de la auditoría y de la tercera comprobación

- Herramientas: `validar.mjs` (ahora con `--sin-cache`), `auditar.mjs` y `traer.mjs`; 21 tests en verde en el entorno externo.
- Los 6 ficheros se leen con 0 avisos del parser y hacen ida y vuelta exacta.
- Los 6 lotes de la P2 están publicados (tabla de PROGRESO).

## Incidencias

Ver `INCIDENCIAS.md`. Resumen:
- ningún intento de inyección detectado;
- ningún contenido web en un comando;
- límites del entorno: guardia sin hook, agentes sin herramientas limitadas, proxy que rechaza descargas y unas 200 búsquedas por turno.

## Decisiones para el usuario

**Aprobadas el 2026-11-08:**
- la regla nueva de «trozo largo» en la guardia;
- `assets.bbhub.io` en la lista de dominios;
- el criterio estricto de vocabulario;
- los nombres de fichero de las áreas;
- el criterio de la preparación de la P2, aplicado a los 6 ficheros;
- seguir en este entorno (modo reforzado);
- añadir `fca.org.uk`, `kva.se`, `berkeley.edu`, `chicagobooth.edu` y `econometricsociety.org`;
- retirar B-1528.

**Pendientes:**
1. ~~**B-1002 y B-1007:**~~ *Resuelto el 2026-11-08: el usuario aprobó quitar `_` de la regla; las dos notas vuelven a la Base.* sus PDF de ESMA tienen nombres largos con guiones bajos (`…_Market_Report_-_Costs_and_Performance_of_EU_Retail_Investment_Products.pdf`, `09_1028_final_kid_ongoing_charges_methodology_for_publication_u_2_.pdf`), y la regla `[A-Za-z0-9+_=]{48,}` los bloquea. ESMA no tiene otra URL para esos PDF. Propuesta: quitar `_` de la clase (`[A-Za-z0-9+=]{48,}`), de modo que los nombres de fichero con palabras pasen y los tokens tipo base64 sigan bloqueados. La alternativa es retirar las dos notas.
2. **Discrepancias con el maestro** (manda el código, se apuntan):
   - B-1107/B-1108 es un tercer duplicado probable (resuelto con títulos distintos);
   - entre 0,4 y 0,6 hay 8 pares, no 9;
   - el `hash` del ejemplo tiene 8 caracteres, pero la app calcula 6.

## Tras la integración en el repo (2026-11-09)

La P2 se integró en `conocimiento/p2-auditoria` copiando en limpio desde la rama de referencia `conocimiento/p2-bundle`. No se trajeron el `.gitignore` del entorno externo (ignoraba `/src/`) ni `reanudar/src-provisional/`.

**Comprobado con el código real del repo:**
- Los parsers de la app leen los 6 ficheros sin avisos y la ida y vuelta es exacta.
- `scripts/validar-base.js` (validador de la app): 170 notas válidas.
- El validador y el auditor provisionales dan 0 errores y 0 incidencias.
- Ninguna nota ni documento tiene señales de inyección ni caracteres invisibles.
- `validar.mjs` y `comprobar.mjs` usan del `src/` real las mismas firmas que los módulos reconstruidos (`fechas.js`, `lineas.js` y `dinero.js` se reescribieron en el entorno externo; los demás eran copia exacta).

**Verificación independiente por muestra.** 14 notas de los 6 ficheros, con `verificador-notas` y la guardia activa:
- ninguna afirmación contradicha;
- 3 confirmadas enteras: B-1201, B-1211 y B-1125;
- 6 con matices menores:
  - B-1004, B-1307, B-1315, B-1014 y B-1507: `fecha` es la de consulta, no la de la fuente;
  - B-1315: «solo encaja si» y «trabas legales» son más tajantes que el estudio («según un modelo sencillo», «restricciones institucionales»);
  - B-1014: «más de 3.498» participantes;
  - B-1532: no dice desde cuándo rigen los requisitos (períodos iniciados desde el 1-1-2013).
- 5 sin poder comprobar (B-1205, B-1216, B-1121, B-1428 y B-1509): WebFetch no lee PDF comprimidos. B-1509 queda además en duda: la página de la CNMV solo da Obligaciones a 10, 15 y 30 años, frente a los 7–50 de la nota.

**Pendiente de la P2:**
1. **Evidencias.** Solo `p2-indices.jsonl` tiene una línea por afirmación. Las otras cinco (136 notas) las generó un script con texto de plantilla y `p1`/`p2` «confirmada»; la copia y las cifras no se comprobaron contra la caché (`--sin-cache`). El validador no puede distinguirlo.
2. **Dos fuentes.** 49 de las 84 notas con cifras importantes tienen una sola fuente, entre ellas límites fiscales (B-1413, B-1419, B-1423 y B-1424) y caídas de crisis. Decidir si una fuente primaria basta para la cifra de un estudio o una ficha, y completar el resto.
3. **PDF.** 91 de las 250 URL son PDF y 46 notas solo tienen fuentes en PDF. Para comprobarlas hace falta la caché (`traer.mjs`) con `pdftotext` instalado.
4. **`fecha`.** 114 notas llevan la fecha de consulta (2026-11-08) y no la de la fuente o el dato.
5. **Fiscalidad.** Las 11 notas apartadas (`reanudar/`). Las 34 notas con `caduca: 2026-12-31` dejan de llegar al contexto el 1 de enero: reverificarlas para 2027.
6. **Duplicados.** B-1133 repite en su segunda línea lo de B-1509 y se solapa con B-1508.
7. **Carpetas existentes.** `base.importar` solo añade ids nuevos: quien ya importó la Base conserva las notas antiguas y las 38 retiradas. Lo resuelve la P1 (ofrecer las notas corregidas).
8. **Comandos.** `pnpm conocimiento:validar` y `conocimiento:auditar` aún no existen (P1).

