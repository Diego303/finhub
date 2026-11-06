// QA1 · Validador y verificador (§8.3, §8.4) con tablas de casos para cada esquema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar, extraerJson } from '../../src/claude/validar.js';
import { interpretar, cifrasNoVerificadas, permitidos, revisarProbabilidades, revisarCitas, recomendaciones } from '../../src/claude/verificador.js';
import { TRABAJOS, trabajo } from '../../src/claude/trabajos/index.js';
import { ESQUEMAS, TAREAS_CODIGO } from '../../src/claude/tareas.js';
import { validarIsin } from '../../src/core/ids.js';
import { aplicarOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { ficherosEjemplo, HOY } from '../qa/ayuda-claude.js';

const ok = (v, e) => assert.deepEqual(validar(v, e), [], JSON.stringify(v).slice(0, 80));
const mal = (v, e) => assert.ok(validar(v, e).length > 0, `debería fallar: ${JSON.stringify(v).slice(0, 80)}`);

test('cada esquema: lo mínimo válido pasa; una clave de más, un tipo cambiado o un campo que falta, no', () => {
  const VALIDOS = {
    pulso: { notas: [{ titulo: 'Noticia del día', tipo: 'hecho', fecha: HOY, origen: { medio: 'Me', url: 'https://x.example' }, temas: [], activos: [], resumen: 'Un resumen de veinte caracteres.' }] },
    precios: { precios: [{ isin: 'IE00BYX5NX33', valor: 12.3, divisa: 'EUR', fecha: HOY, origen: 'https://x.example' }] },
    datos: { series: [{ id: 'serie-x', filas: [{ mes: '2026-10', valor: 1 }], origen: 'https://x.example' }] },
    ingesta: { notas: [], predicciones: [] },
    conocimiento: { fuentes: [], coinciden: '', discrepan: '', opinion_modelo: '' },
    privado: { respuesta_md: 'x', citas: [], cifras_usadas: [] },
    'rex-web': { respuesta_md: 'x', citas: [], cifras_usadas: [] },
    descubrir: { descubrimientos: [] },
    encaje: { ya_tienes: '', solapamiento: '', comentario_md: 'Comentario largo.', citas: [], cifras_usadas: [] },
  };
  for (const t of TRABAJOS) {
    const v = VALIDOS[t.id];
    ok(v, t.esquema);
    mal({ ...v, claveDeMas: 1 }, t.esquema);
    mal([], t.esquema);
    mal(null, t.esquema);
    mal('texto', t.esquema);
    for (const k of Object.keys(v)) {
      const { [k]: _, ...sin } = v;
      if (t.esquema.req.includes(k)) mal(sin, t.esquema);
      mal({ ...v, [k]: 12345 }, t.esquema);
    }
  }
  for (const [nombre, esq] of Object.entries(ESQUEMAS)) {
    mal({ inventado: 1 }, esq);
    assert.equal(esq.t, 'objeto', nombre);
  }
  for (const [id, c] of Object.entries(TAREAS_CODIGO)) assert.ok(trabajo(c.trabajo), id);
});

test('tabla: tipos del validador', () => {
  const casos = [
    [{ t: 'fecha' }, ['2026-02-28'], ['2026-02-30', '2026-13-01', 'hoy', 20261103, null]],
    [{ t: 'mes' }, ['2026-11'], ['2026-13', '2026', 202611]],
    [{ t: 'url' }, ['https://a.es/x?y=1', 'http://a.es'], ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://a', 'https://a b', '<script>', '']],
    [{ t: 'entero', min: 0, max: 10 }, [0, 10], [-1, 11, 1.5, '3', NaN, Infinity]],
    [{ t: 'numero', min: 0 }, [0, 1.5], [-0.1, '1', Infinity]],
    [{ t: 'bool' }, [true, false], ['true', 0, null]],
    [{ t: 'enum', v: ['a', 'b'] }, ['a'], ['c', 'A', 1]],
    [{ t: 'texto', min: 2, max: 3 }, ['ab', 'abc'], ['a', 'abcd', '  ', 5]],
    [{ t: 'lista', de: { t: 'bool' }, min: 1, max: 2 }, [[true], [true, false]], [[], [true, true, true], ['x'], 'x']],
  ];
  for (const [e, buenos, malos] of casos) {
    for (const v of buenos) ok(v, e);
    for (const v of malos) mal(v, e);
  }
});

test('máximo 5 descubrimientos; extraer el último bloque ```json', () => {
  const e = trabajo('descubrir').esquema;
  const D = { titulo: 'Salud global', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'Una tesis de más de veinte caracteres.', saldria_bien_si: '', la_invalidaria: '', riesgos: '', vehiculos: [], citas: [], afirmaciones: [], revisar_en_dias: 30 };
  ok({ descubrimientos: Array(5).fill(D) }, e);
  mal({ descubrimientos: Array(6).fill(D) }, e);
  mal({ descubrimientos: [{ ...D, revisar_en_dias: 3 }] }, e);
  mal({ descubrimientos: [{ ...D, tipo: 'cripto' }] }, e);
  assert.deepEqual(extraerJson('a\n```json\n{"x":1}\n```\nb\n```json\n{"x":2}\n```').json, { x: 2 });
  assert.match(extraerJson('sin bloque').error, /no trae/);
  assert.match(extraerJson('```json\n{roto\n```').error, /no se puede leer/);
  assert.equal(extraerJson('```json\n{"a":1}\n```').texto, '');
});

test('tabla: cifras en es-ES y en-US con tolerancia de redondeo', () => {
  assert.ok(interpretar('1.234,56').includes(1234.56));
  assert.ok(interpretar('1,234.56').includes(1234.56));
  assert.ok(interpretar('−12,5').includes(-12.5));
  const P = permitidos({ cifras: [{ valor: '57.371,20 €' }, { valor: '33,4 %' }, { valor: '+16,1 %' }], datos: 'Nota con 2,5 % y 1.000 millones.', probabilidades: [60] });
  const casos = [
    ['57.371,20 €', true], ['57,371.20 euros', true], ['57.371 €', true], ['57.000 €', false], ['33,4 %', true], ['33 %', true], ['34 %', false], ['16,1 %', true], ['-16,1 %', true], ['2,5 %', true], ['1.000 millones', true], ['60 %', true], ['61,5 %', false], ['888,88 €', false], ['1.234.567 €', false], ['En 2027', true], ['3 opciones', true], ['13 opciones', false],
  ];
  for (const [t, bueno] of casos) assert.equal(cifrasNoVerificadas(t, P).length === 0, bueno, t);
});

test('tabla: probabilidades', () => {
  for (const [ps, bien] of [[[60, 20, 20], true], [[90, 5, 5], true], [[50, 25, 25], true], [[], true], [[60, 20, 21], false], [[60, 20, 19], false], [[91, 5, 4], false], [[4, 48, 48], false], [[33.3, 33.3, 33.4], false]]) assert.equal(revisarProbabilidades(ps).length === 0, bien, JSON.stringify(ps));
});

test('tabla: citas; recomendaciones', () => {
  const ids = ['B-1001', 'M-261103-01', 'D-007'];
  const r = revisarCitas(['B-1001', 'M-261103-01', 'B-9999', 'web:https://a.es', 'https://a.es/B-9999', 'nota sin id', 'B-1001 y Z-0001'], ids);
  assert.deepEqual(r.validas, ['B-1001', 'M-261103-01', 'web:https://a.es', 'https://a.es/B-9999', 'nota sin id']);
  assert.deepEqual(r.inventadas, ['B-9999', 'B-1001 y Z-0001']);
  assert.deepEqual(revisarCitas(['https://a.es'], ids, { urls: false }).inventadas, ['https://a.es']);
  assert.deepEqual(recomendaciones('Compra esto, luego vende aquello; mi precio objetivo es alto'), ['compra', 'vende', 'precio objetivo']);
  assert.deepEqual(recomendaciones('La compra de viviendas subió'), ['compra'], 'se resalta, no se bloquea');
  assert.deepEqual(recomendaciones('Sin nada que señalar'), []);
});

test('tabla: ISIN con checksum; uno inválido se descarta con aviso y el descubrimiento sigue', () => {
  for (const i of ['US0378331005', 'IE00BYX5NX33', 'IE00B4L5Y983']) assert.ok(validarIsin(i), i);
  for (const i of ['IE00BYX5NX34', 'XX', '', 'US03783310055', 'us0378331005x']) assert.ok(!validarIsin(i), i);
  const fs = ficherosEjemplo();
  const r = aplicarOp((x) => fs.get(x) ?? null, 'descubrimiento.crear', { fecha: HOY, d: { titulo: 'Con vehículos', tipo: 'tema', postura: 'neutral', confianza: 'baja', tesis: 'Una tesis suficientemente larga.', vehiculos: [{ nombre: 'Malo', isin: 'IE00BYX5NX34' }, { nombre: 'Bueno', isin: 'IE00B4L5Y983' }], citas: [], afirmaciones: [], revisar_en_dias: 30 } }, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
  assert.match(r.avisos.join(), /IE00BYX5NX34 no válido/);
  const t = r.escribir[r.resultado.ruta];
  assert.match(t, /Bueno \(IE00B4L5Y983\)/);
  assert.doesNotMatch(t, /Malo/);
});
