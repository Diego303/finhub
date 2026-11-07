// QA-072 (cifras, alto): con range=max, Yahoo da datos semanales en los ETF con poca historia (IUSN.DE, EUNA.DE), y Claude los dejaba fuera. Y en un ETF que
// reparte, el cierre no lleva dividendos: SYBA.DE 2011–2026 da +6 % con close y +26 % con adjclose, y es la serie de la clase Renta fija por defecto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { parseManifiesto } from '../../../src/core/datos.js';
import { ficherosEjemplo, HOY, modeloDe } from '../ayuda-claude.js';
import { RAIZ } from '../entorno.js';

const texto = () => readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8');
const tarea = () => trabajo('datos').entrada(modeloDe(ficherosEjemplo()), { series: [{ id: 'x', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: null }], hoy: HOY }).tarea;

test('la consulta a Yahoo pide meses de verdad y con dividendos', () => {
  for (const t of [tarea(), texto()]) {
    assert.doesNotMatch(t, /range=max/);
    assert.match(t, /period1=0&period2=4102444800&interval=1mo/);
    assert.match(t, /adjclose/);
  }
});

test('las series que se quedaban sin encontrar tienen de dónde salir', () => {
  assert.match(tarea(), /SYBA\.DE/);
  const m = parseManifiesto(texto());
  assert.match(m.find((s) => s.id === 'rf-euro-agregada').proxy, /SYBA\.DE/);
  assert.match(m.find((s) => s.id === 'eurusd').proxy, /data-api\.ecb\.europa\.eu\/service\/data\/EXR\/M\.USD\.EUR\.SP00\.E/);
});
