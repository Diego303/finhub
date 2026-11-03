// Barra R1 fija abajo y su modal: matriz de trabajos (§0.2, manda el plan), cómo se garantiza y registro.
import { html } from '../esc.js';
import { abrir } from './modal.js';

// [trabajo, recibe, internet, datos privados, texto externo, escribe en]
export const TRABAJOS_R1 = [
  ['Pulso', 'temas y, si lo activas, los nombres de tus fondos', 'sí', 'no', 'sí', 'conocimiento/mundo/'],
  ['Precios', 'solo los ISIN y nombres', 'sí', 'no', 'sí', 'propuesta de precios (tú confirmas)'],
  ['Datos de mercado', 'el manifiesto de series y el último dato', 'sí', 'no', 'sí', 'conocimiento/datos/series/ (tú confirmas)'],
  ['Ingesta CONTEXTO', 'los textos de la bandeja', 'no', 'no', 'sí', 'conocimiento/<fuente>/'],
  ['Conocimiento (¿qué opinan?, resumen, quiz)', 'notas de tu mezcla', 'no', 'no', 'normalizado*', 'conocimiento/mundo/ · quiz/'],
  ['Análisis y Rex «Mis finanzas»', 'tus datos + tu base', 'no', 'sí', 'normalizado*', 'analisis/ · chat/privado/ · decisiones/'],
  ['Rex «Conocimiento + internet»', 'tu base pública (nunca Mis notas)', 'sí', 'no', 'sí', 'chat/web/'],
  ['Descubrir', 'tema o noticias públicas · opcional: nombres de tus clases', 'sí', 'no', 'sí', 'conocimiento/descubrimientos/'],
  ['Encaje con tu cartera', 'informe validado + tu cartera', 'no', 'sí', 'normalizado*', 'analisis/encajes/'],
];

export function barraR1({ ejecucionesHoy = 0 } = {}) {
  return html`<button type="button" class="r1bar ck" data-accion="abrir-r1" aria-label="Regla R1: ver cómo se garantiza">
    <span>🔒 <b style="font-weight:500">R1</b> · ningún trabajo de Claude junta tus datos privados + texto externo + internet</span>
    <span class="mut">${TRABAJOS_R1.length} trabajos aislados · registro de hoy: ${ejecucionesHoy} ejecuciones · ver →</span>
  </button>`;
}

const color = (v, col) => (v === 'sí' ? (col === 3 ? 'var(--ep-h)' : 'var(--text-warning)') : v === 'no' ? 'var(--text-success)' : 'var(--text-secondary)');

export function abrirR1() {
  abrir({
    titulo: '🔒 Regla R1 · crítica',
    ancho: true,
    cuerpo: html`<div style="margin:8px 0 12px;padding:9px 11px;border-radius:8px;background:var(--bg-warning);color:var(--text-warning);font-size:12px;line-height:1.6"><b style="font-weight:500">Ningún trabajo de Claude junta a la vez tus datos privados, texto externo y salida a internet.</b> Por eso un texto con instrucciones escondidas no puede sacar tus cifras.</div>
      <table class="tb"><thead><tr><th>trabajo</th><th>recibe</th><th>internet</th><th>datos privados</th><th>texto externo</th><th>escribe en</th></tr></thead>
      <tbody>${TRABAJOS_R1.map((j) => html`<tr><td>${j[0]}</td><td class="mut" style="font-size:10.5px">${j[1]}</td>${[2, 3, 4].map((i) => html`<td style="color:${color(j[i], i)}">${j[i]}</td>`)}<td class="mut" style="font-size:10.5px">${j[5]}</td></tr>`)}</tbody></table>
      <div class="mut" style="font-size:10.5px;margin-top:4px">* Lee notas que vinieron de fuera, pero ya normalizadas y sin internet: aunque una contuviera instrucciones, no tiene por dónde enviar nada.</div>
      <div class="lab" style="margin-top:12px">Cómo se garantiza</div>
      <div style="font-size:11px;line-height:1.8">· El servidor arma cada trabajo: entrada, herramientas permitidas y destino. Sin terminal ni lectura de disco.<br>· Claude Code aislado: sin tus MCP, plugins, hooks ni CLAUDE.md, y una guardia que aborta si aparece algo de más (docs/CLAUDE-CLI.md).<br>· Test que falla si algún trabajo reúne los tres ingredientes · tests con textos trampa.<br>· Salidas que no cumplen el formato → cuarentena.</div>
      <div class="lab" style="margin-top:12px">Registro de Claude · hoy</div>
      <div class="mut" style="font-size:11px">Sin ejecuciones registradas. Los trabajos de Claude llegan en la fase F9.</div>`,
  });
}
