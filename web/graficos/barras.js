// Barras verticales simples (p. ej. tasa de ahorro mes a mes). Geometría en /core/graficos/geometria.js.
import { html, unir } from '../esc.js';
import { barras } from '/core/graficos/geometria.js';

export function graficoBarras({ valores, etiquetas = [], color = '#1D9E75', ancho = 420, alto = 110, formato = String, titulo = 'gráfico de barras' }) {
  const b = barras({ valores, ancho, alto: alto - 14 });
  return html`<svg width="100%" viewBox="0 0 ${ancho} ${alto}" style="display:block" role="img" aria-label="${titulo}">
    ${unir(b.map((r, i) => html`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${Math.max(1, r.h)}" rx="2" fill="${r.valor < 0 ? '#E24B4A' : color}" opacity=".8"><title>${etiquetas[i] ?? ''} ${formato(r.valor)}</title></rect>${etiquetas[i] ? html`<text x="${r.x + r.w / 2}" y="${alto - 2}" font-size="9" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-mono)">${etiquetas[i]}</text>` : ''}`))}
  </svg>`;
}
