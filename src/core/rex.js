// La guarida de Rex (§5 Rex): humor según la tasa de ahorro (`rex_humor`), hucha según el progreso medio de
// tus metas y accesorios que se desbloquean con las reglas de `accesorios`. Todo por código. Isomórfico.
import { mesFinanciero, sumarMesesMes } from './fechas.js';
import { totales } from './mes.js';
import { tasaAgregada } from './panel.js';
import { progresoMetas, consumo12 } from './metas.js';
import { estadoCartera } from './cartera.js';
import { parsePorcentaje } from './dinero.js';

export const ACCESORIOS = { gafas: ['👓', 'gafas'], corbata: ['👔', 'corbata'], japon: ['🎌', 'Japón'], corona: ['👑', 'corona'] };

/** "contento>=30 | tranquilo>=15 | preocupado<15" → [{humor, op, pb}] o {error}. Se evalúan en orden. */
export function parseHumor(texto) {
  const reglas = [];
  for (const parte of String(texto ?? '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([a-záéíóú]+)\s*(>=|<=|>|<)\s*(-?[\d.,]+)\s*%?$/i.exec(parte);
    const n = m ? parsePorcentaje(m[3]) : null;
    if (!m || !n.ok) return { error: `«${parte}» debe ser «humor>=N» o «humor<N»` };
    reglas.push({ humor: m[1].toLowerCase(), op: m[2], pb: n.valor });
  }
  if (!reglas.length) return { error: 'sin reglas' };
  return reglas;
}

const cumple = (v, op, u) => (op === '>=' ? v >= u : op === '>' ? v > u : op === '<=' ? v <= u : v < u);

/** Tasa del mes financiero actual (o del anterior, si este aún no tiene entradas). → pb | null */
export function tasaReciente(modelo, hoy) {
  const actual = mesFinanciero(hoy, modelo.ajustes.mes_inicio_dia);
  for (const m of [actual, sumarMesesMes(actual, -1)]) {
    const d = modelo.mes(m);
    if (!d) continue;
    const t = tasaAgregada([totales(d.movimientos, modelo.grupos)]);
    if (t !== null) return t;
  }
  return null;
}

/** → {humor, tasaPb, regla} · sin datos: «tranquilo». */
export function humorRex(modelo, hoy) {
  const tasaPb = tasaReciente(modelo, hoy);
  const reglas = parseHumor(modelo.ajustes.rex_humor);
  if (tasaPb === null) return { humor: 'tranquilo', tasaPb, regla: null };
  const lista = reglas.error ? parseHumor('contento>=30 | tranquilo>=15 | preocupado<15') : reglas;
  const r = lista.find((x) => cumple(tasaPb, x.op, x.pb));
  return { humor: r ? r.humor : 'tranquilo', tasaPb, regla: r ?? null };
}

/** Hucha: progreso medio (0–10000 pb) de las metas activas y cumplidas (cada una, como mucho 100 %). */
export function huchaRex(modelo, hoy) {
  const ms = progresoMetas(modelo, hoy).filter((m) => ['activa', 'cumplida'].includes(m.estado) && m.objetivo > 0);
  if (!ms.length) return null;
  return Math.round(ms.reduce((a, m) => a + Math.min(10000, m.estado === 'cumplida' ? 10000 : m.pb ?? 0), 0) / ms.length);
}

/**
 * "gafas:mes-tasa>=30 | corbata:meta(colchon)=100 | japon:meta(japon)=100 | corona:libertad" → [{id, regla, tipo, …}] o {error}.
 * Reglas: mes-tasa>=N (algún mes con esa tasa de ahorro) · meta(id)=N o >=N (progreso de esa meta) · libertad
 * (tu cartera ya cubre consumo de 12 meses × libertad_multiplicador).
 */
export function parseAccesorios(texto) {
  const out = [];
  for (const parte of String(texto ?? '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([a-z0-9-]+)\s*:\s*(.+)$/.exec(parte);
    if (!m) return { error: `«${parte}» debe ser «accesorio:regla»` };
    const [, id, regla] = m;
    let r;
    if ((r = /^mes-tasa\s*>=\s*([\d.,]+)$/.exec(regla))) {
      const n = parsePorcentaje(r[1]);
      if (!n.ok) return { error: `«${parte}»: porcentaje no válido` };
      out.push({ id, regla, tipo: 'mes-tasa', pb: n.valor });
    } else if ((r = /^meta\(([a-z0-9-]+)\)\s*(?:=|>=)\s*([\d.,]+)$/.exec(regla))) {
      const n = parsePorcentaje(r[2]);
      if (!n.ok) return { error: `«${parte}»: porcentaje no válido` };
      out.push({ id, regla, tipo: 'meta', meta: r[1], pb: n.valor });
    } else if (regla === 'libertad') out.push({ id, regla, tipo: 'libertad' });
    else return { error: `«${parte}»: regla desconocida (mes-tasa>=N, meta(id)=N o libertad)` };
  }
  return out;
}

const describir = (a, modelo) => (a.tipo === 'mes-tasa' ? `un mes con ${a.pb / 100} % de ahorro o más` : a.tipo === 'meta' ? `meta «${modelo.metas.find((m) => m.id === a.meta)?.titulo ?? a.meta}» al ${a.pb / 100} %` : 'libertad financiera');

/** → {lista: [{id, emoji, nombre, regla, que, logrado}], error?} */
export function accesoriosRex(modelo, hoy) {
  const reglas = parseAccesorios(modelo.ajustes.accesorios);
  if (reglas.error) return { lista: [], error: reglas.error };
  let tasas = null;
  let metas = null;
  const lista = reglas.map((a) => {
    let logrado = false;
    if (a.tipo === 'mes-tasa') {
      tasas ??= modelo.meses.map((m) => tasaAgregada([totales(modelo.mes(m).movimientos, modelo.grupos)]));
      logrado = tasas.some((t) => t !== null && t >= a.pb);
    } else if (a.tipo === 'meta') {
      metas ??= progresoMetas(modelo, hoy);
      const p = metas.find((m) => m.id === a.meta);
      logrado = !!p && (p.estado === 'cumplida' || (p.pb ?? 0) >= a.pb);
    } else {
      const c = consumo12(modelo, hoy).consumo;
      const v = estadoCartera({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: hoy }).valor;
      logrado = !!c && v >= c * (modelo.ajustes.libertad_multiplicador ?? 25);
    }
    const [emoji, nombre] = ACCESORIOS[a.id] ?? ['✨', a.id];
    return { id: a.id, emoji, nombre, regla: a.regla, que: describir(a, modelo), logrado };
  });
  return { lista };
}
