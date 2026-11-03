// Pestañas cuyo contenido se construye en fases posteriores: muestran su marco con datos reales
// del ejemplo y dicen qué llega y cuándo (sin inventar cifras que aún no se calculan).
import { html } from '../esc.js';
import { proximamente } from '../componentes/proximamente.js';

const kpis = (lista) => html`<div class="kpis">${lista.map(([lab, valor, sub]) => html`<div class="box"><div class="lab">${lab}</div><div class="k" style="font-size:19px">${valor}</div>${sub ? html`<div class="mut" style="font-size:10.5px">${sub}</div>` : ''}</div>`)}</div>`;

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

