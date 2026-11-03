// Línea de tiempo del patrimonio (maqueta: timeline()): patrimonio, lo que has puesto tú (discontinua), lo
// que ha añadido el mercado (zona entre las dos) y los hitos. Cada hito es un botón que abre su edición.
import { html, unir } from '../esc.js';
import { lineas } from '/core/graficos/geometria.js';
import { MESES_CORTOS } from '/core/fechas.js';

const COLOR = { mío: '#1D9E75', mundo: '#888780' };

/** datos: de core/panel.js lineaDeTiempo() */
export function graficoLineaTiempo(datos, { ancho = 440, alto = 160 } = {}) {
  const k = (c) => c / 100000; // miles de euros
  const pat = datos.patrimonio.map(k);
  const puesto = datos.puesto.map(k);
  const g = lineas({ series: [{ valores: pat }, { valores: puesto }], ancho, alto, banda: [pat, puesto], margen: { izq: 14, der: 46, sup: 18, inf: 34 } });
  const ultimo = datos.patrimonio.at(-1);
  return html`<svg width="100%" viewBox="0 0 ${ancho} ${alto}" style="display:block" role="img" aria-label="Patrimonio de los últimos 12 meses: de ${Math.round(pat[0])} mil a ${Math.round(k(ultimo))} mil euros, con ${datos.hitos.length} hitos">
    ${unir(g.rejilla.map((r) => html`<line x1="0" x2="${ancho - 46}" y1="${r.y}" y2="${r.y}" stroke="var(--border)" stroke-dasharray="2 3"/><text x="${ancho - 42}" y="${r.y + 3}" font-size="9" fill="var(--text-muted)" font-family="var(--font-mono)">${r.valor.toFixed(0)}k</text>`))}
    <polygon points="${g.banda}" fill="#D85A30" opacity=".12"/>
    <polyline fill="none" stroke="var(--text-muted)" stroke-dasharray="4 3" points="${g.puntos[1]}"/>
    <polyline fill="none" stroke="#D85A30" stroke-width="2" points="${g.puntos[0]}"/>
    ${unir(datos.hitos.filter((h) => h.indice >= 0).map((h, n) => {
      const x = g.x(h.indice);
      const y = g.y(pat[h.indice]);
      const c = COLOR[h.tipo] ?? '#888780';
      return html`<g class="hito" data-accion="hito-form" data-id="${h.id}" role="button" tabindex="0" aria-label="Hito: ${h.texto} (${h.fecha})" style="cursor:pointer"><title>${h.fecha} · ${h.texto}</title>
        <line x1="${x}" x2="${x}" y1="${y}" y2="${alto - 26}" stroke="${c}" stroke-dasharray="1 2"/>
        <circle cx="${x}" cy="${y}" r="3.4" fill="${h.tipo === 'mío' ? c : 'var(--surface-2)'}" stroke="${c}" stroke-width="1.3"/>
        <text x="${x}" y="${alto - 2 - (n % 3) * 8}" font-size="8.5" text-anchor="${h.indice === 0 ? 'start' : h.indice === datos.meses.length - 1 ? 'end' : 'middle'}" fill="${c}" font-family="var(--font-mono)">${h.texto.length > 18 ? `${h.texto.slice(0, 17)}…` : h.texto}</text></g>`;
    }))}
    ${unir(datos.meses.map((m, i) => (i % 2 ? '' : html`<text x="${g.x(i)}" y="10" font-size="8.5" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-mono)">${MESES_CORTOS[+m.slice(5) - 1]}</text>`)))}
  </svg>`;
}
