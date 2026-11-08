# Operaciones (`src/core/ops/`)

Todo lo que cambia tus ficheros pasa por una **operación**: una función pura registrada con un nombre (`mov.crear`), que recibe la lectura de tus ficheros y unos argumentos y devuelve qué ficheros escribir. La web la pide con `POST /api/ops {op, args, versiones}`. Los tests llaman a la misma función.

```
aplicarOp(leer, nombre, args, ctx) → { escribir: {ruta: texto | null}, inversa, papelera, avisos, resultado }
```

## Reglas comunes
- **Pura y determinista.** No toca el disco: lee con `leer(ruta)` y devuelve el texto nuevo de cada fichero tocado (`null` = borrar). El contexto (`ctx`) trae `hoy`, `hora`, `ajustes`, `rutas` y un PRNG con semilla.
- **Inversa exacta.** La inversa es siempre `ficheros.restaurar` con el contenido anterior, byte a byte, de cada fichero tocado (propiedad probada).
  - El servidor la guarda para **deshacer**: las 30 últimas por sesión, durante los 10 s del aviso (y 5 de margen).
  - Solo la aplica si esos ficheros siguen como los dejó la operación; si no, responde 409 «cambió después».
- **Versiones (409).** Cada operación de la web lleva `base`, la versión de los datos con los que la pestaña calculó. Si alguno de los ficheros que va a escribir cambió después (otra pestaña, otro equipo, una edición a mano), el servidor responde 409, la web recarga y nada se pisa. Antes de escribir también se mira el disco, por si hay una edición que el sondeo aún no ha visto. Las operaciones de una pestaña salen de una en una.
- **Papelera.** Lo que una operación borra (una línea, un bloque o un fichero) va a `.finhub/papelera/` 30 días. `papelera.restaurar` lo devuelve a su sitio.
- **Una a la vez.** El servidor encola las operaciones. Escribe cada fichero de forma atómica (temporal + `fsync` + renombrar) y, si falla a mitad, vuelve atrás los que ya había escrito.
- **Solo lectura.** Si la carpeta está abierta en otro equipo, ninguna operación escribe (423).
- **Mes cerrado.** Las que cambian un mes cerrado piden confirmación (`confirmarCerrado: true`), lo marcan «editado tras cierre» y recalculan su foto y la de los siguientes.
- **Claude propone, tú confirmas.** Ningún trabajo de Claude escribe en tus datos. Su salida se aplica con una de estas operaciones cuando la confirmas. Las que nacen de trabajos privados (`privado`, `encaje`) **nunca escriben en `conocimiento/`** (regla R1 en ops, con test).

## Genéricas (`genericas.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `lista.crear` · `lista.editar` · `lista.borrar` | `{ruta, valor}` · `{ruta, clave, cambios}` · `{ruta, clave, que?}` | entidades de una lista (cuentas, grupos, etiquetas, recurrentes, hitos, objetivo, clases, valores, fuentes, familias, mezclas, predicciones…); validadas con su formato; borrar → papelera |
| `bloque.crear` · `bloque.editar` · `bloque.borrar` | `{ruta, id, titulo, campos, cuerpo}` · … · `{ruta, id, que?}` | bloques «## id · título» (metas, activos, notas, versiones…) |
| `ajustes.fijar` · `ajustes.quitar` | `{clave, valor}` · `{clave}` | un ajuste (valor ya interpretado) o volver al valor por defecto |
| `ajustes.textos` | `{valores: {clave: texto}}` | varios ajustes escritos como en el fichero (vacío = por defecto), validados con su tipo y su gramática (humor, accesorios, crisis, supuestos, patrones de conflicto); un solo deshacer |
| `texto.guardar` | `{ruta, texto}` | tu versión de un rol o una tarea (solo `roles/` y `tareas/`), validada |
| `fichero.borrar` | `{ruta, que?}` | un fichero entero a la papelera (análisis, borrador, decisión, descubrimiento, conversación…) |
| `papelera.restaurar` | `{entrada}` | devuelve lo borrado (la pide el servidor, no la web) |
| `ficheros.restaurar` (`motor.js`) | `{ficheros}` | la inversa de todas: restaura el contenido exacto |

