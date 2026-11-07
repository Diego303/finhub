// Pestaña Herramientas (§4.5, §4.6, §5; maqueta: tools()): las 7 herramientas en una lista lateral y un panel.
// Todo lo calcula /core/herramientas.js con tus datos y el grupo «Datos». Sin IA. «Guardar como escenario»
// lo deja en el diario de decisiones; «crear meta», en metas.md.
import { html } from '../esc.js';
import { accion, cambio, formulario } from '../acciones.js';
import { op } from '../api.js';
import { toast } from '../componentes/toast.js';
import { graficoLineas } from '../graficos/linea.js';
import * as H from '/core/herramientas.js';
import { estadoCartera } from '/core/cartera.js';
import { aportacionMensualInversion } from '/core/cartera-resumen.js';
import { consumo12 } from '/core/metas.js';
import { formatearEuros, formatearPct, formatearImporte, formatearPorcentaje, parseImporte, parsePorcentaje } from '/core/dinero.js';
import { MESES_CORTOS, sumarMeses, mesFinanciero } from '/core/fechas.js';

export const HERRAMIENTAS = [
  ['crisis', 'Prueba de crisis', '¿y si se repite 2008, 2020 o 2022?'],
  ['ipc', 'Tu IPC personal', 'tu inflación real'],
  ['oport', 'Coste de oportunidad', 'lo que vale de verdad un gasto'],
  ['fondos', 'Comparador de fondos', 'TER y coste a 30 años'],
  ['vida', 'Escenarios de vida', '¿y si…? sobre tus metas'],
  ['calc', 'Calculadoras', 'interés compuesto · meta · alquilar o comprar'],
  ['subs', 'Radar de suscripciones', 'lo que pagas sin darte cuenta'],
];

const eur = (c, d = 0) => formatearEuros(Math.round(c), d);
const pctT = (t, d = 1) => (t === null || t === undefined ? '—' : formatearPct(Math.round(t * 10000), d));
const mesAnio = (f) => (f ? `${MESES_CORTOS[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}` : '—');

// valores de los campos: importes en céntimos, porcentajes en pb, enteros tal cual
const ui = {
  herramienta: 'crisis',
  crisis: null,
  calc: 'ic',
  marcadas: null,
  v: {
    oImporte: 15000, oMensual: 3000, oAnios: 20, oTasa: 400,
    fInicial: 1000000, fMensual: 30000, fAnios: 30, fBruta: 600, fTerA: 12, fTerB: 180,
    vPausa: 0, vIngresos: 0, vGasto: 0, vPuntual: 0,
    icCapital: 1000000, icMensual: 30000, icAnios: 20, icTasa: 500,
    mObjetivo: 1500000, mMeses: 36, mInicial: 200000, mTasaCuenta: 200, mTasaInv: 400,
    cPrecio: 25000000, cAlquiler: 95000, cEntrada: 2000, cImpuestos: 1000, cIbi: 40000, cComunidad: 6000, cMantenimiento: 100, cRevalorizacion: 200, cTipo: 300, cPlazo: 25, cHorizonte: 10, cRentabilidad: 500, cSubida: 200,
  },
};
let contexto = null;
export const iniciarHerramientas = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();
const tasa = (pb) => pb / 10000;

/** Campo editable: tipo «eur» (céntimos), «pct» (pb) o «n» (entero). */
function campo(clave, tipo, ancho = 60, etiqueta = clave) {
  const v = ui.v[clave];
  const texto = tipo === 'eur' ? formatearImporte(v).replace(/,00$/, '') : tipo === 'pct' ? formatearPorcentaje(v) : String(v);
  return html`<input class="inp" id="h-${clave}" value="${texto}" data-cambio="herr-campo" data-clave="${clave}" data-tipo="${tipo}" style="width:${ancho}px;text-align:right" aria-label="${etiqueta}">`;
}
const caja = (titulo, valor, sub = '', color = '', clave = titulo) => html`<div style="background:var(--surface-1);border-radius:8px;padding:7px 9px"><div class="mut" style="font-size:10.5px">${titulo}</div><div style="font-size:16px;font-weight:500;${color ? `color:${color}` : ''}" data-cifra="${clave}">${valor}</div>${sub ? html`<div class="mut" style="font-size:10px">${sub}</div>` : ''}</div>`;
const rejilla = (n, hijos) => html`<div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:8px;margin:10px 0">${hijos}</div>`;

function base(estado) {
  const m = estado.modelo;
  const hoy = estado.ahora.fecha;
  return { m, hoy, valor: estadoCartera({ activos: m.activos, operaciones: m.operaciones, fotos: m.fotos, hasta: hoy }).valor, aportacion: aportacionMensualInversion(m), consumo: consumo12(m, hoy) };
}

