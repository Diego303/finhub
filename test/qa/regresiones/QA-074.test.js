// QA-074 (bajo): el Data Portal del BCE devolvió 503 a WebFetch en tres intentos (con curl sí responde), y eurusd se quedaba sin datos.
// Ahora hay una segunda fuente: EURUSD=X en Yahoo, que difiere del tipo de referencia del BCE un 0,25 % de mediana (1,4 % como mucho, 2003–2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifiesto } from '../../../src/core/datos.js';
import { RAIZ } from '../entorno.js';

test('eurusd tiene una segunda fuente si el BCE no responde, y se dice en el origen', () => {
  const s = parseManifiesto(readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8')).find((x) => x.id === 'eurusd');
  assert.match(s.proxy, /EURUSD=X/);
  assert.match(s.proxy, /data-api\.ecb\.europa\.eu/);
  assert.match(s.metodo, /origen/);
});
