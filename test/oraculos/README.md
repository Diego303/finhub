# Oráculos independientes de los cálculos

Implementación aparte de los cálculos financieros, escrita **solo** desde `docs/PLAN.md` (manda) y `docs/FORMATOS.md`, sin leer `src/`, `web/`, `test/core/`, `test/propiedades/`, `scripts/` ni `docs/OPERACIONES.md`. Sirve para compararla con `src/core`.

- `oraculos.js`: funciones puras, sin imports.
- `dorados.test.js`: casos calculados a mano, con el razonamiento en un comentario.
- Se ejecuta desde la raíz del repo: `node scripts/test.js test/oraculos`.

**Cómo leer una discrepancia:** un dorado marcado `LECTURA` depende de una duda de la lista de abajo. Si la implementación real difiere ahí, hay que decidir qué lectura vale; no es por fuerza un fallo. Los demás dorados salen directamente del plan.

## Convenciones

| Qué | Cómo |
|---|---|
| Importes | céntimos enteros |
| Porcentajes de entrada | puntos básicos (19 % = 1900) |
| Participaciones | entero ×10⁶ (FORMATOS, tipo `cantidad`) |
| Rentabilidades, pesos y tasas calculadas | fracción en float (10 % = 0,10); comparar con tolerancia |
| Fechas | texto `AAAA-MM-DD`; meses `AAAA-MM`; aritmética con `Date.UTC`, sin zona horaria |
| No concluyente | `{ estado: 'no concluyente', motivo }` (constante `NO_CONCLUYENTE`) |
| Redondeo | mitad al par: exacto por BigInt con enteros, float en simulaciones |
| Signos de movimientos | los del fichero: gasto negativo, ingreso positivo |

**Tolerancias recomendadas:** XIRR ±1e-6 (el plan fija 1e-7 y cada lado puede errar eso); otras fracciones ±1e-9; importes de simulaciones con tasa ≠ 0, ±1 céntimo.

## Interfaz

### Redondeo y fechas (§2.1 `dinero`/`fechas`, §4.1, §9.21; FORMATOS §1.1, `ajustes`, `recurrentes`)

| Función | Entrada | Salida |
|---|---|---|
| `dividirMitadPar(num, den)` | enteros | entero |
| `redondearMitadPar(x)` | float | entero, nunca `-0` |
| `esBisiesto(a)`, `diasDelMes(a, m)`, `fechaValida(f)` | | bool, entero, bool |
| `diasEntre(a, b)` | fechas | `b − a` en días |
| `sumarDias(f, n)`, `sumarMeses(f, n)` | | fecha; `sumarMeses` usa el último día si el suyo no existe |
| `mesSiguiente(m)`, `mesAnterior(m)` | mes | mes |
| `normalizarMesInicioDia(v)` | valor leído | `{ dia, aviso }`; fuera de 1–28 da `{ dia: 1, aviso: true }` |
| `periodoDeMes(mes, inicio=1)` | mes que **termina** | `{ desde, hasta }`; `RangeError` fuera de 1–28 |
| `mesDeFecha(fecha, inicio=1)` | | mes del fichero; `RangeError` fuera de 1–28 |
| `fechaCobroMensual(mes, dia)` | | fecha, con el último día si no existe |
| `fechaCobroAnual(ano, 'DD-MM')` | | fecha, o `null` si es imposible |

### Mes (§4.1)

| Función | Entrada | Salida |
|---|---|---|
| `resumenMes(movimientos, grupos)` | `[{ importe, grupo?, naturaleza?, compensa?, ajuste? }]`, `{ id: { naturaleza } }` | `{ entradas, consumo, consumoPorGrupo, compensaciones, invertido, ahorrado, traspasos, ajustes, sinGrupo, queda, tasaAhorro, tasaAhorroPb }`; las dos tasas son `'no concluyente'` si las entradas son 0 |
| `presupuestoEfectivo(delGrupo, delMes)` | | céntimos o `null` |
| `colorPresupuesto(consumo, presupuesto)` | | `'verde' \| 'ambar' \| 'rojo' \| null` |
| `mediaUltimos6Cerrados(meses, mesReferencia)` | `[{ mes, estado, consumoPorGrupo }]` | `{ mesesUsados, porGrupo, total }`; `total: null` si no hay cerrados |

### Saldos y patrimonio (§4.2)

