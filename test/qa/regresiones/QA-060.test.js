// QA-060 (funcionalidad rota, alto): «Revisar mi cartera», «Ideas para mis aportaciones» y «Dónde ahorrar» se ejecutaban a ciegas: el trabajo
// privado no recibía posiciones, clases, reparto, gastos por grupo ni recurrentes. Y Rex no podía responder de tu cartera. Con el
// Claude simulado parecía funcionar; el real lo decía: «no dispongo del detalle de la cartera».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trabajo, TRABAJOS } from '../../../src/claude/trabajos/index.js';
import { montarPrompt } from '../../../src/claude/contexto.js';
import { ficherosEjemplo, modeloDe, HOY } from '../ayuda-claude.js';

const M = modeloDe(ficherosEjemplo());
const P = trabajo('privado');

test('el trabajo privado recibe cartera, clases, reparto, gastos por grupo, medias y recurrentes, calculados por código', () => {
  const e = P.entrada(M, { pregunta: 'x', hoy: HOY });
  const n = e.cifras.map((c) => c.nombre).join(' | ');
  const a = M.activos.find((x) => !x.campos.archivado);
  assert.match(n, new RegExp(`posición ${a.titulo}`));
  assert.match(n, /peso /);
  assert.match(n, /plusvalía de la cartera/);
  assert.match(n, /impuesto si vendieras hoy/);
  assert.match(n, /TER medio/);
  assert.match(n, /clase .* frente al objetivo/);
  assert.match(n, /reparto de la aportación/);
  assert.match(n, /gasto en .* este mes/);
  assert.match(n, /media de .* en 6 meses cerrados/);
  const u = montarPrompt(P, { ...e, hoy: HOY }).usuario;
  assert.match(u, /<datos origen="tu cartera" nivel="privado">/);
  assert.match(u, /<datos origen="tus recurrentes" nivel="privado">/);
  assert.match(u, new RegExp(M.recurrentes[0].concepto));
});

test('con la cartera vacía no se rompe y lo dice', () => {
  const vacio = { ...M, activos: [], operaciones: [], fotos: [], objetivo: [] };
  const e = P.entrada(vacio, { pregunta: 'x', hoy: HOY });
  assert.match(e.bloques.find((b) => b.origen === 'tu cartera').contenido, /aún no hay/);
});

test('ningún otro trabajo recibe nada de esto', () => {
  const R = { pulso: { fecha: HOY }, 'rex-web': { pregunta: 'x' }, descubrir: { modo: 'nuevas' }, conocimiento: { pregunta: 'x' }, ingesta: { texto: 'x', fichero: 'a.txt', fuente: 'base' }, precios: { activos: [] }, datos: { series: [] } };
  for (const t of TRABAJOS) {
    if (t.id === 'privado' || t.id === 'encaje') continue;
    const e = t.entrada(M, { ...R[t.id], hoy: HOY });
    const u = montarPrompt(t, { ...e, hoy: HOY }).usuario;
    assert.doesNotMatch(u, /origen="tu cartera"|origen="tus recurrentes"|reparto de la aportación/, t.id);
  }
});
