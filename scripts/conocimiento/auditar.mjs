#!/usr/bin/env node
// Auditor PROVISIONAL de coherencia entre notas (maestro §8.4). Manda el del repo (`pnpm conocimiento:auditar`).
//
// Qué hace, leyendo SOLO las notas (no las fuentes):
//   1. Series: decisiones del BCE y de la Fed («del X % al Y %», «de X % a Y %»), Euríbor a 12 meses, IPC de España
//      y EUR/USD, con la fecha de cada nota. Comprueba que cada decisión parte del tipo anterior, que no hay saltos
//      imposibles y que un mismo periodo no tiene dos cifras.
//   2. Conceptos vigilados (límites fiscales, FGD…): el mismo concepto con cifras distintas va a revisión.
//   3. Mundo frente a la historia anual de la Base: mismo año y misma serie, misma cifra.
// Es heurístico (expresiones regulares sobre el texto): lo que no reconoce no lo audita, y lo dice en «cobertura».
//
// Uso: node scripts/conocimiento/auditar.mjs [--json <salida.json>]  · código 1 si hay algo que revisar.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { leerSemilla } from './validar.mjs';
import { normalizar } from '../../src/core/ids.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const PCT = String.raw`(-?\d{1,2}(?:,\d{1,3})?)\s?%`;

/** Saltos máximos creíbles entre dos observaciones consecutivas (en puntos o en proporción). */
export const LIMITES = {
  decision: 1.0, // la mayor decisión en 2000–2026 fue de 100 pb (Fed, marzo de 2020)
  euribor_mes: 0.75, // puntos de un mes al siguiente
  ipc_mes: 3.0,
  eurusd_mes: 0.1, // proporción
};

/** Conceptos que deben tener una sola cifra en toda la semilla (por año de `verificar`). */
export const VIGILADOS = [
  { id: 'fgd-limite', re: /\bFGD\b|Fondo de Garant[ií]a de Dep[oó]sitos/i, cifra: /(\d{2,3}\.000)\s?(€|euros)/ },
  { id: 'pp-limite-individual', re: /planes? de pensiones/i, contexto: /aportaci[oó]n|l[ií]mite/i, cifra: /(1\.500)\s?(€|euros)|(\d\.\d{3})\s?(€|euros)\s+(al|por)\s+a[nñ]o/ },
  { id: 'ahorro-tramos', re: /base (liquidable )?del ahorro/i, cifra: /(\d{1,2})\s?%/g, varias: true },
  { id: 'compensacion-25', re: /compensa/i, contexto: /base general|rendimientos|ganancias/i, cifra: /(\d{1,2})\s?%/ },
  { id: 'regla-dos-meses', re: /dos meses|2 meses/i, contexto: /recompra|homog[eé]ne|p[eé]rdida/i, cifra: /(dos|2)\s+meses/ },
];

