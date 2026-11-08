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

test('QA-022: un importe en euros en CUALQUIER texto de un descubrimiento va a cuarentena', () => {
  for (const [nombre, d] of Object.entries({
    afirmación: { ...SALUD, afirmaciones: [{ tipo: 'hecho', texto: 'Tienes 37.117 € en bolsa.' }] },
    vehículo: { ...SALUD, vehiculos: [{ nombre: 'Tus 3.000 euros en este ETF' }] },
    predicción: { ...SALUD, prediccion: { texto: 'Ganarás 500 € en un año', horizonte: '12 meses' } },
  })) {
    const r = salida('descubrir', json({ descubrimientos: [d] }), { params: { modo: 'nuevas' } });
    assert.equal(r.ok, false, nombre);
    assert.match(r.motivo, /importe en euros/, nombre);
  }
  const visible = salida('descubrir', json({ descubrimientos: [SALUD] }, 'Con tus 37.117 € ya tienes bastante.'), { params: { modo: 'nuevas' } });
  assert.equal(visible.ok, false, 'en el texto para mostrar');
});
