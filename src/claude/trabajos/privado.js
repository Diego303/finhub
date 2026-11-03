// Privado (§0.2): tus datos + notas de la mezcla + cifras calculadas; SIN internet ni herramientas.
// Análisis, Rex «Mis finanzas», Explícame, Pausa 48 h, Tu año y revisión de la cartera base.
import { CHAT, eur, pct } from './comun.js';
import { bloque, notasParaTrabajo, bloquesNotas } from '../contexto.js';
import { kpisPanel, flujoDelMes } from '../../core/panel.js';
import { progresoMetas } from '../../core/metas.js';

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
  escribe: ['analisis/', 'chat/privado/', 'decisiones/'],
  rol: 'Eres Rex, el asistente de finanzas personales de finhub. Explicas las finanzas del usuario con sus números (los de <cifras>) y su base de conocimiento, con calma, sin jerga y sin recomendar comprar o vender nada concreto.',
  esquema: CHAT,
  entrada(modelo, { pregunta, temas = [], hoy }) {
    const k = kpisPanel(modelo, hoy);
    const f = flujoDelMes(modelo, hoy);
    const cifras = [
      { nombre: 'patrimonio neto', valor: eur(k.patrimonio.valor) },
      { nombre: 'valor de la cartera', valor: eur(k.patrimonio.cartera) },
      { nombre: 'colchón', valor: eur(k.colchon.total) },
      { nombre: 'tasa de ahorro del mes', valor: pct(k.tasa.mesPb) },
      { nombre: 'tasa de ahorro media', valor: pct(k.tasa.media12Pb) },
      { nombre: 'rentabilidad TWR 12 meses', valor: k.cartera ? `${(k.cartera.twr * 100).toFixed(1).replace('.', ',')} %` : 'sin datos' },
      { nombre: 'entradas del mes', valor: eur(f.entradas) },
      ...f.partes.map((p) => ({ nombre: `${p.nombre.toLowerCase()} del mes`, valor: eur(p.valor) })),
    ];
    const metas = progresoMetas(modelo, hoy).filter((x) => x.estado === 'activa').map((x) => `${x.titulo}: ${eur(x.llevas)} de ${eur(x.objetivo)}${x.fechaEstimada ? `, llegaría en ${x.fechaEstimada.slice(0, 7)}` : ''}`);
    const sel = notasParaTrabajo(modelo, this, { temas, hoy });
    return { tarea: 'Responde a la pregunta del usuario sobre sus finanzas con sus cifras y sus notas.', cifras, bloques: [bloque('tus metas', 'privado', metas.join('\n') || 'sin metas activas'), ...bloquesNotas(sel.notas, modelo)], pregunta, seleccion: sel };
  },
};
