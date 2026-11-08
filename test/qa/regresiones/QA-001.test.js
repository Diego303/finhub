// QA-001, QA-002, QA-018 · Mis notas nunca dejan de ser privadas: ni por un campo de la nota, ni por _fuentes.md,
// ni moviéndolas a una fuente pública.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { notasParaTrabajo, bloquesNotas } from '../../../src/claude/contexto.js';
import { aplicarOp, ErrorOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { ficherosEjemplo, modeloDe, HOY } from '../ayuda-claude.js';

const NOTA = (extra = '') => `# Mis notas · secreta\nesquema: 1\nfuente: mias\n${extra}## N-9001 · CANARIO-NOTA\n- tipo: opinión\n- fecha: 2026-11-01\n- fuente: FUENTE\nTexto CANARIO-NOTA de mi nota.\n`;

test('QA-001: una nota de conocimiento/mias con «fuente: mundo» sigue siendo privada', () => {
  for (const fuente of ['mundo', 'base', 'datos']) {
    const fs = ficherosEjemplo();
    fs.set('conocimiento/mias/secreta.md', NOTA().replace('FUENTE', fuente));
    const m = modeloDe(fs);
    for (const id of ['rex-web', 'descubrir', 'conocimiento']) {
      const t = trabajo(id);
      const e = id === 'descubrir' ? t.entrada(m, { modo: 'nuevas', hoy: HOY }) : t.entrada(m, { pregunta: 'x', hoy: HOY });
      assert.doesNotMatch(e.bloques.map((b) => b.contenido).join(), /CANARIO-NOTA/, `${id} con fuente: ${fuente}`);
    }
  }
});

test('QA-001: la cabecera «fuente:» de un fichero de mias tampoco la hace pública', () => {
  const fs = ficherosEjemplo();
  fs.set('conocimiento/mias/secreta.md', NOTA().replace('fuente: mias\n', 'fuente: mundo\n').replace('- fuente: FUENTE\n', ''));
  const m = modeloDe(fs);
  const e = trabajo('descubrir').entrada(m, { modo: 'pulso', desde: '2026-10-01', hasta: HOY, hoy: HOY });
  assert.doesNotMatch(e.bloques.map((b) => b.contenido).join(), /CANARIO-NOTA/);
});