| Función | Entrada | Salida |
|---|---|---|
| `saldoCuenta(id, saldoInicial, movimientos)` | `[{ importe, cuenta?, a? }]` | céntimos |
| `importeAjusteSaldo(saldoActual, saldoReal)` | | importe del movimiento `ajuste` |
| `patrimonioNeto(cuentas, activos=[])` | `[{ id, tipo, saldo }]`, `[{ id, valor\|null, aportadoNeto }]` | `{ patrimonio, enCuentas, valorCartera, activosSinValorar }` |
| `colchonMeses(saldoColchon, consumoMedio)` | | `{ estado: 'ok', meses }` o no concluyente |

### Cartera (§4.3, §3.2, §9.5, §9.6)

| Función | Entrada | Salida |
|---|---|---|
| `TRAMOS_PLAN` | | `[{ desde, hasta\|null, pb }]` en céntimos |
| `impuestoEstimado(plusvalia, tramos?)` | céntimos | céntimos; 0 si no es positiva |
| `resumenCartera({ operaciones, fotos, tramos? })` | `[{ fecha, tipo, activo, destino?, importe, participaciones? }]`, `[{ fecha, valores: { activo: céntimos } }]` | `{ porActivo: { id: { aportadoNeto, coste, costeAproximado, sinValorar, faltanValores, valor, plusvalia, avisos } }, valor, aportadoNeto, plusvalia, impuesto }` |
| `flujosParaXirr(operaciones, fechaFinal, valorFinal)` | | `[{ fecha, importe }]`, signo del inversor |

Avisos posibles en `porActivo[id].avisos`: `venta-mayor-que-lo-aportado`, `operacion-antes-de-la-primera-foto`, `valor-negativo-a-cero`.

### Rentabilidad (§4.3, §9.7, §11)

| Función | Entrada | Salida |
|---|---|---|
| `twrDietz(fotos, flujos=[])` | `[{ fecha, valor }]`, `[{ fecha, importe }]` (+ entra en cartera) | `{ estado, twr, twrAnualizado, aprox, periodos, avisos }` |
| `xirr(flujos, { tolerancia=1e-7 })` | `[{ fecha, importe }]`, signo del inversor | `{ estado: 'ok', tasa, metodo: 'newton' \| 'biseccion' }` o no concluyente con `motivo` |
| `comparativaMismasAportaciones(flujos, serie)` | `[{ fecha, importe }]` (+ compra), `{ mes: nivel }` | `{ estado, unidades, valorFinal }`, o `faltan` con los meses sin datos |
| `mezclarSeries(pesos, series)` | `{ clave: pb }`, `{ clave: { mes: nivel } }` | `{ meses, niveles }`, base 100 |
| `indicePropio({ objetivo, activos, clases, series })` | ver el comentario en el código | `{ estado, pesos, meses, niveles }` |

`unidades` va en céntimos/nivel, porque los flujos están en céntimos. El método (`newton` o `biseccion`) es propio del oráculo: no hay que compararlo.

### Reparto (§4.3; FORMATOS, `objetivo.md`)

| Función | Entrada | Salida |
|---|---|---|
| `repartoAportacion({ aportacion, activos, redondeo=1000 })` | `[{ id, valor, objetivoPb, minimo? }]` | `{ estado: 'ok', reparto, deficits, avisos }` o `{ estado: 'no calcula', motivo }` |
| `comprobarReparto(reparto, entrada)` | `reparto` de **cualquier** implementación | lista de violaciones: suma, negativos, bajo mínimo, más de un importe no múltiplo |

### Proyección y libertad (§4.4, §2.1 `prng`, §9.9)

| Función | Entrada | Salida |
|---|---|---|
| `mulberry32(semilla)` | | función que da floats en [0, 1) |
| `percentil(ordenados, p)` | lista ordenada, 0–100 | float, tipo 7 |
| `parsearProyeccionManual(texto)` | `'rv 5,5 · 14 \| …'` | `{ rv: { realPb, volPb } }` |
| `proyeccion({ modo, rentMensuales, ipcMensual, pesos, supuestos, valorInicial, aportacionMensual, anos, real, semilla, caminos=2000 })` | | `{ estado, anos, p10, p50, p90, avisos }`, por año, en céntimos |
| `comprobarProyeccion(salida, { anos })` | salida de **cualquier** implementación | lista de violaciones |
| `libertadFinanciera({ consumo12m, multiplicador=25, p50PorAno })` | | `{ objetivo, ano, texto }`; `texto` es `'más de N años'` si no lo alcanza |

