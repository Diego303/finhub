// F11: Descubrimientos (§4.9) sin IA: mapa de efectos, rendimiento desde el descubrimiento, simulador y
// operaciones (crear, versiones, estado, encaje, precios de lo que sigues) con su inversa exacta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/core/descubrimientos.js';
import { pendientes } from '../../src/core/resumen.js';
import { construirModelo } from '../../src/core/modelo.js';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, valores, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
const BASE = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].map(([r, texto]) => [r, { texto, version: 'v' }])));
const M = modeloDe(BASE);
function mundo(ajustes = {}) {
  const fs = new Map(BASE);
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    modelo: () => modeloDe(fs),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()], ajustes });
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));
const NUEVO = { titulo: 'Salud global y envejecimiento', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'El envejecimiento sostiene la demanda de salud a largo plazo.', saldria_bien_si: 'Que el gasto sanitario siga creciendo.', la_invalidaria: 'Recortes fuertes de precios.', riesgos: 'Regulación · patentes', vehiculos: [{ nombre: 'Fondo con ISIN roto', isin: 'IE00BYX5NX34' }, { nombre: 'ETF salud global', isin: 'IE0031786696', ter: 0.25, indice: 'MSCI World Health Care' }, { nombre: 'Fondo sin ISIN' }], citas: ['https://salud.example/a,b', 'M-261103-01'], afirmaciones: [{ tipo: 'consenso', texto: 'la población envejece' }, { tipo: 'especulación', texto: 'el sector batirá al índice' }], prediccion: { texto: 'salud mejor que el índice mundial', medir: 'msci-world-nr-eur variacion 2026-11-03→2027-11-03 > 0', horizonte: '12 meses' }, revisar_en_dias: 60 };

test('mapa de efectos: ▲ con neto ≥ 2, ▼ con ≤ −2, • si no; cada celda guarda sus notas', () => {
  const mp = D.mapaEfectos(M, HOY, 4);
  assert.equal(mp.semanas.length, 4);
  assert.equal(mp.semanas.at(-1).id, '2026-W45');
  assert.deepEqual(mp.filas.map((f) => f.sector), M.ajustes.sectores_efectos);
  for (const f of mp.filas) {
    for (const c of f.celdas) {
      const neto = c.notas.reduce((a, n) => a + (n.efecto === '▲' ? 1 : n.efecto === '▼' ? -1 : 0), 0);
      assert.equal(c.neto, neto);
      assert.equal(c.signo, !c.notas.length ? '' : neto >= 2 ? '▲' : neto <= -2 ? '▼' : '•');
    }
  }
  const util = mp.filas.find((f) => f.sector === 'utilities-e-infraestructura');
  assert.ok(util.celdas.some((c) => c.signo === '▲' && c.notas.length >= 2));
  // un modelo de juguete: 3 a favor y 1 en contra en la misma semana → ▲ (neto 2)
  const nota = (id, e) => ({ id, titulo: id, campos: { fecha: HOY, efectos: { bancos: e } } });
  const juguete = { ajustes: { sectores_efectos: ['bancos'] }, mundo: [{ fecha: HOY, notas: [nota('a', '▲'), nota('b', '▲'), nota('c', '▲'), nota('d', '▼')] }] };
  assert.deepEqual(D.mapaEfectos(juguete, HOY, 1).filas[0].celdas[0].signo, '▲');
  juguete.mundo[0].notas.pop();
  juguete.mundo[0].notas.push(nota('e', '▼'), nota('f', '▼'));
  assert.equal(D.mapaEfectos(juguete, HOY, 1).filas[0].celdas[0].signo, '•');
});

test('rendimiento desde el descubrimiento: ISIN o serie de Datos frente a «vs»; sin datos «—»', () => {
  const d7 = M.descubrimientos.find((d) => d.id === 'D-007');
  const r7 = D.rendimientoDesde(d7, M);
  const s = M.serie('ie00fhinfra9');
  const v = (filas, mes) => filas.find((f) => f.mes === mes).valor;
  assert.deepEqual([r7.desde, r7.hasta], ['2026-09', '2026-10'], 'desde el cierre del mes anterior al descubrimiento');
  assert.ok(Math.abs(r7.ref - (v(s, '2026-10') / v(s, '2026-09') - 1)) < 1e-12);
  const w = M.serie('msci-world-nr-eur');
  assert.ok(Math.abs(r7.vs - (v(w, '2026-10') / v(w, '2026-09') - 1)) < 1e-12);
  assert.equal(D.rendimientoDesde(M.descubrimientos.find((d) => d.id === 'D-004'), M).desde, '2026-08', 'una serie de Datos como referencia');
  assert.equal(D.rendimientoDesde(M.descubrimientos.find((d) => d.id === 'D-011'), M), null, 'sin referencia');
  assert.equal(D.rendimientoDesde({ referencia: 'IE0031786696', descubierto: '2026-10-01' }, M), null, 'ISIN sin precios');
  assert.equal(D.serieDeReferencia('IE00FHINFRA9'), 'ie00fhinfra9');
  assert.equal(D.serieDeReferencia('nasdaq-100-eur'), 'nasdaq-100-eur');
});

