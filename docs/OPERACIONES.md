# Operaciones (`src/core/ops/`) · propuesta F0

> Cada operación es una **función pura** `(modelo, args) → { modelo, inversa: {op, args}, ficheros: [rutas], avisos: [] }`.
> El servidor comprueba la versión de cada fichero tocado (409 si no coincide), serializa, escribe de forma atómica y guarda la inversa (30 por sesión, deshacer de 10 s).
> **Deshacer (implementado en F2):** la inversa que devuelve el motor es siempre `ficheros.restaurar` con el contenido exacto anterior de cada fichero tocado; el servidor solo la aplica si esos ficheros siguen como los dejó la operación (si no, 409 «cambió después»). Las inversas «semánticas» de las tablas describen el efecto; la restauración exacta lo garantiza byte a byte (propiedad testeada). Ver `docs/DECISIONES.md` F2.
>
> **Implementadas en F11:** `descubrimiento.crear` (D-NNN; vehículos con ISIN no válido se descartan con aviso; la referencia es el primer ISIN válido; un importe en euros en tesis, condiciones o riesgos se rechaza; la predicción va a `predicciones.md` con fuente `finhub-descubrir` y enlace al descubrimiento), `descubrimiento.version` («¿qué ha cambiado?»: nueva `## vN` arriba con `cambios`; sin novedades, según `descubrir_sin_cambios`, versión «sin cambios relevantes» o solo se aplaza `revisar`), `descubrimiento.estado` (nuevo, siguiendo, descartado, archivado; al seguir sin fecha, revisar a 30 días), `encaje.guardar` (solo `analisis/encajes/D-NNN-fecha.md`, privado), `precios.seguimiento` (precio de la referencia de lo que sigues → serie `<isin>` en Datos, una fila por mes, el último precio del mes manda) y `descubrir.listas` (sectores del mapa y filtros, un solo deshacer). Borrar un descubrimiento = `fichero.borrar` (sus versiones van juntas a la papelera; los encajes no se tocan).
>
> **Implementadas en F10:** `pulso.aplicar` (fusión con lo que ya hay: misma URL o título casi igual a ±1 día), `ingesta.aplicar` (notas revisadas con ids de su fuente y predicciones; reingesta sin pisar lo editado), `analisis.guardar` (fichero privado y, si hay rango, la predicción de finhub), `chat.crear | turno | renombrar`, `semana.guardar`, `quiz.responder`, `tuano.rexDice` y `borrador.revisado`. Los precios se guardan con `valores.guardar` y la pausa con `decision.crear`. Todo lo propuesto por Claude se aplica con una de estas operaciones, con deshacer.
>
> **Implementadas en F9:** `datos.aplicar` (guarda las filas que propuso el trabajo «datos» y que tú confirmaste; crea la serie si no existe; nunca completa una serie sintética; solo meses posteriores a los que tienes). Ningún trabajo de Claude escribe en tus datos: el motor devuelve una propuesta y la aplica una operación lanzada por ti.
>
> **Implementadas en F8:** `nota.crear` (no en Mundo ni Datos: los escriben sus trabajos), `nota.editar` (marca «editada: sí»), `nota.mover` (fichero propio en la otra fuente; el id no cambia; si el de origen queda vacío, a la papelera); borrar = `bloque.borrar`. `fuente.crear` (id y prefijo propios; Mis notas siempre privadas), `fuente.borrar` (sus ficheros a la papelera; las fijas no), `familia.borrar` (sus fuentes a otra familia), `mezcla.crear`, `mezcla.limpiar` (quita fuentes borradas; vacía → papelera), `fuentes.activas` (tu mezcla = «activa_por_defecto»), `prediccion.crear | resolver`, `predicciones.resolverAuto` y `base.importar` (solo ids nuevos; las tuyas no se tocan). Editar fuentes, familias, mezclas y predicciones usa `lista.editar`.
>
> **Implementadas en F6:** `meta.crear` (id desde el título), `meta.estado` (pausar, reanudar, cumplir con la fecha de hoy → Rex lo celebra, archivar); editar y borrar una meta son `bloque.editar | borrar`. `hito.crear` (H-NNNN, en orden de fecha); editar y borrar, `lista.editar | borrar`. `decision.crear` (una «pausa de 48 h» sin «vuelve» vuelve en 48 h) y `decision.editar` (título, cabeceras y secciones; vacía = se quita); borrar, `fichero.borrar`.
>
> **Implementadas en F5:** `operacion.crear | editar | borrar` (con enlace op ↔ movimiento), `valores.guardar`, `objetivo.fijar` (pesos, redondeo y umbral), `borrador.crear | aceptar`; descartar un borrador es `fichero.borrar`. Activos y clases usan `bloque.*` y `lista.*`. Cambiar operaciones o valores recalcula la foto de los meses cerrados.
>
> **Implementadas en F4:** `mes.cerrar | reabrir | cambiarInicio`, `rec.editar` (este mes o desde el siguiente), `rec.pausar`, `rec.confirmarTodos`, `grupo.cambiarNaturaleza | borrar`, `etiqueta.renombrar | borrar`, `cuenta.ajustarSaldo` y el recálculo automático de las fotos de los meses cerrados.
>
> **Implementadas en F2:** `mov.crear | editar | borrar`, `rec.confirmar | saltar | desmarcar`, `pres.fijar`, `lista.crear | editar | borrar` (cuentas, grupos, etiquetas, recurrentes, hitos, operaciones, objetivo, clases, valores, plantillas, borradores, familias, fuentes, mezclas, predicciones), `bloque.crear | editar | borrar` (metas, activos, notas, descubrimientos), `ajustes.fijar | quitar`, `fichero.borrar`, `papelera.restaurar` y `ficheros.restaurar`. Las de cierre de mes, cartera, metas, conocimiento… llegan en sus fases, sobre estas mismas piezas.
> **Borrar** = mover a la papelera (§2.5). Su inversa es `papelera.restaurar`.