**La proyección no se compara por valor exacto.** El plan fija el generador (mulberry32), 2.000 caminos y «semilla fija», pero no el valor de la semilla, ni cómo se elige el bloque, ni cuándo entra la aportación. Por eso los valores con azar solo son comparables por propiedades:

- `comprobarProyeccion`: p10 ≤ p50 ≤ p90 y longitud igual a los años;
- misma semilla, mismo resultado;
- valor 0 y aportación 0 dan siempre 0.

Hay casos sin azar que **cualquier** implementación correcta debe clavar:

- rentabilidad 0: valor inicial + aportación × 12 × año (con cualquier semilla y momento de aportar);
- serie plana sin aportación: `V × (1+r)^(12·año)`;
- rentabilidad = IPC en real: el valor no cambia.

### Escenarios y crisis (§4.5; FORMATOS, `crisis_periodos`, `clases.md`)

| Función | Entrada | Salida |
|---|---|---|
| `rentabilidadesMoviles12m(niveles)` | niveles consecutivos | lista de fracciones |
| `rangos12m(niveles)` | | `{ estado, pesimista, base, optimista, peor, n }`; cada rango es `[bajo, alto]` |
| `pruebaCrisis({ pesos, series, desde, hasta, valorInicial, aportacionMensual=0, parecida={} })` | | `{ estado, caidaMaxima, valorEnMinimo, mesMinimo, recuperacionSinAportar, recuperacionAportando, aproximaciones }`; cada recuperación es `{ desdeInicio, desdeMinimo }`, con `null` si no recupera en los datos |

### Herramientas (§4.6)

| Función | Entrada | Salida |
|---|---|---|
| `ipcPersonal({ consumo12mPorGrupo, mapaIpc, tasasPb, generalPb })` | | `{ estado, personalPb, diferenciaPb, sinMapear }` (pb en float) |
| `costeOportunidad({ importe, periodicidad, rPb, anos, consumoAnual })` | `'puntual' \| 'mensual'` | `{ valorFuturo, diasLibertad\|null }` |
| `comparadorFondos({ inicial, mensual, anos, brutaPb, fondos })` | `[{ id, terPb, brutaPb? }]` | `{ finales, curvas, diferenciaFinal }`; curva mensual |
| `escenarioVida(base, modificadores)` | `{ ingresosMensuales, consumoMensual, aportacionMensual, multiplicador?, meta?: { faltan } }`, `[{ tipo, … }]` | `{ ingresos, consumo, aportacion, tasaAhorro, libertadObjetivo, metaMeses }` |
| `interesCompuesto({ inicial, mensual, rPb, anos })` | | `{ valorFinal, aportado, intereses }` |
| `cuotaMeta({ objetivo, actual, rPb, meses })` | | céntimos o `null` |
| `alquilarOComprar({ precio, entrada, impuestosPb, ibiAnual, comunidadAnual, mantenimientoAnual, revalorizacionPb, tipoPb, anos, rentabilidadPb, alquilerMensual, subidaAlquilerPb })` | | `{ comprar, alquilar, diferencia, cuotaMensual }` |
| `radarSuscripciones(recurrentes, { rPb, anos })` | `[{ id, importe, cada, etiquetas, uso, pausado? }]` | `{ lista, costeAnualTotal, ahorroAnual, costeOportunidadAhorro }` |

### Metas (§4.4)

| Función | Entrada | Salida |
|---|---|---|
| `sumaGrupoMeta(movimientos, grupo)` | | céntimos |
| `progresoMeta(meta, datos)` | `{ objetivo, origen }`, `{ saldos, sumasGrupo }` | `{ actual, faltan, progreso, progresoPb, encuadre, importeEncuadre }` |
| `aportacionMedia3m(aportesPorMes)` | céntimos, de antiguo a reciente | céntimos |
| `fechaEstimadaMeta({ faltan, aportacion, hoy })` | | `{ estado, meses, fecha }` |

### Conocimiento (§4.7, §6, §9.12; FORMATOS, `_mezclas.md`)

| Función | Entrada | Salida |
|---|---|---|
| `tokensTitulo(titulo)` | | `Set` de palabras normalizadas |
| `jaccardTitulos(a, b)` | | `{ interseccion, union }`, enteros |
| `esDuplicado(a, b)` | `{ url?, titulo, fecha }` | bool |
| `posturaFuente(notas, hoy)` | `[{ fecha, postura }]` | float en [−1, 1] o `null` |
| `aciertoFuente(predicciones)` | `[{ estado }]` | `{ texto: '—'\|null, pct, resueltas }` |
| `parsearSelector(texto)` | | `{ valido, campo, op, valor }` |
| `cumpleSelector(selector, fuente)` | `{ id, familia, postura, acierto }` | bool |
| `resolverMezcla(elementos, fuentes)` | ids y selectores | `{ ids, avisos }` |

