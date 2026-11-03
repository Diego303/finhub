// F8: conocimiento sin IA. Índice de notas, caducidad, buscador, postura (vida media 90 d), acierto,
// mezclas con selectores, predicciones (medir y resolver), calibración, deduplicación y sus operaciones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/core/conocimiento.js';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
const BASE = generar();
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
const M = modeloDe(BASE);
function mundo(inicial = BASE) {
  const fs = new Map([...inicial].filter(([r]) => r.endsWith('.md')));
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('índice de notas: todas las fuentes, con su fuente y ordenadas por fecha', () => {
  const n = K.indiceNotas(M);
  assert.equal(n.length, 61);
  assert.equal(new Set(n.map((x) => x.id)).size, n.length);
  assert.ok(n.every((x) => x.fuente && x.tipo));
  assert.equal(n.find((x) => x.id === 'P-0019').fuente, 'pizarra');
  assert.equal(n.filter((x) => x.fuente === 'mundo').length, 44);
  for (let i = 1; i < n.length; i++) assert.ok((n[i - 1].fecha ?? '') >= (n[i].fecha ?? ''));
});

test('caducidad: la de la nota, la de su fuente o la de su familia', () => {
  const fuentes = [{ id: 'a', familia: 'yt', caducidad: { dias: 30 } }, { id: 'b', familia: 'yt' }, { id: 'c', familia: 'fija' }];
  const familias = [{ id: 'yt', caducidad: { dias: 180 } }, { id: 'fija' }];
  assert.equal(K.fechaCaducidad({ fuente: 'a', fecha: '2026-01-01', caduca: '2026-02-15' }, fuentes, familias), '2026-02-15');
  assert.equal(K.fechaCaducidad({ fuente: 'a', fecha: '2026-01-01' }, fuentes, familias), '2026-01-31');
  assert.equal(K.fechaCaducidad({ fuente: 'b', fecha: '2026-01-01' }, fuentes, familias), '2026-06-30');
  assert.equal(K.fechaCaducidad({ fuente: 'c', fecha: '2026-01-01' }, fuentes, familias), null);
  assert.equal(K.caducada({ fuente: 'a', fecha: '2026-01-01' }, '2026-02-01', fuentes, familias), true);
  assert.equal(K.caducada({ fuente: 'c', fecha: '2000-01-01' }, HOY, fuentes, familias), false);
});

test('buscador: texto sin tildes en id, título, cuerpo, temas y activos; filtros; caducadas', () => {
  const n = K.indiceNotas(M);
  assert.deepEqual(K.buscarNotas(n, { texto: 'P-0019' }).map((x) => x.id), ['P-0019']);
  const tecno = K.buscarNotas(n, { texto: 'tecnológicas' });
  assert.ok(tecno.length && tecno.every((x) => K.buscarNotas([x], { texto: 'tecnologicas' }).length));
  assert.ok(K.buscarNotas(n, { tipo: 'opinión' }).every((x) => x.tipo === 'opinión'));
  assert.ok(K.buscarNotas(n, { fuente: 'mundo', desde: '2026-11-01' }).every((x) => x.fuente === 'mundo' && x.fecha >= '2026-11-01'));
  assert.ok(K.buscarNotas(n, { tema: 'tipos' }).every((x) => x.temas.includes('tipos')));
  const ctx = { hoy: '2027-06-01', fuentes: M.fuentes, familias: M.familias };
  assert.ok(K.buscarNotas(n, { caducadas: false }, ctx).length < n.length, 'las caducadas se pueden excluir');
  assert.equal(K.buscarNotas(n, { texto: 'zzzz' }).length, 0);
});

test('postura con vida media de 90 días y en el tiempo', () => {
  const notas = [{ fecha: '2026-11-03', postura: 'alcista' }, { fecha: '2026-08-05', postura: 'bajista' }]; // 90 días antes: pesa la mitad
  cerca(K.posturaFuente(notas, HOY), (1 - 0.5) / 1.5);
  assert.equal(K.posturaFuente([{ fecha: HOY }], HOY), null);
  assert.equal(K.posturaFuente([{ fecha: '2027-01-01', postura: 'alcista' }], HOY), null, 'las futuras no cuentan');
  const t = K.posturaEnElTiempo(notas, HOY, 6);
  assert.deepEqual(t.map((x) => x.mes), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(t[0].postura, null);
  assert.equal(t[3].postura, -1);
});

test('mezclas: ids, selectores dinámicos y fuentes borradas', () => {
  const res = [
    { id: 'a', familia: 'yt', postura: -0.5, acierto: { aciertoPb: 7000 } },
    { id: 'b', familia: 'yt', postura: 0.2, acierto: { aciertoPb: 5000 } },
    { id: 'c', familia: 'macro', postura: null, acierto: { aciertoPb: null } },
  ];
  assert.deepEqual(K.resolverMezcla(['a', 'z'], res), { fuentes: ['a'], borradas: ['z'] });
  assert.deepEqual(K.resolverMezcla([{ campo: 'postura', op: '<=', valor: -0.3 }], res).fuentes, ['a']);
  assert.deepEqual(K.resolverMezcla([{ campo: 'familia', op: '=', valor: 'yt' }], res).fuentes, ['a', 'b']);
  assert.deepEqual(K.resolverMezcla([{ campo: 'acierto', op: '>=', valor: 65 }], res).fuentes, ['a']);
  assert.deepEqual(K.resolverMezcla(['c', { campo: 'familia', op: '!=', valor: 'yt' }], res).fuentes, ['c']);
  // las del ejemplo: «Todo» son las 35; «Los bajistas» = base, datos y la pizarra (postura −1)
  const r = K.resumenFuentes(M, HOY);
  const todo = M.mezclas.find((x) => x.id === 'todo');
  assert.equal(K.resolverMezcla(todo.miembros, r).fuentes.length, 35);
  assert.deepEqual(K.resolverMezcla(M.mezclas.find((x) => x.id === 'bajistas').miembros, r).fuentes, ['base', 'datos', 'pizarra']);
  assert.equal(K.nombreMezclaActiva(['base', 'datos'], M.mezclas, r), 'Solo base');
  assert.equal(K.nombreMezclaActiva(['base'], M.mezclas, r), 'personalizada');
});

test('mezclas fluidas con 60 fuentes: resolver y buscar en milisegundos', () => {
  const res = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, familia: ['yt', 'macro', 'pod', 'prensa'][i % 4], postura: Math.sin(i), acierto: { aciertoPb: i % 3 ? 4000 + i * 80 : null } }));
  const t0 = performance.now();
  for (let k = 0; k < 200; k++) K.resolverMezcla(['f1', 'f2', { campo: 'postura', op: '<=', valor: -0.3 }, { campo: 'acierto', op: '>=', valor: 65 }, { campo: 'familia', op: '=', valor: 'pod' }], res);
  assert.ok(performance.now() - t0 < 100, '200 resoluciones en < 100 ms');
});

