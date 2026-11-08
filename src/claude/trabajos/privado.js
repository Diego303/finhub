// Privado (§0.2): tus datos + notas de la mezcla + cifras calculadas; SIN internet ni herramientas.
// Análisis (con tarea y rol), Rex «Mis finanzas», Explícame, Pausa 48 h, Tu año y revisión de la cartera base.
import { CHAT, eur, pct } from './comun.js';
import { bloque, notasParaTrabajo, bloquesNotas } from '../contexto.js';
import { esquemaDe } from '../tareas.js';
import { kpisPanel, flujoDelMes } from '../../core/panel.js';
import { progresoMetas } from '../../core/metas.js';
import { resumenCartera } from '../../core/cartera-resumen.js';
import { totales, mediaCerrados } from '../../core/mes.js';
import { mesFinanciero } from '../../core/fechas.js';
import { proporcionPb } from '../../core/dinero.js';

/** Lo que las tareas de análisis necesitan de tu cartera, calculado por código. Solo para trabajos privados. */
function contextoCartera(modelo, hoy) {
  const r = resumenCartera(modelo, hoy);
  const e = r.estado;
  const cifras = [{ nombre: 'plusvalía de la cartera', valor: eur(e.plusvalia) }, { nombre: 'impuesto si vendieras hoy (estimación)', valor: eur(r.impuesto) }];
  if (r.terMedio !== null && r.terMedio !== undefined) cifras.push({ nombre: 'TER medio de la cartera', valor: pct(r.terMedio) });
  const lineas = [];
  for (const p of e.porActivo.values()) {
    const peso = e.valor > 0 ? proporcionPb(p.valor, e.valor) : 0;
    cifras.push({ nombre: `posición ${p.nombre}`, valor: eur(p.valor) }, { nombre: `peso de ${p.nombre}`, valor: pct(peso) }, { nombre: `plusvalía de ${p.nombre}`, valor: eur(p.plusvalia) });
    const clase = modelo.clases.find((c) => c.id === p.clase)?.nombre ?? 'sin clase';
    lineas.push(`${p.nombre}: ${clase}${p.isin ? ` · ISIN ${p.isin}` : ''}${p.ter !== null && p.ter !== undefined ? ` · TER ${pct(p.ter)}` : ''}${p.valorado ? '' : ' · sin valorar: se cuenta por lo aportado'}`);
  }
  for (const c of r.clases) cifras.push({ nombre: `clase ${c.nombre} frente al objetivo`, valor: `${pct(c.actualPb)} (objetivo ${pct(c.objetivoPb)})` });
  if (r.reparto.filas) {
    const nombre = (id) => modelo.activos.find((a) => a.id === id)?.titulo ?? id;
    for (const f of r.reparto.filas) cifras.push({ nombre: `reparto de la aportación de ${eur(r.reparto.aportacion)}: ${nombre(f.id)}`, valor: eur(f.importe) });
  }
  return { cifras, contenido: lineas.join('\n') || 'aún no hay posiciones en la cartera' };
}

/** Gastos del mes por grupo y su media de los últimos cerrados; recurrentes y suscripciones. */
function contextoGastos(modelo, hoy) {
  const mes = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  const delMes = modelo.meses.includes(mes) ? totales(modelo.mes(mes).movimientos, modelo.grupos) : null;
  const media = mediaCerrados(modelo.meses.map((m) => ({ mes: m, estado: modelo.mes(m).estado.estado, totales: totales(modelo.mes(m).movimientos, modelo.grupos) })), mes);
  const cifras = [];
  for (const g of modelo.grupos.filter((x) => x.naturaleza === 'consumo')) {
    const gastado = delMes?.porGrupo.get(g.id)?.consumo ?? 0;
    const medio = media?.porGrupo.get(g.id) ?? 0;
    if (gastado) cifras.push({ nombre: `gasto en ${g.nombre} este mes`, valor: eur(gastado) });
    if (medio) cifras.push({ nombre: `media de ${g.nombre} en 6 meses cerrados`, valor: eur(medio) });
  }
  const recurrentes = modelo.recurrentes.map((r) => `${r.concepto}: ${eur(r.importe)} (cada ${r.cada})${r.pausado ? ' · en pausa' : ''}${r.etiquetas?.includes('suscripción') ? ' · suscripción' : ''}${r.uso?.estado === 'no' ? ' · dices que no la usas' : ''}`);
  return { cifras, contenido: recurrentes.join('\n') || 'sin recurrentes' };
}