### Descubrimientos (§4.9)

| Función | Entrada | Salida |
|---|---|---|
| `celdaMapaEfectos(posturas)` | `['▲', '▼', '•', …]` | `'▲' \| '▼' \| '•'` |
| `simularDescubrimiento({ activos, xPb, modo, activoOrigen, aportacion, descubrimiento, crisis })` | `modo`: `'todo' \| 'activo' \| 'aportaciones'` | `{ estado, pesos, pesoDescubrimiento, pesosClase, terMedioPb, exposicion, caidas, siLoHubieras, avisos }` |

## Dudas

Cada una es una ambigüedad del plan con la lectura elegida. **Prioridad** indica la probabilidad de que la implementación real difiera con un efecto visible en las cifras.

### Prioridad alta

1. **TWR acumulado o anualizado.** §4.3 no lo dice, pero §11 exige «TWR = TIR si no hay flujos», y la TIR es anual. Devuelvo los dos: `twr` y `twrAnualizado` (`(1+twr)^(365/días)−1`). La propiedad se comprueba con el anualizado; a 365 días exactos coinciden.
2. **Base de días de la TIR.** El plan no la fija. Uso ACT/365.
3. **Mínimo por fondo (§4.3, paso 5).** «Respeta un mínimo» no dice qué pasa si no se llega. Lectura: una asignación entre 0 y el mínimo pasa a 0 y su importe va al de mayor déficit; un activo sin asignación no se fuerza a comprar. La lectura contraria (subirlo al mínimo) es igual de defendible: para compararlas, usa `comprobarReparto`, que acepta las dos.
4. **«Redondea a 10 €» (paso 4).** Uso mitad al par, por lo que la suma puede pasarse (15/15/70 sobre 100 da 20+20+70). El resto es entonces negativo y se quita del de mayor déficit y, si no basta, del siguiente. Un redondeo hacia abajo daría otras cifras en esos casos. En un empate de mayor déficit gana el primero de la lista.
5. **Reparto «si todo está en objetivo» (paso 6).** Con objetivos que suman 100 y A > 0, la suma de déficits es ≥ A > 0, así que el paso no se alcanza; y en objetivo exacto, repartir por déficit ya es repartir por pesos. Solo se usaría con A = 0, que da todo 0.
6. **Venta sin participaciones (§4.3).** «Reembolsos a coste» no se puede calcular sin participaciones. Lectura: reduce el aportado en el importe de la venta, con suelo en 0 y aviso si lo supera (§9.6). Otra opción sería reducirlo en proporción a valor vendido ÷ valor total.
7. **FIFO mezclado.** FIFO solo si **todas** las aportaciones, ventas y traspasos de salida del activo llevan participaciones y no ha recibido traspasos. Si no, coste aproximado (`costeAproximado: true`). Un traspaso de entrada lo desactiva porque la línea de operación solo lleva un número de participaciones: no se sabe cuántas entran en destino.
8. **Traspaso sin participaciones.** Se mueve `min(importe, aportado del origen)` como coste. El total no cambia, que es lo único que fija el plan. El reparto entre activos es lectura.
9. **Impuesto: sobre qué plusvalía.** «Plusvalía positiva» se aplica a la plusvalía **total** de la cartera, compensando entre activos, y no a la suma de las positivas. El redondeo se hace al final, no por tramo.
10. **Dividendos, comisiones y `ajuste` de cartera.** El plan no define sus flujos. Lectura: no tocan el aportado ni el valor. En la TIR, el dividendo es + y la comisión lleva su signo. `flujosParaXirr` ignora `ajuste` y `traspaso`. La operación `ajuste` no está definida en el plan.
11. **Tasa mensual desde una anual** (oportunidad, comparador, calculadoras, proyección manual). El plan no elige. Uso la equivalente, `(1+r)^(1/12)−1`, y aportación a final de mes. Con `r/12` o aportación a principio de mes salen cifras distintas. Los dorados con r = 0 o sin renta mensual no dependen de esto; los que sí llevan `LECTURA`. En el comparador, la neta anual es `bruta − TER`, y se pasa a mensual después. La cuota de la hipoteca de alquilar o comprar sí usa `tipo/12`, por ser la convención de los préstamos.
12. **Compensación mayor que el gasto.** Sin suelo: el grupo queda en negativo y resta del total, que es la lectura literal de «Σ consumo − Σ compensaciones».
13. **Encuadre justo en el 50 %.** El plan dice «por debajo» y «por encima». Elijo «te faltan» en el 50 % exacto.
14. **Prueba de crisis.**
    - La caída se mide con el pico móvil, hasta `hasta` (no sobre la historia posterior).
    - «Meses para recuperar» devuelve las dos medidas: desde el inicio y desde el mínimo.
    - Recuperar es volver al **valor inicial**, también aportando; la otra opción sería compararlo con lo invertido.
    - Rebalanceo mensual.
    - Una clase sin parecida con datos da no concluyente, porque el plan solo contempla aproximar. La cadena de `parecida` se sigue varios saltos.