export function vistaHerramientas(estado) {
  const panel = { crisis: tCrisis, ipc: tIpc, oport: tOport, fondos: tFondos, vida: tVida, calc: tCalc, subs: tSubs }[ui.herramienta];
  return html`<div style="display:grid;grid-template-columns:200px minmax(0,1fr);gap:8px"><div class="box" role="tablist" aria-label="Herramientas" aria-orientation="vertical">${HERRAMIENTAS.map(([id, t, d]) => html`<button type="button" role="tab" class="herr ${ui.herramienta === id ? 'on' : ''}" aria-selected="${ui.herramienta === id ? 'true' : 'false'}" data-accion="herr" data-id="${id}"><div style="font-size:11.5px">${t}</div><div class="mut" style="font-size:10px">${d}</div></button>`)}
      <div class="mut" style="font-size:10.5px;margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)">Todo lo calcula el código con tus datos y el grupo «Datos». Sin IA.</div></div>
    <div class="box" id="herramienta" data-herramienta="${ui.herramienta}">${panel(estado)}</div></div>`;
}

// ---------- prueba de crisis ----------
function tCrisis(estado) {
  const { m, valor, aportacion } = base(estado);
  let periodos = H.parseCrisis(m.ajustes.crisis_periodos);
  const errorPeriodos = periodos.error;
  if (errorPeriodos) periodos = H.parseCrisis(H.CRISIS_DEFECTO);
  const sel = periodos.find((p) => p.id === ui.crisis) ?? periodos.find((p) => p.id === '2007') ?? periodos[0];
  ui.crisis = sel.id;
  const filas = H.filasCartera(m, estadoCartera({ activos: m.activos, operaciones: m.operaciones, fotos: m.fotos, hasta: estado.ahora.fecha }).porActivo);
  const r = H.pruebaCrisis({ filas, clases: m.clases, series: (id) => m.serie(id), periodo: sel, valor, aportacion });
  const rg = H.rangos12m(H.historicoMezcla(H.componentesDe(filas, m.clases), (id) => m.serie(id)));
  const cab = html`<div class="entre"><b style="font-weight:500">Prueba de crisis</b><span>${periodos.map((p) => html`<button type="button" class="chip ck ${p.id === sel.id ? 'on' : ''}" data-accion="crisis-periodo" data-id="${p.id}" aria-pressed="${p.id === sel.id ? 'true' : 'false'}">${p.nombre}</button>`)}</span></div>
    ${errorPeriodos ? html`<div class="banda aviso" style="margin-top:6px">Periodos de Ajustes no válidos (${errorPeriodos}): uso los de por defecto.</div>` : ''}`;
  if (r.error || !filas.length) return html`${cab}<div class="banda aviso" style="margin-top:8px">No se puede simular: ${filas.length ? r.error : 'aún no tienes cartera ni objetivo'}.</div>`;
  const rec = (n) => (n === null ? `más de ${r.mesesConDatos - 1} meses` : `${n} meses`);
  const n = r.sin.length;
  const conLibertad = r.recuperaCon ?? r.mesesConDatos - 1;
  const cuentasInversion = new Set(m.cuentas.filter((c) => c.tipo === 'inversion').map((c) => c.id));
  const metasExpuestas = m.metas.filter((x) => x.campos.estado?.estado !== 'archivada' && x.campos.estado?.estado !== 'cumplida' && x.campos.se_alimenta_de?.tipo === 'cuenta' && cuentasInversion.has(x.campos.se_alimenta_de.valor));
  return html`${cab}
    ${rejilla(4, [caja('Caída máxima', formatearPct(r.caidaPb, 0), `mínimo en ${mesAnio(r.mesMinimo + '-01')}`, 'var(--text-danger)'), caja('Tu cartera caería a', eur(r.valorMinimo), `hoy ${eur(valor)}`), caja('Meses en recuperar', rec(r.recuperaSin), 'sin aportar'), caja(`Aportando ${eur(aportacion)}/mes`, rec(r.recuperaCon), 'hasta recuperar lo puesto', 'var(--text-success)')])}
    ${graficoLineas({ series: [{ nombre: 'sin aportar', color: '#E24B4A', valores: r.sin, grosor: 2 }, { nombre: 'aportando', color: '#1D9E75', valores: r.con, grosor: 1.6, discontinua: true }], ancho: 460, alto: 150, etiquetaY: (v) => v.toFixed(0), etiquetasX: r.meses.map((x, i) => (i % 12 === 0 ? x.slice(0, 4) : '')), titulo: `${sel.nombre}: caída máxima ${formatearPct(r.caidaPb, 0)}` })}
    <div class="mut" style="font-size:10.5px"><span style="color:var(--t-rojo)">━</span> tu cartera (base 100) si se repitiera ${sel.desde}…${sel.hasta} · <span style="color:var(--t-verde)">┄</span> valor ÷ lo puesto si sigues aportando · datos hasta ${r.hastaDatos}${n > 1 ? '' : ''}</div>
    ${r.aproximaciones.length ? html`<div class="banda aviso" style="margin-top:6px">Aproximado: ${r.aproximaciones.map((a) => `«${a.nombre}» con ${a.con}`).join(' · ')} (no hay datos de su índice en ese periodo).</div>` : ''}
    ${r.avisos.map((a) => html`<div class="banda aviso" style="margin-top:6px">⚠ ${a}</div>`)}
    <div style="font-size:11.5px;margin-top:10px;line-height:1.7">Tus metas: ${metasExpuestas.length ? html`<b style="font-weight:500">${metasExpuestas.map((x) => x.titulo).join(', ')}</b> se alimenta(n) de una cuenta de inversión y lo notaría(n)` : html`<b style="font-weight:500">ninguna se alimenta de la cartera</b> (cuentas, grupos o importes propios), así que no se tocan`} · la libertad financiera se retrasaría ~${(conLibertad / 12).toFixed(1).replace('.', ',')} años si sigues aportando.<br><span class="mut">Quien vendió en el mínimo tardó mucho más en recuperarse que quien siguió aportando. Simulación con las series del grupo «Datos» y tus pesos ${m.objetivo.length ? 'objetivo' : 'actuales'}.${m.series.some((s) => s.sintetica) ? ' Las series del ejemplo son SINTÉTICAS.' : ''}</span></div>
    ${rg.error ? '' : html`<div style="margin-top:10px;padding-top:8px;border-top:.5px solid var(--border)"><div class="lab">Rangos a 12 meses con la historia de tu mezcla (${rg.desde}…${rg.hasta}, ${rg.ventanas} ventanas)</div>
      ${rg.aviso ? html`<div class="banda aviso" style="margin:4px 0">⚠ ${rg.aviso}</div>` : ''}
      <div style="font-size:11.5px;line-height:1.8">pesimista <b style="font-weight:500">${formatearPct(rg.pesimista[0], 0)} … ${formatearPct(rg.pesimista[1], 0)}</b> · base <b style="font-weight:500">${formatearPct(rg.base[0], 0)} … ${formatearPct(rg.base[1], 0)}</b> · optimista <b style="font-weight:500">${formatearPct(rg.optimista[0], 0)} … ${formatearPct(rg.optimista[1], 0)}</b> · peor caso ${formatearPct(rg.peor, 0)}</div></div>`}
    <div class="entre" style="margin-top:10px"><form class="fila" data-form="crisis-periodos" style="flex:1"><label class="sr-only" for="crisis-periodos">Periodos de crisis</label><input class="inp" id="crisis-periodos" name="periodos" value="${m.ajustes.crisis_periodos}" style="flex:1;font-size:10.5px" title="AAAA-MM..AAAA-MM nombre | …"><button type="submit" class="go">guardar periodos</button></form>
      <button type="button" class="go" data-accion="herr-escenario" data-tipo="crisis">guardar como escenario</button></div>`;
}

