// Qué formato tiene cada fichero de la carpeta de datos, según su ruta relativa (§3).
import { ajustes } from './config.js';
import { cuentas, grupos, etiquetas, recurrentes, hitos } from './catalogos.js';
import { mes } from './mes.js';
import { metas, decision } from './metas.js';
import { activos, operaciones, objetivo, clases, valores, plantilla, borrador } from './cartera.js';
import { familias, fuentes, mezclas, predicciones, notas, semana, serie, descubrimiento } from './conocimiento.js';
import { rol, tarea, analisis, encaje, chat, quiz, tuano } from './textos.js';

export const FORMATOS = { ajustes, cuentas, grupos, etiquetas, recurrentes, hitos, mes, metas, decision, activos, operaciones, objetivo, clases, valores, plantilla, borrador, familias, fuentes, mezclas, predicciones, notas, semana, serie, descubrimiento, rol, tarea, analisis, encaje, chat, quiz, tuano };

const FIJOS = {
  'ajustes.md': 'ajustes',
  'cuentas.md': 'cuentas',
  'grupos.md': 'grupos',
  'etiquetas.md': 'etiquetas',
  'recurrentes.md': 'recurrentes',
  'metas.md': 'metas',
  'hitos.md': 'hitos',
  'cartera/activos.md': 'activos',
  'cartera/operaciones.md': 'operaciones',
  'cartera/objetivo.md': 'objetivo',
  'cartera/clases.md': 'clases',
  'conocimiento/_familias.md': 'familias',
  'conocimiento/_fuentes.md': 'fuentes',
  'conocimiento/_mezclas.md': 'mezclas',
  'conocimiento/predicciones.md': 'predicciones',
  'quiz/progreso.md': 'quiz',
};

/** Reglas por patrón: [regex, tipo, ctx(m)] en orden; la primera que encaja manda. */
const PATRONES = [
  [/^mes\/(\d{4}-(?:0[1-9]|1[0-2]))\.md$/, 'mes', (m) => ({ mes: m[1] })],
  [/^cartera\/valores\/(\d{4}-\d{2}-\d{2})\.md$/, 'valores', (m) => ({ fecha: m[1] })],
  [/^cartera\/plantillas\/([^/]+)\.md$/, 'plantilla', (m) => ({ perfil: m[1] })],
  [/^cartera\/borradores\/([^/]+)\.md$/, 'borrador', () => ({})],
  [/^decisiones\/([^/]+)\.md$/, 'decision', () => ({})],
  [/^conocimiento\/mundo\/semana-(\d{4}-W\d{2})\.md$/, 'semana', (m) => ({ semana: m[1], fuente: 'mundo' })],
  [/^conocimiento\/mundo\/(\d{4}-\d{2}-\d{2})\.md$/, 'notas', (m) => ({ fuente: 'mundo', fecha: m[1] })],
  [/^conocimiento\/datos\/series\/([^/]+)\.md$/, 'serie', (m) => ({ serie: m[1] })],
  [/^conocimiento\/descubrimientos\/(D-\d{3,})\.md$/, 'descubrimiento', (m) => ({ id: m[1] })],
  [/^conocimiento\/([^_/][^/]*)\/(?:[^/]+\/)*[^/]+\.md$/, 'notas', (m) => ({ fuente: m[1] })],
  [/^roles\/([^/]+)\.md$/, 'rol', (m) => ({ id: m[1] })],
  [/^tareas\/([^/]+)\.md$/, 'tarea', (m) => ({ id: m[1] })],
  [/^analisis\/encajes\/([^/]+)\.md$/, 'encaje', () => ({})],
  [/^analisis\/([^/]+)\.md$/, 'analisis', () => ({})],
  [/^chat\/(privado|web)\/([^/]+)\.md$/, 'chat', (m) => ({ modo: m[1] })],
  [/^tu-ano\/(\d{4})\.md$/, 'tuano', (m) => ({ anio: +m[1] })],
];

/**
 * Formato de una ruta relativa a la carpeta de datos (con "/").
 * → {formato, ctx} · null si no es un fichero de datos (CONTEXTO/, .finhub/, ficheros ajenos).
 */
export function detectar(ruta) {
  const r = String(ruta).replaceAll('\\', '/').replace(/^\.\//, '');
  if (r.startsWith('.finhub/') || r.startsWith('CONTEXTO/') || !r.endsWith('.md')) return null;
  if (FIJOS[r]) return { formato: FORMATOS[FIJOS[r]], ctx: { ruta: r } };
  for (const [re, tipo, ctx] of PATRONES) {
    const m = re.exec(r);
    if (m) return { formato: FORMATOS[tipo], ctx: { ruta: r, ...ctx(m) } };
  }
  return null;
}

/** Atajo: parsea un fichero por su ruta. `ctxExtra` añade, p. ej., `diaInicio` del mes financiero. */
export function leer(ruta, texto, ctxExtra = {}) {
  const d = detectar(ruta);
  if (!d) return null;
  return d.formato.parsear(texto, { ...d.ctx, ...ctxExtra });
}
