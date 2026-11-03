// Mapa de exposición (maqueta: treemap()). Geometría en /core/graficos/geometria.js.
import { html, unir } from '../esc.js';
import { treemap } from '/core/graficos/geometria.js';

/** datos: [{nombre, valor, color}] · formato(valor) → texto de la segunda línea. */
export function graficoTreemap({ datos, formato = (v) => `${v} %`, ancho = 400, alto = 170, titulo = 'mapa de exposición' }) {
  const celdas = treemap({ datos, ancho, alto });
  return html`<svg width="100%" viewBox="0 0 ${ancho} ${alto}" style="display:block" role="img" aria-label="${titulo}">
    ${unir(celdas.map((c) => html`<rect x="${c.x + 1}" y="${c.y + 1}" width="${Math.max(0, c.w - 2)}" height="${Math.max(0, c.h - 2)}" rx="4" fill="${c.color}" opacity=".85"><title>${c.nombre}: ${formato(c.valor)}</title></rect>${c.conEtiqueta ? html`<text x="${c.x + 7}" y="${c.y + 16}" font-size="10" fill="#fff" font-family="var(--font-mono)">${c.nombre}</text><text x="${c.x + 7}" y="${c.y + 29}" font-size="10" fill="#fff" opacity=".85" font-family="var(--font-mono)">${formato(c.valor)}</text>` : ''}`))}
  </svg>`;
}
