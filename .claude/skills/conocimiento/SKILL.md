---
name: conocimiento
description: Protocolo para construir y auditar la Base y Mundo de finhub (semilla/base/, semilla/mundo/): fases P0–P7, las tres pasadas anti-alucinación, formato de las notas, evidencias, PROGRESO.md y paradas obligatorias. Úsala al empezar cualquier sesión de conocimiento y antes de escribir, verificar o publicar notas.
---

# Proyecto de conocimiento de finhub

El plan completo y las decisiones están en `docs/conocimiento/PLAN-CONOCIMIENTO.md`. Úsalo como referencia; esto es la chuleta de trabajo. Antes de abrir ninguna web, carga también la skill `web-segura`.

## Al empezar cada sesión
1. Lee `docs/conocimiento/PROGRESO.md` y `git log --oneline -15`.
2. Sigue desde el primer lote que no esté `publicado`. Un lote a medias se rehace entero.
3. Respeta las paradas: final de P0 y de P1; tras el primer lote de P2, P3, P4 y P5; P7. Entre medias, informa lote a lote.

## Límites que no se cruzan
- Solo ficheros dentro del repo (y `/tmp`). Nunca la carpeta de datos de finhub, `~/.config/finhub/` ni `~/.claude/`.
- Esta sesión tiene internet y texto externo: nunca ve datos privados. `ejemplo/` solo sirve para copiar el formato.
- Nada de series de valores de índices en el repo (§7.3). En las notas, como mucho rentabilidades anuales redondeadas a un decimal, con su fuente.
- No es asesoramiento: ni «compra», ni «vende», ni «precio objetivo», ni recomendaciones de productos. Los productos comerciales, solo como ejemplo neutro e imprescindible.
- Derechos: paráfrasis propia de 2 a 6 líneas. Solo datos y nombres propios pueden ser literales.
- Git: solo `develop`, sin push. Un commit por lote publicado: `feat(base): …`, `feat(mundo): …`, `fix(base): …`. La caché de páginas va en `.cache/conocimiento/` (ignorada).
- Código de la app: solo en P1 (validación e importación) y con tests. No cambies formatos ni comportamiento sin permiso.

## Las tres pasadas (cada nota)
1. **Autor, con evidencia.** Nada de memoria: la memoria solo dice qué buscar. Cada afirmación sale de una página abierta en esta sesión por `lector-fuentes` (el fragmento de un buscador no basta). Las cifras importantes (tipos, IPC, rentabilidades, límites fiscales, fechas de decisiones) se confirman en dos fuentes independientes, al menos una primaria. Las páginas se guardan con `node scripts/conocimiento/traer.js` en `.cache/conocimiento/paginas/` y cada afirmación se apunta en `docs/conocimiento/evidencias/<lote>.jsonl` (id de nota, afirmación en una frase, cifras exactas, URL, medio, fecha de publicación, fecha de consulta y apartado, sin copiar texto).
2. **Verificador independiente.** `verificador-notas` recibe SOLO la nota y la lista de URL. Vuelve a abrir cada fuente y da un veredicto por afirmación. `no_encontrada` o `contradicha` bloquean la nota; un `matiz` se corrige y la nota vuelve a la pasada 2. Si dos fuentes discrepan: una tercera, primaria; si no hay acuerdo, se descarta o se reescribe con las dos versiones.
3. **Automática.** `pnpm conocimiento:validar`: formato con los parsers de la app, ids y hash únicos, temas de la taxonomía, longitud, `origen` https, `verificar: AAAA` en normativa, `caduca` según el tipo, vocabulario prohibido, copia (8+ palabras seguidas iguales a la fuente), cifras presentes en las fuentes, duplicados (misma URL o Jaccard ≥ 0,6 en títulos, ±1 día en Mundo) y evidencias completas con las dos pasadas confirmadas.
Al cerrar cada lote: `pnpm conocimiento:auditar` (series de tipos, IPC, Euríbor y EUR/USD sin saltos imposibles; mismo concepto con la misma cifra; Mundo coherente con la historia anual).

## Retrospectiva (fechas pasadas)
- Una nota con fecha D usa solo fuentes publicadas hasta D+1 y no menciona nada posterior a D.
- Postura y efectos: como se leyó entonces. Las previsiones de ese día son opinión o especulación, con su autor; nunca van a predicciones.
- Llevan la marca de retrospectiva acordada en P0. Los resúmenes se fechan el último día del periodo.
- `efectos`: solo sectores de la lista por defecto y solo si el efecto es claro y directo; ante la duda, `•` o nada.

## Estados de PROGRESO.md
`pendiente` → `escrito` → `verificado-1` → `verificado-2` → `validado` → `publicado`. Solo se hace commit de lotes `validado` con todas sus notas en `verificado-2`. Escribe en disco nota a nota.
