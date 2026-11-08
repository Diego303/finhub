# Incidencias del proyecto de conocimiento

Cada intento de inyección (webs con instrucciones trampa), muro de pago, fuente desaparecida, bloqueo de la guardia o problema del proceso. Formato: fecha · dónde · qué pasó · qué se hizo. Nunca se copia aquí la orden entera de una web: se resume.

| Fecha | Dónde | Qué pasó | Qué se hizo |
|---|---|---|---|
| 2026-11-08 | `.claude/` | Se crean la guardia (`hooks/guardia.mjs`, con tests), la lista de dominios, los agentes `lector-fuentes`, `buscador-fuentes` y `verificador-notas`, y las skills `web-segura` y `conocimiento`. | Comprobado con 5 tests de la guardia. |
| 2026-11-08 | sesión de P0 | La guardia y los agentes **no se activan en la sesión en la que se crean**: la carpeta `.claude/` no existía al empezarla, y Claude Code solo la carga al reiniciar. Un comando de prueba con `/mnt/d/GoogleDrive` todavía pasó (solo un `echo`, sin leer nada). | En P0 no se ha abierto ninguna web. P1 empieza en una sesión nueva, y lo primero es comprobar que la guardia bloquea. |
| 2026-11-08 | documentación de Claude Code | WebFetch devuelve lo que un modelo extrae de la página, no el texto crudo. | El detector de copia y el comprobador de cifras usarán una descarga aparte (`scripts/conocimiento/traer.js`, P1), pendiente de tu OK. |
| 2026-11-08 | documentación de Claude Code | En WSL, Grep y Glob se hacen con Bash. Un hook que falla deja pasar la llamada si no se le dice lo contrario. | Las reglas de la guardia cubren Bash, Monitor y PowerShell, y el hook lleva `onFailure: block`. Las páginas se guardan comprimidas, para que un `grep` no las muestre en crudo. |