test('predicciones: medir y resolver contra series; anticipada; cartera; no medible', () => {
  const serie = [['2026-01', 100], ['2026-02', 90], ['2026-03', 80], ['2026-04', 95], ['2026-05', 110]].map(([mes, valor]) => ({ mes, valor }));
  const series = (id) => (id === 's' ? serie : null);
  const p = (medir) => ({ medir, estado: 'pendiente' });
  assert.deepEqual(K.parseMedir('s variacion 2026-01-31→2026-05-31 > 5'), { serie: 's', metrica: 'variacion', desde: '2026-01-31', hasta: '2026-05-31', op: '>', valor: 5 });
  assert.deepEqual(K.parseMedir('cartera twr 2026-11-03→2027-11-03 en -1…9').rango, [-1, 9]);
  assert.equal(K.parseMedir('sp500 baja mucho'), null);
  // variación desde el cierre de enero (100) hasta mayo (110): +10 %
  assert.deepEqual(K.resolverPrediccion(p('s variacion 2026-02-01→2026-05-31 > 5'), { series, hoy: HOY }), { estado: 'acertada', valor: 10, resuelta: '2026-05-31' });
  assert.equal(K.resolverPrediccion(p('s variacion 2026-02-01→2026-05-31 > 15'), { series, hoy: HOY }).estado, 'fallida');
  // caída máxima: del 100 al 80 = 20 %
  cerca(K.resolverPrediccion(p('s caída-max 2026-02-01→2026-05-31 >= 15'), { series, hoy: HOY }).valor, 20, 1e-3);
  assert.equal(K.resolverPrediccion(p('s subida-max 2026-02-01→2026-05-31 >= 30'), { series, hoy: HOY }).estado, 'acertada'); // 80 → 110 = 37,5 %
  assert.equal(K.resolverPrediccion(p('s nivel 2026-04-01→2026-04-30 >= 95'), { series, hoy: HOY }).estado, 'acertada');
  // aún no ha terminado el periodo → no se resuelve… salvo una caída máxima que ya ha pasado el umbral
  assert.equal(K.resolverPrediccion(p('s variacion 2026-02-01→2027-01-31 > 5'), { series, hoy: '2026-06-01' }), null);
  assert.deepEqual(K.resolverPrediccion(p('s caída-max 2026-02-01→2027-01-31 >= 15'), { series, hoy: '2026-06-01' }), { estado: 'acertada', valor: 20, resuelta: '2026-06-01' });
  assert.equal(K.resolverPrediccion(p('x variacion 2026-02-01→2026-05-31 > 5'), { series, hoy: HOY }), null, 'serie que no existe');
  assert.equal(K.resolverPrediccion({ estado: 'pendiente' }, { series, hoy: HOY }), null, 'sin medir');
  // las del ejemplo: PR-0007 se puede resolver ya (tipo del BCE a 31-10 ≥ 2 %)
  const r = K.resolverPrediccion(M.predicciones.find((x) => x.id === 'PR-0007'), { series: (id) => M.serie(id), hoy: HOY });
  assert.equal(r.estado, 'acertada');
  // cartera: twr de un periodo con fotos
  const cartera = { activos: M.activos, operaciones: M.operaciones, fotos: M.fotos };
  const c = K.resolverPrediccion(p('cartera twr 2025-10-31→2026-10-31 en 0…30'), { series, cartera, hoy: HOY });
  assert.equal(c.estado, 'acertada');
  assert.ok(c.valor > 0 && c.valor < 30);
});

