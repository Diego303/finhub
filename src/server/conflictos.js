// Conflictos de sincronización (§2.6, §9.23, §14.17): diferencias por entidad entre tu fichero y la copia en
// conflicto que dejó el servicio de sincronización, y fusión por entidades. Nada se pierde: lo descartado va
// a la papelera como «copia en conflicto» (al restaurarla vuelve a aparecer el conflicto).
import { leer } from '../core/formato/index.js';
import { serializar } from '../core/formato/motor.js';

/** Texto → secciones [{cab: '## …' | null, lineas}] (la 0 es el título y el preámbulo). */
export function secciones(texto) {
  const out = [];
  let cur = { cab: null, lineas: [] };
  for (const l of String(texto).replace(/\r\n/g, '\n').split('\n')) {
    if (l.startsWith('## ')) {
      out.push(cur);
      cur = { cab: l, lineas: [] };
    } else cur.lineas.push(l);
  }
  out.push(cur);
  return out;
}

const RE_CLAVE = /^(?:- )?([a-záéíóúñ_]+):\s/i;
const util = (l) => l.trim() !== '';

/**
 * Diferencias por sección (entidad): líneas que solo están en tu versión y solo en la otra.
 * → [{seccion, soloTuya: [líneas], soloOtra: [líneas]}] (solo las secciones que difieren)
 */
export function diferencias(tuya, otra) {
  const a = secciones(tuya);
  const b = secciones(otra);
  const cabs = [...new Set([...a, ...b].map((s) => s.cab))];
  const out = [];
  for (const cab of cabs) {
    const la = a.find((s) => s.cab === cab)?.lineas.filter(util) ?? null;
    const lb = b.find((s) => s.cab === cab)?.lineas.filter(util) ?? null;
    const soloTuya = la ? (lb ? la.filter((l) => !lb.includes(l)) : la) : [];
    const soloOtra = lb ? (la ? lb.filter((l) => !la.includes(l)) : lb) : [];
    const nombre = cab ? cab.slice(3) : 'cabecera';
    if (!la) out.push({ seccion: nombre, soloTuya: [], soloOtra: [cab, ...soloOtra] });
    else if (!lb) out.push({ seccion: nombre, soloTuya: [cab, ...soloTuya], soloOtra: [] });
    else if (soloTuya.length || soloOtra.length) out.push({ seccion: nombre, soloTuya, soloOtra });
  }
  return out;
}

/**
 * Fusión por entidades: a tu versión se le añaden las líneas (entidades) que solo están en la otra, cada una
 * en su sección; las secciones que solo están en la otra se añaden enteras. Si una clave («tesis: …»,
 * «estado: …») tiene valores distintos, se queda el tuyo y se avisa. → {texto, ignoradas: [líneas], avisos}
 * Lanza un error si el resultado no es un fichero válido (entonces: a mano).
 */
export function fusionar(ruta, tuya, otra) {
  const a = secciones(tuya);
  const ignoradas = [];
  for (const sb of secciones(otra)) {
    const sa = a.find((s) => s.cab === sb.cab);
    if (!sa) {
      if (sb.cab) a.push({ cab: sb.cab, lineas: [...sb.lineas] });
      continue;
    }
    const claves = new Set(sa.lineas.map((l) => RE_CLAVE.exec(l)?.[1]).filter(Boolean));
    const nuevas = [];
    for (const l of sb.lineas.filter(util)) {
      if (sa.lineas.includes(l) || l.startsWith('# ')) continue;
      const k = RE_CLAVE.exec(l)?.[1];
      if (k && claves.has(k)) {
        ignoradas.push(l);
        continue;
      }
      nuevas.push(l);
    }
    if (!nuevas.length) continue;
    let fin = sa.lineas.length;
    while (fin > 0 && !util(sa.lineas[fin - 1])) fin--;
    sa.lineas.splice(fin, 0, ...nuevas);
  }
  const texto = a.map((s) => [s.cab, ...s.lineas].filter((x) => x !== null).join('\n')).join('\n');
  const doc = leer(ruta, texto);
  if (!doc) throw new Error(`«${ruta}» no es un fichero de datos de finhub`);
  const errores = doc.avisos.filter((x) => x.nivel === 'error');
  const dobles = doc.avisos.filter((x) => /repetid|duplicad/i.test(x.mensaje));
  if (errores.length || dobles.length) throw new Error(`la fusión no da un fichero válido (${[...errores, ...dobles].slice(0, 3).map((x) => `línea ${x.linea}: ${x.mensaje}`).join(' · ')}): resuélvelo a mano`);
  return { texto: serializar(doc), ignoradas, avisos: doc.avisos.map((x) => x.mensaje) };
}

/** Nombre para guardar una versión descartada como copia en conflicto (la detecta el almacén). */
export const nombreDescartada = (base, fecha, que) => base.replace(/\.md$/, ` (copia en conflicto · ${que} ${fecha}).md`);
