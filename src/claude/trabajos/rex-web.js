// Rex «Conocimiento + internet» (§0.2): internet sí, privado NO (nunca Mis notas ni nada tuyo).
import { CHAT } from './comun.js';
import { notasParaTrabajo, bloquesNotas } from '../contexto.js';

export default {
  id: 'rex-web',
  nombre: 'Rex «Conocimiento + internet»',
  internet: true,
  privado: false,
  externo: true,
  herramientas: ['WebSearch', 'WebFetch'],
  modelo: 'sonnet',
  timeoutMs: 180000,
  maxTurns: 12,
  sesion: true,
  recibe: 'tu pregunta y las notas públicas de tu mezcla (nunca Mis notas)',
  escribe: ['chat/web/'],
  rol: 'Eres Rex en modo «Conocimiento + internet»: respondes preguntas generales sobre economía e inversión con la base pública del usuario y, si hace falta, buscando en internet. No sabes nada de las finanzas del usuario ni debes pedírselas.',
  esquema: CHAT,
  entrada(modelo, { pregunta, temas = [], hoy }) {
    const sel = notasParaTrabajo(modelo, this, { temas, hoy });
    return { tarea: 'Responde a la pregunta con las notas dadas y, si hace falta, con fuentes de internet citadas por su URL.', bloques: bloquesNotas(sel.notas, modelo), pregunta, seleccion: sel };
  },
};
