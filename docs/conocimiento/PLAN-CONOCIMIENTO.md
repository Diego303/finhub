# Plan de conocimiento · Base y Mundo de finhub

> P0 · 2026-11-08 · inventario y plan, sin notas nuevas. Pendiente de tu OK (preguntas al final).

Objetivo: dejar en el repo una Base (`semilla/base/`) y un Mundo histórico (`semilla/mundo/`) en los que cada afirmación es verdad y se puede comprobar. Una nota dudosa se descarta.

## 1. Qué hace hoy la app (leído en el código)

| Pregunta | Respuesta | Dónde |
|---|---|---|
| ¿El onboarding copia la Base? | Sí, si marcas la casilla: pide `/api/semilla?tipo=base` y lanza `base.importar`, que añade a `conocimiento/base/<fichero>.md` las notas cuyo **id** aún no tienes. | `web/vistas/inicio.js:133`, `src/core/ops/inicio.js:51`, `src/core/ops/conocimiento.js:283` |
| ¿Y `semilla/mundo/`? | **No.** `/api/semilla` solo admite `plantillas-cartera`, `roles`, `tareas` y `base`. Nada copia ni ofrece Mundo. | `src/server/app.js:431` |
| ¿Cómo se ofrecen después las notas nuevas de la semilla? | En Conocimiento, «Base de finhub · N notas nuevas»: las de la semilla cuyo id no está en tu carpeta, con un botón «Importar N notas». | `web/vistas/conocimiento.js:280-290` |
| ¿Y las notas **corregidas**? | **No se ofrecen.** Una nota con el mismo id se considera ya importada, aunque su texto haya cambiado. Hoy no afecta: tu carpeta real aún no ha copiado la Base. | `base.importar` (por id) |
| ¿Cómo trata las caducadas al elegir notas por periodo? | Las **excluye siempre** de los trabajos de Claude, también cuando el trabajo pide un periodo (`desde`/`hasta`). Siguen en el buscador (por defecto incluye caducadas) y en el mapa de efectos. | `src/claude/contexto.js` (`notasParaTrabajo`), `src/core/conocimiento.js` (`caducada`, `buscarNotas`) |
| Caducidad de una nota | Su `caduca:`; si no tiene, su fecha + la caducidad de su fuente o familia. `pulso` pone `caduca = fecha + 90 días` a toda nota de Mundo, sea cual sea su tipo. La Base no lleva `caduca`. | `src/core/conocimiento.js:52`, `src/core/ops/ia.js:75` |
| Lista por defecto de sectores del mapa de efectos | **No existe para una carpeta nueva**: `sectores_efectos` no está en los ajustes por defecto y el onboarding no la rellena, así que el mapa sale vacío y `pulso` no pone efectos. Solo `ejemplo/` trae 7: `bancos, utilities-e-infraestructura, tecnologia, inmobiliario, consumo-basico, energia, renta-fija-euro` (la web tiene nombre para esos 7). | `src/core/formato/config.js`, `ejemplo/ajustes.md:13`, `web/vistas/descubrimientos.js:30` |
| ¿Existe `mundo/semana-AAAA-Wnn.md`? | Sí, como formato (`semana`). Lo escribe la tarea «resumen semanal» del trabajo `conocimiento` (op `semana.guardar`) cuando lo lanzas. No son notas: no tienen ids ni entran en el índice de notas. | `src/core/formato/conocimiento.js`, `src/core/ops/ia.js:205` |
| ¿Qué campo puede llevar la marca de retrospectiva sin romper el parser? | **Ninguno de los actuales sirve limpio.** `pulso:` es una hora (`HH:MM`): «retro-2026-11» no parsea. Una clave nueva se conserva, pero con aviso «clave desconocida» en cada nota. Lo que sí funciona sin tocar nada: **un prefijo de id propio**, `MR-AAMMDD-NN` (el patrón de ids admite 1–4 letras). Ver pregunta 1. | `src/core/formato/conocimiento.js` (`camposNota`), `src/core/ids.js:80` |