test('acierto (≥ 5 resueltas), calibración de finhub y deduplicación de Mundo', () => {
  const preds = [...Array(5)].map((_, i) => ({ fuente: 'a', estado: i < 3 ? 'acertada' : 'fallida' })).concat([{ fuente: 'a', estado: 'no-medible' }, { fuente: 'b', estado: 'acertada' }]);
  const a = K.aciertoPorFuente(preds);
  assert.deepEqual([a.get('a').aciertoPb, a.get('a').resueltas, a.get('b').aciertoPb], [6000, 5, null]);
  const cal = K.calibracion([{ fuente: 'finhub', medir: 'cartera twr 2025-01-01→2026-01-01 en -1…9', estado: 'acertada' }, { fuente: 'finhub', medir: 'cartera twr 2025-01-01→2026-01-01 en 0…5', estado: 'fallida' }, { fuente: 'finhub', medir: 'x', estado: 'pendiente' }]);
  assert.deepEqual(cal, { resueltos: 2, aciertos: 1, pb: 5000 });
  cerca(K.jaccard('El BCE mantiene los tipos de interés', 'El BCE mantiene tipos de interés'), 0.8); // 4 palabras comunes de 5
  assert.ok(K.jaccard('El BCE mantiene los tipos', 'La Fed sube los tipos') < 0.6);
  const ex = [{ titulo: 'El BCE mantiene los tipos en el 2 %', fecha: '2026-11-03', origen: 'Medio · https://a.es/x' }];
  assert.ok(K.duplicadoDe({ titulo: 'Otra cosa', fecha: '2026-10-01', origen: 'https://a.es/x' }, ex), 'misma URL');
  assert.ok(K.duplicadoDe({ titulo: 'El BCE mantiene los tipos en el 2 por ciento', fecha: '2026-11-04' }, ex), 'título parecido a ±1 día');
  assert.equal(K.duplicadoDe({ titulo: 'El BCE mantiene los tipos en el 2 %', fecha: '2026-11-06' }, ex), null, 'más de un día');
});

