// Conocimiento (§0.2): sin internet, sin datos privados (nunca Mis notas); lee notas de tu mezcla (texto
// externo ya normalizado). ¿Qué opinan mis canales?, resumen semanal y quiz.
import { O, L, T, POSTURA, ID, ID_NOTA } from './comun.js';
import { notasParaTrabajo, bloquesNotas } from '../contexto.js';

export default {
  id: 'conocimiento',
  nombre: 'Conocimiento (¿qué opinan?, resumen, quiz)',
  internet: false,
  privado: false,
  externo: true,
  herramientas: [],
  modelo: 'sonnet',
  timeoutMs: 120000,
  maxTurns: 2,
  recibe: 'notas de tu mezcla (nunca Mis notas)',
  escribe: ['conocimiento/mundo/ · quiz/'],
  rol: 'Explicas qué dicen las fuentes de la mezcla sobre una pregunta: la postura de cada una con su argumento y una cita, en qué coinciden, en qué discrepan, y tu lectura marcada como opinión del modelo.',
  esquema: O({ fuentes: L(O({ id: { ...ID, ayuda: 'id de la FUENTE, el que va tras «notas:» en el origen del bloque, p. ej. indexado' }, postura: POSTURA, argumento: T('texto', { min: 5, max: 500 }), cita: { ...ID_NOTA, ayuda: 'id de la NOTA que lo respalda, p. ej. IND-0031' } }), { max: 60 }), coinciden: T('texto', { max: 1200 }), discrepan: T('texto', { max: 1200 }), opinion_modelo: T('texto', { max: 1200 }) }),
  entrada(modelo, { pregunta, temas = [], hoy }) {
    const sel = notasParaTrabajo(modelo, this, { temas, hoy });
    return { tarea: 'Resume qué opina cada fuente sobre la pregunta, solo con las notas dadas.', bloques: bloquesNotas(sel.notas, modelo), pregunta, seleccion: sel };
  },
};