Otros hechos del código que condicionan el trabajo:
- **Ids de Mundo:** `M-AAMMDD-NN`, con 2 cifras (máx. 99 por día). Únicos de 2000 a 2099.
- **Duplicados en Mundo:** al guardar un pulso, una nota es repetida si tiene la **misma URL** o un título con Jaccard ≥ 0,6 a ±1 día. Consecuencia: **una URL, una nota** (dos notas de la misma página se fundirían).
- **`hash`** en Mundo es un resumen de 6 caracteres de la URL. La Base no lleva `hash`.
- **Quiz:** solo usa notas de la Base. Las áreas nuevas lo alimentan directamente.
- **Mapa de efectos:** últimas 4 semanas ISO, sin mirar caducidad. Las notas retrospectivas de septiembre a noviembre de 2026 aparecerán ahí.
- **Postura de una fuente:** media de la postura de sus notas con vida media de 90 días. Las retrospectivas de 2026 la moverían (ver pregunta 3).
- **WebFetch no devuelve la página en crudo:** devuelve lo que un modelo extrae de ella. Sirve para leer, pero no para el detector de copia ni para el comprobador de cifras: hace falta descargar el texto aparte (§6).

## 2. Inventario de la Base actual (`semilla/base/`)

- **208 notas** en 6 ficheros, todas válidas para el parser (0 avisos). Ids `B-1001` a `B-1534`, sin repetir.

| Fichero | Notas | Rango |
|---|---|---|
| conceptos.md | 38 | B-10xx |
| indices.md | 36 | B-11xx |
| crisis.md | 34 | B-12xx |
| comportamiento.md | 32 | B-13xx |
| fiscalidad.md | 34 | B-14xx |
| renta-fija-y-ahorro.md | 34 | B-15xx |

- **Tipos:** 112 hecho, 51 consenso, 45 dato. Ninguna opinión ni especulación.
- **Fechas:** las 208 con `fecha: 2026-11-03` (fecha de escritura, no del hecho).
- **Origen:** todas con URL https y «consultado 2026-11-03». **Ninguna tiene registro de evidencias** ni segunda verificación: a efectos de este protocolo, **ninguna está verificada**.
- **146 notas con cifras** (sin contar años): todas pasan por la doble fuente en P2.
- **Fiscalidad:** 34 notas, todas con `verificar: 2026`, pero solo 11 citan la norma (`BOE-A-…`). B-1401 y B-1402 describen el ejercicio 2025 (Manual de Renta 2025) y B-1403 afirma que sigue igual en 2026: hay que confirmarlo en el texto consolidado del BOE.
- **Temas:** 175 distintos, sin taxonomía (por ejemplo `2008`, `1929`, `sp500`, `irpf`, `sesgos`). **Activos:** ninguna nota los usa.
- **Fuentes que no encajan en el nuevo orden** (se sustituyen o la nota se retira en P2): `hartfordfunds.com` (9, contenido de una gestora), `wikipedia.org` (6), `ultimahora.es` (2), `cnbc.com` (2), `pbs.org` (3), varias gestoras (Vanguard, iShares, BlackRock, J.P. Morgan, Fidelity: 20 en total) y blogs de investigación.
- **Posibles duplicados** (títulos con Jaccard ≥ 0,6): B-1102/B-1103 (0,71), B-1101/B-1109 (0,60); y 9 pares más entre 0,4 y 0,6 a revisar.
- **Vocabulario:** 35 notas contienen «compra», «vende» o similares. A primera vista describen mecánica («comprar Letras en subasta»), no recomiendan, pero se revisan una a una.

## 3. Seguridad: tres capas contra inyecciones de instrucciones

Lo que buscas en internet puede llevar instrucciones escondidas. Ninguna de estas capas depende de que el modelo «se porte bien»:

1. **Cuarentena.** Solo tres agentes abren webs y solo tienen WebFetch (y WebSearch el buscador). No pueden ejecutar, escribir ni leer ficheros, y devuelven JSON con un esquema fijo:
   - `lector-fuentes` (pasada 1)
   - `buscador-fuentes` (candidatos de URL)
   - `verificador-notas` (pasada 2, independiente)

   Están en `.claude/agents/`. El autor (la sesión principal) nunca lee el texto crudo de una página.
