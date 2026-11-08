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

test('QA-013: tolerancia de redondeo según los decimales escritos; es-ES y en-US; los enteros pequeños con unidad cuentan', () => {
  const ok = permitidos({ cifras: [{ valor: '2,7 %' }, { valor: '1.234,56 €' }, { valor: '10,4 %' }] });
  const dudosa = (t) => cifrasNoVerificadas(t, ok).map((d) => d.texto);
  assert.deepEqual(dudosa('Unos 2,7 % y 1.234,56 €.'), []);
  assert.deepEqual(dudosa('En inglés, 1,234.56 euros.'), [], 'en-US completo');
  assert.deepEqual(dudosa('Redondeado: 1.235 € y 10 %.'), [], 'redondeo al escribir sin decimales');
  assert.deepEqual(dudosa('Inventada: 2,3 %.'), ['2,3'], 'un decimal escrito: tolerancia de una décima');
  assert.deepEqual(dudosa('Inventada: 7 % de rentabilidad.'), ['7'], 'un entero con % no es una enumeración');
  assert.deepEqual(dudosa('Inventado: 5 €.'), ['5']);
  assert.deepEqual(dudosa('Mira los 3 escenarios y los 12 meses.'), [], 'enumeraciones sin unidad');
});
