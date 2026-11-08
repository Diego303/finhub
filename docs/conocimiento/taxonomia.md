# Taxonomía de temas de la semilla

Lista cerrada aprobada en P0 (maestro §5). El validador (`scripts/conocimiento/config.mjs`) rechaza cualquier otro tema. Un tema nuevo se propone al usuario y no se usa hasta que lo apruebe; si se aprueba, se añade aquí y en `config.mjs` a la vez.

- Entre 1 y 6 temas por nota, sin repetir.
- `activos` va vacío en toda la semilla: en la app son los ids de los activos del usuario.
- Los 175 temas libres de la Base actual (como `2008` o `sp500`) se reetiquetan a esta lista en la auditoría (P2), sin cambiar ids.

| Grupo | Temas |
|---|---|
| Conceptos | `conceptos`, `interes-compuesto`, `inflacion`, `riesgo`, `volatilidad`, `rentabilidad`, `diversificacion`, `correlacion`, `costes`, `liquidez` |
| Indexación | `indices`, `indexacion`, `fondos`, `etf`, `replica`, `rebalanceo`, `concentracion`, `factores`, `divisas`, `dividendos` |
| Renta fija y ahorro | `renta-fija`, `deuda-publica`, `tesoro`, `credito`, `depositos`, `monetarios`, `cuentas` |
| Fiscalidad | `fiscalidad`, `irpf`, `base-ahorro`, `traspasos`, `planes-pensiones`, `patrimonio`, `sucesiones-donaciones`, `itp-ajd`, `modelos-informativos` |
| Pensiones y retirada | `pensiones-publicas`, `jubilacion`, `retirada` |
| Vivienda y deuda | `vivienda`, `hipotecas`, `euribor`, `alquiler`, `deuda` |
| Protección | `seguros`, `colchon`, `fgd`, `desempleo`, `proteccion-inversor`, `cripto`, `productos-complejos`, `reclamaciones` |
| Mercados y macro | `mercados`, `bolsa`, `bonos`, `bancos-centrales`, `tipos`, `bce`, `fed`, `empleo`, `pib`, `curva-tipos`, `materias-primas`, `petroleo`, `oro`, `emergentes`, `china`, `geopolitica`, `empresas`, `europa-espana`, `tecnologia`, `energia-materias-primas` |
| Historia y comportamiento | `crisis`, `historia`, `valoracion`, `comportamiento`, `sesgos`, `market-timing`, `glosario` |
| Nuevos | `historia-anual`, `resumen-mensual`, `resumen-anual`, `retrospectivo` |

## Usos fijos

- **Pulsos de la app:** `mercados`, `bancos-centrales`, `europa-espana`, `tecnologia` y `energia-materias-primas` son los 5 temas del pulso. En Mundo se usan para que la semilla encaje con los pulsos del usuario.
- **Mundo retrospectivo:** toda nota `MR-` lleva `retrospectivo`. Los resúmenes llevan además `resumen-mensual` (fecha: último día del mes) o `resumen-anual` (fecha: 31 de diciembre).
- **Historia anual de la Base** (`historia.md`, ids `B-4AANN`): lleva `historia-anual`.
- **Normativa:** una nota con algún tema del grupo Fiscalidad, o con `pensiones-publicas`, es normativa. Lleva `verificar: AAAA`, `caduca: AAAA-12-31` y la norma `BOE-A-…`. El validador también la trata como normativa si su texto cita una ley, un real decreto, una orden, un reglamento o una directiva con número.

## Sectores del mapa de efectos (`efectos:` en Mundo)

`bancos`, `utilities-e-infraestructura`, `tecnologia`, `inmobiliario`, `consumo-basico`, `energia`, `renta-fija-euro`. Solo cuando la noticia afecta clara y directamente al sector según las fuentes del momento. Ante la duda, `•` o nada.
