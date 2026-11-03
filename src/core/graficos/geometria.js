// Geometría pura de los gráficos (§2.1 core/graficos): sin DOM. La web la convierte en SVG.
// Los mismos algoritmos que la maqueta, parametrizados y con tests.

/** Escala lineal [d0,d1] → [r0,r1]. Si el dominio es nulo, centra. */
export function escalaLineal([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

/** Mínimo y máximo de varias series, con margen opcional. */
export function extension(series, { min, max } = {}) {
  const todos = series.flat().filter((v) => Number.isFinite(v));
  if (!todos.length) return [0, 1];
  return [min ?? Math.min(...todos), max ?? Math.max(...todos)];
}

/**
 * Gráfico de líneas (maqueta: line()). series: [{valores:[…]}] de igual longitud.
 * → {x(i), y(v), puntos: [ "x,y …" ], rejilla: [{y, valor}], ultimo: [{x,y}], banda?: "polígono"}
 */
export function lineas({ series, ancho, alto, min, max, banda = null, margen = { izq: 12, der: 44, sup: 10, inf: 14 } }) {
  const n = Math.max(...series.map((s) => s.valores.length));
  const [mn, mx] = extension([...series.map((s) => s.valores), ...(banda ? banda : [])], { min, max });
  const x = (i) => margen.izq + (n <= 1 ? 0 : (i * (ancho - margen.izq - margen.der)) / (n - 1));
  const y = escalaLineal([mn, mx], [alto - margen.inf, margen.sup]);
  const puntos = series.map((s) => s.valores.map((v, i) => `${redondear(x(i))},${redondear(y(v))}`).join(' '));
  const rejilla = [0, 0.5, 1].map((t) => ({ valor: mn + t * (mx - mn), y: redondear(y(mn + t * (mx - mn))) }));
  const ultimo = series.map((s) => ({ x: redondear(x(s.valores.length - 1)), y: redondear(y(s.valores.at(-1))) }));
  const poligono = banda ? [...banda[0].map((v, i) => `${redondear(x(i))},${redondear(y(v))}`), ...banda[1].map((v, i) => `${redondear(x(i))},${redondear(y(v))}`).reverse()].join(' ') : null;
  return { x: (i) => redondear(x(i)), y: (v) => redondear(y(v)), puntos, rejilla, ultimo, banda: poligono, min: mn, max: mx };
}

/**
 * Sankey de un mes (maqueta: sankey()): entradas → «tu dinero» → salidas.
 * entradas/salidas: [{nombre, valor ≥ 0}] (en céntimos). Si salen menos de las que entran, se añade «Queda».
 */
export function sankey({ entradas, salidas, ancho = 560, alto = 230, hueco = 4, huecoIzq = 12 }) {
  const tin = entradas.reduce((a, e) => a + Math.max(0, e.valor), 0);
  const tout = salidas.reduce((a, s) => a + Math.max(0, s.valor), 0);
  const der = [...salidas.map((s) => ({ ...s, valor: Math.max(0, s.valor) }))];
  if (tin > tout) der.push({ nombre: 'Queda', valor: tin - tout, queda: true });
  const total = Math.max(tin, tout) || 1;
  const sc = (alto - hueco * der.length) / total;
  let y = 0;
  const izq = entradas.map((e) => {
    const r = { ...e, y: redondear(y), h: redondear(Math.max(0, e.valor) * sc) };
    y += Math.max(0, e.valor) * sc + huecoIzq;
    return r;
  });
  const cy0 = (alto - tin * sc) / 2;
  let yd = 0;
  const derecha = der.map((d) => {
    const r = { ...d, y: redondear(yd), h: redondear(d.valor * sc) };
    yd += d.valor * sc + hueco;
    return r;
  });
  const enlaces = [];
  let yc = cy0;
  for (const s of izq) {
    enlaces.push({ lado: 'entrada', grosor: Math.max(1, s.h), d: `M110 ${redondear(s.y + s.h / 2)} C190 ${redondear(s.y + s.h / 2)} 190 ${redondear(yc + s.h / 2)} 270 ${redondear(yc + s.h / 2)}` });
    yc += s.h;
  }
  yc = cy0;
  for (const d of derecha) {
    enlaces.push({ lado: 'salida', nombre: d.nombre, grosor: Math.max(1, d.h), d: `M282 ${redondear(yc + d.h / 2)} C360 ${redondear(yc + d.h / 2)} 360 ${redondear(d.y + d.h / 2)} 430 ${redondear(d.y + d.h / 2)}` });
    yc += d.h;
  }
  // etiquetas de la derecha sin solaparse (separación mínima de 12)
  let ly = -99;
  for (const d of derecha) {
    d.etiquetaY = redondear(Math.max(ly + 12, d.y + d.h / 2 + 3));
    ly = d.etiquetaY;
  }
  return { izq, centro: { y: redondear(cy0), h: redondear(tin * sc) }, der: derecha, enlaces, ancho, alto };
}

/** Treemap por cortes alternos (maqueta: treemap()). datos: [{nombre, valor}] → rectángulos ordenados de mayor a menor. */
export function treemap({ datos, ancho = 400, alto = 170 }) {
  const orden = [...datos].filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor);
  let x = 0;
  let y = 0;
  let w = ancho;
  let h = alto;
  let resto = orden.reduce((a, d) => a + d.valor, 0);
  let vertical = true;
  return orden.map((d, i) => {
    const ultimo = i === orden.length - 1;
    const f = resto ? d.valor / resto : 0;
    let r;
    if (vertical) {
      const rw = ultimo ? w : w * f;
      r = { x, y, w: rw, h };
      x += rw;
      w -= rw;
    } else {
      const rh = ultimo ? h : h * f;
      r = { x, y, w, h: rh };
      y += rh;
      h -= rh;
    }
    resto -= d.valor;
    vertical = !vertical;
    const rect = { ...d, x: redondear(r.x), y: redondear(r.y), w: redondear(r.w), h: redondear(r.h) };
    rect.conEtiqueta = rect.w > 44 && rect.h > 22;
    return rect;
  });
}

/** Barra de rango (maqueta: rng()): [a,b] dentro de un dominio simétrico. */
export function rango({ desde, hasta, dominio = [-20, 20], ancho = 150 }) {
  const x = escalaLineal(dominio, [0, ancho]);
  const a = Math.max(dominio[0], Math.min(dominio[1], desde));
  const b = Math.max(dominio[0], Math.min(dominio[1], hasta));
  return { x0: redondear(x(0)), x: redondear(x(a)), w: redondear(x(b) - x(a)), signo: b < 0 ? 'negativo' : a > 0 ? 'positivo' : 'mixto' };
}

/** Barras verticales: valores → [{x, y, w, h}] con base en 0 (admite negativos). */
export function barras({ valores, ancho, alto, hueco = 2 }) {
  const n = valores.length || 1;
  const [mn, mx] = extension([valores], {});
  const lo = Math.min(0, mn);
  const hi = Math.max(0, mx) || 1;
  const y = escalaLineal([lo, hi], [alto, 0]);
  const w = (ancho - hueco * (n - 1)) / n;
  return valores.map((v, i) => ({ x: redondear(i * (w + hueco)), y: redondear(Math.min(y(v), y(0))), w: redondear(w), h: redondear(Math.abs(y(v) - y(0))), valor: v }));
}

export function redondear(v) {
  return Math.round(v * 100) / 100;
}
