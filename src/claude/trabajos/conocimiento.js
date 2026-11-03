// Conocimiento (§0.2): sin internet, sin datos privados (nunca Mis notas); lee notas de tu mezcla (texto
// externo ya normalizado). ¿Qué opinan mis canales?, resumen semanal y quiz (con su tarea).
import { O, L, T, POSTURA, ID, ID_NOTA } from './comun.js';
import { notasParaTrabajo, bloquesNotas } from '../contexto.js';
import { esquemaDe } from '../tareas.js';
import { crearPrng } from '../../core/prng.js';

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
  escribe: ['conocimiento/mundo/semana-*', 'quiz/'],
  rol: 'Trabajas solo con las notas de conocimiento dadas (fuentes públicas y canales): explicas qué dicen, resumes y preparas preguntas, siempre citando las notas por su id.',
  esquema: O({ fuentes: L(O({ id: { ...ID, ayuda: 'id de la FUENTE, el que va tras «notas:» en el origen del bloque, p. ej. indexado' }, postura: POSTURA, argumento: T('texto', { min: 5, max: 500 }), cita: { ...ID_NOTA, ayuda: 'id de la NOTA que lo respalda, p. ej. IND-0031' } }), { max: 60 }), coinciden: T('texto', { max: 1200 }), discrepan: T('texto', { max: 1200 }), opinion_modelo: T('texto', { max: 1200 }) }),
  /** params: {pregunta, tarea?, rol?, fuentes?, temas?, desde?, hasta?, quiz?: n} */
  entrada(modelo, { pregunta = null, tarea = null, rol = null, fuentes = null, temas = [], desde = null, hasta = null, quiz = null, hoy }) {
    let sel;
    if (quiz) {
      // quiz: notas de la Base barajadas con una semilla del día (mismo día, mismas notas)
      const prng = crearPrng(`quiz-${hoy}`);
      sel = notasParaTrabajo(modelo, this, { hoy, soloFuentes: ['base'], limite: { notas: quiz, caracteres: 30000 }, orden: (l) => prng.barajar(l) });
    } else sel = notasParaTrabajo(modelo, this, { temas, hoy, fuentes, desde, hasta, soloFuentes: desde ? ['mundo'] : null });
    return {
      tarea: tarea?.instrucciones || 'Resume qué opina cada fuente sobre la pregunta, solo con las notas dadas.',
      tareaId: tarea?.id ?? null,
      rol: rol?.texto ?? null,
      esquema: esquemaDe(tarea?.esquema ?? 'opinan', this),
      bloques: bloquesNotas(sel.notas, modelo),
      pregunta,
      seleccion: sel,
    };
  },
};
