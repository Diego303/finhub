// Pestañas cuyo contenido se construye en fases posteriores: muestran su marco con datos reales
// del ejemplo y dicen qué llega y cuándo (sin inventar cifras que aún no se calculan).
import { html } from '../esc.js';
import { proximamente } from '../componentes/proximamente.js';
import { rex } from '../componentes/rex-sprite.js';
import { tituloMes, mesFinanciero } from '/core/fechas.js';

const kpis = (lista) => html`<div class="kpis">${lista.map(([lab, valor, sub]) => html`<div class="box"><div class="lab">${lab}</div><div class="k" style="font-size:19px">${valor}</div>${sub ? html`<div class="mut" style="font-size:10.5px">${sub}</div>` : ''}</div>`)}</div>`;

function saludo(hora) {
  const h = Number(hora.slice(0, 2));
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export function panel(e) {
  const m = e.modelo;
  const nombre = m.ajustes.nombre ? `, ${m.ajustes.nombre}` : '';
  return html`<div class="box" style="display:flex;gap:12px;align-items:center;margin-bottom:8px">${rex(54, 46, e.rex)}<div style="font-size:11.5px;line-height:1.7"><b style="font-weight:500">${saludo(e.ahora.hora)}${nombre}.</b> El resumen al abrir (pendientes, gasto de ayer, tasa del mes y meta más cercana) lo calculará el código. <span class="mut" style="font-size:10.5px">· sin IA</span></div></div>
    ${kpis([['Cuentas', m.cuentas.length, 'patrimonio neto: F4'], ['Metas', m.metas.length, 'progreso en la pestaña Metas'], ['Activos', m.activos.length, 'TWR y TIR: F5'], ['Pulsos', m.mundo.length, `${m.notas} notas`]])}
    <div style="margin-top:8px">${proximamente('Panel', 'F7', ['4 KPI con «?» Explícame', 'Línea de tiempo del patrimonio con lo aportado y los hitos', 'Flujo del mes, último pulso, metas y tarjeta «Tu año»'])}</div>`;
}

export function mes(e) {
  const m = e.modelo;
  const id = mesFinanciero(e.ahora.fecha, m.ajustes.mes_inicio_dia);
  const d = m.mes(id);
  return html`<div class="entre" style="margin-bottom:8px"><span><b style="font-weight:500;font-size:13px">${tituloMes(id)}</b> <span class="mut" style="font-size:10.5px">${m.ajustes.mes_inicio_dia === 1 ? 'mes natural' : `del ${m.ajustes.mes_inicio_dia} al ${m.ajustes.mes_inicio_dia - 1}`} · ${d ? `${d.movimientos.length} movimientos · ${d.estado.estado}` : 'sin movimientos aún'}</span></span><span class="mut" style="font-size:10.5px">${m.meses.length} meses en mes/</span></div>
    ${proximamente('Mes', 'F4', ['Barra «Anotar» con la naturaleza que sale del grupo', 'KPI, mapa del dinero (Sankey) y tabla con edición en línea', 'Presupuestos y comparación con tu media', 'Recurrentes del mes, cerrar, editar cerrado y reabrir'])}`;
}

const HERRAMIENTAS = [['Prueba de crisis', '¿y si se repite 2008, 2020 o 2022?'], ['Tu IPC personal', 'tu inflación real'], ['Coste de oportunidad', 'lo que vale de verdad un gasto'], ['Comparador de fondos', 'TER y coste a 30 años'], ['Escenarios de vida', '¿y si…? sobre tus metas'], ['Calculadoras', 'interés compuesto · meta · alquilar o comprar'], ['Radar de suscripciones', 'lo que pagas sin darte cuenta']];
export function herramientas() {
  return html`<div style="display:grid;grid-template-columns:200px minmax(0,1fr);gap:8px"><div class="box">${HERRAMIENTAS.map((t, i) => html`<div style="padding:7px 8px;border-radius:6px;margin-bottom:2px;${i === 0 ? 'background:var(--surface-1);border-left:2px solid var(--naranja)' : ''}"><div style="font-size:11.5px">${t[0]}</div><div class="mut" style="font-size:10px">${t[1]}</div></div>`)}<div class="mut" style="font-size:10.5px;margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)">Todo lo calcula el código con tus datos y el grupo «Datos». Sin IA.</div></div>
    ${proximamente('Herramientas', 'F7', ['Las 7 herramientas de §4.6, con «guardar como escenario» o «crear meta»'])}</div>`;
}

export function analisis(e) {
  const m = e.modelo;
  return html`<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:8px"><div class="box"><div class="lab">1 · Tarea</div>${m.tareas.map((t) => html`<div class="mut" style="font-size:11.5px;padding:3px 0">${t.titulo}</div>`)}<div class="lab" style="margin-top:12px">2 · Rol experto</div>${m.roles.map((r) => html`<div class="mut" style="font-size:11.5px">${r.titulo}</div>`)}<div class="mut" style="font-size:10.5px;margin:8px 0">🔒 Trabajo <b style="font-weight:500;color:var(--text-primary)">privado</b>: tus datos y tu base · sin internet</div><button type="button" class="pri" style="width:100%" disabled>Analizar con Claude</button></div>
    ${proximamente('Análisis', 'F10', ['Tarea, rol y mezcla de fuentes', 'Escenarios con probabilidad subjetiva y rangos calculados por código', 'Ideas para estudiar con etiqueta y citas', 'Calibración e historial'])}</div>`;
}

export function descubrimientos(e) {
  const m = e.modelo;
  const col = { alcista: 'var(--verde)', neutral: 'var(--gris)', bajista: 'var(--rojo)' };
  return html`<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:8px"><div class="box"><div class="lab">1 · Qué investigar</div>${['A partir del pulso', 'Nuevas ideas', 'Seguimiento', 'Pregunta libre'].map((t) => html`<div class="mut" style="font-size:11.5px;padding:3px 0">${t}</div>`)}<div class="mut" style="font-size:10.5px;margin:10px 0">🔒 Trabajo <b style="font-weight:500;color:var(--text-primary)">descubrir</b>: con internet · <b style="font-weight:500;color:var(--text-primary)">sin</b> tus importes, gastos ni metas · el encaje con tu cartera se calcula después, sin internet</div><button type="button" class="pri" style="width:100%" disabled>🔭 Investigar con Claude</button><div class="mut" style="font-size:10px;margin-top:6px">Es para informarte. Los cambios en tu cartera los haces tú.</div></div>
    <div>${m.descubrimientos.map((d) => html`<div class="box" style="margin-bottom:8px;border-left:3px solid ${col[d.postura] ?? 'var(--gris)'}"><b style="font-weight:500;font-size:12.5px">${d.titulo}</b> <span class="mut" style="font-size:10.5px">· ${d.tipo ?? ''} · ${d.id} · v${d.versiones.length}</span><div class="mut" style="font-size:10.5px">origen: ${d.origen ?? '—'} · ${d.estado ?? ''}</div></div>`)}
    ${proximamente('Descubrimientos', 'F11', ['Investigar (4 modos), mapa de efectos del pulso', '¿Cómo encaja con mi cartera? (sin internet, guardado en privado)', 'Simulador y rendimiento desde el descubrimiento'])}</div></div>`;
}

export function conocimiento(e) {
  const m = e.modelo;
  return html`${kpis([['Fuentes', m.fuentes.length, `${m.familias.length} familias`], ['Notas', m.notas, ''], ['Mezclas', m.mezclas.length, 'guardadas'], ['Predicciones', m.predicciones.length, `${m.predicciones.filter((p) => p.estado === 'pendiente').length} pendientes`]])}
    <div style="margin-top:8px">${proximamente('Conocimiento', 'F8', ['Tabla de fuentes con postura y acierto, y su ficha', 'Buscador, vista y edición de notas', 'Pulsos (14 días) y bandeja CONTEXTO', 'Familias, mezclas y predicciones'])}</div>`;
}

export function tuano(e) {
  return html`<div class="box" style="text-align:center;padding:22px;background:linear-gradient(135deg,#D85A3018,#7F77DD18)"><div style="display:flex;justify-content:center">${rex(90, 78, e.rex)}</div><div style="font-size:22px;font-weight:500;margin-top:6px">Tu ${e.ahora.fecha.slice(0, 4)} en finanzas</div><div class="mut">se completa el 31 de diciembre</div></div>
    <div style="margin-top:8px">${proximamente('Tu año', 'F7', ['Tarjetas y tasa de ahorro mes a mes, por código', '«Rex dice» bajo demanda (con tu luz verde)', 'Exportar a PNG'])}</div>`;
}