// ---------- IPC personal ----------
function tIpc(estado) {
  const { m, hoy } = base(estado);
  const r = H.ipcPersonal(m, hoy);
  const componentes = m.series.filter((s) => s.id.startsWith('ipc-') && s.id !== 'ipc-espana');
  if (r.personal === null) return html`<b style="font-weight:500">Tu IPC personal</b><div class="banda aviso" style="margin-top:8px">No se puede calcular: ${r.general === null ? 'no hay serie «ipc-espana» en Datos' : 'ninguno de tus grupos de consumo tiene componente del IPC'}.</div>`;
  const max = Math.max(...r.filas.map((f) => f.pesoPb)) || 1;
  const remunerada = m.cuentas.find((c) => c.colchon);
  return html`<b style="font-weight:500">Tu IPC personal</b> <span class="mut" style="font-size:10.5px">· interanual a ${mesAnio(r.mes + '-01')}</span>
    <div class="fila" style="gap:24px;margin:10px 0"><div><div class="mut" style="font-size:10.5px">tu inflación</div><div class="k" style="color:var(--t-naranja)" data-cifra="tu inflación">${pctT(r.personal)}</div></div><div><div class="mut" style="font-size:10.5px">IPC general</div><div class="k" data-cifra="IPC general">${pctT(r.general)}</div></div></div>
    ${r.filas.map((f) => html`<div style="display:grid;grid-template-columns:100px 1fr 150px;gap:8px;align-items:center;font-size:11px;padding:3px 0"><span>${f.nombre}</span><div class="bar" style="height:8px"><i style="width:${(f.pesoPb / max) * 100}%;background:#D85A30"></i></div><span class="mut">${Math.round(f.pesoPb / 100)} % de tu gasto · ${pctT(f.tasa)}</span></div>`)}
    ${r.sinMapear.length ? html`<div class="banda aviso" style="display:block;margin-top:8px">Fuera del cálculo (${Math.round(r.excluidoPb / 100)} % de tu consumo): ${r.sinMapear.map((x) => html`<span class="fila" style="display:inline-flex;margin-right:10px">${x.nombre} <select class="inp" data-cambio="grupo-ipc" data-id="${m.grupos.find((g) => g.nombre === x.nombre)?.id ?? ''}" aria-label="Componente del IPC de ${x.nombre}" style="font-size:10.5px"><option value="">asignar componente…</option>${componentes.map((s) => html`<option value="${s.id}">${s.id.replace('ipc-', '')}</option>`)}</select></span>`)}</div>` : ''}
    <div class="mut" style="font-size:10.5px;margin-top:8px">Pesos = tu consumo de los últimos 12 meses por grupo; tasas = las de cada componente del IPC en el grupo «Datos» (campo «ipc:» de cada grupo).${r.personal > r.general ? ' Tu dinero pierde valor algo más rápido que la media.' : ' Tu cesta sube menos que la media.'}${remunerada ? ` Lo que tengas en «${remunerada.nombre}» necesita rendir más de ${pctT(r.personal)} para no perder poder de compra.` : ''}</div>`;
}

