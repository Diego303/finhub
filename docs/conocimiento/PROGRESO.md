# Progreso del proyecto de conocimiento

Estados: `pendiente` → `escrito` → `verificado-1` → `verificado-2` → `validado` → `publicado`. Solo se hace commit de lotes `validado` con todas sus notas en `verificado-2`. Un lote a medias se rehace entero.

Al empezar una sesión: lee esta tabla y `git log --oneline -15`, y sigue desde el primer lote que no esté `publicado`.

La P2 se hizo fuera del repo y se integró el 2026-11-09 en la rama `conocimiento/p2-auditoria`, copiando en limpio desde la rama de referencia `conocimiento/p2-bundle` (la historia original, 14 commits). Los commits de la tabla son los de la rama de integración.

**Siguiente paso:** P3, por prioridad. Antes, lo pendiente de la P2 (ver INFORME, «Tras la integración»): la regla de dos fuentes en las cifras importantes, las 11 notas de fiscalidad apartadas y las notas con fuentes solo en PDF, que hay que comprobar con la caché.

Herramientas (provisionales hasta la P1; la P1 decide si pasan a `pnpm conocimiento:validar` y `pnpm conocimiento:auditar`):
- `node scripts/conocimiento/validar.mjs [--solo <fichero.md>] [--sin-cache] [--json .cache/conocimiento/informes/<x>.json]` (pasada 3);
- `node scripts/conocimiento/auditar.mjs [--json …]` (coherencia, al cerrar cada lote);
- `node scripts/conocimiento/traer.mjs <url> …` (descarga para la caché; los PDF necesitan `pdftotext`);
- `node scripts/validar-base.js` (validador de la Base de la app);
- tests: `pnpm test` (incluye `test/conocimiento/` y `test/seguridad/`).