## Mes (`ops/mes.js`)
| Operación | Args | Inversa |
|---|---|---|
| `mov.crear` | mes, movimiento | `mov.borrarDefinitivo(mes, id)`: sin papelera, porque acaba de nacer |
| `mov.editar` | mes, id, cambios (incl. naturaleza, grupo, mes destino) | `mov.editar(mes, id, valores anteriores)` |
| `mov.mover` | mesOrigen, id, mesDestino | `mov.mover` al revés |
| `mov.borrar` | mes, id | `mov.restaurar(mes, línea, posición)` |
| `mov.ajustarSaldo` | cuenta, fecha, saldo real | `mov.borrarDefinitivo` del ajuste creado |
| `mes.cerrar` | mes, lección | `mes.descerrar(mes, estado y bloque Cierre anteriores)` |
| `mes.reabrir` | mes | `mes.recerrar(mes, bloque Cierre)` |
| `mes.recalcularCierre` | mes (tras editar un mes cerrado) | `mes.restaurarCierre(mes, bloque anterior)` + saldos iniciales siguientes |
| `mes.cambiarInicio` | día nuevo | `mes.cambiarInicio(día anterior)` + reparto inverso (operación compuesta, §9.3) |
| `pres.fijar` | grupo, importe, (mes \| plantilla) | `pres.fijar` con el valor anterior o `pres.quitar` |
| `rec.crear` / `rec.editar` | recurrente, `aplicar: esteMes \| siguiente` | `rec.borrarDefinitivo` / `rec.editar` anterior (y el movimiento de este mes, si se tocó) |
| `rec.pausar` / `rec.reanudar` | id | la contraria |
| `rec.confirmar` | mes, id, importe? | `mov.borrarDefinitivo` + quitar la marca `confirmado` |
| `rec.saltar` | mes, id | quitar la marca `saltado` |
| `rec.borrar` | id | `papelera.restaurar` |

## Catálogos (`ops/catalogos.js`)
| Operación | Inversa |
|---|---|
| `cuenta.crear` / `cuenta.editar` / `cuenta.renombrar` | borrarDefinitivo / editar anterior / renombrar anterior |
| `cuenta.archivar` (si tiene movimientos no se borra) | `cuenta.desarchivar` |
| `grupo.crear` / `grupo.renombrar` | borrarDefinitivo / renombrar anterior |
| `grupo.cambiarNaturaleza(id, nat, aplicarAMovimientos)` | restaura la naturaleza y, si se aplicó, la de cada movimiento tocado (lista guardada en la inversa) |
| `grupo.borrar(id, destino?)` | restaura el grupo y reasigna los movimientos movidos |
| `etiqueta.renombrar(de, a)` | `etiqueta.renombrar(a, de)` sobre los mismos movimientos |
| `etiqueta.borrar` | restaura la etiqueta en los movimientos que la tenían |