// ---------- coste de oportunidad ----------
function tOport(estado) {
  const { consumo } = base(estado);
  const v = ui.v;
  const r = H.costeOportunidad({ importe: v.oImporte, mensual: v.oMensual, anios: v.oAnios, tasa: tasa(v.oTasa), consumoAnual: consumo.consumo });
  const dias = (d) => (d === null ? 'sin consumo anual para comparar' : `≈ ${d} días de libertad financiera`);
  return html`<b style="font-weight:500">Coste de oportunidad</b>
    <div class="fila" style="flex-wrap:wrap;margin:10px 0;font-size:11.5px">un capricho de ${campo('oImporte', 'eur', 70, 'importe puntual')} € · o un gasto de ${campo('oMensual', 'eur', 56, 'gasto mensual')} €/mes · en ${campo('oAnios', 'n', 36, 'años')} años al ${campo('oTasa', 'pct', 40, 'rentabilidad real')} % real</div>
    ${rejilla(2, [caja(`${eur(v.oImporte)} hoy serían en ${v.oAnios} años`, eur(r.puntual), dias(r.diasPuntual), '', 'puntual'), caja(`${eur(v.oMensual)} cada mes serían en ${v.oAnios} años`, eur(r.mensual), dias(r.diasMensual), '', 'mensual')])}
    <div class="mut" style="font-size:10.5px">No es para no darte caprichos: es para que elijas sabiendo lo que valen. Euros de hoy (rentabilidad real, descontada la inflación). Un día de libertad = tu consumo anual ÷ 365${consumo.consumo ? ` (${eur(consumo.consumo / 365)})` : ''}.</div>`;
}

// ---------- comparador de fondos ----------
function tFondos(estado) {
  const { m } = base(estado);
  const v = ui.v;
  const r = H.comparadorFondos({ inicial: v.fInicial, mensual: v.fMensual, anios: v.fAnios, bruta: tasa(v.fBruta), terA: tasa(v.fTerA), terB: tasa(v.fTerB) });
  const conTer = m.activos.filter((a) => a.campos.ter !== undefined && !a.campos.archivado);
  return html`<b style="font-weight:500">Comparador de fondos</b>
    <div class="fila" style="flex-wrap:wrap;margin:10px 0;font-size:11.5px;gap:12px"><span><span style="color:var(--t-verde)">■</span> Fondo A · TER ${campo('fTerA', 'pct', 46, 'TER del fondo A')} %</span><span><span style="color:var(--t-rojo)">■</span> Fondo B · TER ${campo('fTerB', 'pct', 46, 'TER del fondo B')} %</span>
      ${conTer.length ? html`<select class="inp" data-cambio="fondos-ter" aria-label="Usar el TER de uno de tus fondos" style="font-size:10.5px"><option value="">TER de A desde tus fondos…</option>${conTer.map((a) => html`<option value="${a.campos.ter}">${a.titulo} (${formatearPorcentaje(a.campos.ter)} %)</option>`)}</select>` : ''}</div>
    <div class="fila mut" style="flex-wrap:wrap;font-size:11px;margin-bottom:6px">${campo('fInicial', 'eur', 70, 'capital inicial')} € + ${campo('fMensual', 'eur', 50, 'aportación mensual')} €/mes · ${campo('fAnios', 'n', 36, 'años')} años · ${campo('fBruta', 'pct', 40, 'rentabilidad bruta')} % bruto</div>
    ${graficoLineas({ series: [{ nombre: 'A', color: '#1D9E75', valores: r.a.map((x) => x / 100000), grosor: 2 }, { nombre: 'B', color: '#E24B4A', valores: r.b.map((x) => x / 100000), grosor: 2 }], ancho: 460, alto: 150, etiquetaY: (x) => `${x.toFixed(0)}k`, etiquetasX: r.a.map((_, i) => (i % 5 ? '' : `año ${i}`)), titulo: `Fondo A ${eur(r.finalA)}, fondo B ${eur(r.finalB)}` })}
    <div style="font-size:12px;margin-top:6px">A: <b style="font-weight:500" data-cifra="A">${eur(r.finalA)}</b> · B: <b style="font-weight:500" data-cifra="B">${eur(r.finalB)}</b> · la diferencia de costes te quita <b style="font-weight:500;color:var(--text-danger)" data-cifra="diferencia">${eur(r.diferencia)}</b></div>
    <div class="mut" style="font-size:10.5px;margin-top:4px">Misma rentabilidad bruta; cada mes se descuenta el TER. El TER de tus fondos está en Gestión → Activos y objetivo.</div>`;
}

