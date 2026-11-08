// QA-061: una cifra de tu propia pregunta («meter 500 € en oro») salía como «cifra no verificada» en la respuesta de Rex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesarSalida } from '../../../src/claude/motor.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { montarPrompt } from '../../../src/claude/contexto.js';
import { json, HOY } from '../ayuda-claude.js';

test('lo que dice tu pregunta no es una cifra inventada; lo demás sigue avisando', () => {
  const t = trabajo('privado');
  const prompt = montarPrompt(t, { tarea: 't', cifras: [], bloques: [], hoy: HOY, pregunta: 'Quiero meter 500 € en oro' });
  const r = procesarSalida(t, json({ respuesta_md: 'Meter 500 € supondría 777 € al final.', citas: [], cifras_usadas: [] }), { prompt, params: { pregunta: 'Quiero meter 500 € en oro' }, modelo: {}, bloques: [] });
  const av = r.avisos.join(' ');
  assert.doesNotMatch(av, /\b500\b/);
  assert.match(av, /777/);
});
