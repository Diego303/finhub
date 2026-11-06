# Lista manual de QA (Windows)

Lo que los tests automáticos no pueden comprobar: tu Windows, tu servicio de sincronización y el Claude de verdad. Unos 45 minutos. Hazla con tu carpeta real solo donde se dice; para lo demás usa `finhub --ejemplo`.

## Arrancar
- [ ] 1. `finhub --ejemplo` abre el navegador en `http://127.0.0.1:4747/` (u otro puerto si está ocupado).
- [ ] 2. El acceso directo del escritorio arranca finhub sin dejar ventanas abiertas.
- [ ] 3. Instala la app desde el navegador (Chrome o Edge: «Instalar finhub») y ábrela: tiene su icono y su ventana.
- [ ] 4. `finhub arranque activar` y reinicia el PC: finhub está en marcha al entrar, sin ventana. `finhub status` lo confirma.
- [ ] 5. `finhub arranque desactivar` y reinicia: ya no arranca solo.

## Tu carpeta sincronizada
- [ ] 6. En Google Drive para escritorio (u OneDrive) marca la carpeta como «Disponible sin conexión» / «Mantener siempre en este dispositivo».
- [ ] 7. Pon un fichero «solo en la nube» a propósito: finhub avisa «solo en la nube» y no lo vacía. Vuelve a descargarlo: se recupera.
- [ ] 8. Anota un movimiento y mira que el fichero sube a la nube (icono del servicio) sin copias en conflicto.

## Editar a mano
- [ ] 9. Con la web abierta, cambia un concepto en `mes/AAAA-MM.md` con el **Bloc de notas** y guarda: la web lo muestra en menos de 3 s, y «actualizado» arriba a la derecha.
- [ ] 10. Lo mismo con **Obsidian**, incluida una línea nueva sin id: al guardar en la web recibe id y no se pierde nada.
- [ ] 11. Escribe en un formulario de la web, edita a mano otro fichero y comprueba que lo escrito sigue ahí.

## Dos sitios a la vez
- [ ] 12. Abre finhub en el segundo PC con la misma carpeta: «abierto en OTRO-PC», solo lectura. No aparece ninguna copia en conflicto.
- [ ] 13. «Tomar el control»: el primero pasa a solo lectura en su siguiente operación.
- [ ] 14. Sin conexión, edita el mismo mes en los dos PC; al sincronizar aparece el aviso en Pendientes y en Ajustes.
- [ ] 15. Resuelve con «fusionar»: están los movimientos de los dos y lo descartado sigue en la papelera. **Apunta el nombre exacto de la copia en conflicto de tu servicio:** los patrones de Google Drive están sin verificar (`docs/SINCRONIZACION.md` §4 y §7).

## Claude de verdad (gasta tu suscripción)
- [ ] 16. Pulso real de hoy: mira el progreso, revisa y guarda. Cada nota lleva su URL y se abre en una pestaña nueva.
- [ ] 17. Descubrimiento real: investiga, guarda; después «Encaje con mi cartera» y comprueba que va a `analisis/encajes/`, nunca junto al descubrimiento.
- [ ] 18. Gestión → R1 y registro: el registro de hoy lista esas ejecuciones con sus herramientas: solo `WebSearch` y `WebFetch` en las de internet, ninguna en las privadas.
- [ ] 19. Abre `.finhub/registro/AAAA-MM.jsonl` y comprueba que no hay nada tuyo en las líneas de los trabajos con internet.
- [ ] 20. Cierra sesión en Claude (`claude /logout`), lanza un chat: mensaje claro y Rex preocupado. Vuelve a entrar.

## Aspecto
- [ ] 21. Ajustes → tema: claro, oscuro y automático; cambia el tema de Windows con «automático» y mira que sigue.
- [ ] 22. Zoom del navegador al 125 % y al 200 %: todo se puede usar y nada queda oculto bajo la barra de R1.
- [ ] 23. Usa solo el teclado para anotar un movimiento y cerrar un modal.

## Lo importante
- [ ] 24. `pnpm qa:validar -- --datos "<tu carpeta>"`: revisa lo que señale. Trabaja sobre una copia y no toca tu carpeta.
- [ ] 25. Restaura un fichero desde `.finhub/copias/AAAA-MM-DD/` a una carpeta de prueba: es idéntico al de ese día.
