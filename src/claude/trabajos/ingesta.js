// Ingesta de CONTEXTO (§0.2): sin internet, sin datos privados; procesa un texto externo y propone notas.
import { O, L, T, opc, TEMAS, POSTURA, TIPO_NOTA } from './comun.js';
import { bloque } from '../contexto.js';

export default {
  id: 'ingesta',
  nombre: 'Ingesta de CONTEXTO',
  internet: false,
  privado: false,
  externo: true,
  herramientas: [],
  modelo: 'sonnet',
  timeoutMs: 180000,
  maxTurns: 2,
  recibe: 'el texto de CONTEXTO y la ficha de su fuente',
  escribe: ['conocimiento/<fuente>/ (tú revisas)'],
  rol: 'Conviertes una transcripción, artículo o informe en notas breves y fieles: una idea por nota, parafraseada, marcando si es hecho, dato, consenso, opinión o especulación, y las predicciones verificables que haga el autor.',
  esquema: O({
    notas: L(O({ titulo: T('texto', { min: 5, max: 160 }), tipo: TIPO_NOTA, temas: TEMAS, activos: L(T('texto', { max: 60 }), { max: 8 }), postura: opc(POSTURA), resumen: T('texto', { min: 20, max: 900 }), cita: opc(T('texto', { max: 80 })) }, ['titulo', 'tipo', 'temas', 'activos', 'resumen']), { max: 20 }),
    predicciones: L(O({ texto: T('texto', { min: 5, max: 300 }), medir: opc(T('texto', { max: 200 })), horizonte: T('texto', { max: 60 }) }, ['texto', 'horizonte']), { max: 10 }),
  }),
  entrada(modelo, { texto, fichero, fuente }) {
    const f = modelo.fuentes.find((x) => x.id === fuente);
    return { tarea: 'Extrae del documento las ideas principales como notas y las predicciones verificables. No añadas nada que no esté en el documento.', bloques: [bloque('ficha de la fuente', 'publico', `${f?.nombre ?? fuente} · familia: ${f?.familia ?? '—'}`), bloque(`CONTEXTO/${fichero}`, 'externo', texto)] };
  },
};