2. **Guardia por código** (`.claude/hooks/guardia.mjs`, hook `PreToolUse` en todas las herramientas, también dentro de los agentes, con `onFailure: block`). Bloquea:
   - WebFetch fuera de `.claude/hooks/dominios.txt` (lista de fuentes permitidas), sin https, con IP, puerto, credenciales o datos escondidos en la URL;
   - herramientas de red en la terminal, ejecutar texto canalizado (`| sh`, `eval`, `base64 -d`), instalar paquetes, `npx`;
   - leer las páginas descargadas salvo con los scripts del proyecto;
   - tu carpeta de datos, `~/.config/finhub`, `~/.claude`, claves y todo fuera del repo y `/tmp`;
   - `git push`, `main`, reescribir historia;
   - escribir notas o evidencias desde la terminal;
   - cambiar `.claude/`, solo tú a mano.

   El hook `PostToolUse` apunta en `.cache/conocimiento/incidencias-web.jsonl` cada página con texto que parece una orden. Tiene **5 tests** (`test/seguridad/guardia-claude.test.js`) con más de 30 ataques.
3. **Permisos** en `.claude/settings.json` (deny): lectura de `~/.claude`, `~/.config/finhub`, claves y `/mnt/d/GoogleDrive`; edición de `.claude/`; `git push`.

Skills: `web-segura` (reglas para leer la web) y `conocimiento` (este protocolo, para cada sesión).

**Límites que conviene que sepas:**
- **La guardia y los agentes se activan al reiniciar Claude Code.** La carpeta `.claude/` no existía al empezar esta sesión y Claude Code no la carga hasta reiniciar. Lo he comprobado: en esta sesión un comando con `/mnt/d/GoogleDrive` todavía pasa. Por eso en P0 **no se ha abierto ninguna web**, y P1 debe empezar en una sesión nueva.
- **Afecta a todo el repo.** La guardia vale para cualquier sesión en este proyecto, no solo la de conocimiento. Para quitarla, edita a mano `.claude/settings.json`.
- **Un agente que puede escribir y ejecutar código puede, en teoría, salir a internet desde un script propio.** La guardia lo dificulta, pero el corte de verdad sería el sandbox de Bash de Claude Code, con red solo a los dominios de la lista. Está desactivado; ver pregunta 4.

## 4. Taxonomía

**Temas.** La app no tiene una lista cerrada: `temas` admite cualquier id. Propongo una lista canónica en `docs/conocimiento/taxonomia.md`, que comprobará el validador. Los temas actuales de la Base se reetiquetan en P2 sin cambiar ids.

| Grupo | Temas |
|---|---|
| Conceptos | conceptos, interes-compuesto, inflacion, riesgo, volatilidad, rentabilidad, diversificacion, correlacion, costes, liquidez |
| Indexación | indices, indexacion, fondos, etf, replica, rebalanceo, concentracion, factores, divisas, dividendos |
| Renta fija y ahorro | renta-fija, deuda-publica, tesoro, credito, depositos, monetarios, cuentas |
| Fiscalidad | fiscalidad, irpf, base-ahorro, traspasos, planes-pensiones, patrimonio, sucesiones-donaciones, itp-ajd, modelos-informativos |
| Pensiones y retirada | pensiones-publicas, jubilacion, retirada |
| Vivienda y deuda | vivienda, hipotecas, euribor, alquiler, deuda |
| Protección | seguros, colchon, fgd, desempleo, proteccion-inversor, cripto, productos-complejos, reclamaciones |
| Mercados y macro | mercados, bolsa, bonos, bancos-centrales, tipos, bce, fed, empleo, pib, curva-tipos, materias-primas, petroleo, oro, emergentes, china, geopolitica, empresas, europa-espana, tecnologia, energia-materias-primas |
| Historia y comportamiento | crisis, historia, valoracion, comportamiento, sesgos, market-timing, glosario |
| **Nuevos** (para aprobar) | `historia-anual` (Base, año a año), `resumen-mensual` y `resumen-anual` (Mundo), `retrospectivo` (toda nota escrita después de su fecha) |

Los temas del pulso de la app (`mercados`, `bancos-centrales`, `europa-espana`, `tecnologia` y `energia-materias-primas`) están incluidos, para que las notas de Mundo encajen con las del usuario.

**Activos.** En la app, `activos` son los ids de **tus** activos (por ejemplo `msci-world`); la semilla no puede conocerlos. Propuesta: la semilla deja `activos` vacío (pregunta 2).

**Sectores de `efectos`.** Solo los 7 de la lista de `ejemplo/` (§1) y solo si el efecto es claro y directo según las fuentes del momento.

## 5. Formato de las notas nuevas

