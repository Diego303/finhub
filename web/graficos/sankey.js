// Mapa del dinero (maqueta: sankey()). Geometría en /core/graficos/geometria.js.
import { html, unir } from '../esc.js';
import { sankey } from '/core/graficos/geometria.js';

const NARANJA = '#D85A30';

/** entradas: [{nombre, valor}] · salidas: [{nombre, valor, color}] · formato(valor) → texto. */
export function graficoSankey({ entradas, salidas, formato = String, ancho = 560, alto = 230, titulo = 'mapa del dinero' }) {
  const g = sankey({ entradas, salidas, ancho, alto });
  const colorDe = (d) => (d.queda ? '#D3D1C7' : d.color ?? '#888780');
  return html`<svg width="100%" viewBox="0 0 ${ancho} ${alto}" style="display:block;max-width:720px;margin:0 auto" role="img" aria-label="${titulo}">
    ${unir(g.enlaces.map((e, i) => html`<path d="${e.d}" stroke="${e.lado === 'entrada' ? '#1D9E75' : colorDe(g.der[i - g.izq.length])}" stroke-opacity="${e.lado === 'entrada' ? '.35' : '.45'}" stroke-width="${e.grosor}" fill="none"/>`))}
    ${unir(g.izq.map((s) => html`<rect x="100" y="${s.y}" width="10" height="${Math.max(2, s.h)}" fill="#1D9E75"/><text x="96" y="${s.y + s.h / 2 + 3}" font-size="9.5" text-anchor="end" fill="var(--text-primary)" font-family="var(--font-mono)">${s.nombre} ${formato(s.valor)}</text>`))}
    <rect x="270" y="${g.centro.y}" width="12" height="${g.centro.h}" fill="${NARANJA}"/><text x="276" y="${g.centro.y - 4}" font-size="9.5" text-anchor="middle" fill="var(--text-secondary)" font-family="var(--font-mono)">tu dinero</text>
    ${unir(g.der.map((d) => html`<rect x="430" y="${d.y}" width="10" height="${Math.max(2, d.h)}" fill="${colorDe(d)}"/><text x="446" y="${d.etiquetaY}" font-size="9.5" fill="var(--text-primary)" font-family="var(--font-mono)">${d.nombre} <tspan fill="var(--text-secondary)">${formato(d.valor)}</tspan></text>`))}
  </svg>`;
}
