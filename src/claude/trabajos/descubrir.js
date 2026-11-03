// Descubrir (§0.2, §4.9): internet sí, privado no. Entrada: modo (pulso, nuevas, seguimiento, libre), periodo,
// tema, filtros, notas PÚBLICAS (Mundo del periodo; Base y Datos), descubrimientos previos, en seguimiento la
// versión anterior (pública) y, solo si lo activas, los NOMBRES de tus clases (nunca importes ni pesos).
// La profundidad cambia --max-turns y el número de fuentes. Los ISIN no válidos los descarta la operación
// (con aviso); un importe en euros manda la salida a cuarentena (§9.25).
import { O, L, T, opc, POSTURA } from './comun.js';
import { bloque, notasParaTrabajo, bloquesNotas } from '../contexto.js';
import { TIPOS_DESCUBRIMIENTO } from '../../core/formato/conocimiento.js';

export const MODOS_DESCUBRIR = ['pulso', 'nuevas', 'seguimiento', 'libre'];
export const PROFUNDIDAD = { rapida: { maxTurns: 12, fuentes: 3, notas: 20 }, normal: { maxTurns: 24, fuentes: 6, notas: 40 }, fondo: { maxTurns: 40, fuentes: 10, notas: 60, timeoutMs: 600000 } };
const RE_EUROS = /\d[\d.,]*\s*(€|eur\b|euros)/i;

const TAREA_DEFECTO = {
  pulso: 'A partir de las noticias del pulso del periodo (notas de Mundo), detecta temas de inversión que se repiten y propón descubrimientos con su tesis.',
  nuevas: 'Busca ideas de inversión nuevas (sectores, regiones, clases de activo o vehículos) que no estén ya en los descubrimientos previos.',
  seguimiento: 'Revisa el descubrimiento de la versión anterior: qué ha cambiado desde su fecha (noticias, datos, tesis) y devuelve su nueva versión.',
  libre: 'Investiga la pregunta del usuario y propón descubrimientos solo si hay evidencia.',
};