// ---------- escenarios de vida ----------
let cacheVida = { clave: null, valor: null };
function tVida(estado) {
  const { m, hoy } = base(estado);
  const v = ui.v;
  const mods = { pausaMeses: v.vPausa, ingresosMes: v.vIngresos, gastoMes: v.vGasto, gastoPuntual: v.vPuntual };
  const clave = JSON.stringify([hoy, mods]);
  if (cacheVida.modelo !== m || cacheVida.clave !== clave) cacheVida = { modelo: m, clave, valor: H.escenariosVida(m, hoy, mods) };
  const r = cacheVida.valor;
  const lib = (x) => (x === undefined ? 'sin consumo' : x === null ? `más de ${r.libertad.horizonte} años` : String(x));
  return html`<b style="font-weight:500">Escenarios de vida</b>
    <div style="margin:10px 0;font-size:11.5px;line-height:2.2">
      <div>Dejo de aportar ${campo('vPausa', 'n', 36, 'meses de pausa')} meses (metas y cartera)</div>
      <div>Mis ingresos cambian en ${campo('vIngresos', 'eur', 60, 'cambio de ingresos al mes')} €/mes · mi gasto cambia en ${campo('vGasto', 'eur', 60, 'cambio de gasto al mes')} €/mes</div>
      <div>Un gasto puntual de ${campo('vPuntual', 'eur', 70, 'gasto puntual')} € (sale de la cartera)</div></div>
    ${rejilla(Math.min(4, r.metas.length + 1), [
      ...r.metas.map((x) => caja(x.titulo, mesAnio(x.despues), `antes: ${mesAnio(x.antes)}`)),
      caja('Libertad financiera (mediana)', lib(r.libertad.despues), `antes: ${lib(r.libertad.antes)}`),
    ])}
    <div style="font-size:11.5px">Tasa de ahorro: <b style="font-weight:500">${r.tasa.despuesPb === null ? '—' : `${Math.round(r.tasa.despuesPb / 100)} %`}</b> <span class="mut">(antes ${r.tasa.antesPb === null ? '—' : `${Math.round(r.tasa.antesPb / 100)} %`})</span> · aportación a la cartera ${eur(r.aportacion.despues)}/mes <span class="mut">(antes ${eur(r.aportacion.antes)})</span></div>
    <div class="mut" style="font-size:10.5px;margin-top:8px">Cambio neto mensual ${r.neto >= 0 ? '+' : ''}${eur(r.neto)}: va a (o sale de) tu aportación a la cartera; las metas mantienen su aportación salvo durante la pausa. Más gasto mensual sube también el objetivo de libertad financiera. Con tus metas, tu tasa de los últimos meses cerrados y la proyección de Metas (semilla fija).</div>
    <div style="text-align:right;margin-top:8px"><button type="button" class="go" data-accion="herr-escenario" data-tipo="vida">guardar como escenario</button></div>`;
}