15. **«Pocas fotos» para `aprox.`** No hay umbral en el plan. El oráculo marca `aprox.` con menos de 3 fotos. **Solo compares los extremos:** 1–2 fotos deberían ir marcadas y 13 mensuales no. El tramo intermedio es decisión de implementación.

### Prioridad media

16. **`mes_inicio_dia` 29–31.** FORMATOS lo declara imposible: se usa el defecto (1) y se avisa. Por eso `normalizarMesInicioDia` lo hace y `periodoDeMes` y `mesDeFecha` lanzan `RangeError`. Los días 29–31 se prueban como **fechas** dentro de un mes financiero y en recurrentes. Si `src/core` admite 29–31 en sus funciones puras, no es una discrepancia por sí misma.
17. **Deuda.** «Resta» se lee como −|saldo|, de modo que una deuda anotada en negativo no sume al patrimonio. La lectura literal (restar el saldo) daría lo contrario en ese caso.
18. **Movimiento con `compensa` en un grupo de ingreso.** `compensa` manda: nunca es una entrada («una devolución no es un ingreso»).
19. **Entradas negativas.** El plan solo cubre entradas 0. Con entradas negativas la tasa se calcula tal cual, aunque no tenga mucho sentido.
20. **«Sin grupo» y grupo borrado.** Sin naturaleza no suman a ningún total, pero se devuelven en `sinGrupo`. Por eso `queda` no los descuenta.
21. **Campo `cuenta:` del grupo** (`colchon | … | cuenta: remunerada`). Su efecto no está definido en §4.2. Lectura: **no** se aplica; solo cuenta `cuenta:` o `a:` del movimiento. Tampoco hay cuenta por defecto: el Bizum del ejemplo no lleva cuenta y no mueve ningún saldo. Si la implementación usa la del grupo, los saldos pueden diferir.
22. **`a:` con importe positivo.** Se mantiene la simetría: `cuenta` suma el importe y `a` lo resta (conservación de céntimos). No se toma el valor absoluto.
23. **Fecha de `saldo_inicial`.** §4.2 suma todos los movimientos; los anteriores a `@fecha` también cuentan.
24. **Cuentas archivadas.** Suman, si tienen saldo.
25. **Valor en la cartera.** Operación del **mismo día** que la foto: se considera ya dentro («posterior» es estricto). Las fotos se miran por activo: un activo ausente de la última foto usa la anterior. Si los flujos posteriores dejan el valor negativo, se pone a 0 con aviso. Una foto con valor 0 cuenta como valorado.
26. **Flujos en TWR.** Periodo (t0, t1]. Un flujo el mismo día que la foto final pesa 0 y uno anterior a la primera foto se ignora con aviso. Capital medio ≤ 0: no concluyente para toda la serie.
27. **Comparativa.** Se usa el mes **natural** del flujo, porque las series son mensuales naturales, aunque el mes financiero sea otro. Un flujo sin cierre da no concluyente; §9.8 permite interpolar o excluir, así que una implementación que interpole no estaría mal.
28. **Índice propio.** Rebalanceo mensual; el plan no aclara si es rebalanceado o comprar y mantener. Se usa el índice de la clase (`clases.md`), no el campo `indice` del activo. Solo los meses comunes.
29. **Percentiles.** El plan no da el método. Uso interpolación lineal (tipo 7) en proyección y escenarios. Con pocos datos otros métodos dan otros valores.
30. **Proyección con datos.** Bloque de 12 meses consecutivos con inicio uniforme y sin dar la vuelta a la serie; aportación a final de mes; aportación constante también en real; el IPC se descuenta mes a mes con el mismo índice del bloque.
31. **Proyección manual.**
    - Sin correlación entre clases: `σ² = Σ(w·σᵢ)²`.
    - Mensual: `σ/√12`.
    - Los supuestos son **reales**, y el plan no da una inflación manual, así que `real: false` da lo mismo que real, con el aviso `supuestos-manuales-reales`.