Copiado del código. Si el plan y el código discrepan, manda el código.

**Base**
- **Ficheros:** `semilla/base/<area>.md`, con `# Base · <Área>`, `esquema: 1` y `fuente: base`.
- **Campos, en este orden:** `editada: no`, `tipo`, `fecha`, `fuente: base`, `origen`, `temas`, `verificar` (normativa).
- **`tipo`:** solo `hecho`, `dato` o `consenso`; el parser avisa de otro tipo en la Base.
- **`fecha`:** la del hecho o del dato (y `consultado` dentro de `origen`). En conceptos sin fecha propia, la de la consulta.
- **`origen`:** «Medio · título o apartado · URL (consultado AAAA-MM-DD)»; si hay dos fuentes, separadas por « · y · ».
- **Normativa:** `verificar: 2026` y la norma (`BOE-A-…`) con la fecha desde la que se aplica, dentro del texto o de `origen`.
- **`caduca`:** solo en normativa, el 31-12 del año de `verificar`. Pasada esa fecha deja de entrar en los análisis hasta que se reverifique, y eso es lo seguro.
- **Ids nuevos por bloques**, sin tocar los existentes:
  - Áreas de P3: `B-2AANN` a `B-3…`, un bloque de 1.000 por área, por ejemplo `B-21001` para el área 1 y `B-34001` para el área 14.
  - Historia anual: `B-4AANN`, con AA = año (00–25) y NN = nota, por ejemplo `B-42501`.

**Mundo**
- **Ficheros:** `semilla/mundo/AAAA-MM-DD.md`, con `# Mundo AAAA-MM-DD`, `fuente: mundo` y `fecha`.
- **Campos:** como los que escribe `pulso` (`editada`, `tipo`, `fecha`, `fuente: mundo`, `origen`, `temas`, `activos`, `postura`, `efectos`, `caduca`, `hash`), sin `pulso:`, porque no la trajo un pulso.
- **Ids:** `MR-AAMMDD-NN` si apruebas la pregunta 1; si no, `M-AAMMDD-NN`.
- **`hash`:** el mismo cálculo que la app (6 caracteres de la URL).
- **`caduca`** según el tipo, contado desde la fecha del hecho:

| tipo | días |
|---|---|
| dato | 365 |
| hecho | 180 |
| consenso | 180 |
| opinión | 90 |
| especulación | 60 |
| resúmenes mensuales y anuales | 365 |

  Las de antes de 2026 saldrán caducadas, y es lo esperado: buscables, pero fuera de los análisis.
- **Resúmenes:** se fechan el último día del periodo y usan solo lo publicado hasta el día siguiente.

**Vocabulario prohibido** (lo comprueba el validador): formas de recomendación como «compra», «vende», «compre», «venda», «deberías comprar o vender», «te recomendamos», «es buen momento para», «precio objetivo», «sobreponderar» o «infraponderar», y «garantizado» aplicado a una rentabilidad. Describir la mecánica («las Letras se compran en subasta») está permitido.

## 6. Fuentes, descargas y evidencias

- **Orden:** primarias (BOE, AEAT, Seguridad Social, CNMV, BdE, BCE, Fed, INE, Eurostat, BLS, MSCI, S&P DJI, FTSE Russell, Stoxx, comunicados oficiales) > prensa de referencia (Reuters, Expansión, Cinco Días, El Economista, FT, Bloomberg) > divulgación seria, solo para conceptos.
- **Prohibidos:** foros, afiliados, promoción y webs automáticas.
- **Lista de dominios:** `.claude/hooks/dominios.txt`, que solo editas tú. Los comunicados de empresas y otras fuentes fiables que falten se piden caso a caso y se apuntan en `INCIDENCIAS.md`.
- **Descarga para la caché** (P1, `scripts/conocimiento/traer.js`, sin dependencias):
  - misma lista de dominios, solo https, sin seguir redirecciones a otros dominios, 10 MB y 30 s como máximo;
  - guarda la página **comprimida** en `.cache/conocimiento/paginas/<sha256>.gz` (así un `grep` no la muestra en crudo), su texto extraído y una ficha (URL, fecha de consulta, tipo y hash).
  - **PDF:** se intenta extraer el texto; si no se puede, la nota necesita una fuente HTML equivalente o queda marcada «verificación manual».
  - Nunca se ejecuta nada descargado.
  - La pasada 1 abre cada URL dos veces: el lector para entenderla y el script para guardarla.