test('operaciones: crear, editar (marca editada), mover y borrar notas', () => {
  const m = mundo();
  const r = m.op('nota.crear', { fuente: 'mias', titulo: 'Mi regla del colchón', fecha: HOY, campos: { tipo: 'opinión', temas: ['colchon'] }, cuerpo: 'Seis meses de gastos en la remunerada antes de invertir más.' });
  const id = r.resultado.id;
  assert.match(id, /^[A-Z]{1,4}-\d{4}$/);
  const doc = m.doc(r.resultado.ruta);
  assert.equal(doc.avisos.length, 0);
  assert.equal(cabeceras(doc).fuente, 'mias');
  assert.equal(bloques(doc)[0].campos.editada, false);
  falla(() => m.op('nota.crear', { fuente: 'mundo', titulo: 'x', fecha: HOY, campos: { tipo: 'hecho' }, cuerpo: 'x' }), 'invalida', /trabajos/);
  falla(() => m.op('nota.crear', { fuente: 'mias', titulo: 'x', fecha: HOY, campos: { tipo: 'hecho' }, cuerpo: '' }), 'invalida', /texto/);
  m.op('nota.editar', { ruta: r.resultado.ruta, id, cuerpo: 'Seis meses de gastos, y revisarlo cada año.', campos: { temas: ['colchon', 'reglas'] } });
  const editada = bloques(m.doc(r.resultado.ruta))[0];
  assert.deepEqual([editada.campos.editada, editada.cuerpo, editada.campos.temas], [true, 'Seis meses de gastos, y revisarlo cada año.', ['colchon', 'reglas']]);
  // mover una nota de la pizarra a «indexado»: el id no cambia; el fichero de origen sigue con la otra nota
  const mv = m.op('nota.mover', { ruta: 'conocimiento/pizarra/2026-10-28-valoraciones.md', id: 'P-0019', fuente: 'indexado' });
  const nueva = bloques(m.doc(mv.resultado.ruta));
  assert.deepEqual([nueva[0].id, nueva[0].campos.fuente], ['P-0019', 'indexado']);
  assert.ok(!bloques(m.doc('conocimiento/pizarra/2026-10-28-valoraciones.md')).some((b) => b.id === 'P-0019'));
  // mover la última nota de un fichero lo deja vacío: va a la papelera
  const ult = m.op('nota.mover', { ruta: r.resultado.ruta, id, fuente: 'pizarra' });
  assert.ok(!m.fs.has(r.resultado.ruta));
  assert.equal(ult.papelera.length, 1);
  const b = m.op('bloque.borrar', { ruta: mv.resultado.ruta, id: 'P-0019', que: 'nota P-0019' });
  assert.equal(b.papelera.length, 1);
});

test('operaciones: fuentes, familias, mezclas, mezcla activa', () => {
  const m = mundo();
  const f = m.op('fuente.crear', { nombre: 'Finanzas con Calma', familia: 'yt', caducidad: { n: 90, unidad: 'd', dias: 90 } });
  assert.deepEqual(f.resultado, { id: 'finanzas-con-calma', prefijo: 'FCC' });
  const fu = items(m.doc('conocimiento/_fuentes.md')).find((x) => x.id === 'finanzas-con-calma');
  assert.deepEqual([fu.familia, fu.privada, fu.activa_por_defecto], ['yt', false, false]);
  assert.equal(m.op('fuente.crear', { nombre: 'Flujo', familia: 'mias' }).resultado.id, 'flujo');
  assert.equal(items(m.doc('conocimiento/_fuentes.md')).find((x) => x.id === 'flujo').privada, true, 'Mis notas siempre privadas');
  falla(() => m.op('fuente.crear', { nombre: 'x', familia: 'nada' }), 'invalida', /familia/);
  falla(() => m.op('fuente.borrar', { id: 'base' }), 'invalida', /fija/);
  // borrar una fuente manda sus ficheros a la papelera y avisa de las mezclas que la usan
  const b = m.op('fuente.borrar', { id: 'pizarra' });
  assert.ok(b.papelera.length >= 2);
  assert.ok(![...m.fs.keys()].some((r) => r.startsWith('conocimiento/pizarra/')));
  assert.ok(b.avisos.some((a) => /Solo Andrés/.test(a)));
  assert.deepEqual(m.op('mezcla.limpiar', { id: 'solo-andres' }).resultado, { quitadas: 1, borrada: true }, 'solo tenía la pizarra');
  assert.deepEqual(m.op('mezcla.limpiar', { id: 'todo' }).resultado, { quitadas: 1, borrada: false });
  falla(() => m.op('mezcla.limpiar', { id: 'todo' }), 'invalida', /no tiene fuentes borradas/);
  // familias
  m.op('lista.crear', { ruta: 'conocimiento/_familias.md', valor: { id: 'blogs', nombre: 'Blogs' } });
  m.op('familia.borrar', { id: 'pod', destino: 'blogs' });
  assert.ok(items(m.doc('conocimiento/_fuentes.md')).filter((x) => ['charlas', 'cafe'].includes(x.id)).every((x) => x.familia === 'blogs'));
  falla(() => m.op('familia.borrar', { id: 'mias', destino: 'blogs' }), 'invalida', /fija/);
  // mezclas y mezcla activa
  const mz = m.op('mezcla.crear', { nombre: 'Macro bajista', miembros: ['base', { campo: 'familia', op: '=', valor: 'macro' }, { campo: 'postura', op: '<=', valor: -0.3 }] });
  assert.equal(mz.resultado.id, 'macro-bajista');
  assert.equal(m.doc('conocimiento/_mezclas.md').avisos.length, 0);
  assert.match(m.fs.get('conocimiento/_mezclas.md'), /macro-bajista \| Macro bajista \| base, @familia=macro, @postura<=-0,3/);
  m.op('fuentes.activas', { ids: ['base', 'datos', 'mundo'] });
  assert.deepEqual(items(m.doc('conocimiento/_fuentes.md')).filter((x) => x.activa_por_defecto).map((x) => x.id), ['base', 'datos', 'mundo']);
});

