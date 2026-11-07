// Datos de mercado (§7.3): internet sí, privado no. Entrada: el manifiesto de series y el último mes que
// tienes de cada una. Salida: filas nuevas, que se validan y que tú confirmas antes de guardarlas.
import { O, L, T } from './comun.js';
import { bloque } from '../contexto.js';

export default {
  id: 'datos',
  nombre: 'Datos de mercado',
  internet: true,
  privado: false,
  externo: true,
  herramientas: ['WebSearch', 'WebFetch'],
  modelo: 'sonnet',
  timeoutMs: 300000,
  maxTurns: 30,
  recibe: 'el manifiesto de series y el último dato que tienes',
  escribe: ['conocimiento/datos/series/ (tú confirmas)'],
  rol: 'Construyes series mensuales para calcular (índices vía ETF de acumulación, IPC del INE, tipos y cambios del BCE) desde fuentes públicas y gratuitas, siguiendo exactamente el método del manifiesto. Un valor por mes: el último dato del mes.',
  esquema: O({ series: L(O({ id: T('texto', { patron: /^[a-z0-9]+(-[a-z0-9]+)*$/ }), filas: L(O({ mes: T('mes'), valor: T('numero') }), { max: 400 }), origen: T('texto', { min: 5, max: 1000 }) }), { max: 20 }) }),
  comprobar(json, { params }) {
    const pedidas = new Map(params.series.map((s) => [s.id, s]));
    const e = [];
    for (const [i, s] of json.series.entries()) {
      const p = pedidas.get(s.id);
      if (!p) e.push(`series[${i}]: «${s.id}» no se pidió`);
      if (!/https?:\/\//.test(s.origen)) e.push(`series[${i}]: el origen debe llevar la URL`);
      // un tipo de interés puede ser negativo (el del BCE lo fue de 2014 a 2022); un índice o un cambio, no
      if (p && p.unidad !== 'porcentaje' && s.filas.some((f) => f.valor < 0)) e.push(`series[${i}]: «${s.id}» con un valor negativo`);
    }
    return e;
  },
  entrada(modelo, { series, hoy }) {
    const lineas = series.map((s) => `${s.id} · ${s.que} · unidad: ${s.unidad} · proxy/fuente: ${s.proxy} · método: ${s.metodo} · ${s.ultimo ? `tienes hasta ${s.ultimo}${s.ultimoValor != null ? ` (valor ${s.ultimoValor})` : ''}: trae solo los meses posteriores, en esa misma escala` : 'no tienes datos: trae todo el histórico mensual disponible, hasta 25 años'}`);
    return { tarea: `Para cada serie, devuelve las filas mensuales que faltan hasta el último mes completo anterior a ${hoy.slice(0, 7)}, siguiendo su método. Indica en «origen» la fuente y la URL. Para los índices, las webs de las gestoras no suelen dar la tabla mensual: antes de rendirte, consulta con WebFetch el cierre mensual del ETF en euros en https://query1.finance.yahoo.com/v8/finance/chart/<ticker>?period1=0&period2=4102444800&interval=1mo o en https://stooq.com/q/d/l/?s=<ticker>&i=m. Usa siempre «adjclose» (lleva los dividendos), no «close». Cada marca de tiempo es el inicio del mes en hora de la bolsa, aunque en UTC caiga el día anterior; la última fila puede ser el mes en curso. Tickers, por ejemplo: EUNL.DE (MSCI World), IUSQ.DE (MSCI ACWI), SXR8.DE (S&P 500), SXRV.DE (Nasdaq 100), IS3N.DE (emergentes), IUSN.DE (small caps), EUNA.DE (renta fija global cubierta), SYBA.DE (renta fija en euros); comprueba que el ticker es de ese ETF y cotiza en euros, y di en «origen» que es la cotización de cierre. Si ya tienes filas de una serie, sigue en su misma escala, aunque sea base 100 o la fuente haya cambiado de base: valor nuevo = tu último valor × dato del mes ÷ dato de tu último mes en la fuente. Por lo demás, copia las cifras tal cual: nunca las estimes ni las completes. Si no encuentras datos fiables para una serie, no la incluyas.`, bloques: [bloque('manifiesto de series', 'publico', lineas.join('\n'))] };
  },
};
