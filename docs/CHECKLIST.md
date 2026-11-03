# Checklist de casos límite (PLAN §9) · F12

Cada caso del §9 con la prueba que lo cubre. Todas corren con `pnpm test`: unitarios, servidor por HTTP real y e2e en Chromium con carpetas temporales y el Claude falso. **Ningún test llama al Claude real ni toca una carpeta real.**

| § | Caso | Cómo se comprueba | Prueba |
|---|---|---|---|
| 9.1 | Mes sin entradas → tasa «no concluyente» | cálculo | `test/core/mes-calculos.test.js` · «tasa sin entradas…» |
| 9.2 | Movimiento sin grupo o con grupo borrado → ⚠ y «sin grupo», sin perderlo | cálculo, formato y operación | `mes-calculos.test.js` (mismo test) · `formato/ficheros.test.js` «mes: … sin grupo» · `ops-mes.test.js` «grupos: … borrar … dejando “sin grupo”» |
| 9.3 | Cambiar el mes financiero con meses cerrados | operación con inversa exacta + e2e desde Ajustes | `ops-mes.test.js` «mes financiero (§9.3)» · `e2e/mes.test.js` «mes financiero desde Ajustes» |
| 9.4 | Editar un mes cerrado → recalcula su foto y los siguientes | operación | `ops-mes.test.js` «editar un mes cerrado (§9.4)» |
| 9.5 | Activo sin valores → «sin valorar» por lo aportado | cálculo | `cartera.test.js` «valor de un activo … (§9.5)» |
| 9.6 | Operación anterior a la primera foto / ventas mayores que lo aportado | aviso sin romper | `cartera.test.js` «coste fiscal FIFO…» («venta antes de aportar: aviso, sin romper (§9.6)») |
| 9.7 | XIRR sin solución o con varias → «no concluyente» | cálculo | `cartera.test.js` «XIRR … (§9.7)» |
| 9.8 | Series con huecos → interpolación marcada o exclusión | cálculo y formato | `cartera.test.js` «… huecos interpolados (§9.8)» · `ficheros.test.js` «series de Datos: … huecos» · `datos.test.js` |
| 9.9 | Proyección con aportación 0 o 40 años en < 300 ms | tiempo medido | `metas.test.js` «proyección determinista … y < 300 ms con 40 años» |
| 9.10 | Fuente borrada usada por una mezcla → aviso y limpieza con deshacer | operación | `conocimiento.test.js` «mezclas: … fuentes borradas» y «operaciones: fuentes, familias, mezclas» |
| 9.11 | Nota editada a mano y reingesta → no se pisa y avisa | operación | `ops-ia.test.js` «ingesta: … reingesta sin pisar lo editado» |
| 9.12 | Dos pulsos el mismo día → deduplicación · fechas fuera de rango → cuarentena | operación + motor | `ops-ia.test.js` «pulso: fusión…» · `r1/motor.test.js` «ataques…» (fuera del día pedido) |
| 9.13 | Claude sin instalar, sin sesión, sin conexión o con el límite → mensaje claro; Pendientes sin IA | runner con el Claude falso | `r1/motor.test.js` «errores con mensaje claro…» · `core/resumen.test.js` (Pendientes es solo código) |
| 9.14 | JSON inválido, citas inventadas, cifras no verificadas | validador y verificador | `r1/motor.test.js` «verificador…» y «ataques…» |
| 9.15 | Texto trampa en CONTEXTO o en la web | escapado, niveles, guardia y cuarentena | `r1/r1.test.js` «texto externo…» · `r1/motor.test.js` «ataques…» · `r1/descubrir.test.js` (webs trampa) |
| 9.16 | Editar a mano con la web abierta → recarga o 409 | servidor y SSE | `server/api.test.js` «operación, 409 …», «deshacer no pisa cambios posteriores», «SSE…» · `server/almacen.test.js` «cambios hechos fuera…» · `e2e/web.test.js` «cambios de fuera…» |
| 9.17 | Líneas mal escritas → se conservan y se marcan | formato (ida y vuelta) | `formato/ficheros.test.js` (todas las secciones) · `propiedades/` (ida y vuelta) · `scripts/generar-ejemplo.js --comprobar` |
| 9.18 | 5 años de datos (≈ 3.000 movimientos, 600 operaciones, 2.000 notas) → cada vista < 200 ms | e2e medido en Chromium | `e2e/rendimiento.test.js` (carpeta de `server/grande.js`; peor caso medido ≈ 70 ms) |
| 9.19 | Cambio de año fiscal → tramos con «verificar» | cálculo + aviso en Cartera | `core/pulido.test.js` «§9.19…» · `ficheros.test.js` (fiscalidad con «verificar») |
| 9.20 | Divisa distinta del euro sin tipo de cambio → «no concluyente» y aviso | cálculo | `cartera.test.js` · `ops-cartera.test.js` |
| 9.21 | Fechas en cambio de hora y zona horaria (UTC, Madrid, LA) | mismos resultados en las 3 zonas | `fechas.test.js` «zona horaria (§9.21)» · `humo.test.js` |
| 9.22 | Restaurar algo cuyo padre ya no existe | restaura también la fuente (si está en la papelera) o explica qué hacer | `server/pulido.test.js` «papelera §9.22…» |
| 9.23 | Carpeta sincronizada: conflicto → aviso y resolución · solo en la nube → reintento, nunca vacío · temporal huérfano → se limpia · dos equipos → solo lectura | almacén, API y e2e | `server/almacen.test.js` (conflictos, nube, temporales) · `server/pulido.test.js` (resolver: tuya, otra, fusionar, a mano, restaurar) · `e2e/pulido.test.js` (desde la interfaz) · `server/candado-papelera-copias.test.js` y `server/api.test.js` (solo lectura) |
| 9.24 | Cambiar de carpeta: sin permisos, otra unidad, espacios o tildes, ya con datos, dentro de la actual; «Mover» interrumpido | validaciones y copia verificada | `server/carpeta.test.js` (todos) · `server/api.test.js` «cambiar de carpeta sin reiniciar» |
| 9.25 | Descubrimiento con ISIN inválido → se descarta con aviso · importes → cuarentena | operación + motor | `core/descubrimientos.test.js` · `r1/descubrir.test.js` |
| 9.26 | «¿Qué ha cambiado?» sin noticias → versión «sin cambios relevantes» o nada (configurable) | operación + motor | `core/descubrimientos.test.js` «descubrimiento.version…» · `r1/descubrir.test.js` (sin_cambios) |

## Lo que no es un test automático
- **La carpeta real** (Google Drive en `D:\`): solo con tu permiso explícito, al final de F12, y sin borrar ni mover nada tuyo.
- **Arranque con Windows:** `finhub arranque activar` escribe un único `finhub.vbs` en tu carpeta Inicio. Su contenido y el «no tocar lo ajeno» están probados en un directorio temporal (`test/pulido-cli.test.js`); que Windows lo ejecute al iniciar sesión se comprueba a mano.
- **Instalar la app** desde el navegador (icono ⊕ de la barra de direcciones): el manifiesto, los iconos y el service worker están probados (`e2e/pulido.test.js`, `pulido-cli.test.js`); el botón de instalar lo pone el navegador.
