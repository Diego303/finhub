// QA-048: el plazo del deshacer y la duración del registro se medían con el reloj de pared. En WSL ese reloj da saltos (se ha
// medido: pasos de 500 ms y saltos de varios segundos, más al volver de suspender): un deshacer podía caducar al instante, y una
// duración salir negativa. Lo que mide tiempo transcurrido usa el reloj monótono.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Deshacer } from '../../../src/server/deshacer.js';
import { ejecutarTrabajo } from '../../../src/claude/motor.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { taller, ficherosEjemplo, modeloDe, json, HOY } from '../ayuda-claude.js';

test('un salto del reloj de pared no caduca el deshacer', () => {
  const real = Date.now;
  const d = new Deshacer();
  const id = d.guardar('s', { op: 'x', inversa: { op: 'y', args: {} }, esperado: {} });
  const saltar = mock.method(Date, 'now', () => real() + 3600000);
  try {
    assert.equal(d.tomar('s', id)?.id, id);
  } finally {
    saltar.mock.restore();
  }
});

test('un salto hacia atrás del reloj no da una duración negativa en el registro', async () => {
  const ta = await taller('reloj');
  const real = Date.now;
  let llamadas = 0;
  const saltar = mock.method(Date, 'now', () => real() - 60000 * llamadas++);
  try {
    const M = modeloDe(ficherosEjemplo());
    const r = await ejecutarTrabajo({ trabajo: trabajo('rex-web'), modelo: M, params: { pregunta: 'x' }, hoy: HOY, servicio: ta.servicio, sesiones: ta.sesiones(), runner: { sandboxBase: ta.base, comando: await ta.guion([{ init: {} }, { responder: json({ respuesta_md: 'x', citas: [], cifras_usadas: [] }) }]) } });
    assert.ok(r.registro.duracionMs >= 0, `${r.registro.duracionMs}`);
  } finally {
    saltar.mock.restore();
    await ta.limpiar();
  }
});