test('simulador: pesos por clase, TER, crisis y último año; de todo, de un activo o de aportaciones; no toca nada', () => {
  const d7 = M.descubrimientos.find((d) => d.id === 'D-007');
  const antes = JSON.stringify(M.activos);
  const s0 = D.simular(M, HOY, d7, { pct: 0 });
  for (const c of s0.clases) assert.equal(c.antesPb, c.despuesPb, 'con 0 % no cambia nada');
  const s = D.simular(M, HOY, d7, { pct: 10 });
  assert.equal(s.pesoPb, 1000);
  assert.equal(s.clases.find((c) => c.nombre.startsWith('Nuevo:')).despuesPb, 1000);
  assert.ok(Math.abs(s.clases.reduce((a, c) => a + c.despuesPb, 0) - 10000) <= s.clases.length, 'los pesos suman 100 %');
  for (const c of s.clases.filter((x) => !x.nombre.startsWith('Nuevo:'))) assert.ok(Math.abs(c.despuesPb - Math.round(c.antesPb * 0.9)) <= 1, c.nombre);
  // TER: el del vehículo (0,4 %) en el 10 %
  assert.ok(Math.abs(s.ter.despues - (s.ter.antes * 0.9 + 40 * 0.1)) < 0.5);
  assert.equal(s.crisis.length, 4);
  assert.ok(s.crisis.every((c) => c.antesPb < 0 && c.despuesPb < 0));
  assert.ok(s.ultimoAnio.antes !== null && s.ultimoAnio.despues !== null);
  // de un activo: solo baja ese
  const a = D.simular(M, HOY, d7, { pct: 10, de: 'activo:msci-world' });
  const rv = (x) => x.clases.find((c) => c.nombre === 'RV desarrollados');
  assert.equal(rv(a).despuesPb, rv(a).antesPb - 1000);
  assert.equal(a.clases.find((c) => c.nombre === 'Renta fija').despuesPb, a.clases.find((c) => c.nombre === 'Renta fija').antesPb);
  assert.ok(D.simular(M, HOY, d7, { pct: 10, de: 'activo:no-existe' }).error);
  // solo nuevas aportaciones: cuánto se tarda (o el tope a 12 meses)
  assert.match(D.simular(M, HOY, d7, { pct: 5, de: 'aportaciones' }).avisos.join(), /lo alcanzarías en \d+ meses/);
  const tope = D.simular(M, HOY, d7, { pct: 50, de: 'aportaciones' });
  assert.ok(tope.pesoPb < 5000);
  assert.match(tope.avisos.join(), /en 12 meses llegarías/);
  // sin serie ni TER: avisos y no inventa
  const sinRef = D.simular(M, HOY, M.descubrimientos.find((d) => d.id === 'D-011'), { pct: 10 });
  assert.match(sinRef.avisos.join(), /sin serie de referencia/);
  assert.match(sinRef.avisos.join(), /no se conoce el TER/);
  assert.equal(D.simular(M, HOY, d7, { pct: 80 }).pesoPb, 5000, 'como mucho 50 %');
  assert.equal(JSON.stringify(M.activos), antes);
  assert.ok(D.simular({ ...M, activos: [], operaciones: [], fotos: [] }, HOY, d7, { pct: 5 }).error, 'cartera vacía');
});

