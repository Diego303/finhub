// QA-073 (bajo): el modelo de datos pasó a sonnet (QA-062), pero el diálogo y la carpeta de ejemplo seguían con haiku; y el diálogo decía que solo recibe el último mes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from '../entorno.js';

test('datos usa sonnet también en el ejemplo y en el diálogo, que dice lo que recibe', () => {
  assert.doesNotMatch(readFileSync(join(RAIZ, 'ejemplo/ajustes.md'), 'utf8'), /datos=haiku/);
  const web = readFileSync(join(RAIZ, 'web/componentes/claude.js'), 'utf8');
  assert.doesNotMatch(web, /claude_modelo\?\.datos \?\? 'haiku'/);
  assert.doesNotMatch(web, /el último mes que tienes/);
});
