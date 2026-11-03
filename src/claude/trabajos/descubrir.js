// Descubrir (§0.2, §4.9): internet sí, privado no. Entrada: modo, periodo, tema, notas PÚBLICAS del periodo,
// descubrimientos previos y, solo si lo activas, los nombres de tus clases (nunca importes ni pesos).
import { O, L, T, opc, ID_NOTA, POSTURA } from './comun.js';
import { bloque, notasParaTrabajo, bloquesNotas } from '../contexto.js';
import { validarIsin } from '../../core/ids.js';
import { TIPOS_DESCUBRIMIENTO } from '../../core/formato/conocimiento.js';

export default {
  id: 'descubrir',
  nombre: 'Descubrir',
  internet: true,
  privado: false,
  externo: true,
  metadatos: true,
  herramientas: ['WebSearch', 'WebFetch'],
  modelo: 'opus',
  timeoutMs: 300000,
  maxTurns: 30,
  recibe: 'tema o noticias públicas · opcional: nombres de tus clases',
  escribe: ['conocimiento/descubrimientos/'],
  rol: 'Investigas temas de inversión (sectores, regiones, clases de activo, vehículos) a partir de noticias y fuentes públicas, con tesis, riesgos, lo que la invalidaría y vehículos para informarse. Es información, no recomendación.',
  esquema: O({
    descubrimientos: L(O({ titulo: T('texto', { min: 5, max: 140 }), tipo: T('enum', { v: TIPOS_DESCUBRIMIENTO }), postura: POSTURA, confianza: T('enum', { v: ['baja', 'media', 'alta'] }), tesis: T('texto', { min: 20, max: 1500 }), saldria_bien_si: T('texto', { max: 800 }), la_invalidaria: T('texto', { max: 800 }), riesgos: T('texto', { max: 1200 }), vehiculos: L(O({ nombre: T('texto', { max: 200, ayuda: 'nombre corto del fondo, ETF o índice' }), isin: opc(T('texto')), ter: opc(T('numero', { min: 0, max: 5 })), indice: opc(T('texto', { max: 120 })) }, ['nombre']), { max: 6 }), citas: L(T('texto', { max: 300 }), { max: 20 }), afirmaciones: L(O({ tipo: T('enum', { v: ['hecho', 'dato', 'consenso', 'opinión', 'especulación'] }), texto: T('texto', { max: 400 }) }), { max: 12 }), prediccion: opc(O({ texto: T('texto', { max: 300 }), medir: opc(T('texto', { max: 200 })), horizonte: T('texto', { max: 60 }) }, ['texto', 'horizonte'])), revisar_en_dias: T('entero', { min: 7, max: 365 }) }, ['titulo', 'tipo', 'postura', 'confianza', 'tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos', 'vehiculos', 'citas', 'afirmaciones', 'revisar_en_dias']), { max: 5 }),
    cambios: opc(T('texto', { max: 1500 })),
  }, ['descubrimientos']),
  comprobar(json) {
    const e = [];
    json.descubrimientos.forEach((d, i) => d.vehiculos.forEach((v, j) => v.isin && !validarIsin(v.isin) && e.push(`descubrimientos[${i}].vehiculos[${j}]: ISIN ${v.isin} no válido`)));
    return e;
  },
  entrada(modelo, { modo = 'libre', tema = '', clases = null, hoy }) {
    const sel = notasParaTrabajo(modelo, this, { hoy, soloFuentes: ['base', 'mundo', 'datos'] });
    const bloques = [...bloquesNotas(sel.notas, modelo), bloque('descubrimientos previos', 'publico', modelo.descubrimientos.map((d) => `${d.id} · ${d.titulo}`).join('\n') || 'ninguno', { ids: modelo.descubrimientos.map((d) => d.id) })];
    if (clases?.length) bloques.push(bloque('nombres de tus clases de activo', 'metadato', clases.join(', ')));
    return { tarea: `Modo: ${modo}. ${tema ? `Tema: ${tema}. ` : ''}Propón como mucho 2 descubrimientos con sus fuentes (URL en «citas»).`, bloques, seleccion: sel };
  },
};