/** Observaciones de series en una nota. → [{serie, periodo, desde?, valor, nota, fecha}] */
export function observaciones(n) {
  const t = `${n.titulo}. ${n.cuerpo}`;
  const temas = n.campos.temas ?? [];
  const fecha = n.campos.fecha ?? null;
  const out = [];
  const plano = normalizar(t);
  const quien = temas.includes('fed') || /\b(fed|reserva federal)\b/.test(plano) ? 'fed' : temas.includes('bce') || /\b(bce|banco central europeo)\b/.test(plano) ? 'bce' : null;
  if (quien && fecha) {
    const re = new RegExp(String.raw`\bde(?:l)?\s+${PCT}\s+(?:a|al|hasta(?:\s+el)?)\s+${PCT}`, 'gi');
    for (const m of t.matchAll(re)) out.push({ serie: `tipos-${quien}`, periodo: fecha, desde: num(m[1]), valor: num(m[2]), nota: n.id, fecha });
  }
  if (/eur[ií]bor/i.test(t)) {
    const re = new RegExp(String.raw`eur[ií]bor(?:\s+a\s+(?:12|doce)\s+meses)?[^.%]{0,60}?${PCT}`, 'gi');
    for (const m of t.matchAll(re)) if (fecha) out.push({ serie: 'euribor-12m', periodo: fecha.slice(0, 7), valor: num(m[1]), nota: n.id, fecha });
  }
  if (/\bIPC\b/.test(t) && /Espa[nñ]a|INE/.test(t)) {
    const re = new RegExp(String.raw`\bIPC\b[^.%]{0,60}?${PCT}`, 'g');
    for (const m of t.matchAll(re)) if (fecha) out.push({ serie: 'ipc-espana', periodo: fecha.slice(0, 7), valor: num(m[1]), nota: n.id, fecha });
  }
  for (const m of t.matchAll(/\b(1[,.]\d{2,4})\s*d[oó]lares\s+(?:por\s+euro|el\s+euro)|EUR\/USD[^.]{0,30}?\b(1[,.]\d{2,4})\b/gi)) if (fecha) out.push({ serie: 'eurusd', periodo: fecha.slice(0, 7), valor: num(m[1] ?? m[2]), nota: n.id, fecha });
  return out;
}