32. **Libertad.** «Supera» es estricto: igualar el objetivo no basta. Sin año 0: el primer valor corresponde al final del año 1.
33. **Escenarios de vida.** El plan solo nombra modificadores y efectos. Lecturas:
    - aportación = aportación + Δingresos − Δgasto, con suelo 0;
    - la tasa se mide a 12 meses con la pausa descontada;
    - el gasto puntual aumenta lo que falta para la meta;
    - la pausa suma sus meses a la fecha de la meta;
    - en libertad solo se calcula el **objetivo**, porque el año requeriría una proyección.
34. **Alquilar o comprar.** El plan solo enumera los supuestos, no el método. **Baja confianza fuera de r = 0.** Método: dos carteras con el mismo dinero; quien paga menos cada mes invierte la diferencia; compara el patrimonio final. Plazo de la hipoteca = años. El alquiler y su subida no están en la lista del plan, pero hacen falta.
35. **Coste de oportunidad del radar.** Como renta mensual de `ahorro/12`.
36. **Radar y pausadas.** Las pausadas se listan, pero no suman al total ni al ahorro. La etiqueta se compara exacta (`suscripción`, con tilde).
37. **Metas.**
    - Grupo: valor absoluto de la suma de todos sus movimientos («Σ del grupo», sin periodo).
    - Fecha: techo de los meses, misma fecha del mes con ajuste al último día.
    - `media3m`: últimas 3 entradas entre 3, también si hay menos.
38. **Recurrente anual el 29-02.** En año no bisiesto se cobra el 28-02. FORMATOS solo prohíbe fechas imposibles como `31-02`. Con mes financiero, el plan no dice en qué mes cae un recurrente: se calcula en mes natural.

### Prioridad baja

39. **Dedup.** «Misma URL» no mira fechas: el «±1 día» se aplica solo a los títulos. La URL se compara exacta. «Normalizados» = minúsculas, sin tildes ni puntuación, palabras separadas, **sin** quitar palabras vacías, como conjunto.
40. **Postura.** `neutral` cuenta como 0; una nota sin postura no cuenta. Las fechas futuras tienen edad 0. Las notas caducadas no se excluyen.
41. **Acierto.** `no-medible` no cuenta como resuelta.
42. **Selectores.** `postura` y `acierto` con dato ausente no cumplen nunca, tampoco con `!=`. `familia` solo admite `=` y `!=`.
43. **Mezcla.** Sin orden definido; se devuelve en orden de aparición.
44. **Mapa de efectos.** Una celda sin notas da `•` («en otro caso»); la interfaz quizá la pinte vacía.
45. **Simulador.**
    - `aportaciones`: X % de la aportación va al descubrimiento, y el resto según los pesos actuales. La otra lectura sería alcanzar X % del total.
    - `activo`: si X supera su peso, se limita a ese peso con aviso.
    - Fuera de 0–50: `'fuera de rango'`.
    - «Si lo hubieras tenido» es la suma ponderada de rentabilidades a 12 meses, sin simular el rebalanceo.
    - Los activos sin exposición declarada no suman, por lo que la exposición puede no llegar a 100.

## Límites del propio oráculo

- `xirr` cuenta raíces con una rejilla en log(1+r) para r entre −1 + 1e-9 y 1e30 (paso del 0,45 %): dos raíces más juntas que eso cuentan como «sin solución», y una tasa mayor que 1e30 también.
- **A ±1 céntimo de un tramo, el impuesto casi no discrimina:** 0,21 c y 0,19 c redondean igual. Los dorados de ±100 c son los que delatan un límite desplazado.
- Mulberry32 se comprueba por determinismo y rango, sin vector de referencia externo.

## Omitido

**Por no estar definido en el plan:**

- **Efecto de la crisis en metas (§4.5):** se nombra, sin decir cómo se calcula.

**Fuera de la lista pedida, aunque esté en el plan:** exposición estimada como función propia (solo dentro del simulador), clases frente a objetivo, calibración de finhub, caducidad de notas, rendimiento desde el descubrimiento, resumen al abrir, Pendientes y Tu año.
