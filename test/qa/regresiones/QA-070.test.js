// QA-070 (bajo): el método de las series de ETF decía «valor liquidativo» aunque la fuente real sea la cotización de cierre: la serie guardada se contradecía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifiesto } from '../../../src/core/datos.js';
import { RAIZ } from '../entorno.js';

test('el método de los índices admite la cotización de cierre', () => {
  const ms = parseManifiesto(readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8'));
  const w = ms.find((s) => s.id === 'msci-world-nr-eur');
  assert.match(w.metodo, /cotización/);
  assert.match(w.proxy, /cierre mensual/);
  assert.match(ms.find((s) => s.id === 'sp500-eur').metodo, /cotiza/);
});