test('descubrimiento.crear: id correlativo, ISIN roto descartado con aviso, referencia, predicción enlazada; sin euros', () => {
  const m = mundo();
  const r = m.op('descubrimiento.crear', { fecha: HOY, origen: 'nuevas ideas: salud', d: NUEVO });
  assert.equal(r.resultado.id, 'D-013');
  assert.match(r.avisos.join(), /IE00BYX5NX34 no válido/);
  const d = m.doc('conocimiento/descubrimientos/D-013.md');
  assert.equal(d.avisos.length, 0, JSON.stringify(d.avisos));
  const v = valores(d);
  assert.deepEqual([v.estado, v.descubierto, v.revisar, v.referencia, v.vs], ['nuevo', HOY, '2027-01-02', 'IE0031786696', 'msci-world-nr-eur']);
  const v1 = bloques(d)[0];
  assert.equal(v1.id, 'v1');
  assert.equal(v1.campos.vehiculos, 'ETF salud global (IE0031786696, TER 0,25 %, índice MSCI World Health Care) · Fondo sin ISIN');
  assert.deepEqual(v1.campos.citas, ['web:https://salud.example/a%2Cb', 'M-261103-01']);
  assert.equal(v1.campos.afirmaciones, '[consenso] la población envejece · [especulación] el sector batirá al índice');
  const pr = items(m.doc('conocimiento/predicciones.md')).find((p) => p.id === r.resultado.prediccion);
  assert.deepEqual([pr.fuente, pr.descubrimiento, pr.estado], ['finhub-descubrir', 'D-013', 'pendiente']);
  assert.deepEqual(v1.campos.predicciones, [pr.id]);
  assert.equal(D.terVehiculo(v1.campos.vehiculos), 25);
  // un importe en euros en la tesis no se guarda nunca (§9.25)
  falla(() => m.op('descubrimiento.crear', { fecha: HOY, d: { ...NUEVO, tesis: 'Con tus 37.117 € ya tienes bastante.' } }), 'invalida', /importe en euros/);
  falla(() => m.op('descubrimiento.crear', { fecha: HOY, d: { ...NUEVO, tipo: 'cripto' } }), 'invalida');
  // la inversa lo deja todo como estaba, byte a byte
  const antes = new Map(m.fs);
  const r2 = m.op('descubrimiento.crear', { fecha: HOY, d: NUEVO });
  m.op(r2.inversa.op, r2.inversa.args);
  assert.deepEqual([...m.fs.keys()].sort(), [...antes.keys()].sort());
  for (const [k, t] of antes) assert.equal(m.fs.get(k), t, k);
});

