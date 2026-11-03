// Gráfico de líneas con banda opcional (maqueta: line()). Geometría en /core/graficos/geometria.js.
import { html, unir } from '../esc.js';
import { lineas } from '/core/graficos/geometria.js';

/**
 * series: [{valores, color, grosor?, discontinua?, nombre?}] · banda: {inf, sup, color} ·
 * etiquetaY(v) → texto · etiquetasX: [texto|''] por punto · titulo: para lectores de pantalla.
 */
export function graficoLineas({ series, ancho = 440, alto = 150, etiquetaY = (v) => Math.round(v), etiquetasX = [], banda = null, min, max, titulo = 'gráfico de líneas' }) {
  const g = lineas({ series, ancho, alto, min, max, banda: banda ? [banda.inf, banda.sup] : null });
  return html`<svg width="100%" viewBox="0 0 ${ancho} ${alto}" style="display:block" role="img" aria-label="${titulo}">
    ${unir(g.rejilla.map((r) => html`<line x1="0" x2="${ancho - 42}" y1="${r.y}" y2="${r.y}" stroke="var(--border)" stroke-dasharray="2 3"/><text x="${ancho - 38}" y="${r.y + 3}" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${etiquetaY(r.valor)}</text>`))}
    ${g.banda ? html`<polygon points="${g.banda}" fill="${banda.color}" opacity=".18"/>` : ''}
    ${unir(series.map((s, i) => html`<polyline fill="none" stroke="${s.color}" stroke-width="${s.grosor ?? 1.6}" ${s.discontinua ? html`stroke-dasharray="4 3"` : ''} points="${g.puntos[i]}"/><circle cx="${g.ultimo[i].x}" cy="${g.ultimo[i].y}" r="2.6" fill="${s.color}"/>`))}
    ${unir(etiquetasX.map((t, i) => (t ? html`<text x="${g.x(i)}" y="${alto - 2}" font-size="9" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-mono)">${t}</text>` : '')))}
  </svg>`;
}
