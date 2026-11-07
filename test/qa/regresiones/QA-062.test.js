// QA-062 (funcionalidad rota con Claude real): las series de índices no se conseguían: las gestoras no dan la tabla mensual y el manifiesto no
// decía dónde más buscar. Sin ellas no hay proyección, escenarios ni comparativas. Con fuentes indicadas, sonnet trajo 35 meses de MSCI World por
// 0,09 USD; haiku ni siquiera conseguía el tipo del BCE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ajustesEfectivos } from '../../../src/core/formato/config.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { montarPrompt } from '../../../src/claude/contexto.js';
import { ficherosEjemplo, modeloDe, HOY } from '../ayuda-claude.js';
import { RAIZ } from '../entorno.js';

test('el manifiesto dice dónde buscar el histórico mensual, y que hay que comprobar el ticker', () => {
  const m = readFileSync(join(RAIZ, 'semilla/datos-manifiesto.md'), 'utf8');
  assert.match(m, /query1\.finance\.yahoo\.com/);
  assert.match(m, /stooq\.com/);
  assert.match(m, /EUNL\.DE/);
  assert.match(m, /comprueba/i);
});

test('los datos usan sonnet por defecto', () => {
  assert.equal(ajustesEfectivos({}).claude_modelo.datos, 'sonnet');
  assert.equal(trabajo('datos').modelo, 'sonnet');
});

test('las fuentes llegan de verdad al prompt, y le pide no inventar cifras', () => {
  const t = trabajo('datos');
  const e = t.entrada(modeloDe(ficherosEjemplo()), { series: [{ id: 'msci-world-nr-eur', que: 'x', unidad: 'indice', proxy: 'x', metodo: 'x', ultimo: null }], hoy: HOY });
  const u = montarPrompt(t, { ...e, hoy: HOY }).usuario;
  assert.match(u, /query1\.finance\.yahoo\.com/);
  assert.match(u, /stooq\.com/);
  assert.match(u, /EUNL\.DE/);
  assert.match(u, /nunca las estimes/);
});
