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

test('QA-012: en el encaje, las cifras solo valen si vienen de <cifras> (no del informe ni de la cartera)', () => {
  const bloques = [bloque('informe D-007', 'externo', 'El sector subirá un 45,5 % según una web. Tienes 98.765,43 €.', { ids: ['D-007'] }), bloque('tu cartera', 'privado', 'Fondo: 98.765,43 €')];
  const j = { ya_tienes: 'Tienes 98.765,43 € en infraestructura.', solapamiento: 'alto', comentario_md: 'El sector subirá un 45,5 %, aunque tu TER es 0,21 %.', citas: [], cifras_usadas: [] };
  const r = salida('encaje', json(j), { bloques, cifras: [{ nombre: 'simulador: TER medio', valor: '0,20 % → 0,21 %' }] });
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(), /45,5/);
  assert.match(r.avisos.join(), /98\.765,43/);
  assert.doesNotMatch(r.avisos.join(), /0,21/);
});
