// Operaciones de F6: metas (crear, estados, editar y borrar), hitos y diario de decisiones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const BASE = generar();
const HOY = '2026-11-03';
function mundo(inicial = BASE) {
  const fs = new Map([...inicial].filter(([r]) => r.endsWith('.md')));
  const ctx = () => ({ ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng: crearPrng(9), hoy: HOY, hora: '21:15', rutas: [...fs.keys()] });
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, ctx());
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));
const meta = (m, id) => bloques(m.doc('metas.md')).find((b) => b.id === id);

test('meta: crear con id del título, estados (cumplida con fecha y celebración), editar y borrar', () => {
  const m = mundo();
  const r = m.op('meta.crear', { titulo: 'Coche nuevo', campos: { objetivo: 1500000, fecha_deseada: '2029-01-01', se_alimenta_de: { tipo: 'manual', valor: 200000 }, aportacion: { mensual: 30000 } } });
  assert.equal(r.resultado.id, 'coche-nuevo');
  assert.equal(m.op('meta.crear', { titulo: 'Coche nuevo', campos: { objetivo: 100, se_alimenta_de: { tipo: 'manual', valor: 0 } } }).resultado.id, 'coche-nuevo-2');
  const c = meta(m, 'coche-nuevo').campos;
  assert.deepEqual([c.objetivo, c.estado.estado, c.aportacion.mensual], [1500000, 'activa', 30000]);
  assert.equal(m.doc('metas.md').avisos.length, 0);
  falla(() => m.op('meta.crear', { titulo: ' ', campos: { objetivo: 1 } }), 'invalida', /nombre/);
  falla(() => m.op('meta.crear', { titulo: 'x', campos: { objetivo: 0 } }), 'invalida', /positivo/);

  m.op('meta.estado', { id: 'coche-nuevo', estado: 'pausada' });
  assert.equal(meta(m, 'coche-nuevo').campos.estado.estado, 'pausada');
  falla(() => m.op('meta.estado', { id: 'coche-nuevo', estado: 'pausada' }), 'invalida', /ya está/);
  const cumplir = m.op('meta.estado', { id: 'coche-nuevo', estado: 'cumplida' });
  assert.deepEqual(cumplir.resultado, { celebrar: true });
  assert.deepEqual(meta(m, 'coche-nuevo').campos.estado, { estado: 'cumplida', fecha: HOY });
  assert.deepEqual(m.op('meta.estado', { id: 'coche-nuevo', estado: 'activa' }).resultado, { celebrar: false });
  assert.deepEqual(meta(m, 'coche-nuevo').campos.estado, { estado: 'activa', fecha: null });
  falla(() => m.op('meta.estado', { id: 'coche-nuevo', estado: 'olvidada' }), 'invalida');

  m.op('bloque.editar', { ruta: 'metas.md', id: 'coche-nuevo', titulo: 'Coche', campos: { aportacion: { media3m: true }, se_alimenta_de: { tipo: 'cuenta', valor: 'remunerada' } } });
  assert.equal(meta(m, 'coche-nuevo').titulo, 'Coche');
  assert.deepEqual(meta(m, 'coche-nuevo').campos.aportacion, { media3m: true });
  const b = m.op('bloque.borrar', { ruta: 'metas.md', id: 'coche-nuevo', que: 'meta Coche' });
  assert.equal(b.papelera.length, 1);
  assert.equal(meta(m, 'coche-nuevo'), undefined);
  // las metas del ejemplo siguen intactas
  assert.deepEqual(bloques(m.doc('metas.md')).map((x) => x.id), ['colchon', 'japon', 'piso', 'portatil', 'coche-nuevo-2']);
});

