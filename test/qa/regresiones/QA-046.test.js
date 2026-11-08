// QA-046 (accesibilidad): textos con los colores de la maqueta (KPI, chips de postura y de naturaleza, leyendas), filas
// archivadas muy apagadas y accesorios bloqueados no llegaban a AA (4,5:1). La medida de verdad está en test/visual/aspecto.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from '../entorno.js';

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('la paleta de texto llega a AA sobre todas las superficies, en los dos temas', () => {
  const css = readFileSync(join(RAIZ, 'web/estilos.css'), 'utf8');
  const bloques = [...css.matchAll(/--t-naranja: (#\w+); --t-verde: (#\w+); --t-violeta: (#\w+); --t-azul: (#\w+); --t-rojo: (#\w+); --t-gris: (#\w+);/g)].map((m) => m.slice(1));
  assert.equal(bloques.length, 3, 'claro y los dos oscuros');
  for (const c of bloques[0]) for (const f of ['#ffffff', '#faf9f5', '#f5f4ef']) assert.ok(ratio(c, f) >= 4.5, `${c} sobre ${f}: ${ratio(c, f).toFixed(2)}`);
  for (const b of bloques.slice(1)) for (const c of b) for (const f of ['#2b2b29', '#232322', '#1a1a19']) assert.ok(ratio(c, f) >= 4.5, `${c} sobre ${f}: ${ratio(c, f).toFixed(2)}`);
});