| Lote | Fase | Estado | Notas | Commit | Pasada 1 | Pasada 2 | Pasada 3 | Auditar |
|---|---|---|---|---|---|---|---|---|
| P0 · inventario y plan | P0 | hecho (decisiones del maestro §4 incorporadas) | — | — | — | — | — | — |
| Puesta en marcha (entorno externo) | — | hecha; se sigue aquí en modo reforzado por decisión del usuario (ver INCIDENCIAS 2026-11-08) | — | ver git | — | — | validador listo · Base actual: 0/208 sin errores | auditor listo · 0 a revisar |
| P1 · herramientas e importación | P1 | pendiente · **se hace en el repo** (maestro §11); aquí solo hay validador y auditor provisionales | — | | | | | |
| P2 · auditoría indices.md | P2 | **publicado** · B-1119 y B-1127 retiradas; B-1120 corregida en la segunda vuelta (regla de cotización de mayo de 2026). Evidencias en `evidencias/p2-indices.jsonl` | 34 | 21d4320 | 34/34 | 34/34 | `--sin-cache`: 34/34 sin errores · 3 avisos de título (Jaccard 0,43–0,50) revisados: contenido distinto | 0 a revisar |
| P2 · auditoría conceptos.md | P2 | **publicado** · B-1035 y B-1036 retiradas; 12 notas corregidas en la pasada 2. B-1002 y B-1007, retiradas mientras la guardia bloqueaba sus URL de ESMA, **recuperadas** tras el cambio de la regla aprobado por el usuario (commit 7b97a9d de `conocimiento/p2-bundle`). Evidencias en `evidencias/p2-conceptos.jsonl` | 36 | f9f2462 | 36/36 | 36/36 | `--sin-cache`: 36/36 sin errores · `normativa.revisar` en B-1002, 1015 y 1028 revisado: no son normativa (informe, glosario, opinión) | 0 a revisar |
| P2 · auditoría renta-fija-y-ahorro.md | P2 | **publicado** · B-1528 (duplicado) y B-1531 (solo con fuente de gold.org) retiradas. 26 notas reescritas en la pasada 1: fuentes de gestoras y de gold.org sustituidas por BOE, CNMV, BdE, BCE, FGD, FMI, CFA y S&P; 14 notas corregidas en la pasada 2. Evidencias en `evidencias/p2-renta-fija-y-ahorro.jsonl` | 32 | aa83d4b | 32/32 | 32/32 | `--sin-cache`: 32/32 sin errores · 4 avisos de título revisados · `normativa.revisar` en B-1533 (aviso de supervisores, no norma) | 0 a revisar |
| P2 · auditoría fiscalidad.md | P2 | **publicado** · 23 notas. 11 apartadas por no poder verificarse en este entorno (el proxy rechaza las URL largas del manual de la AEAT y WebFetch corta el BOE consolidado de la Ley 35/2006 en el art. 17): B-1406, 1409, 1416, 1417, 1418, 1420, 1425, 1426, 1427, 1432 y 1433, en `reanudar/retiradas/fiscalidad-sin-verificar.md`, para recuperarlas cuando se pueda leer el BOE completo. Evidencias en `evidencias/p2-fiscalidad.jsonl` | 23 | 74306c3 | 23/23 | 23/23 | `--sin-cache`: 23/23 sin errores | 0 a revisar |
| P2 · auditoría crisis.md | P2 | **publicado** · 15 notas retiradas (fuentes no válidas, sin sustituta: Hartford Funds, Wikipedia, PBS, CNBC, OCU, prensa no listada; o series de cierres de índices); copia en `reanudar/retiradas/crisis-retiradas.md`. 19 notas reescritas con Federal Reserve History, NBER, SEC, Fed, MEDE, BIS, MSCI, S&P DJI y Bloomberg; 12 corregidas en la pasada 2. Evidencias en `evidencias/p2-crisis.jsonl` | 19 | ddf15f0 | 19/19 | 19/19 | `--sin-cache`: 19/19 sin errores | 0 a revisar |
| P2 · auditoría comportamiento.md | P2 | **publicado** · 6 notas retiradas (solo con fuentes de J.P. Morgan, Hartford Funds, AAII o CFA Society Toronto, sin sustituta válida); copia en `reanudar/retiradas/comportamiento-retiradas.md`. Fuentes sustituidas: kva.se por nobelprize.org, Frontiers por Thaler y Johnson (1990), Morningstar por Dichev (2007) y el FAJ (2026), casact por RePEc. Quitadas 17 frases de consejo propio sin fuente. Evidencias en `evidencias/p2-comportamiento.jsonl` | 26 | 3b2545e | 26/26 | 26/26 | `--sin-cache`: 26/26 sin errores · aviso de título B-1323/B-1301 (0,50) revisado | 0 a revisar |
| P3 · área 2 · inversión indexada (`inversion-indexada.md`, B-22001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 1 · conceptos básicos (`conceptos-basicos.md`, B-21001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 3 · renta fija y liquidez (`renta-fija-y-liquidez.md`, B-23001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 4 · fondos y vehículos en España (`fondos-y-vehiculos.md`, B-24001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 5 · fiscalidad 2026 (`fiscalidad-2026.md`, B-25001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 6 · pensiones públicas (`pensiones-publicas.md`, B-26001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 7 · deudas y vivienda (`deudas-y-vivienda.md`, B-27001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 8 · protección (`proteccion.md`, B-28001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 9 · jubilación y retirada (`jubilacion-y-retirada.md`, B-29001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 10 · mercados e historia (`mercados-e-historia.md`, B-30001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 11 · macro para inversores (`macro-para-inversores.md`, B-31001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 12 · comportamiento (`comportamiento-con-datos.md`, B-32001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 13 · riesgos y protección del inversor (`riesgos-y-proteccion-del-inversor.md`, B-33001…) | P3 | pendiente | 40–80 | | | | | |
| P3 · área 14 · glosario (`glosario.md`, B-34001…) | P3 | pendiente | 40–80 | | | | | |
| P4 · Mundo 2026-09-1 | P4 | pendiente | 40–90 | | | | | |
| P4 · Mundo 2026-09-2 | P4 | pendiente | 40–90 | | | | | |
| P4 · Mundo 2026-10-1 | P4 | pendiente | 40–90 | | | | | |
| P4 · Mundo 2026-10-2 | P4 | pendiente | 40–90 | | | | | |
| P4 · Mundo 2026-11-1 (1–7 nov) | P4 | pendiente | 20–40 | | | | | |
| P4 · Mundo 2026-08 … 2026-01 (un lote por mes) | P4 | pendiente | 40–65 por mes | | | | | |
| P5 · Base historia 2021–2025 | P5 | pendiente | 10–15 | | | | | |
| P5 · Base historia 2016–2020 | P5 | pendiente | 10–15 | | | | | |
| P5 · Base historia 2011–2015 | P5 | pendiente | 10–15 | | | | | |
| P5 · Base historia 2006–2010 | P5 | pendiente | 10–15 | | | | | |
| P5 · Base historia 2001–2005 | P5 | pendiente | 10–15 | | | | | |
| P5 · Base historia 2000 | P5 | pendiente | 2–3 | | | | | |
| P5 · Mundo 2025 … 2020 (un lote por año) | P5 | pendiente | 36–60 por año | | | | | |
| P5 · Mundo 2015–2019, 2010–2014, 2005–2009, 2000–2004 | P5 | pendiente | 30–45 por lustro | | | | | |
| P6 · IMPORTAR.md | P6 | pendiente | — | | | | | |
| P7 · auditoría final | P7 | pendiente | — | | | | | |