test('hitos: id correlativo, en orden de fecha, editar y borrar', () => {
  const m = mundo();
  const r = m.op('hito.crear', { fecha: '2026-07-15', texto: 'Cambio de trabajo' });
  assert.equal(r.resultado.id, 'H-0005');
  const lista = items(m.doc('hitos.md'));
  assert.deepEqual(lista.map((h) => h.id), ['H-0001', 'H-0002', 'H-0005', 'H-0003', 'H-0004']);
  assert.equal(lista[2].tipo, 'mío');
  falla(() => m.op('hito.crear', { fecha: '2026-13-01', texto: 'x' }), 'invalida');
  falla(() => m.op('hito.crear', { fecha: HOY, texto: '' }), 'invalida');
  m.op('lista.editar', { ruta: 'hitos.md', clave: 'H-0005', cambios: { texto: 'Trabajo nuevo', fecha: '2026-07-16' } });
  assert.equal(items(m.doc('hitos.md')).find((h) => h.id === 'H-0005').texto, 'Trabajo nuevo');
  m.op('lista.borrar', { ruta: 'hitos.md', clave: 'H-0005' });
  assert.ok(!items(m.doc('hitos.md')).some((h) => h.id === 'H-0005'));
  // sin hitos.md, se crea
  const vacio = mundo(new Map([...BASE].filter(([k]) => k !== 'hitos.md')));
  assert.equal(vacio.op('hito.crear', { fecha: HOY, texto: 'Primero', tipo: 'mundo', nota: 'M-261103-01' }).resultado.id, 'H-0001');
  assert.equal(items(vacio.doc('hitos.md'))[0].nota, 'M-261103-01');
});

test('decisiones: crear (pausa de 48 h con «vuelve»), editar secciones y cabeceras, borrar', () => {
  const m = mundo();
  const r = m.op('decision.crear', { titulo: 'Vender el fondo de emergentes', fecha: HOY, estado: 'decidida', revisar: '2027-05-03', secciones: { 'Por qué': 'Demasiado riesgo\npara mí.', Qué: 'Vendo emergentes.', Alternativas: '' } });
  const ruta = r.resultado.ruta;
  assert.equal(ruta, 'decisiones/2026-11-03-vender-el-fondo-de-emergentes.md');
  let d = m.doc(ruta);
  assert.equal(d.titulo, 'Vender el fondo de emergentes');
  assert.deepEqual([cabeceras(d).fecha, cabeceras(d).estado, cabeceras(d).revisar], [HOY, 'decidida', '2027-05-03']);
  assert.equal(textoSeccion(d, 'Qué'), 'Vendo emergentes.');
  assert.equal(textoSeccion(d, 'Por qué'), 'Demasiado riesgo\npara mí.');
  assert.deepEqual(d.secciones.slice(1).map((s) => s.nombre), ['Qué', 'Por qué'], 'en el orden del formato, sin secciones vacías');
  assert.equal(d.avisos.length, 0);
  assert.equal(m.op('decision.crear', { titulo: 'Vender el fondo de emergentes', fecha: HOY }).resultado.ruta, 'decisiones/2026-11-03-vender-el-fondo-de-emergentes-2.md');

  const p = m.op('decision.crear', { titulo: 'Comprar oro', fecha: HOY, estado: 'pausa-48h', secciones: { Qué: 'Un 5 % en oro.' } });
  assert.deepEqual(cabeceras(m.doc(p.resultado.ruta)).vuelve, { fecha: '2026-11-05', hora: '21:15' });

  m.op('decision.editar', { ruta, titulo: 'Vender emergentes', cabeceras: { estado: 'descartada', revisar: null }, secciones: { 'Resultado de la revisión': 'Al final no vendí.', 'Por qué': null } });
  d = m.doc(ruta);
  assert.equal(d.titulo, 'Vender emergentes');
  assert.equal(cabeceras(d).estado, 'descartada');
  assert.equal(cabeceras(d).revisar, undefined);
  assert.deepEqual(d.secciones.slice(1).map((s) => s.nombre), ['Qué', 'Resultado de la revisión']);
  falla(() => m.op('decision.editar', { ruta, cabeceras: { estado: 'quizá' } }), 'invalida', /estado/);
  falla(() => m.op('decision.editar', { ruta, secciones: { Inventada: 'x' } }), 'invalida', /sección/);
  falla(() => m.op('decision.editar', { ruta, secciones: { Qué: '## truco' } }), 'invalida', /#/);
  falla(() => m.op('decision.editar', { ruta: 'metas.md', titulo: 'x' }), 'invalida');
  falla(() => m.op('decision.crear', { titulo: 'x', fecha: 'mañana' }), 'invalida', /fecha/);
  const b = m.op('fichero.borrar', { ruta, que: 'decisión' });
  assert.equal(b.papelera.length, 1);
  assert.ok(!m.fs.has(ruta));
  // la inversa lo devuelve tal cual
  m.op(b.inversa.op, b.inversa.args);
  assert.equal(m.doc(ruta).titulo, 'Vender emergentes');
});
