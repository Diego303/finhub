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

test('QA-010: las cifras inventadas se marcan en TODOS los textos que ve el usuario', () => {
  const esc = { escenarios: [{ nombre: 'base', prob: 60, porque: 'La cartera subirá un 37,7 % este año.', citas: [] }, { nombre: 'optimista', prob: 20, porque: 'Bajadas de tipos antes de lo previsto.', citas: [] }, { nombre: 'pesimista', prob: 20, porque: 'Valoraciones altas en la bolsa.', citas: [] }], ideas: [{ titulo: 'Idea con cifra', tipo: 'opinión', texto: 'Ahorrarías 4.321 € al año.', citas: [] }] };
  const r = salida('privado', json(esc), { esquema: ESQUEMAS.escenarios });
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(), /37,7/, 'en «porque»');
  assert.match(r.avisos.join(), /4\.321/, 'en «ideas[].texto»');
  const tu = salida('privado', json({ texto_md: 'Este año has ahorrado 9.876 € de golpe, un récord.', citas: [] }), { esquema: ESQUEMAS.texto });
  assert.match(tu.avisos.join(), /9\.876/, 'en «texto_md»');
  const sem = salida('conocimiento', json({ secciones: [{ tema: 'Bolsa', texto: 'La bolsa subió un 33,3 % en una semana, según nadie.' }] }), { esquema: ESQUEMAS.semana });
  assert.match(sem.avisos.join(), /33,3/, 'en «secciones[].texto»');
  // lo que no es texto para el usuario no cuenta: fechas, ids, nombres de cifras
  const limpio = salida('privado', json({ respuesta_md: 'Vas bien [B-1001].', citas: ['B-1001'], cifras_usadas: ['rango 12 m (p5–p25) 2026'] }));
  assert.deepEqual(limpio.avisos, []);
});