// ---------- calculadoras ----------
function tCalc(estado) {
  const v = ui.v;
  const chips = html`<span>${[['ic', 'Interés compuesto'], ['meta', 'Ahorro para una meta'], ['casa', 'Alquilar o comprar']].map(([k, t]) => html`<button type="button" class="chip ck ${ui.calc === k ? 'on' : ''}" data-accion="calc" data-id="${k}" aria-pressed="${ui.calc === k ? 'true' : 'false'}">${t}</button>`)}</span>`;
  let cuerpo;
  if (ui.calc === 'ic') {
    const r = H.interesCompuesto({ capital: v.icCapital, mensual: v.icMensual, anios: v.icAnios, tasa: tasa(v.icTasa) });
    cuerpo = html`<div class="fila" style="flex-wrap:wrap;margin:10px 0;font-size:11.5px">capital ${campo('icCapital', 'eur', 70, 'capital')} € · aportación ${campo('icMensual', 'eur', 50, 'aportación mensual')} €/mes · ${campo('icAnios', 'n', 36, 'años')} años · ${campo('icTasa', 'pct', 40, 'rentabilidad anual')} %</div>
      ${rejilla(3, [caja('Pones', eur(r.pones)), caja('Intereses', eur(r.intereses)), caja('Total', eur(r.total))])}
      <div style="display:flex;height:12px;border-radius:4px;overflow:hidden" role="img" aria-label="${Math.round(r.interesPb / 100)} % del total son intereses"><div style="width:${r.total ? (r.pones / r.total) * 100 : 0}%;background:#888780"></div><div style="flex:1;background:#D85A30"></div></div>
      <div class="mut" style="font-size:10.5px;margin-top:4px">El ${Math.round(r.interesPb / 100)} % del resultado es interés sobre interés. Interés compuesto mensual.</div>`;
  } else if (ui.calc === 'meta') {
    const cuenta = H.cuotaMeta({ objetivo: v.mObjetivo, inicial: v.mInicial, meses: v.mMeses, tasa: tasa(v.mTasaCuenta) });
    const inv = H.cuotaMeta({ objetivo: v.mObjetivo, inicial: v.mInicial, meses: v.mMeses, tasa: tasa(v.mTasaInv) });
    cuerpo = html`<div style="font-size:11.5px;margin:10px 0;line-height:2.2">Quiero ${campo('mObjetivo', 'eur', 70, 'objetivo')} € en ${campo('mMeses', 'n', 36, 'meses')} meses, partiendo de ${campo('mInicial', 'eur', 60, 'lo que ya tengo')} €<br>
      → necesitas apartar <b style="font-weight:500" data-cifra="cuota">${cuenta === null ? '—' : `${eur(cuenta)}/mes`}</b> en cuenta al ${campo('mTasaCuenta', 'pct', 36, 'interés de la cuenta')} % · o ${inv === null ? '—' : `${eur(inv)}/mes`} invirtiendo al ${campo('mTasaInv', 'pct', 36, 'rentabilidad invirtiendo')} % (con más riesgo)</div>
      <button type="button" class="go" data-accion="calc-crear-meta" ${cuenta === null ? 'disabled' : ''}>crear meta con esto</button>`;
  } else {
    const r = H.alquilarComprar({ precio: v.cPrecio, alquiler: v.cAlquiler, entrada: tasa(v.cEntrada), impuestos: tasa(v.cImpuestos), ibi: v.cIbi, comunidad: v.cComunidad, mantenimiento: tasa(v.cMantenimiento), revalorizacion: tasa(v.cRevalorizacion), tipo: tasa(v.cTipo), plazo: v.cPlazo, horizonte: v.cHorizonte, rentabilidad: tasa(v.cRentabilidad), subidaAlquiler: tasa(v.cSubida) });
    cuerpo = html`<div style="font-size:11px;margin:10px 0;line-height:2.3">Piso de ${campo('cPrecio', 'eur', 80, 'precio')} € · alquiler equivalente ${campo('cAlquiler', 'eur', 56, 'alquiler')} €/mes (sube ${campo('cSubida', 'pct', 34, 'subida anual del alquiler')} %/año)<br>
      entrada ${campo('cEntrada', 'pct', 34, 'entrada')} % · impuestos y gastos de compra ${campo('cImpuestos', 'pct', 34, 'impuestos de compra')} % · hipoteca al ${campo('cTipo', 'pct', 34, 'tipo de interés')} % a ${campo('cPlazo', 'n', 30, 'plazo en años')} años<br>
      IBI ${campo('cIbi', 'eur', 50, 'IBI anual')} €/año · comunidad ${campo('cComunidad', 'eur', 46, 'comunidad al mes')} €/mes · mantenimiento ${campo('cMantenimiento', 'pct', 34, 'mantenimiento anual')} %/año · revalorización ${campo('cRevalorizacion', 'pct', 34, 'revalorización anual')} %/año<br>
      la alternativa rinde ${campo('cRentabilidad', 'pct', 34, 'rentabilidad de la alternativa')} %/año · horizonte ${campo('cHorizonte', 'n', 30, 'horizonte en años')} años</div>
      ${rejilla(2, [caja(`Comprar · patrimonio a ${v.cHorizonte} años`, eur(r.comprar), `vivienda ${eur(r.vivienda)} − deuda ${eur(r.deuda)} · cuota ${eur(r.cuota)}/mes`), caja('Alquilar e invertir la diferencia', eur(r.alquilar), r.diferencia >= 0 ? `comprar gana por ${eur(r.diferencia)}` : `alquilar gana por ${eur(-r.diferencia)}`)])}
      <div class="mut" style="font-size:10.5px">Los dos gastan lo mismo cada mes; quien paga menos invierte la diferencia, y quien alquila invierte desde el principio la entrada y los gastos de compra. No incluye costes de venta ni impuestos de la plusvalía.</div>`;
  }
  return html`<div class="entre"><b style="font-weight:500">Calculadoras</b>${chips}</div>${cuerpo}`;
}

