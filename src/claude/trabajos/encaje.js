// Encaje (§0.2): variante de privado; informe del descubrimiento ya validado + tu cartera y cifras del
// simulador y de la exposición, calculadas por código. SIN internet. Escribe en analisis/encajes/ (privado),
// nunca junto al descubrimiento.
import { O, L, T, eur, pct } from './comun.js';
import { bloque } from '../contexto.js';
import { estadoCartera, exposicion } from '../../core/cartera.js';
import { simular } from '../../core/descubrimientos.js';

const pp = (x) => (x === null || x === undefined ? 'no concluyente' : `${x >= 0 ? '+' : ''}${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const ter = (pb) => (pb === null || pb === undefined ? 'no concluyente' : `${(pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);

/** Texto del informe (última versión) para el prompt: campos del descubrimiento público. */
export function textoInforme(d) {
  const v = d.versiones[0];
  if (!v) return '(sin versiones)';
  const c = v.campos;
  return [`${d.id} · ${d.titulo} (${v.id} · ${v.titulo})`, `tipo: ${d.tipo ?? '—'} · postura: ${d.postura ?? '—'} · confianza: ${d.confianza ?? '—'}`, ...['tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos', 'vehiculos', 'afirmaciones'].filter((k) => c[k]).map((k) => `${k}: ${c[k]}`)].join('\n');
}

export default {
  id: 'encaje',
  nombre: 'Encaje con tu cartera',
  internet: false,
  privado: true,
  externo: true,
  herramientas: [],
  cifrasEstrictas: true, // §8.3: cifras solo de <cifras>, no del informe (externo) ni de la cartera
  modelo: 'opus',
  timeoutMs: 120000,
  maxTurns: 2,
  recibe: 'informe validado + tu cartera + cifras del simulador',
  escribe: ['analisis/encajes/'],
  rol: 'Explicas cómo encaja un descubrimiento (informe público ya validado) con la cartera del usuario: qué tiene ya expuesto, el solapamiento y qué supondría, solo con las cifras calculadas por el código. Es información, no recomendación.',
  esquema: O({ ya_tienes: T('texto', { max: 1200 }), solapamiento: T('texto', { max: 1200 }), comentario_md: T('texto', { min: 10, max: 6000 }), citas: L(T('texto', { max: 300 }), { max: 20 }), cifras_usadas: L(T('texto', { max: 120 }), { max: 30 }) }),
  /** params: {descubrimiento, pct?, de? (los del simulador), tarea?: {id, instrucciones}} */
  entrada(modelo, { descubrimiento, pct: porcentaje = 5, de = 'todo', tarea = null, hoy }) {
    const d = modelo.descubrimientos.find((x) => x.id === descubrimiento);
    const e = estadoCartera({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: hoy });
    const cifras = [{ nombre: 'valor de la cartera', valor: eur(e.valor) }];
    for (const dim of ['region', 'sector']) for (const f of exposicion(e.porActivo, modelo.activos, dim).filas.slice(0, 8)) cifras.push({ nombre: `exposición ${dim === 'region' ? 'región' : 'sector'} ${f.nombre}`, valor: pct(f.pb) });
    const s = d ? simular(modelo, hoy, d, { pct: porcentaje, de }) : { error: 'sin descubrimiento' };
    if (!s.error) {
      cifras.push({ nombre: `simulador: peso dedicado (${de === 'todo' ? 'sacado de todo en proporción' : de === 'aportaciones' ? 'solo nuevas aportaciones' : `sacado de ${de.slice(7)}`})`, valor: pct(s.pesoPb) }, { nombre: 'simulador: importe equivalente', valor: eur(s.valorNuevo) });
      for (const c of s.clases) cifras.push({ nombre: `simulador: clase ${c.nombre}`, valor: `${pct(c.antesPb)} → ${pct(c.despuesPb)}` });
      cifras.push({ nombre: 'simulador: TER medio', valor: `${ter(s.ter.antes)} → ${ter(s.ter.despues)}` });
      for (const c of s.crisis) cifras.push({ nombre: `simulador: caída en ${c.nombre}`, valor: `${c.antesPb === null ? 'sin datos' : pct(c.antesPb)} → ${c.despuesPb === null ? 'sin datos' : pct(c.despuesPb)}` });
      cifras.push({ nombre: 'simulador: el último año', valor: `${pp(s.ultimoAnio.antes)} → ${pp(s.ultimoAnio.despues)}` });
    }
    for (const p of e.porActivo.values()) cifras.push({ nombre: `posición ${p.nombre}`, valor: eur(p.valor) });
    const posiciones = [...e.porActivo.values()].map((p) => `${p.nombre} (${modelo.clases.find((c) => c.id === p.clase)?.nombre ?? 'sin clase'}): ${eur(p.valor)}`).join('\n');
    return {
      tarea: tarea?.instrucciones || 'Explica cómo encaja el descubrimiento con la cartera: qué tiene ya expuesto (ya_tienes), el solapamiento con lo que ya tiene y qué supondría según el simulador, usando solo las cifras dadas. Es información para decidir con calma, no una recomendación.',
      tareaId: 'encaje',
      cifras,
      bloques: [bloque(`informe ${descubrimiento}`, 'externo', d ? textoInforme(d) : '(sin informe)', { ids: d ? [d.id] : [] }), bloque('tu cartera', 'privado', posiciones || '(vacía)')],
      simulacion: s.error ? null : s,
    };
  },
};
