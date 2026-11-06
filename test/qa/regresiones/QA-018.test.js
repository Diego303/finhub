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

test('QA-018: mover una nota de Mis notas a una fuente no privada se rechaza (sería blanquearla)', () => {
  const fs = ficherosEjemplo();
  fs.set('conocimiento/mias/secreta.md', NOTA().replace('- fuente: FUENTE\n', ''));
  const op = (args) => aplicarOp((x) => fs.get(x) ?? null, 'nota.mover', args, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
  assert.throws(() => op({ ruta: 'conocimiento/mias/secreta.md', id: 'N-9001', fuente: 'pizarra' }), (e) => e instanceof ErrorOp && /privad/i.test(e.message));
  assert.throws(() => op({ ruta: 'conocimiento/mias/secreta.md', id: 'N-9001', fuente: 'base' }), (e) => e instanceof ErrorOp && /privad/i.test(e.message));
  // al revés (de una fuente pública a Mis notas) sí se puede
  assert.ok(op({ ruta: 'conocimiento/pizarra/2026-10-28-valoraciones.md', id: 'P-0019', fuente: 'mias' }).resultado.ruta.startsWith('conocimiento/mias/'));
});