// ---------- radar de suscripciones ----------
function tSubs(estado) {
  const { m, hoy } = base(estado);
  const r = H.radarSuscripciones(m, { marcadas: ui.marcadas, hoy });
  if (!r.filas.length) return html`<b style="font-weight:500">Radar de suscripciones</b><div class="mut" style="font-size:11px;margin-top:8px">Ningún recurrente lleva la etiqueta #suscripción. Añádesela en Gestión → Recurrentes.</div>`;
  return html`<b style="font-weight:500">Radar de suscripciones</b>
    <div class="fila" style="gap:24px;margin:10px 0"><div><div class="mut" style="font-size:10.5px">pagas al año</div><div class="k" data-cifra="pagas al año">${eur(r.total, 2)}</div></div><div><div class="mut" style="font-size:10.5px">si cancelas lo marcado</div><div class="k" style="color:var(--t-verde)" data-cifra="ahorro">${eur(r.ahorro, 2)}/año</div><div class="mut" style="font-size:10.5px">≈ ${eur(r.futuro)} en ${r.anios} años al ${Math.round(r.tasa * 100)} % real</div></div></div>
    <table class="tb"><thead><tr><th>suscripción</th><th class="n">al año</th><th>¿la usas?</th><th></th></tr></thead><tbody>
    ${r.filas.map((f) => html`<tr style="${f.pausado ? 'opacity:.75' : ''}"><td>${f.concepto}${f.pausado ? ' · en pausa' : ''}</td><td class="n">${eur(f.anual, 2)}</td>
      <td><button type="button" class="go" data-accion="subs-uso" data-id="${f.id}" title="Cambiar «¿la usas?»">${f.uso?.estado === 'no' ? html`<span style="color:var(--text-warning)">no${f.uso.fecha ? ` desde ${mesAnio(f.uso.fecha.length === 7 ? `${f.uso.fecha}-01` : f.uso.fecha)}` : ''}</span>` : f.uso?.estado === 'sí' ? 'sí' : html`<span class="mut">¿?</span>`}</button></td>
      <td><button type="button" class="chip ck ${f.marcada ? 'on' : ''}" data-accion="subs-marcar" data-id="${f.id}" aria-pressed="${f.marcada ? 'true' : 'false'}">${f.marcada ? 'a cancelar' : 'cancelar'}</button></td></tr>`)}</tbody></table>
    <div class="mut" style="font-size:10.5px;margin-top:6px">Salen de tus recurrentes con #suscripción. «¿La usas?» lo marcas tú (se guarda en recurrentes.md); «cancelar» solo calcula, no cancela nada.</div>`;
}

// ---------- acciones ----------
function textoEscenario(tipo, estado) {
  const { m, hoy, valor, aportacion } = base(estado);
  const v = ui.v;
  if (tipo === 'crisis') {
    const per = (H.parseCrisis(m.ajustes.crisis_periodos).error ? H.parseCrisis(H.CRISIS_DEFECTO) : H.parseCrisis(m.ajustes.crisis_periodos)).find((p) => p.id === ui.crisis);
    const r = H.pruebaCrisis({ filas: H.filasCartera(m), clases: m.clases, series: (id) => m.serie(id), periodo: per, valor, aportacion });
    return { titulo: `Escenario: si se repite «${per.nombre}»`, que: `Prueba de crisis ${per.desde}…${per.hasta} con mis pesos ${m.objetivo.length ? 'objetivo' : 'actuales'} y ${eur(valor)} en cartera.\nCaída máxima ${formatearPct(r.caidaPb, 0)} (a ${eur(r.valorMinimo)}). Recuperación: ${r.recuperaSin ?? 'más de ' + (r.mesesConDatos - 1)} meses sin aportar; ${r.recuperaCon ?? 'más de ' + (r.mesesConDatos - 1)} aportando ${eur(aportacion)}/mes.\nCalculado por código el ${hoy}.` };
  }
  const r = H.escenariosVida(m, hoy, { pausaMeses: v.vPausa, ingresosMes: v.vIngresos, gastoMes: v.vGasto, gastoPuntual: v.vPuntual });
  const sup = [v.vPausa && `dejo de aportar ${v.vPausa} meses`, v.vIngresos && `ingresos ${v.vIngresos > 0 ? '+' : ''}${eur(v.vIngresos)}/mes`, v.vGasto && `gasto ${v.vGasto > 0 ? '+' : ''}${eur(v.vGasto)}/mes`, v.vPuntual && `gasto puntual de ${eur(v.vPuntual)}`].filter(Boolean);
  return {
    titulo: `Escenario: ${sup.join(', ') || 'sin cambios'}`,
    que: `¿Y si… ${sup.join(', ') || 'nada cambia'}?\n${r.metas.map((x) => `${x.titulo}: ${mesAnio(x.despues)} (antes ${mesAnio(x.antes)})`).join('\n')}\nLibertad financiera: ${r.libertad.despues ?? 'más de 40 años'} (antes ${r.libertad.antes ?? 'más de 40 años'}). Tasa de ahorro ${r.tasa.despuesPb === null ? '—' : Math.round(r.tasa.despuesPb / 100) + ' %'} (antes ${r.tasa.antesPb === null ? '—' : Math.round(r.tasa.antesPb / 100) + ' %'}).\nCalculado por código el ${hoy}.`,
  };
}