export function auditar({ raiz = RAIZ } = {}) {
  const notas = leerSemilla(raiz).flatMap((f) => f.notas.map((n) => ({ ...n, ruta: `semilla/${f.carpeta}/${f.fichero}` })));
  const revisar = [];
  const obs = notas.flatMap(observaciones);
  const porSerie = {};
  for (const o of obs) (porSerie[o.serie] ??= []).push(o);
  for (const [serie, lista] of Object.entries(porSerie)) {
    lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    if (serie.startsWith('tipos-')) {
      // cada decisión parte del tipo anterior; mismo día, misma decisión
      const decisiones = lista.filter((o) => o.desde !== undefined);
      for (let i = 0; i < decisiones.length; i++) {
        const d = decisiones[i];
        if (Math.abs(d.valor - d.desde) > LIMITES.decision + 1e-9) revisar.push({ regla: 'serie.salto', serie, notas: [d.nota], detalle: `decisión de ${d.desde} % a ${d.valor} %: más de ${LIMITES.decision} puntos` });
        const ant = decisiones[i - 1];
        if (ant && ant.fecha === d.fecha && (ant.valor !== d.valor || ant.desde !== d.desde)) revisar.push({ regla: 'serie.contradiccion', serie, notas: [ant.nota, d.nota], detalle: `el ${d.fecha}: ${ant.desde}→${ant.valor} frente a ${d.desde}→${d.valor}` });
        else if (ant && ant.fecha !== d.fecha && Math.abs(ant.valor - d.desde) > 1e-9) revisar.push({ regla: 'serie.hueco', serie, notas: [ant.nota, d.nota], detalle: `tras ${ant.fecha} el tipo quedó en ${ant.valor} %, y la decisión del ${d.fecha} parte de ${d.desde} % (¿falta una decisión o hay un error?)` });
      }
      continue;
    }
    // series mensuales: un valor por mes; saltos creíbles entre meses consecutivos
    const porMes = {};
    for (const o of lista) (porMes[o.periodo] ??= []).push(o);
    const meses = Object.keys(porMes).sort();
    for (const m of meses) {
      const vals = [...new Set(porMes[m].map((o) => o.valor))];
      if (vals.length > 1) revisar.push({ regla: 'serie.contradiccion', serie, notas: porMes[m].map((o) => o.nota), detalle: `${m}: cifras distintas ${vals.join(' / ')}` });
    }
    for (let i = 1; i < meses.length; i++) {
      const [a, b] = [meses[i - 1], meses[i]];
      const consecutivos = (+b.slice(0, 4) * 12 + +b.slice(5)) - (+a.slice(0, 4) * 12 + +a.slice(5)) === 1;
      if (!consecutivos) continue;
      const va = porMes[a][0].valor;
      const vb = porMes[b][0].valor;
      const lim = serie === 'eurusd' ? Math.abs(vb / va - 1) > LIMITES.eurusd_mes : Math.abs(vb - va) > (serie === 'ipc-espana' ? LIMITES.ipc_mes : LIMITES.euribor_mes);
      if (lim) revisar.push({ regla: 'serie.salto', serie, notas: [porMes[a][0].nota, porMes[b][0].nota], detalle: `${a} ${va} → ${b} ${vb}: salto poco creíble` });
    }
  }
  // conceptos vigilados
  const conceptos = {};
  for (const n of notas) {
    const t = `${n.titulo}. ${n.cuerpo}`;
    for (const v of VIGILADOS) {
      if (!v.re.test(t) || (v.contexto && !v.contexto.test(t))) continue;
      // los límites fiscales solo se comparan entre notas de normativa (con «verificar»)
      if (v.id !== 'fgd-limite' && n.campos.verificar === undefined) continue;
      const clave = `${v.id}@${n.campos.verificar ?? n.campos.fecha?.slice(0, 4) ?? '¿año?'}`;
      const cifras = v.varias ? [...t.matchAll(v.cifra)].map((m) => m[1]).sort().join('|') : (v.cifra.exec(t)?.slice(1).find(Boolean) ?? null);
      if (!cifras) continue;
      (conceptos[clave] ??= []).push({ nota: n.id, cifras });
    }
  }
  for (const [clave, lista] of Object.entries(conceptos)) {
    const distintas = [...new Set(lista.map((x) => x.cifras))];
    if (distintas.length > 1 && !clave.startsWith('ahorro-tramos')) revisar.push({ regla: 'concepto.cifras', serie: clave, notas: lista.map((x) => x.nota), detalle: `cifras distintas: ${distintas.join(' / ')}` });
  }
  // Mundo frente a la historia anual: mismo año, misma serie
  const historia = obs.filter((o) => /^B-4\d{4}$/.test(o.nota));
  const resumenesAnuales = obs.filter((o) => {
    const n = notas.find((x) => x.id === o.nota);
    return n?.carpeta === 'mundo' && (n.campos.temas ?? []).includes('resumen-anual');
  });
  for (const h of historia)
    for (const m of resumenesAnuales)
      if (h.serie === m.serie && h.fecha.slice(0, 4) === m.fecha.slice(0, 4) && h.valor !== m.valor) revisar.push({ regla: 'mundo-historia', serie: h.serie, notas: [h.nota, m.nota], detalle: `${h.fecha.slice(0, 4)}: Base ${h.valor} frente a Mundo ${m.valor}` });

  return {
    revisar,
    cobertura: {
      notas: notas.length,
      observaciones: Object.fromEntries(Object.entries(porSerie).map(([k, v]) => [k, v.length])),
      conceptos: Object.fromEntries(Object.entries(conceptos).map(([k, v]) => [k, v.length])),
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const r = auditar();
  const i = args.indexOf('--json');
  if (i >= 0) {
    const destino = resolve(RAIZ, args[i + 1]);
    if (!(destino.startsWith(join(RAIZ, '.cache') + '/') || destino.startsWith('/tmp/'))) {
      process.stderr.write('--json solo escribe en .cache/ o /tmp/\n');
      process.exit(2);
    }
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, JSON.stringify(r, null, 1));
  }
  console.log(`Auditor provisional · ${r.cobertura.notas} notas · ${r.revisar.length} a revisar`);
  console.log(`  series reconocidas: ${JSON.stringify(r.cobertura.observaciones)}`);
  console.log(`  conceptos vigilados: ${JSON.stringify(r.cobertura.conceptos)}`);
  for (const x of r.revisar) console.log(`  ✗ ${x.regla} · ${x.serie} · ${x.notas.join(', ')} · ${x.detalle}`);
  process.exit(r.revisar.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