test('descubrimiento.version: «¿qué ha cambiado?» arriba, sin cambios configurable; estado, encaje y listas', () => {
  const m = mundo();
  const r = m.op('descubrimiento.version', { id: 'D-007', fecha: '2026-11-10', d: { ...NUEVO, titulo: 'Infraestructura', postura: 'neutral', confianza: 'media', prediccion: null, revisar_en_dias: 30 }, cambios: 'una noticia en contra' });
  assert.equal(r.resultado.version, 'v4');
  let d = m.doc('conocimiento/descubrimientos/D-007.md');
  assert.deepEqual(bloques(d).map((b) => b.id), ['v4', 'v3', 'v2', 'v1']);
  assert.equal(bloques(d)[0].campos.cambios, 'una noticia en contra');
  assert.deepEqual([valores(d).postura, valores(d).revisar, valores(d).referencia], ['neutral', '2026-12-10', 'IE00FHINFRA9']);
  assert.equal(d.avisos.length, 0);
  // sin cambios: por defecto, versión «sin cambios relevantes» que copia la anterior
  const s = m.op('descubrimiento.version', { id: 'D-007', fecha: '2026-11-17', sinCambios: true });
  d = m.doc('conocimiento/descubrimientos/D-007.md');
  assert.equal(s.resultado.version, 'v5');
  assert.equal(bloques(d)[0].campos.cambios, 'sin cambios relevantes');
  assert.equal(bloques(d)[0].campos.tesis, bloques(d)[1].campos.tesis);
  // con «descubrir_sin_cambios: nada», solo se aplaza la revisión
  const n = mundo({ descubrir_sin_cambios: 'nada' });
  assert.equal(n.op('descubrimiento.version', { id: 'D-007', fecha: '2026-11-17', sinCambios: true }).resultado.version, null);
  const d2 = n.doc('conocimiento/descubrimientos/D-007.md');
  assert.deepEqual([bloques(d2).length, valores(d2).revisar], [3, '2026-12-17']);
  falla(() => m.op('descubrimiento.version', { id: 'D-999', fecha: HOY, sinCambios: true }), 'no_existe');
  // estado
  m.op('descubrimiento.estado', { id: 'D-011', estado: 'siguiendo' });
  assert.equal(valores(m.doc('conocimiento/descubrimientos/D-011.md')).estado, 'siguiendo');
  falla(() => m.op('descubrimiento.estado', { id: 'D-011', estado: 'comprado' }), 'invalida');
  // encaje en privado (analisis/encajes/), nunca junto al descubrimiento
  const e = m.op('encaje.guardar', { fecha: HOY, descubrimiento: 'D-007', version: 'v5', ejecucion: 'abc', modelo: 'opus', cifras: [{ nombre: 'simulador: TER medio', valor: '0,2 % → 0,22 %' }], json: { ya_tienes: 'Algo vía el fondo global.', solapamiento: 'alto', comentario_md: '# Encaja\ncomo idea para seguir.', citas: ['D-007'] }, avisos: [] });
  assert.equal(e.resultado.ruta, 'analisis/encajes/D-007-2026-11-03-2.md', 'el del ejemplo ya existe: no se pisa');
  assert.deepEqual(Object.keys(e.escribir), [e.resultado.ruta], 'R1 en ops: el encaje solo escribe en analisis/encajes/, nunca en conocimiento/');
  const ed = m.doc(e.resultado.ruta);
  assert.equal(ed.avisos.filter((a) => a.nivel === 'error').length, 0);
  assert.deepEqual([cabeceras(ed).descubrimiento, cabeceras(ed).version], ['D-007', 'v5']);
  assert.match(textoSeccion(ed, 'Resultado'), /^\\# Encaja/);
  assert.match(textoSeccion(ed, 'Cifras (código)'), /TER medio/);
  // sectores y filtros juntos (un solo deshacer)
  const l = m.op('descubrir.listas', { sectores: ['bancos', 'salud'], filtros: ['ETF'] });
  assert.deepEqual(m.modelo().ajustes.sectores_efectos, ['bancos', 'salud']);
  m.op(l.inversa.op, l.inversa.args);
  assert.equal(m.fs.get('ajustes.md'), BASE.get('ajustes.md'));
});

test('precios de lo que sigues: serie por ISIN (una fila por mes), solo de lo que sigues; Pendientes los pide', () => {
  const m = mundo();
  m.op('descubrimiento.crear', { fecha: HOY, d: NUEVO });
  falla(() => m.op('precios.seguimiento', { precios: [{ isin: 'IE0031786696', valor: 30.5, fecha: HOY }] }), 'invalida', /no es la referencia/);
  m.op('descubrimiento.estado', { id: 'D-013', estado: 'siguiendo' });
  let pe = pendientes(m.modelo(), { fecha: HOY });
  assert.match(pe.elementos.find((e) => e.id === 'seguimiento').detalle, /IE0031786696/);
  assert.deepEqual(D.isinsSeguidos(m.modelo()).map((x) => x.isin), ['IE00FHINFRA9', 'IE0031786696']);
  m.op('precios.seguimiento', { precios: [{ isin: 'IE0031786696', valor: 30.5, divisa: 'EUR', fecha: '2026-10-31', origen: 'https://g.example' }] });
  m.op('precios.seguimiento', { precios: [{ isin: 'IE0031786696', valor: 31.25, divisa: 'EUR', fecha: '2026-11-02', origen: 'https://g.example' }] });
  m.op('precios.seguimiento', { precios: [{ isin: 'IE0031786696', valor: 31.5, divisa: 'EUR', fecha: '2026-11-03', origen: 'https://g.example' }] });
  const s = m.doc('conocimiento/datos/series/ie0031786696.md');
  assert.equal(s.avisos.length, 0);
  assert.deepEqual(items(s, 'Filas').map((f) => [f.mes, f.valor]), [['2026-10', 30500000], ['2026-11', 31500000]], 'el último precio del mes manda');
  falla(() => m.op('precios.seguimiento', { precios: [{ isin: 'IE0031786696', valor: 29, fecha: '2026-09-30' }] }), 'invalida', /posteriores/);
  pe = pendientes(m.modelo(), { fecha: HOY });
  assert.ok(!pe.elementos.some((e) => e.id === 'seguimiento'), 'ya está al día');
  assert.ok(!(pe.elementos.find((e) => e.id === 'datos')?.detalle ?? '').includes('3 series'), 'la serie de seguimiento no cuenta como dato de mercado');
  const r = D.rendimientoDesde(m.modelo().descubrimientos.find((d) => d.id === 'D-013'), m.modelo());
  assert.ok(Math.abs(r.ref - (31.5 / 30.5 - 1)) < 1e-9);
});