export function registrarAccionesHerramientas() {
  accion('herr', (el) => {
    ui.herramienta = el.dataset.id;
    repintar();
  });
  accion('crisis-periodo', (el) => {
    ui.crisis = el.dataset.id;
    repintar();
  });
  accion('calc', (el) => {
    ui.calc = el.dataset.id;
    repintar();
  });
  cambio('herr-campo', (el) => {
    const { clave, tipo } = el.dataset;
    const t = el.value.trim() || '0';
    const r = tipo === 'eur' ? parseImporte(t) : tipo === 'pct' ? parsePorcentaje(t) : { ok: /^-?\d+$/.test(t), valor: Number(t) };
    const minimo = ['vIngresos', 'vGasto'].includes(clave) ? -Infinity : 0;
    if (!r.ok || r.valor < minimo) return toast('Valor no válido', { tipo: 'error' });
    if (['oAnios', 'fAnios', 'icAnios', 'cPlazo', 'cHorizonte'].includes(clave) && (r.valor < 1 || r.valor > 60)) return toast('Años: de 1 a 60', { tipo: 'error' });
    if (clave === 'mMeses' && (r.valor < 1 || r.valor > 600)) return toast('Meses: de 1 a 600', { tipo: 'error' });
    if (clave === 'vPausa' && r.valor > 120) return toast('Pausa: como mucho 120 meses', { tipo: 'error' });
    ui.v[clave] = r.valor;
    repintar();
  });
  cambio('fondos-ter', (el) => {
    if (!el.value) return;
    ui.v.fTerA = Number(el.value);
    repintar();
  });
  formulario('crisis-periodos', (f, d) => {
    const r = H.parseCrisis(d.periodos);
    if (r.error) return toast(r.error, { tipo: 'error' });
    op('ajustes.fijar', { clave: 'crisis_periodos', valor: d.periodos.trim() }, { mensaje: 'Periodos de crisis guardados en ajustes.md' });
  });
  cambio('grupo-ipc', (el) => el.value && el.dataset.id && op('lista.editar', { ruta: 'grupos.md', clave: el.dataset.id, cambios: { ipc: el.value } }, { mensaje: `Componente del IPC asignado (${el.value})` }));
  accion('subs-marcar', (el) => {
    const r = H.radarSuscripciones(est().modelo, { marcadas: ui.marcadas, hoy: est().ahora.fecha });
    ui.marcadas = new Set(r.filas.filter((f) => f.marcada).map((f) => f.id));
    ui.marcadas.has(el.dataset.id) ? ui.marcadas.delete(el.dataset.id) : ui.marcadas.add(el.dataset.id);
    repintar();
  });
  accion('subs-uso', (el) => {
    const rec = est().modelo.recurrentes.find((r) => r.id === el.dataset.id);
    const usa = rec.uso?.estado !== 'no';
    const mes = mesFinanciero(est().ahora.fecha, est().modelo.ajustes.mes_inicio_dia);
    op('lista.editar', { ruta: 'recurrentes.md', clave: rec.id, cambios: { uso: usa ? { estado: 'no', fecha: mes } : { estado: 'sí', fecha: null } } }, { mensaje: `«${rec.concepto}»: ${usa ? 'no la usas' : 'la usas'}` });
  });
  accion('herr-escenario', async (el) => {
    const e = textoEscenario(el.dataset.tipo, est());
    await op('decision.crear', { titulo: e.titulo, fecha: est().ahora.fecha, estado: null, origen: `herramientas · ${el.dataset.tipo === 'crisis' ? 'prueba de crisis' : 'escenarios de vida'}`, secciones: { Qué: e.que } }, { mensaje: 'Escenario guardado en tu diario de decisiones (Metas)' });
  });
  accion('calc-crear-meta', async () => {
    const v = ui.v;
    const cuota = H.cuotaMeta({ objetivo: v.mObjetivo, inicial: v.mInicial, meses: v.mMeses, tasa: tasa(v.mTasaCuenta) });
    const fecha = sumarMeses(est().ahora.fecha, v.mMeses);
    await op('meta.crear', { titulo: `Meta de ${eur(v.mObjetivo)}`, campos: { objetivo: v.mObjetivo, fecha_deseada: fecha, se_alimenta_de: { tipo: 'manual', valor: v.mInicial }, aportacion: { mensual: cuota } } }, { mensaje: (r) => `Meta creada (${r.resultado.id}): renómbrala y elige de dónde se alimenta en Metas` });
  });
}