export default {
  id: 'privado',
  nombre: 'Análisis y Rex «Mis finanzas»',
  internet: false,
  privado: true,
  externo: true,
  herramientas: [],
  modelo: 'opus',
  timeoutMs: 120000,
  maxTurns: 2,
  sesion: true, // los chats de Rex se reanudan (solo con el mismo trabajo)
  recibe: 'tus datos + tu base + cifras calculadas',
  escribe: ['analisis/', 'chat/privado/', 'decisiones/', 'tu-ano/'],
  rol: 'Eres Rex, el asistente de finanzas personales de finhub. Explicas las finanzas del usuario con sus números (los de <cifras>) y su base de conocimiento, con calma, sin jerga y sin recomendar comprar o vender nada concreto.',
  esquema: CHAT,
  /**
   * params: {pregunta, tarea?: {id, instrucciones, esquema}, rol?: {texto}, fuentes?, temas?, cifrasExtra?, bloquesExtra?}
   */
  entrada(modelo, { pregunta = null, tarea = null, rol = null, fuentes = null, temas = [], cifrasExtra = [], bloquesExtra = [], hoy }) {
    const k = kpisPanel(modelo, hoy);
    const f = flujoDelMes(modelo, hoy);
    const cartera = contextoCartera(modelo, hoy);
    const gastos = contextoGastos(modelo, hoy);
    const cifras = [
      { nombre: 'patrimonio neto', valor: eur(k.patrimonio.valor) },
      { nombre: 'valor de la cartera', valor: eur(k.patrimonio.cartera) },
      { nombre: 'colchón', valor: eur(k.colchon.total) },
      { nombre: 'tasa de ahorro del mes', valor: pct(k.tasa.mesPb) },
      { nombre: 'tasa de ahorro media', valor: pct(k.tasa.media12Pb) },
      { nombre: 'rentabilidad TWR 12 meses', valor: k.cartera ? `${(k.cartera.twr * 100).toFixed(1).replace('.', ',')} %` : 'sin datos' },
      { nombre: 'entradas del mes', valor: eur(f.entradas) },
      ...f.partes.map((p) => ({ nombre: `${p.nombre.toLowerCase()} del mes`, valor: eur(p.valor) })),
      ...cartera.cifras,
      ...gastos.cifras,
      ...cifrasExtra,
    ];
    const metas = progresoMetas(modelo, hoy).filter((x) => x.estado === 'activa').map((x) => `${x.titulo}: ${eur(x.llevas)} de ${eur(x.objetivo)}${x.fechaEstimada ? `, llegaría en ${x.fechaEstimada.slice(0, 7)}` : ''}`);
    const sel = notasParaTrabajo(modelo, this, { temas, hoy, fuentes });
    return {
      tarea: tarea?.instrucciones || 'Responde a la pregunta del usuario sobre sus finanzas con sus cifras y sus notas.',
      tareaId: tarea?.id ?? null,
      rol: rol?.texto ?? null,
      esquema: esquemaDe(tarea?.esquema ?? 'chat', this),
      cifras,
      bloques: [bloque('tus metas', 'privado', metas.join('\n') || 'sin metas activas'), bloque('tu cartera', 'privado', cartera.contenido), bloque('tus recurrentes', 'privado', gastos.contenido), ...bloquesExtra, ...bloquesNotas(sel.notas, modelo)],
      pregunta,
      seleccion: sel,
    };
  },
};