- **Archivo web:** solo la página original archivada (`web.archive.org/web/<fecha>/<URL original>`), con su fecha de captura.
- **Evidencias:** `docs/conocimiento/evidencias/<lote>.jsonl`, una línea por afirmación, con:
  - `nota` y `afirmacion` (en una frase), y `cifras` exactas;
  - `url`, `medio`, `publicada` y `consultada`, y el `apartado` de la página;
  - `pagina` (sha256 de la caché);
  - `p1` y `p2`: confirmada, matiz, no_encontrada o contradicha, con quién y cuándo;
  - `p3`: el resultado del validador.

  Sin texto copiado.

## 7. Herramientas (P1)

**`pnpm conocimiento:validar`** (la pasada 3). Comprueba:
- el formato con los parsers reales;
- ids y hash únicos en Base y Mundo;
- temas de la taxonomía;
- de 2 a 6 líneas de texto y `origen` https;
- `verificar` en normativa y `caduca` según el tipo;
- vocabulario prohibido;
- copia: 8 o más palabras seguidas iguales a la página en caché, sin contar nombres ni cifras;
- cifras: cada número de la nota aparece en alguna de sus páginas;
- duplicados con la regla de la app;
- evidencias completas con p1 y p2 en «confirmada»;
- en retrospectiva, que ninguna fuente se publicó después de D+1.

Cada fallo indica nota, regla y, como mucho, 12 palabras del fragmento.

**`pnpm conocimiento:auditar`** (coherencia):
- reconstruye desde las notas las series de tipos del BCE y de la Fed, el Euríbor, el IPC y el EUR/USD. Cada decisión parte del tipo anterior; un salto imposible o un hueco va a revisión;
- marca el mismo concepto con cifras distintas, por ejemplo límites fiscales;
- comprueba que Mundo y la historia anual de la Base no se contradicen.

**Importación de Mundo** (lo mínimo, como pides):
- `/api/semilla?tipo=mundo`;
- el onboarding lo copia;
- después se ofrece «hay N notas nuevas de Mundo · revisar»;
- op `mundo.importar`: valida, deduplica con la regla de la app, funde por día, no pisa notas editadas y manda a cuarentena lo inválido;
- test de R1: solo escribe en `conocimiento/base/` y `conocimiento/mundo/`, y nunca lee datos privados.

Todo con tests. Commit `feat(conocimiento): validar e importar paquetes de notas públicas`.

## 8. Cuotas (orientativas; si un área no da para más con calidad, se para antes)

| Bloque | Densidad | Total aprox. |
|---|---|---|
| Base · auditoría | las 208 actuales | 208 revisadas |
| Base · temática (14 áreas) | 40–80 por área | ~600 |
| Base · historia anual 2000–2025 | 2–3 por año | ~70 |
| Mundo 2026 · tramo B (1-sep → 7-nov, 49 días laborables) | 4–8 por día | ~290 |
| Mundo 2026 · tramo A (1-ene → 31-ago, 35 semanas) | 10–15 por semana | ~370 |
| Mundo 2020–2025 (72 meses) | 1 resumen + 2–4 hitos por mes | ~250 |
| Mundo 2000–2019 (20 años) | 1 resumen + 5–8 hitos por año | ~150 |
| **Total** | | **~1.930 notas nuevas + 208 auditadas** |

## 9. Calendario de lotes (orden de prioridad)

| Fase | Lotes | Commit |
|---|---|---|
| P1 | herramientas | `feat(conocimiento): …` · PARA |
| P2 | 6 lotes, uno por fichero actual (primero `indices`) | `fix(base): auditoría de <tema>` · PARA tras el primero |
| P3 | 14 áreas, primero la 2 (inversión indexada), luego 1, 3–14 | un commit por área · PARA tras la primera |
| P4 | tramo B por quincena: 09-1, 09-2, 10-1, 10-2, 11-1 (1–7 nov); tramo A por mes, de agosto a enero | `feat(mundo): 2026-MM(-1/-2)` · PARA tras 10-1 |
| P5 | historia anual por lustro (2021–2025 → 2000); Mundo 2025 → 2020 por año; Mundo 2019 → 2000 por lustro | PARA tras historia 2021–2025 |
| P6 | IMPORTAR.md | |
| P7 | auditoría final, tercera comprobación al azar, prueba en la app con copia temporal de `ejemplo/` | PARA con el informe |

