// QA-009 a QA-013, QA-022 · Validación y verificación de la salida de Claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesarSalida } from '../../../src/claude/motor.js';
import { montarPrompt, bloque } from '../../../src/claude/contexto.js';
import { cifrasNoVerificadas, permitidos, revisarCitas } from '../../../src/claude/verificador.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { ESQUEMAS } from '../../../src/claude/tareas.js';
import { ficherosEjemplo, modeloDe, json, HOY } from '../ayuda-claude.js';

const M = modeloDe(ficherosEjemplo());
const salida = (id, texto, { bloques = [bloque('notas:base', 'publico', 'x', { ids: ['B-1001'] })], cifras = [], esquema, params = {} } = {}) => {
  const t = trabajo(id);
  const prompt = montarPrompt(t, { tarea: 't', bloques, cifras, hoy: HOY, esquema: esquema ?? t.esquema });
  return procesarSalida(t, texto, { prompt, params, modelo: M, bloques, esquema: esquema ?? t.esquema });
};
const SALUD = { titulo: 'Salud global y envejecimiento', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'El envejecimiento sostiene la demanda de salud.', saldria_bien_si: 'x', la_invalidaria: 'x', riesgos: 'x', vehiculos: [], citas: [], afirmaciones: [], revisar_en_dias: 60 };

test('QA-011: las citas inventadas se quitan a cualquier nivel; las URL solo valen en trabajos con internet', () => {
  const esc = { escenarios: [{ nombre: 'base', prob: 60, porque: 'Base con su nota citada.', citas: ['B-1001', 'B-9999'] }, { nombre: 'optimista', prob: 20, porque: 'Sin citas por ahora, de verdad.', citas: [] }, { nombre: 'pesimista', prob: 20, porque: 'Sin citas por ahora, de verdad.', citas: [] }], ideas: [{ titulo: 'Idea', tipo: 'opinión', texto: 'Una idea con cita inventada.', citas: ['X-0001'] }] };
  const r = salida('privado', json(esc), { esquema: ESQUEMAS.escenarios });
  assert.deepEqual(r.json.escenarios[0].citas, ['B-1001']);
  assert.deepEqual(r.json.ideas[0].citas, []);
  assert.match(r.avisos.join(), /B-9999/);
  assert.match(r.avisos.join(), /X-0001/);
  // descubrir: las URL se conservan aunque lleven algo parecido a un id, y los ids inventados no
  const d = salida('descubrir', json({ descubrimientos: [{ ...SALUD, citas: ['https://x.example/AB-12345/informe', 'web:https://y.example/CD-777', 'B-1001', 'Z-0404'] }] }), { params: { modo: 'nuevas' } });
  assert.equal(d.ok, true, d.motivo);
  assert.deepEqual(d.json.descubrimientos[0].citas, ['https://x.example/AB-12345/informe', 'web:https://y.example/CD-777', 'B-1001']);
  assert.match(d.avisos.join(), /Z-0404/);
  // privado no tiene internet: una URL en sus citas (con datos en la query) se quita y se avisa
  const p = salida('privado', json({ respuesta_md: 'Vas bien.', citas: ['https://malo.example/?saldo=7913', 'B-1001'], cifras_usadas: [] }));
  assert.deepEqual(p.json.citas, ['B-1001']);
  assert.match(p.avisos.join(), /malo\.example/);
  assert.deepEqual(revisarCitas(['https://a.example/AB-12345'], [], { urls: true }).validas, ['https://a.example/AB-12345']);
});
