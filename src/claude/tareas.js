// Tareas y roles (§5 Análisis, §8.2, §8.5). El Markdown (tareas/*.md, roles/*.md) pone el TEXTO de la
// instrucción y del rol; el TRABAJO y el ESQUEMA de salida los fija el código: una tarea nunca puede cambiar
// las banderas R1 de su trabajo ni el contrato de su salida.
import { O, L, T, opc, ID_NOTA, CHAT } from './trabajos/comun.js';
import { leer } from '../core/formato/index.js';
import { cabeceras, textoSeccion } from '../core/formato/motor.js';

const CITAS = L(ID_NOTA, { max: 20 });
const IDEA = O({ titulo: T('texto', { min: 3, max: 160 }), tipo: T('enum', { v: ['consenso', 'opinión', 'especulación'] }), texto: T('texto', { min: 10, max: 900 }), citas: CITAS });

export const ESQUEMAS = {
  chat: CHAT,
  escenarios: O({ escenarios: L(O({ nombre: T('enum', { v: ['base', 'optimista', 'pesimista'] }), prob: T('entero', { min: 0, max: 100 }), porque: T('texto', { min: 10, max: 900 }), citas: CITAS }), { min: 3, max: 3 }), ideas: L(IDEA, { max: 5 }), no_concluyente: opc(T('bool')) }, ['escenarios', 'ideas']),
  ideas: O({ ideas: L(IDEA, { max: 6 }), no_concluyente: opc(T('bool')) }, ['ideas']),
  preguntas: O({ preguntas: L(T('texto', { min: 10, max: 300 }), { min: 2, max: 5 }), resumen: T('texto', { max: 600 }) }),
  semana: O({ secciones: L(O({ tema: T('texto', { min: 3, max: 60, ayuda: 'nombre corto del tema, p. ej. Bancos centrales' }), texto: T('texto', { min: 20, max: 1200 }) }), { min: 1, max: 6 }) }),
  quiz: O({ preguntas: L(O({ nota: { ...ID_NOTA, ayuda: 'id de la nota de la Base en la que se basa, p. ej. B-1001' }, pregunta: T('texto', { min: 10, max: 300 }), opciones: L(T('texto', { min: 1, max: 160 }), { min: 3, max: 4 }), correcta: T('entero', { min: 0, max: 3, ayuda: 'índice de la opción correcta, empezando en 0' }), explicacion: T('texto', { min: 10, max: 500 }) }), { min: 1, max: 5 }) }),
  texto: O({ texto_md: T('texto', { min: 20, max: 3000 }), citas: CITAS }),
};

/** Tareas que el código conoce: trabajo y esquema. Una tarea del usuario que no está aquí usa el de su trabajo. */
export const TAREAS_CODIGO = {
  'escenarios-12m': { trabajo: 'privado', esquema: 'escenarios', rangos: true },
  'ideas-aportacion': { trabajo: 'privado', esquema: 'ideas' },
  'revision-cartera': { trabajo: 'privado', esquema: 'chat' },
  'donde-ahorrar': { trabajo: 'privado', esquema: 'chat' },
  'pregunta-libre': { trabajo: 'privado', esquema: 'chat' },
  'abogado-diablo': { trabajo: 'privado', esquema: 'chat' },
  explicame: { trabajo: 'privado', esquema: 'chat' },
  'pausa-48h': { trabajo: 'privado', esquema: 'preguntas' },
  'tu-ano': { trabajo: 'privado', esquema: 'texto' },
  'revisar-cartera-base': { trabajo: 'privado', esquema: 'chat' },
  'opinan-canales': { trabajo: 'conocimiento', esquema: 'opinan' },
  'resumen-semanal': { trabajo: 'conocimiento', esquema: 'semana' },
  quiz: { trabajo: 'conocimiento', esquema: 'quiz' },
  'descubrir-pulso': { trabajo: 'descubrir' },
  'descubrir-nuevas': { trabajo: 'descubrir' },
  'descubrir-seguimiento': { trabajo: 'descubrir' },
  'descubrir-libre': { trabajo: 'descubrir' },
  encaje: { trabajo: 'encaje' },
};
/** Esquema por defecto de cada trabajo para tareas propias del usuario. */
export const ESQUEMA_DEFECTO = { privado: 'chat', conocimiento: 'opinan' };


/** Esquema de una ejecución: el de la tarea si el código lo conoce; si no, el del trabajo. */
export const esquemaDe = (nombre, trabajo) => ESQUEMAS[nombre] ?? trabajo.esquema;

/** Lee las tareas (semilla del repo + las de tu carpeta, que mandan). → Map id → {id, titulo, trabajo, descripcion, instrucciones, esquema, origen} */
export function leerTareas({ semilla = {}, carpeta = {} } = {}) {
  const out = new Map();
  const anadir = (nombre, texto, origen) => {
    const id = nombre.replace(/\.md$/, '');
    const d = leer(`tareas/${nombre}`, texto);
    if (!d || d.trabajoInvalido) return;
    const cab = cabeceras(d);
    const codigo = TAREAS_CODIGO[id];
    if (codigo && codigo.trabajo !== cab.trabajo) return; // una tarea conocida no puede cambiar de trabajo
    out.set(id, { id, titulo: d.titulo.replace(/^Tarea · /, ''), trabajo: cab.trabajo, descripcion: cab.descripcion ?? null, instrucciones: textoSeccion(d, 'Trabajo') ?? '', esquema: codigo?.esquema ?? ESQUEMA_DEFECTO[cab.trabajo] ?? null, rangos: !!codigo?.rangos, origen });
  };
  for (const [n, t] of Object.entries(semilla)) anadir(n, t, 'semilla');
  for (const [n, t] of Object.entries(carpeta)) anadir(n, t, 'carpeta');
  return out;
}

/** Lee los roles. → Map id → {id, titulo, trabajo, descripcion, texto (rol + reglas)} */
export function leerRoles({ semilla = {}, carpeta = {} } = {}) {
  const out = new Map();
  const anadir = (nombre, texto, origen) => {
    const id = nombre.replace(/\.md$/, '');
    const d = leer(`roles/${nombre}`, texto);
    if (!d || d.trabajoInvalido) return;
    const cab = cabeceras(d);
    const rol = textoSeccion(d, 'Rol') ?? '';
    const reglas = textoSeccion(d, 'Reglas') ?? '';
    out.set(id, { id, titulo: d.titulo.replace(/^Rol · /, ''), trabajo: cab.trabajo, descripcion: cab.descripcion ?? null, texto: [rol, reglas && `Reglas del rol:\n${reglas}`].filter(Boolean).join('\n'), origen });
  };
  for (const [n, t] of Object.entries(semilla)) anadir(n, t, 'semilla');
  for (const [n, t] of Object.entries(carpeta)) anadir(n, t, 'carpeta');
  return out;
}
