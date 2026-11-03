# Tarea · Descubrir a partir del pulso
esquema: 1
trabajo: descubrir
descripcion: Temas que se repiten en las noticias del periodo, con su tesis y lo que la invalidaría.
## Trabajo
A partir de las notas de Mundo del periodo (el pulso), detecta los temas de inversión que se repiten en varias noticias. Para cada uno: tesis, qué tendría que pasar para que saliera bien, qué la invalidaría, riesgos y vehículos para informarse (con ISIN solo si lo has comprobado). Cita las notas y las URL que consultes. Marca cada afirmación como hecho, dato, consenso, opinión o especulación. Es información, no una recomendación.
## Formato de salida
```json
{"descubrimientos":[{"titulo":"…","tipo":"tema","postura":"alcista","confianza":"media","tesis":"…","saldria_bien_si":"…","la_invalidaria":"…","riesgos":"…","vehiculos":[{"nombre":"…","isin":"…","ter":0.2}],"citas":["M-…","https://…"],"afirmaciones":[{"tipo":"hecho","texto":"…"}],"revisar_en_dias":30}]}
```