test('operaciones: predicciones (crear, resolver a mano y automáticamente) e importar la Base', () => {
  const m = mundo();
  const c = m.op('prediccion.crear', { fuente: 'indexado', texto: 'el índice mundial sube en octubre de 2026', medir: 'msci-world-nr-eur variacion 2026-10-01→2026-10-31 > 0' });
  assert.equal(c.resultado.id, 'PR-0131');
  m.op('prediccion.resolver', { id: 'PR-0019', estado: 'no-medible' });
  assert.deepEqual([items(m.doc('conocimiento/predicciones.md')).find((p) => p.id === 'PR-0019').estado, items(m.doc('conocimiento/predicciones.md')).find((p) => p.id === 'PR-0019').resuelta], ['no-medible', HOY]);
  m.op('prediccion.resolver', { id: 'PR-0019', estado: 'pendiente' });
  const a = m.op('predicciones.resolverAuto', {}).resultado.resueltas;
  assert.deepEqual(a.map((x) => x.id).sort(), ['PR-0131']);
  const p = items(m.doc('conocimiento/predicciones.md')).find((x) => x.id === 'PR-0131');
  assert.ok(['acertada', 'fallida'].includes(p.estado) && p.resuelta === '2026-10-31' && p.valor !== undefined);
  assert.deepEqual(m.op('predicciones.resolverAuto', {}).resultado.resueltas, [], 'nada más que resolver');
  // importar la Base: solo las notas nuevas, sin tocar las que ya tienes
  const semilla = '# Base · Prueba\nesquema: 1\nfuente: base\n## B-0007 · Ya la tienes\n- tipo: consenso\n- fuente: base\n- temas: x\nTexto que no debe pisar la tuya.\n## B-1001 · Nueva\n- editada: no\n- tipo: consenso\n- fecha: 2026-11-03\n- fuente: base\n- origen: Org · https://example.org\n- temas: conceptos\nUna nota nueva de la Base.\n';
  const imp = m.op('base.importar', { ficheros: { 'prueba.md': semilla } }).resultado;
  assert.deepEqual(imp, { importadas: 1, ficheros: ['conocimiento/base/prueba.md'] });
  const d = m.doc('conocimiento/base/prueba.md');
  assert.deepEqual(bloques(d).map((x) => x.id), ['B-1001']);
  assert.equal(d.avisos.length, 0);
  assert.equal(m.op('base.importar', { ficheros: { 'prueba.md': semilla } }).resultado.importadas, 0, 'idempotente');
  falla(() => m.op('base.importar', { ficheros: { '../x.md': semilla } }), 'invalida');
});

test('el ejemplo es coherente: sus predicciones resueltas coinciden con la resolución automática', () => {
  const cartera = { activos: M.activos, operaciones: M.operaciones, fotos: M.fotos };
  for (const p of M.predicciones.filter((x) => x.medir && x.estado !== 'pendiente')) {
    const r = K.resolverPrediccion({ ...p, estado: 'pendiente' }, { series: (id) => M.serie(id), cartera, hoy: HOY });
    assert.equal(r?.estado, p.estado, p.id);
  }
});

