// QA-058 (funcionalidad rota con Claude real): el pulso nunca decía al modelo que «efectos» solo admite los sectores de tu mapa. Con el
// Claude real devolvió «Ibex 35» y «EUR/USD» y TODAS las notas fueron a cuarentena (0,20 USD perdidos). El simulador no podía verlo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { montarPrompt } from '../../../src/claude/contexto.js';
import { ficherosEjemplo, modeloDe, HOY } from '../ayuda-claude.js';

const M = modeloDe(ficherosEjemplo());
const P = trabajo('pulso');

test('la tarea dice qué sectores valen y que, si ninguno encaja, se omita «efectos»', () => {
  const e = P.entrada(M, { fecha: HOY, temas: [] });
  for (const s of M.ajustes.sectores_efectos) assert.ok(e.tarea.includes(s), s);
  assert.match(e.tarea, /«efectos»[^.]*solo[^.]*/);
  assert.match(e.tarea, /omite «efectos»/);
  assert.match(montarPrompt(P, { ...e, hoy: HOY }).usuario, new RegExp(M.ajustes.sectores_efectos[0]));
});

test('sin sectores en tu mapa, la tarea pide no incluir «efectos»', () => {
  const e = P.entrada({ ...M, ajustes: { ...M.ajustes, sectores_efectos: [] } }, { fecha: HOY, temas: [] });
  assert.match(e.tarea, /no incluyas «efectos»/i);
});

test('el nombre de un sector de tu lista se acepta aunque venga con mayúsculas o tildes; uno inventado, no', () => {
  const s = M.ajustes.sectores_efectos[0];
  const nota = (efectos) => ({ titulo: 'Una noticia', tipo: 'hecho', fecha: HOY, origen: { medio: 'Medio', url: 'https://m.example/a' }, temas: [], activos: [], resumen: 'x'.repeat(30), efectos });
  const bien = { notas: [nota({ [s.toUpperCase()]: '▲' })] };
  assert.deepEqual(P.comprobar(bien, { params: { fecha: HOY }, modelo: M }), []);
  assert.deepEqual(bien.notas[0].efectos, { [s]: '▲' }, 'se guarda con su id');
  assert.match(P.comprobar({ notas: [nota({ 'Ibex 35': '▲' })] }, { params: { fecha: HOY }, modelo: M }).join(), /Ibex 35/);
});
