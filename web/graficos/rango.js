// Barra de rango de escenarios (maqueta: rng()). Geometría en /core/graficos/geometria.js.
import { html } from '../esc.js';
import { rango } from '/core/graficos/geometria.js';

const COLOR = { negativo: '#E24B4A', positivo: '#1D9E75', mixto: '#7F77DD' };
const signo = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',').replace('-', '−')}`;

export function barraRango({ desde, hasta, dominio = [-20, 20], ancho = 150 }) {
  const r = rango({ desde, hasta, dominio, ancho });
  return html`<svg width="${ancho + 64}" height="14" style="vertical-align:middle" role="img" aria-label="de ${signo(desde)} a ${signo(hasta)} %"><line x1="${r.x0}" x2="${r.x0}" y1="1" y2="13" stroke="var(--border-strong)"/><rect x="${r.x}" y="4" width="${r.w}" height="6" rx="3" fill="${COLOR[r.signo]}" opacity=".75"/><text x="${ancho + 4}" y="11" font-size="9.5" fill="var(--text-secondary)" font-family="var(--font-mono)">${signo(desde)}…${signo(hasta)} %</text></svg>`;
}
