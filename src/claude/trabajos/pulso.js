// Pulso de noticias (§0.2): internet sí, privado no, externo sí. Entrada: fecha, temas y, solo si lo
// activas en esa ejecución, los nombres de tus activos. Salida: notas de Mundo propuestas.
import { O, L, T, opc, TEMAS, POSTURA, TIPO_NOTA } from './comun.js';
import { bloque } from '../contexto.js';
import { diasEntre } from '../../core/fechas.js';

export default {
  id: 'pulso',
  nombre: 'Pulso de noticias',
  internet: true,
  privado: false,
  externo: true,
  metadatos: true,
  herramientas: ['WebSearch', 'WebFetch'],
  modelo: 'sonnet',
  timeoutMs: 300000,
  maxTurns: 24,
  recibe: 'fecha, temas y, si lo activas, los nombres de tus fondos',
  escribe: ['conocimiento/mundo/'],
  rol: 'Eres el redactor del pulso de noticias económicas de finhub: buscas en medios fiables las noticias del día pedido sobre los temas dados y las resumes con tus palabras, en dos o tres líneas, distinguiendo hechos, consenso, opinión y especulación.',
  esquema: O({
    notas: L(O({ titulo: T('texto', { min: 5, max: 160 }), tipo: TIPO_NOTA, fecha: T('fecha'), origen: O({ medio: T('texto', { min: 2, max: 80 }), url: T('url') }), temas: TEMAS, activos: L(T('texto', { max: 60 }), { max: 8 }), postura: opc(POSTURA), efectos: opc({ t: 'mapa', de: T('enum', { v: ['▲', '▼', '•'] }) }), resumen: T('texto', { min: 20, max: 700 }) }, ['titulo', 'tipo', 'fecha', 'origen', 'temas', 'activos', 'resumen']), { max: 8 }),
  }),
  /** Reglas además del esquema: la fecha es la pedida ±1; los sectores, los del mapa de efectos. */
  comprobar(json, { params, modelo }) {
    const e = [];
    const sectores = new Set(modelo.ajustes.sectores_efectos ?? []);
    for (const [i, n] of json.notas.entries()) {
      if (Math.abs(diasEntre(params.fecha, n.fecha)) > 1) e.push(`notas[${i}]: fecha ${n.fecha} fuera del día pedido ±1`);
      for (const s of Object.keys(n.efectos ?? {})) if (!sectores.has(s)) e.push(`notas[${i}]: sector «${s}» no está en tu mapa de efectos`);
    }
    return e;
  },
  entrada(modelo, { fecha, temas = [], activos = null }) {
    const bloques = [bloque('temas', 'publico', temas.join(', ') || 'economía, mercados, bancos centrales, inflación')];
    if (modelo.ajustes.sectores_efectos?.length) bloques.push(bloque('sectores del mapa de efectos', 'publico', modelo.ajustes.sectores_efectos.join(', ')));
    if (activos?.length) bloques.push(bloque('nombres de tus activos', 'metadato', activos.join('\n')));
    return { tarea: `Busca las noticias económicas y de mercados del ${fecha} sobre los temas indicados y devuelve como mucho 6 notas, cada una con su medio y URL. La fecha de cada nota debe ser el ${fecha} (o un día antes o después).`, bloques };
  },
};
