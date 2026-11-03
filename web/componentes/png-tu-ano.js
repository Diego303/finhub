// PNG de Tu año dibujado en <canvas> por código (§5 Tu año): sin librerías ni capturas del DOM.
// Siempre en tema claro, para que se lea igual compartida en cualquier sitio.
import { PIXELES_REX } from './rex-sprite.js';
import { tarjetas, periodoTexto, etiquetaMes } from '/core/tu-ano.js';

const ANCHO = 1200;
const ALTO = 860;
const FUENTE = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function texto(ctx, t, x, y, { tam = 16, peso = 400, color = '#2C2C2A', alinear = 'left', max = null } = {}) {
  ctx.font = `${peso} ${tam}px ${FUENTE}`;
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  let s = String(t);
  if (max) while (s.length > 1 && ctx.measureText(s).width > max) s = `${s.slice(0, -2)}…`;
  ctx.fillText(s, x, y);
}

function caja(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** → <canvas> con el resumen del año (t de core/tu-ano.js tuAnio). */
export function dibujarTuAnio(t, { nombre = null } = {}) {
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = ALTO;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F7F6F2';
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // cabecera con degradado
  const g = ctx.createLinearGradient(0, 0, ANCHO, 220);
  g.addColorStop(0, '#D85A3026');
  g.addColorStop(1, '#7F77DD26');
  caja(ctx, 40, 32, ANCHO - 80, 200, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  // Rex en píxeles
  const px = 9;
  PIXELES_REX.cuerpo.forEach((fila, yy) => [...fila].forEach((ch, xx) => {
    if (ch === '.') return;
    ctx.fillStyle = PIXELES_REX.color[ch];
    ctx.fillRect(ANCHO / 2 - 60 + xx * px, 52 + yy * px, px + 0.5, px + 0.5);
  }));
  texto(ctx, `${nombre ? `${nombre}: tu` : 'Tu'} ${t.anio} en finanzas`, ANCHO / 2, 175, { tam: 34, peso: 600, alinear: 'center' });
  texto(ctx, periodoTexto(t), ANCHO / 2, 208, { tam: 16, color: '#5F5E5A', alinear: 'center' });
  // 8 tarjetas
  const cs = tarjetas(t);
  const cw = (ANCHO - 80 - 3 * 16) / 4;
  cs.forEach((k, i) => {
    const x = 40 + (i % 4) * (cw + 16);
    const y = 256 + Math.floor(i / 4) * 150;
    caja(ctx, x, y, cw, 134);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = k.color;
    ctx.fillRect(x, y, cw, 5);
    texto(ctx, k.titulo, x + 16, y + 34, { tam: 14, color: '#5F5E5A', max: cw - 32 });
    texto(ctx, k.valor, x + 16, y + 76, { tam: k.valor.length > 12 ? 20 : 30, peso: 600, max: cw - 32 });
    texto(ctx, k.sub, x + 16, y + 108, { tam: 13, color: '#71706A', max: cw - 32 });
  });
  // tasa de ahorro mes a mes
  const y0 = 572;
  caja(ctx, 40, y0, ANCHO - 80, 240);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  texto(ctx, 'Tasa de ahorro mes a mes', 60, y0 + 34, { tam: 15, color: '#5F5E5A' });
  const tasas = t.tasas.filter((x) => x.pb !== null);
  if (tasas.length > 1) {
    const vals = tasas.map((x) => x.pb / 100);
    const mn = Math.min(0, ...vals);
    const mx = Math.max(...vals, 1);
    const X = (i) => 80 + (i * (ANCHO - 200)) / (tasas.length - 1);
    const Y = (v) => y0 + 200 - ((v - mn) / (mx - mn)) * 140;
    ctx.strokeStyle = '#E4E2DA';
    ctx.lineWidth = 1;
    for (const v of [mn, (mn + mx) / 2, mx]) {
      ctx.beginPath();
      ctx.moveTo(70, Y(v));
      ctx.lineTo(ANCHO - 110, Y(v));
      ctx.stroke();
      texto(ctx, `${Math.round(v)} %`, ANCHO - 100, Y(v) + 5, { tam: 13, color: '#71706A' });
    }
    ctx.strokeStyle = '#1D9E75';
    ctx.lineWidth = 3;
    ctx.beginPath();
    vals.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.stroke();
    tasas.forEach((x, i) => texto(ctx, etiquetaMes(x.mes), X(i), y0 + 226, { tam: 12, color: '#71706A', alinear: 'center' }));
  }
  texto(ctx, 'finhub · cifras calculadas por código con tus datos', ANCHO / 2, ALTO - 20, { tam: 13, color: '#8A8984', alinear: 'center' });
  return c;
}
