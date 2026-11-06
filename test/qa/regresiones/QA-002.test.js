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

test('QA-002: «mias» es privada aunque _fuentes.md diga lo contrario o no la tenga', () => {
  const base = ficherosEjemplo();
  const variantes = {
    editada: (t) => t.replace(/^- mias \|.*$/m, '- mias | Mis notas | familia: mundo | privada: no | activa_por_defecto: sí'),
    borrada: (t) => t.replace(/^- mias \|.*\n/m, ''),
  };
  for (const [nombre, cambio] of Object.entries(variantes)) {
    const fs = new Map(base);
    fs.set('conocimiento/_fuentes.md', cambio(fs.get('conocimiento/_fuentes.md')));
    fs.set('conocimiento/mias/secreta.md', NOTA().replace('- fuente: FUENTE\n', ''));
    const m = modeloDe(fs);
    for (const id of ['rex-web', 'conocimiento', 'descubrir']) {
      const sel = notasParaTrabajo(m, trabajo(id), { hoy: HOY, fuentes: ['mias', 'base'] });
      assert.ok(!sel.notas.some((n) => n.fuente === 'mias'), `${id} (${nombre})`);
    }
    // en privado sí entra, y su bloque va marcado como privado
    const sel = notasParaTrabajo(m, trabajo('privado'), { hoy: HOY, fuentes: ['mias'] });
    assert.ok(sel.notas.some((n) => n.titulo === 'CANARIO-NOTA'), `privado (${nombre})`);
    assert.ok(bloquesNotas(sel.notas, m).every((b) => b.nivel === 'privado'), `nivel (${nombre})`);
  }
});
