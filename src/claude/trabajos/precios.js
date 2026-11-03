// Precios (§0.2): internet sí, privado no. Entrada: SOLO los ISIN y nombres (sin participaciones ni importes).
// Salida: precios propuestos, que tú confirmas (nunca se guardan solos).
import { O, L, T } from './comun.js';
import { bloque } from '../contexto.js';

export default {
  id: 'precios',
  nombre: 'Precios de tus fondos',
  internet: true,
  privado: false,
  externo: true,
  metadatos: true,
  metadatosSiempre: true, // los ISIN son la petición misma (la lanzas tú, para esos ISIN)
  herramientas: ['WebSearch', 'WebFetch'],
  modelo: 'haiku',
  timeoutMs: 90000,
  maxTurns: 16,
  recibe: 'solo los ISIN y nombres',
  escribe: ['propuesta (tú confirmas) → cartera/valores/'],
  rol: 'Buscas el último valor liquidativo o precio de cierre publicado de cada fondo o ETF por su ISIN, en la web de la gestora o en una fuente pública fiable, con su fecha y divisa.',
  esquema: O({ precios: L(O({ isin: T('texto', { patron: /^[A-Z]{2}[A-Z0-9]{9}\d$/ }), valor: T('numero', { min: 0.0001 }), divisa: T('texto', { patron: /^[A-Z]{3}$/ }), fecha: T('fecha'), origen: T('url') }), { max: 40 }) }),
  comprobar(json, { params }) {
    const pedidos = new Set(params.activos.map((a) => a.isin));
    return json.precios.flatMap((p, i) => (pedidos.has(p.isin) ? [] : [`precios[${i}]: ISIN ${p.isin} no pedido`]));
  },
  entrada(modelo, { activos }) {
    return { tarea: 'Para cada ISIN, devuelve el último valor liquidativo (o cierre) publicado, su fecha, su divisa y la URL de donde lo sacas. Si no lo encuentras con seguridad, no lo incluyas.', bloques: [bloque('ISIN y nombres', 'metadato', activos.map((a) => `${a.isin} · ${a.nombre}`).join('\n'))] };
  },
};
