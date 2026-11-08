# Notas retiradas de la P2, para reanudar

Esto **no es semilla**: la app no lee esta carpeta y nada de aquí se importa. Son copias de trabajo para recuperar o rehacer notas en lotes posteriores.

| Fichero | Notas | Por qué se apartaron |
|---|---|---|
| `retiradas/fiscalidad-sin-verificar.md` | 11 | B-1406, 1409, 1416, 1417, 1418, 1420, 1425, 1426, 1427, 1432 y 1433. No se detectó ningún error, pero no pudieron contrastarse con el texto de la ley en el entorno externo. |
| `retiradas/crisis-retiradas.md` | 15 | Solo tenían fuentes no válidas (Hartford Funds, Wikipedia, PBS, CNBC, OCU, prensa no listada) o publicaban cierres de índices. |
| `retiradas/comportamiento-retiradas.md` | 6 | Solo tenían fuentes de gestoras, Hartford Funds, AAII o CFA Society Toronto. |
| `retiradas/otras-retiradas.md` | 6 | B-1035 y B-1036 (conceptos), B-1119 y B-1127 (índices), B-1528 (duplicado) y B-1531 (renta fija). |
| `p1-fiscalidad-resumen.md` | — | Lo que averiguó la pasada 1 de fiscalidad: fuentes que sí abrieron y correcciones por nota. |

Las 38 notas más las 170 publicadas suman las 208 de la Base original.

Para recuperar una nota hay que pasarla otra vez por las tres pasadas con fuentes de la lista de dominios, como una nota nueva. El texto de aquí solo sirve de punto de partida.

No están aquí, y siguen en el zip del paquete (`finhub-conocimiento-2026-11-08.zip`), fuera del repo:
- `herramientas/evid-*.mjs`: escriben `p1` y `p2` como «confirmada» para cada nota sin verificar nada, a partir de una lista de verificadores. Usados mal, crean evidencias falsas.
- `informes/`: la salida final del validador y del auditor en el entorno externo. Se vuelve a obtener con `node scripts/conocimiento/validar.mjs --sin-cache --json …` y `auditar.mjs`.
- `src-provisional/`: módulos de `src/` reconstruidos para el entorno externo. En el repo manda el `src/` real.
