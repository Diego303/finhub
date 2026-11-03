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

// Accesorios (§5): los fijos que has desbloqueado (gafas, corbata, Japón, corona) y uno temporal (la lupa
// mientras «descubrir» investiga). En el SVG van como lista separada por espacios en data-rex-accesorio.
let fijos = [];
let temporal = '';
const accesorio = () => [...fijos, temporal].filter(Boolean).join(' ');
function aplicar() {
  document.querySelectorAll('[data-rex]').forEach((el) => (el.dataset.rexAccesorio = accesorio()));
}
export function ponerAccesorioRex(a = '') {
  temporal = a;
  aplicar();
}
export function ponerAccesoriosFijos(lista = []) {
  const nuevo = lista.join(' ');
  if (nuevo === fijos.join(' ')) return;
  fijos = [...lista];
  aplicar();
}
export const accesorioRex = accesorio;

/** Interior del SVG para un estado y un fotograma (la animación alterna fotogramas). */
export function interior(estado, f = 0, acc = '') {
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
  const accs = new Set(String(acc ?? '').split(' ').filter(Boolean));
  if (accs.has('japon')) partes.push(html`<rect x="3.9" y="0.15" width="6.2" height="0.6" fill="#F1EFE8"/><circle cx="7.9" cy="0.45" r="0.35" fill="#E24B4A"/>`);
  if (accs.has('corona')) partes.push(html`<path d="M4.3 0 L4.3 -1.4 L5.2 -0.6 L6.1 -1.7 L7 -0.6 L7.9 -1.4 L7.9 0 Z" fill="#EF9F27" stroke="#BA7517" stroke-width="0.15"/>`);
  if (accs.has('gafas')) partes.push(html`<rect x="5.3" y="0.9" width="2.2" height="2.2" fill="none" stroke="#2C2C2A" stroke-width="0.35"/><line x1="7.5" y1="1.9" x2="9" y2="1.6" stroke="#2C2C2A" stroke-width="0.3"/>`);
  if (accs.has('corbata')) partes.push(html`<path d="M6.6 4 L7.6 4 L7.4 4.6 L7.8 6.2 L7.1 6.8 L6.4 6.2 L6.8 4.6 Z" fill="#378ADD"/>`);
  if (accs.has('lupa')) {
    const dx = impar ? 0.3 : 0;
    partes.push(html`<line x1="${9.4 + dx}" y1="6.4" x2="${10.4 + dx}" y2="5.2" stroke="#444441" stroke-width="0.45"/><circle cx="${11.2 + dx}" cy="4.3" r="1.25" fill="#B5D4F4" fill-opacity="0.6" stroke="#444441" stroke-width="0.35"/>`);
  } else partes.push(html`<circle cx="9.6" cy="${cy}" r="1.1" fill="${COLOR.y}"/><text x="9.6" y="${cy + 0.45}" font-size="1.4" text-anchor="middle" fill="#633806" font-family="monospace">€</text>`);
  return unir(partes);
}

/** <svg> de Rex. Se anima solo (ticker) y cambia con data-rex-estado. */
export function rex(ancho, alto, estado = 'quieto') {
  return html`<svg class="rex" data-rex data-rex-estado="${estado}" data-rex-accesorio="${accesorio()}" width="${ancho}" height="${alto}" viewBox="-1 -2 14 12" role="img" aria-label="Rex ${NOMBRES[estado] ?? estado}${accesorio().includes('lupa') ? ' con la lupa' : ''}">${interior(estado, 0, accesorio())}</svg>`;
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
      const a = el.dataset.rexAccesorio ?? '';
      el.setAttribute('aria-label', `Rex ${NOMBRES[e] ?? e}${a.includes('lupa') ? ' con la lupa' : ''}`);
      pintar(el, interior(e, reducido ? 0 : fotograma, a));
    });
  }, 350);
}