## Cartera (`ops/cartera.js`)
| Operación | Inversa |
|---|---|
| `activo.crear` / `activo.editar` / `activo.borrar` | borrarDefinitivo / editar anterior / papelera.restaurar |
| `operacion.crear` / `operacion.editar` / `operacion.borrar` | ídem (TWR, TIR, coste y plusvalía se recalculan, no se guardan) |
| `valores.guardar(fecha, filas)` | `valores.restaurar(fecha, filas anteriores \| ninguna)` |
| `objetivo.fijar(pesos)` | `objetivo.fijar(anteriores)` |
| `clase.crear` / `clase.editar` / `clase.borrar` | ídem |
| `plantilla.editar` / `plantilla.restaurarDefecto` | restaurar el contenido anterior |
| `borrador.crear` / `borrador.editar` / `borrador.descartar` | borrarDefinitivo / editar anterior / papelera.restaurar |
| `borrador.aceptar` (crea activos y objetivo) | restaura `activos.md` y `objetivo.md` anteriores y el estado del borrador |
| `precios.confirmar(propuesta)` | = `valores.guardar`; la propuesta de Claude no es una operación hasta que la confirmas |

## Metas y decisiones (`ops/metas.js`)
`meta.crear | editar | pausar | reanudar | cumplir | archivar | borrar`, `hito.crear | editar | borrar`, `decision.crear | editar | cambiarEstado | borrar`, `pausa.crear` (= `decision.crear` con `estado: pausa-48h`): cada una con su contraria o con la restauración de los valores anteriores.

## Conocimiento (`ops/conocimiento.js`)
| Operación | Inversa |
|---|---|
| `nota.crear` / `nota.editar` (marca `editada: sí`) | borrarDefinitivo / editar anterior, **incluida la marca** |
| `nota.mover(id, fuenteDestino)` | `nota.mover` de vuelta |
| `nota.borrar` | papelera.restaurar |
| `fuente.crear` / `renombrar` / `cambiarFamilia` / `caducidad` | la contraria |
| `fuente.borrar` (notas a la papelera; las mezclas se limpian, §9.10) | restaura la fuente, sus notas y las mezclas |
| `familia.*`, `mezcla.crear` / `editar` / `borrar` | ídem |
| `prediccion.crear` / `editar` / `resolver` / `reabrir` | ídem |
| `ingesta.aceptar(notas propuestas)` | borrarDefinitivo de las notas creadas |
| `pulso.fusionar(fecha, notas)` (dedup §4.7) | quitar exactamente las notas añadidas |
| `descubrimiento.crear` / `nuevaVersion` / `cambiarEstado` / `borrar` | borrarDefinitivo / quitar la versión / estado anterior / papelera.restaurar |
| `base.importarSemilla(notas nuevas)` | borrarDefinitivo de las importadas |

**Regla R1 en ops (test):** las operaciones que nacen de una salida de los trabajos `privado` o `encaje` **no pueden escribir en `conocimiento/`**. `encaje.guardar` solo escribe en `analisis/encajes/`.

## Rex, roles, tareas y ajustes (`ops/rex.js`, `ops/ajustes.js`)
| Operación | Inversa |
|---|---|
| `conversacion.crear` / `renombrar` / `borrar` | ídem |
| `conversacion.añadirTurno` | sin deshacer: es un registro; se puede borrar la conversación |
| `quiz.registrar` | sin deshacer |
| `rol.editar` / `tarea.editar` / `restaurarDefecto` | restaurar el contenido anterior |
| `ajustes.fijar(clave, valor)` | `ajustes.fijar(clave, anterior)` |

## Sistema (`ops/sistema.js`)
| Operación | Inversa |
|---|---|
| `papelera.enviar` (la usan los `*.borrar`) | `papelera.restaurar` |
| `papelera.restaurar(id)` (si falta el padre: lo restaura o pregunta, §9.22) | `papelera.enviar` |
| `papelera.purgar` (> 30 días, avisando antes) | **sin inversa** (único borrado real, con confirmación) |
| `conflicto.resolver(fichero, quedarse A \| B \| fusionar \| manual)` | restaura la versión descartada desde la papelera |
| `esquema.migrar(fichero, de, a)` (con copia previa) | restaurar desde la copia |

**No son operaciones** (no tienen deshacer, sino su propio flujo con confirmación): cambiar de carpeta (mover, copiar o usar), tomar el control del candado y purgar la papelera.
