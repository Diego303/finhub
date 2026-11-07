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
- **Dónde buscar el histórico mensual:** las webs de las gestoras no suelen dar la tabla. Antes de rendirte, prueba el precio de cierre mensual del ETF en euros en una fuente pública, con WebFetch: `https://query1.finance.yahoo.com/v8/finance/chart/<ticker>?range=max&interval=1mo` o `https://stooq.com/q/d/l/?s=<ticker>&i=m`. Tickers en euros, por ejemplo: `EUNL.DE` (MSCI World), `IUSQ.DE` (MSCI ACWI), `SXR8.DE` (S&P 500), `SXRV.DE` (Nasdaq 100), `IS3N.DE` (emergentes), `IUSN.DE` (small caps), `EUNA.DE` (renta fija global cubierta). Comprueba que el ticker es de ese ETF y que cotiza en euros. Indica en `metodo` que es la cotización de cierre del ETF de acumulación.
- **Actualizar una serie:** sigue en la escala que ya tienes (base 100, o una base anterior del INE): valor nuevo = tu último valor × dato del mes ÷ dato de tu último mes en la fuente.
- Los ISIN de los proxies son orientativos: el trabajo `datos` debe **verificarlos** (nombre, clase de
  acumulación, divisa) antes de descargar nada.

## Series

| id | qué es | unidad | proxy (fuente gratuita) | método |
|---|---|---|---|---|
| `msci-world-nr-eur` | MSCI World, net return, en € | indice | ETF UCITS de acumulación sobre el MSCI World (p. ej. iShares Core MSCI World, IE00B4L5Y983) · cierre mensual del ETF en euros | cierre mensual del ETF en EUR (cotización, o valor liquidativo si la gestora da la tabla; di cuál en «origen»), base 100 en el primer mes |
| `msci-acwi-nr-eur` | MSCI ACWI (desarrollados + emergentes), en € | indice | ETF UCITS de acumulación sobre el MSCI ACWI (p. ej. iShares MSCI ACWI, IE00B6R52259) | ídem |
| `sp500-eur` | S&P 500, en € y con dividendos | indice | ETF UCITS de acumulación sobre el S&P 500 (p. ej. iShares Core S&P 500, IE00B5BMR087) | ídem, convertido a EUR si cotiza en USD (con `eurusd`) |
| `nasdaq-100-eur` | Nasdaq-100, en € y con dividendos | indice | ETF UCITS de acumulación sobre el Nasdaq-100 (p. ej. iShares Nasdaq 100, IE00B53SZB19) | ídem |
| `msci-em-nr-eur` | MSCI Emerging Markets, en € | indice | ETF UCITS de acumulación sobre emergentes (p. ej. iShares Core MSCI EM IMI, IE00BKM4GZ66) | ídem |
| `msci-world-small-eur` | MSCI World Small Cap, en € | indice | ETF UCITS de acumulación sobre el MSCI World Small Cap (p. ej. iShares MSCI World Small Cap, IE00BF4RFH31) | ídem |
| `rf-global-agregada-eur-h` | renta fija global agregada, cubierta en € | indice | ETF UCITS de acumulación sobre el Bloomberg Global Aggregate EUR Hedged (p. ej. iShares Core Global Aggregate Bond EUR Hedged, IE00BDBRDM35) | ídem |
| `rf-euro-agregada` | renta fija agregada en euros | indice | ETF o fondo indexado de acumulación sobre el Bloomberg Euro Aggregate | ídem |
| `ipc-espana` | IPC general de España | indice | INE · índice general nacional, base 2025, API JSON: serie IPC290751 en https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC290751?nult=400 | índice mensual publicado, sin desestacionalizar; una sola base: si el INE cambia de base, usa la serie nueva, que trae la historia reescalada, y nunca pegues dos bases |
| `ipc-vivienda`, `ipc-alimentos`, `ipc-transporte`, `ipc-ocio-cultura`, `ipc-salud`, `ipc-ensenanza` | componentes del IPC (grupos ECOICOP) | indice | INE · API JSON, base 2025, igual que `ipc-espana`, con estas series: ipc-vivienda IPC290763, ipc-alimentos IPC290755, ipc-transporte IPC290775, ipc-ocio-cultura IPC290787, ipc-salud IPC290771, ipc-ensenanza IPC290791 | ídem; el campo `ipc:` de cada grupo de gasto apunta a uno de estos ids |
| `bce-deposito` | tipo de la facilidad de depósito del BCE | porcentaje | BCE · Data Portal (tipos oficiales) | tipo vigente a fin de cada mes, en % anual |
| `eurusd` | tipo de cambio EUR/USD | tipo-cambio | BCE · tipos de cambio de referencia (Data Portal) | último tipo de referencia de cada mes (USD por 1 EUR) |

## Uso en finhub
- **Cartera:** comparativa con índices, «con tus mismas aportaciones hoy tendrías…» e índice propio (clase → índice en `cartera/clases.md`).
- **Metas:** proyección por bootstrap (mezcla de índices de tu perfil) y descuento del IPC.
- **Herramientas:** prueba de crisis, rangos a 12 meses e IPC personal.
- **Conocimiento:** resolución automática de las predicciones con `medir: <id> …`.
- **Pendientes:** «Datos de mercado» se ofrece cada mes; nada se descarga sin tu luz verde.
