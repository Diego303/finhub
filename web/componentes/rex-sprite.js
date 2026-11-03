// Rex en píxeles (el de la maqueta) con sus 5 estados (§5):
// quieto · piensa (trabajo en marcha) · habla (llegan deltas) · feliz (éxito o meta) · preocupado (error o tasa baja).
import { html, unir, pintar } from '../esc.js';

const NARANJA = '#D85A30';
const COLOR = { '#': NARANJA, o: '#4A1B0C', y: '#EF9F27' };
const CUERPO = ['....####.....', '....#o####...', '....######...', '....####.....', '#..######....', '########.....', '.######......', '..#..#.......', '..#..#.......'];
export const ESTADOS = ['quieto', 'piensa', 'habla', 'feliz', 'preocupado'];
/** Los píxeles de Rex, para dibujarlo fuera del SVG (p. ej. el PNG de Tu año). */
export const PIXELES_REX = { cuerpo: CUERPO, color: COLOR };
const NOMBRES = { quieto: 'tranquilo', piensa: 'pensando', habla: 'hablando', feliz: 'contento', preocupado: 'preocupado' };

const pixeles = unir(CUERPO.flatMap((fila, y) => [...fila].map((c, x) => (c === '.' ? '' : html`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${COLOR[c]}"/>`))));

/** Interior del SVG para un estado y un fotograma (la animación alterna fotogramas). */
export function interior(estado, f = 0) {
  const impar = f % 2 === 1;
  const partes = [pixeles];
  if (estado === 'habla' && impar) partes.push(html`<rect x="8" y="3" width="2" height="0.6" fill="${COLOR.o}"/>`);
  if (estado === 'piensa') partes.push(html`<rect x="10.5" y="${impar ? 0 : -0.4}" width="0.8" height="0.8" fill="${COLOR.y}"/><rect x="11.8" y="${impar ? -1 : -1.4}" width="0.6" height="0.6" fill="${COLOR.y}"/>`);
  if (estado === 'preocupado') {
    // ceja caída y una gota de sudor (falta en la maqueta, §14.10)
    partes.push(html`<line x1="5.3" y1="0.75" x2="7.3" y2="1.15" stroke="${COLOR.o}" stroke-width="0.35"/><circle cx="3.4" cy="${impar ? 1.7 : 1.3}" r="0.45" fill="#85B7EB"/>`);
  }
  partes.push(html`<rect x="5.6" y="1.2" width="1.6" height="1.6" fill="none" stroke="#444441" stroke-width="0.25"/>`);
  const cy = 5.2 + (estado === 'feliz' && impar ? -1.2 : 0) + (estado === 'preocupado' ? 0.4 : 0);
  partes.push(html`<circle cx="9.6" cy="${cy}" r="1.1" fill="${COLOR.y}"/><text x="9.6" y="${cy + 0.45}" font-size="1.4" text-anchor="middle" fill="#633806" font-family="monospace">€</text>`);
  return unir(partes);
}

/** <svg> de Rex. Se anima solo (ticker) y cambia con data-rex-estado. */
export function rex(ancho, alto, estado = 'quieto') {
  return html`<svg class="rex" data-rex data-rex-estado="${estado}" width="${ancho}" height="${alto}" viewBox="-1 -2 14 12" role="img" aria-label="Rex ${NOMBRES[estado] ?? estado}">${interior(estado, 0)}</svg>`;
}

let fotograma = 0;
let ticker = null;
export function arrancarAnimacion() {
  if (ticker) return;
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  ticker = setInterval(() => {
    fotograma++;
    document.querySelectorAll('[data-rex]').forEach((el) => {
      const e = el.dataset.rexEstado;
      el.setAttribute('aria-label', `Rex ${NOMBRES[e] ?? e}`);
      pintar(el, interior(e, reducido ? 0 : fotograma));
    });
  }, 350);
}