El detalle y el estado de cada lote están en `PROGRESO.md`.

## 10. Estimación de esfuerzo (aproximada)

Cada nota tiene unas 3–4 afirmaciones y 2 fuentes, y las cifras clave llevan doble fuente. Los agentes trabajan por grupos: un lector para 5–10 notas que comparten fuentes y un verificador para unas 5 notas.

| Bloque | Notas | Páginas abiertas (p1 + p2) | Búsquedas | Llamadas a agentes | Sesiones |
|---|---|---|---|---|---|
| Auditoría Base | 208 | 800–1.000 | 100–200 | ~90 | 4–6 |
| Base temática | ~600 | 2.400–3.000 | 400–600 | ~250 | 10–15 |
| Historia anual | ~70 | 400–500 | 100 | ~35 | 2–3 |
| Mundo 2026 | ~650 | 2.000–2.600 | 600–900 | ~250 | 10–14 |
| Mundo 2020–2025 | ~250 | 800–1.000 | 250–400 | ~100 | 4–6 |
| Mundo 2000–2019 | ~150 | 500–700 | 150–250 | ~60 | 3–4 |
| **Total** | **~1.930** | **~7.000–9.000** | **~1.600–2.450** | **~800** | **~35–50** |

Riesgos de volumen:
- **Muros de pago y bloqueos.** Reuters, FT y Bloomberg suelen bloquear la lectura automática o tener muro de pago. En Mundo, las fuentes reales serán sobre todo primarias (BCE, Fed, INE, Eurostat) y prensa española.
- **La regla «publicada hasta D+1»** reduce mucho las fuentes de años antiguos (archivo web).
- **Tramo A** puede quedarse por debajo de la cuota con calidad. Si pasa, se para antes y se dice.

## 11. Discrepancias entre plan y código (manda el código; se apuntan)

1. El plan (§4.7) dice que las caducadas no entran en los análisis «por defecto». El código no las deja entrar nunca, ni pidiendo su periodo.
2. El plan (§4.9) habla de sectores editables con lista por defecto. El código no trae lista por defecto para una carpeta nueva.
3. El plan (§7.1) ofrece «notas nuevas en la Base», pero no corregidas. El código hace lo mismo: una corrección con el mismo id no llega a quien ya importó.
4. El plan pide `hash` en las notas. El código solo lo pone en Mundo (un resumen de la URL), y la Base no lo lleva.
5. El ejemplo de nota del plan lleva `activos: rf-euro, colchon`. En el código, `activos` son ids de tus activos.

## 12. Preguntas para ti (P0 → PARA)

1. **Marca de retrospectiva.**
   - A (recomendada): prefijo de id `MR-AAMMDD-NN`. No cambia el formato, el parser no avisa y la app lo puede distinguir.
   - B: una clave nueva `retro: AAAA-MM`. Es un cambio de formato pequeño, pero cambia el formato.
2. **Taxonomía.** ¿Apruebas la lista de temas del §4, los 4 temas nuevos y dejar `activos` vacío en la semilla?
3. **Cambios de la app en P1, además de importar Mundo.** Cada uno cambia comportamiento; elige los que quieras:
   - a) el onboarding rellena los 7 sectores del mapa de efectos;
   - b) un trabajo que pide un periodo pasado incluye las notas caducadas de ese periodo;
   - c) la app ofrece también las notas corregidas de la semilla (mismo id y otro texto, si no las editaste);
   - d) la postura de la fuente Mundo ignora las notas retrospectivas.
4. **Descargas y sandbox.**
   - ¿Apruebas el descargador `scripts/conocimiento/traer.js` (§6)? Sin él no hay detector de copia ni comprobador de cifras.
   - ¿Activo también el sandbox de Bash, con red solo a la lista de dominios? Es la barrera más fuerte, pero habría que probar que no rompe los tests con navegador y servidor local.
5. **Alcance.** Son ~1.930 notas, unas 8.000 páginas y 35–50 sesiones. ¿Sigo con todo en el orden de prioridad, o recortas algún bloque (por ejemplo, el tramo A de Mundo 2026 a 5–8 notas por semana)?
