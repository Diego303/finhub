# Manifiesto de Datos · series para calcular

Este fichero dice **qué series** usa finhub, **de qué fuente gratuita** salen y **con qué método** se construyen.
Los **valores no se versionan** en el repo (licencias de los índices): el trabajo `datos` los crea en tu máquina,
con tu luz verde, en `conocimiento/datos/series/<id>.md` (formato en `docs/FORMATOS.md`). En `ejemplo/` y en los
tests las series son **sintéticas**, generadas con semilla.

## Reglas comunes
- Frecuencia **mensual**: el último dato de cada mes (`AAAA-MM`).
- Índices en **euros y con dividendos** (net return o un ETF de acumulación como proxy).
- Cada serie lleva `fuente` (con URL), `metodo`, `actualizado` y `sintetica: no`.
- Validación al guardar: sin meses duplicados, sin meses inexistentes y sin saltos mayores del 40 % en un mes
  sin `| nota: …`. Los huecos se interpolan al calcular y se marcan.
- **Más historia (2000–2009):** si el proxy no llega, índice de precio más un ajuste por dividendos documentado en
  `metodo`, con cada fila marcada `| aproximación`.
- Los ISIN de los proxies son orientativos: el trabajo `datos` debe **verificarlos** (nombre, clase de
  acumulación, divisa) antes de descargar nada.

## Series

| id | qué es | unidad | proxy (fuente gratuita) | método |
|---|---|---|---|---|
| `msci-world-nr-eur` | MSCI World, net return, en € | indice | ETF UCITS de acumulación sobre el MSCI World (p. ej. iShares Core MSCI World, IE00B4L5Y983) · histórico del valor liquidativo en la web de la gestora | cierre mensual del valor liquidativo en EUR, base 100 en el primer mes |
| `msci-acwi-nr-eur` | MSCI ACWI (desarrollados + emergentes), en € | indice | ETF UCITS de acumulación sobre el MSCI ACWI (p. ej. iShares MSCI ACWI, IE00B6R52259) | ídem |
| `sp500-eur` | S&P 500, en € y con dividendos | indice | ETF UCITS de acumulación sobre el S&P 500 (p. ej. iShares Core S&P 500, IE00B5BMR087) | ídem, convertido a EUR si el valor liquidativo es en USD (con `eurusd`) |
| `nasdaq-100-eur` | Nasdaq-100, en € y con dividendos | indice | ETF UCITS de acumulación sobre el Nasdaq-100 (p. ej. iShares Nasdaq 100, IE00B53SZB19) | ídem |
| `msci-em-nr-eur` | MSCI Emerging Markets, en € | indice | ETF UCITS de acumulación sobre emergentes (p. ej. iShares Core MSCI EM IMI, IE00BKM4GZ66) | ídem |
| `msci-world-small-eur` | MSCI World Small Cap, en € | indice | ETF UCITS de acumulación sobre el MSCI World Small Cap (p. ej. iShares MSCI World Small Cap, IE00BF4RFH31) | ídem |
| `rf-global-agregada-eur-h` | renta fija global agregada, cubierta en € | indice | ETF UCITS de acumulación sobre el Bloomberg Global Aggregate EUR Hedged (p. ej. iShares Core Global Aggregate Bond EUR Hedged, IE00BDBRDM35) | ídem |
| `rf-euro-agregada` | renta fija agregada en euros | indice | ETF o fondo indexado de acumulación sobre el Bloomberg Euro Aggregate | ídem |
| `ipc-espana` | IPC general de España | indice | INE · índice general nacional (base 2021), API JSON del INE | índice mensual publicado, sin desestacionalizar |
| `ipc-vivienda`, `ipc-alimentos`, `ipc-transporte`, `ipc-ocio-cultura`, `ipc-salud`, `ipc-ensenanza` | componentes del IPC (grupos ECOICOP) | indice | INE · índices por grupos especiales/ECOICOP | ídem; el campo `ipc:` de cada grupo de gasto apunta a uno de estos ids |
| `bce-deposito` | tipo de la facilidad de depósito del BCE | porcentaje | BCE · Data Portal (tipos oficiales) | tipo vigente a fin de cada mes, en % anual |
| `eurusd` | tipo de cambio EUR/USD | tipo-cambio | BCE · tipos de cambio de referencia (Data Portal) | último tipo de referencia de cada mes (USD por 1 EUR) |

## Uso en finhub
- **Cartera:** comparativa con índices, «con tus mismas aportaciones hoy tendrías…» e índice propio (clase → índice en `cartera/clases.md`).
- **Metas:** proyección por bootstrap (mezcla de índices de tu perfil) y descuento del IPC.
- **Herramientas:** prueba de crisis, rangos a 12 meses e IPC personal.
- **Conocimiento:** resolución automática de las predicciones con `medir: <id> …`.
- **Pendientes:** «Datos de mercado» se ofrece cada mes; nada se descarga sin tu luz verde.