const DESCUBRIMIENTO = O(
  {
    id: opc(T('texto', { patron: /^D-\d{3,}$/, ayuda: 'solo en seguimiento: el id del descubrimiento revisado' })),
    titulo: T('texto', { min: 5, max: 140 }),
    tipo: T('enum', { v: TIPOS_DESCUBRIMIENTO }),
    postura: POSTURA,
    confianza: T('enum', { v: ['baja', 'media', 'alta'] }),
    tesis: T('texto', { min: 20, max: 1500 }),
    saldria_bien_si: T('texto', { max: 800 }),
    la_invalidaria: T('texto', { max: 800 }),
    riesgos: T('texto', { max: 1200 }),
    vehiculos: L(O({ nombre: T('texto', { max: 200, ayuda: 'nombre corto del fondo, ETF o índice' }), isin: opc(T('texto')), ter: opc(T('numero', { min: 0, max: 5 })), indice: opc(T('texto', { max: 120 })) }, ['nombre']), { max: 6 }),
    citas: L(T('texto', { max: 300, ayuda: 'URL consultada o id de una nota de <datos>' }), { max: 20 }),
    afirmaciones: L(O({ tipo: T('enum', { v: ['hecho', 'dato', 'consenso', 'opinión', 'especulación'] }), texto: T('texto', { max: 400 }) }), { max: 12 }),
    prediccion: opc(O({ texto: T('texto', { max: 300 }), medir: opc(T('texto', { max: 200 })), horizonte: T('texto', { max: 60 }) }, ['texto', 'horizonte'])),
    revisar_en_dias: T('entero', { min: 7, max: 365 }),
  },
  ['titulo', 'tipo', 'postura', 'confianza', 'tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos', 'vehiculos', 'citas', 'afirmaciones', 'revisar_en_dias'],
);

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
  maxTurns: 24,
  recibe: 'tema o noticias públicas · opcional: nombres de tus clases',
  escribe: ['conocimiento/descubrimientos/'],
  rol: 'Investigas temas de inversión (sectores, regiones, clases de activo, vehículos) a partir de noticias y fuentes públicas, con tesis, riesgos, lo que la invalidaría y vehículos para informarse. Es información, no recomendación. Nunca incluyas importes en euros ni cifras de una cartera concreta.',
  esquema: O({ descubrimientos: L(DESCUBRIMIENTO, { max: 5 }), sin_cambios: opc(T('bool')), cambios: opc(T('texto', { max: 1500 })) }, ['descubrimientos']),
  comprobar(json, { params = {} } = {}) {
    const e = [];
    json.descubrimientos.forEach((d, i) => {
      for (const k of ['titulo', 'tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos']) if (RE_EUROS.test(d[k] ?? '')) e.push(`descubrimientos[${i}].${k}: contiene un importe en euros (un descubrimiento es público)`);
      if (params.modo === 'seguimiento' && d.id && d.id !== params.anterior?.id) e.push(`descubrimientos[${i}].id: ${d.id} no es el descubrimiento revisado`);
      if (params.modo !== 'seguimiento' && d.id) e.push(`descubrimientos[${i}].id: solo se da en seguimiento`);
    });
    if (RE_EUROS.test(json.cambios ?? '')) e.push('cambios: contiene un importe en euros');
    if (params.modo === 'seguimiento' && json.descubrimientos.length > 1) e.push('en seguimiento se devuelve como mucho un descubrimiento (el revisado)');
    if (params.modo === 'seguimiento' && !json.descubrimientos.length && !json.sin_cambios) e.push('en seguimiento: devuelve la nueva versión o «sin_cambios»: true');
    return e;
  },
  /** params: {modo, desde?, hasta?, tema?, filtros?, clases?: [nombres], profundidad?, tarea?: {id, instrucciones}, anterior?: {id, titulo, version, fecha, texto}} */
  entrada(modelo, { modo = 'libre', desde = null, hasta = null, tema = '', filtros = [], clases = null, profundidad = 'normal', tarea = null, anterior = null, hoy }) {
    const p = PROFUNDIDAD[profundidad] ?? PROFUNDIDAD.normal;
    const lim = (n) => ({ notas: n, caracteres: 60000 });
    const desdeMundo = modo === 'seguimiento' && anterior?.fecha ? anterior.fecha : desde;
    const mundo = notasParaTrabajo(modelo, this, { hoy, soloFuentes: ['mundo'], desde: desdeMundo, hasta: hasta ?? hoy, limite: lim(modo === 'pulso' ? p.notas : Math.ceil(p.notas / 2)) });
    const resto = modo === 'pulso' ? { notas: [], usadas: 0, total: 0 } : notasParaTrabajo(modelo, this, { hoy, soloFuentes: ['base', 'datos'], limite: lim(Math.floor(p.notas / 2)) });
    const sel = { notas: [...mundo.notas, ...resto.notas], usadas: mundo.usadas + resto.usadas, total: mundo.total + resto.total };
    const previos = modelo.descubrimientos.filter((d) => d.id !== anterior?.id);
    const bloques = [...bloquesNotas(sel.notas, modelo), bloque('descubrimientos previos', 'publico', previos.map((d) => `${d.id} · ${d.titulo} (${d.estado ?? 'nuevo'})`).join('\n') || 'ninguno', { ids: previos.map((d) => d.id) })];
    if (anterior) bloques.push(bloque(`versión anterior de ${anterior.id} (${anterior.version} · ${anterior.fecha})`, 'publico', `${anterior.id} · ${anterior.titulo}\n${anterior.texto}`, { ids: [anterior.id] }));
    if (filtros?.length) bloques.push(bloque('filtros del usuario', 'publico', filtros.map((f) => String(f).slice(0, 60)).join(', ')));
    if (clases?.length) bloques.push(bloque('nombres de tus clases de activo', 'metadato', clases.join(', ')));
    const periodo = desdeMundo || hasta ? ` Periodo de las noticias: ${desdeMundo ?? 'el inicio'} → ${hasta ?? hoy}.` : '';
    const instr = tarea?.instrucciones || TAREA_DEFECTO[modo] || TAREA_DEFECTO.libre;
    const cierre =
      modo === 'seguimiento'
        ? ` Devuelve como mucho UN descubrimiento con «id»: «${anterior?.id}» y en «cambios» qué ha cambiado frente a la versión anterior. Si no hay nada nuevo relevante, devuelve «descubrimientos»: [] y «sin_cambios»: true.`
        : ` Propón como mucho ${modo === 'pulso' ? 3 : 2} descubrimientos, sin repetir los previos.`;
    return {
      tarea: `Modo: ${modo}.${periodo} ${instr} Consulta como mucho ${p.fuentes} fuentes web y pon sus URL en «citas».${cierre}${filtros?.length ? ' Respeta los filtros del usuario en los vehículos.' : ''}`,
      tareaId: tarea?.id ?? `descubrir-${modo}`,
      pregunta: tema ? String(tema).slice(0, 2000) : null,
      bloques,
      seleccion: sel,
      maxTurns: p.maxTurns,
      timeoutMs: p.timeoutMs ?? this.timeoutMs,
    };
  },
};