## Mes (`mes.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `mov.crear` · `mov.editar` · `mov.borrar` | `{mov}` · `{mes, id, cambios}` · `{mes, id}` | movimientos del mes financiero que toca (ordenados por fecha, con id corto propio) |
| `rec.confirmar` · `rec.confirmarTodos` · `rec.saltar` · `rec.desmarcar` | `{mes, rec, importe, fecha}` … | los recurrentes del mes: confirmarlos (crea el movimiento), saltarlos o quitar la marca |
| `pres.fijar` | `{mes, grupo, importe}` | presupuesto de un grupo solo para ese mes |
| `mes.cerrar` · `mes.reabrir` | `{mes, leccion?}` · `{mes}` | foto de cierre (saldos, cartera, patrimonio) o quitarla |
| `mes.cambiarInicio` | `{dia}` | cambia el mes financiero y reparte **todos** los movimientos en sus nuevos meses (con avisos) |

## Catálogos (`catalogos.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `rec.editar` · `rec.pausar` | `{id, cambios, aplicar, mes?}` · `{id, pausado}` | cambiar un recurrente «también este mes» o «desde el siguiente»; pausarlo |
| `grupo.cambiarNaturaleza` · `grupo.borrar` | `{id, naturaleza, aplicarAMovimientos}` · `{id, destino?}` | sin destino, lo anotado queda «sin grupo», sin perderse (§9.2) |
| `etiqueta.renombrar` · `etiqueta.borrar` | `{de, a}` · `{id}` | en todos los ficheros, conservando la posición |
| `cuenta.ajustarSaldo` | `{cuenta, fecha, saldo}` | un movimiento «ajuste» por la diferencia, neutro en el mes |

## Cartera (`cartera.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `operacion.crear` · `operacion.editar` · `operacion.borrar` | `{op, mov?}` · `{id, cambios}` · `{id}` | aportación, venta, traspaso, dividendo, comisión y ajuste, enlazados con su movimiento del mes |
| `valores.guardar` | `{fecha, filas}` | la foto de valores de tu cartera de ese día (a mano o con los precios que confirmaste) |
| `objetivo.fijar` | `{pesos, redondeo, umbral}` | pesos objetivo (suman 100 %) |
| `borrador.crear` · `borrador.aceptar` | `{plantilla, fecha}` · `{ruta}` | «Generar cartera base»: borrador desde una plantilla; al aceptarlo crea activos y objetivo |

## Metas y decisiones (`metas.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `meta.crear` · `meta.estado` | `{titulo, campos}` · `{id, estado}` | crear; pausar, reanudar, cumplir (Rex lo celebra) o archivar. Editar y borrar: `bloque.*` |
| `hito.crear` | `{fecha, texto, tipo?, nota?}` | hitos de la línea de tiempo (H-NNNN). Editar y borrar: `lista.*` |
| `decision.crear` · `decision.editar` | `{titulo, fecha, estado?, revisar?, vuelve?, origen?, secciones}` · `{ruta, …}` | diario de decisiones; una pausa de 48 h sin «vuelve» vuelve en 48 h |

## Conocimiento (`conocimiento.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `nota.crear` · `nota.editar` · `nota.mover` | `{fuente, titulo, fecha, campos, cuerpo}` · `{ruta, id, …}` · `{ruta, id, fuente}` | notas propias (no en Mundo ni Datos); editar marca «editada: sí»; mover conserva el id. Borrar: `bloque.borrar` |
| `fuente.crear` · `fuente.borrar` | `{nombre, familia, caducidad?, privada?}` · `{id}` | borrar manda sus notas a la papelera y avisa de las mezclas que la usan |
| `familia.borrar` | `{id, destino}` | sus fuentes pasan a otra familia |
| `mezcla.crear` · `mezcla.limpiar` · `fuentes.activas` | `{nombre, miembros}` · `{id}` · `{ids}` | mezclas (con selectores `@…`); limpiar quita las fuentes borradas (§9.10); tu mezcla por defecto |
| `prediccion.crear` · `prediccion.resolver` · `predicciones.resolverAuto` | `{fuente, texto, medir?, nota?}` · `{id, estado}` · `{}` | predicciones y su resolución, a mano o automática con las series |
| `datos.aplicar` | `{series}` | guarda las filas que propuso el trabajo «datos» y confirmaste: los meses posteriores a tu último, y los anteriores a tu primero solo si vienen marcados `aproximación` (van delante, y su fuente se añade a la de la serie). Nunca completa una serie sintética |
| `base.importar` | `{ficheros}` | copia a `conocimiento/base/` las notas de la Base que aún no tienes |

## Lo que propone Claude (`ia.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `pulso.aplicar` | `{fecha, hora, notas}` | notas de Mundo del día, fusionadas con lo que ya hay (misma URL o título casi igual) |
| `ingesta.aplicar` | `{fuente, fichero, fecha, notas, predicciones}` | notas revisadas de un texto de CONTEXTO, sin pisar lo que editaste a mano |
| `analisis.guardar` | `{fecha, tarea, …, cifras, resultado_md, json, prediccion?}` | el análisis en `analisis/` (privado) y, si hay rango, la predicción de finhub |
| `chat.crear` · `chat.turno` · `chat.renombrar` | `{modo, titulo, fecha}` · `{ruta, tu, rex, cuando, sesion?}` · `{ruta, titulo}` | conversaciones de Rex en `chat/privado/` o `chat/web/` |
| `semana.guardar` · `quiz.responder` · `tuano.rexDice` · `borrador.revisado` | … | resumen semanal, progreso del quiz, «Rex dice» de Tu año y revisión de la cartera base |

## Descubrimientos (`descubrimientos.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `descubrimiento.crear` | `{fecha, origen, d}` | D-NNN desde la salida de «descubrir»: ISIN no válidos fuera con aviso, importes en euros rechazados, predicción `finhub-descubrir` enlazada |
| `descubrimiento.version` | `{id, fecha, d?, cambios?, sinCambios?}` | «¿qué ha cambiado?»: nueva `## vN` arriba; sin novedades, según `descubrir_sin_cambios` |
| `descubrimiento.estado` | `{id, estado}` | nuevo, siguiendo, descartado o archivado. Borrar: `fichero.borrar` |
| `encaje.guardar` | `{fecha, descubrimiento, …}` | solo en `analisis/encajes/` (privado), nunca junto al descubrimiento |
| `precios.seguimiento` | `{precios}` | precio de la referencia de lo que sigues → serie `<isin>` en Datos (una fila por mes) |
| `descubrir.listas` | `{sectores, filtros}` | sectores del mapa de efectos y filtros del panel, en un solo deshacer |

## Primera vez (`inicio.js`)
| Operación | Argumentos | Qué hace |
|---|---|---|
| `inicio.crear` | `{fecha, nombre, mes_inicio_dia, tema, cuentas, grupos, recurrentes, base?}` | de una carpeta vacía a tu carpeta: ajustes, cuentas con saldo, grupos por defecto elegidos, etiquetas, recurrentes y la Base; no se repite sobre una carpeta con datos |

## Acciones del servidor que no son operaciones
Escriben en tu carpeta, pero no son funciones puras sobre los ficheros de datos. También se ven en el indicador de guardado.

| Ruta | Qué hace | Cómo se deshace |
|---|---|---|
| `POST /api/deshacer` | aplica la inversa guardada (si los ficheros no cambiaron después) | — |
| `POST /api/papelera/restaurar` | devuelve lo borrado; si son notas de una fuente borrada, restaura también la fuente (§9.22) | borrarlo otra vez |
| `POST /api/conflicto/resolver` | conflicto de sincronización: tu versión, la otra, fusionar por entidades o «ya lo arreglé a mano» | lo descartado está en la papelera como «copia en conflicto» |
| `POST /api/carpeta/cambiar` | usar, crear, copiar o mover la carpeta (copia verificada por hash) | la antigua se queda, o va a la Papelera de reciclaje si lo confirmas |
| `POST /api/contexto/procesado` | pasa un texto de `CONTEXTO/` a `CONTEXTO/procesados/<fuente>/` | moverlo a mano |

La historia de cómo se decidió cada una está en [DECISIONES.md](DECISIONES.md).
