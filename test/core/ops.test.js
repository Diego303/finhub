import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, operaciones, ErrorOp } from '../../src/core/ops/index.js';
import { fechaCobro } from '../../src/core/ops/mes.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, valores } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const BASE = generar();
const ctx = (semilla = 1, dia = 1) => ({ ajustes: { mes_inicio_dia: dia }, formato: { diaInicio: dia }, prng: crearPrng(semilla) });

/** Mini almacén en memoria: aplica operaciones como haría el servidor. */
function mundo(inicial = BASE) {
  const fs = new Map(inicial);
  return {
    fs,
    leer: (r) => fs.get(r) ?? null,
    op(nombre, args, c = ctx()) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, c);
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)), `esperaba ${codigo} ${re ?? ''}`);
const movs = (m, mes) => items(leer(`mes/${mes}.md`, m.fs.get(`mes/${mes}.md`)), 'Movimientos');

test('el registro tiene las operaciones base', () => {
  for (const o of ['mov.crear', 'mov.editar', 'mov.borrar', 'rec.confirmar', 'rec.saltar', 'rec.desmarcar', 'pres.fijar', 'lista.crear', 'lista.editar', 'lista.borrar', 'bloque.crear', 'bloque.editar', 'bloque.borrar', 'ajustes.fijar', 'ajustes.quitar', 'fichero.borrar', 'papelera.restaurar', 'ficheros.restaurar']) assert.ok(operaciones().includes(o), o);
  falla(() => aplicarOp(() => null, 'inventada', {}), 'invalida');
});

test('mov.crear: al mes de su fecha, ordenado, con id, escapando | y #; mes nuevo con cabeceras', () => {
  const m = mundo();
  const r = m.op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'Café | #amigos', importe: -350, grupo: 'ocio', cuenta: 'corriente', etiquetas: ['social'] } });
  assert.deepEqual(Object.keys(r.escribir), ['mes/2026-11.md']);
  const lista = movs(m, '2026-11');
  const i = lista.findIndex((x) => x.id === r.resultado.id);
  assert.equal(lista[i].concepto, 'Café | #amigos');
  assert.ok(lista[i - 1].fecha <= '2026-11-03' && lista[i + 1].fecha > '2026-11-03', 'ordenado por fecha');
  const nuevo = m.op('mov.crear', { mov: { fecha: '2027-02-10', concepto: 'Futuro', importe: -100, grupo: 'ocio' } });
  assert.equal(nuevo.resultado.mes, '2027-02');
  assert.match(m.fs.get('mes/2027-02.md'), /^# Febrero 2027\nesquema: 1\nperiodo: 2027-02-01 → 2027-02-28\nestado: abierto\n## Movimientos\n- 2027-02-10 \| Futuro/);
  falla(() => m.op('mov.crear', { mov: { fecha: '2026-11-31', concepto: 'x', importe: 1, grupo: 'ocio' } }), 'invalida', /2026-11-31/);
  falla(() => m.op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'x', importe: 1.5, grupo: 'ocio' } }), 'invalida', /entero/);
  falla(() => m.op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'a\nb', importe: 1, grupo: 'ocio' } }), 'invalida');
  falla(() => m.op('mov.crear', { mov: { fecha: '2026-11-03', concepto: '', importe: 1, grupo: 'ocio' } }), 'invalida');
});

test('mes financiero: con inicio 25, el 26 de octubre va a «noviembre»', () => {
  const m = mundo(new Map());
  const r = m.op('mov.crear', { mov: { fecha: '2026-10-26', concepto: 'x', importe: -1, grupo: 'ocio' } }, ctx(1, 25));
  assert.equal(r.resultado.mes, '2026-11');
  assert.match(m.fs.get('mes/2026-11.md'), /periodo: 2026-10-25 → 2026-11-24/);
  assert.equal(fechaCobro('2026-11', 1, 25), '2026-11-01');
  assert.equal(fechaCobro('2026-11', 28, 25), '2026-10-28');
  assert.equal(fechaCobro('2026-02', 31, 1), '2026-02-28');
});

test('al guardar un mes, los movimientos escritos a mano sin id (o con id repetido) reciben uno', () => {
  const t = '# Noviembre 2026\nesquema: 1\nperiodo: 2026-11-01 → 2026-11-30\nestado: abierto\n## Movimientos\n- 2026-11-01 | A mano | -1,00 | ocio\n- 2026-11-02 | Repetido | -1,00 | ocio | id: aaaa\n- 2026-11-03 | Repetido 2 | -1,00 | ocio | id: aaaa\n';
  const m = mundo(new Map([['mes/2026-11.md', t]]));
  m.op('mov.crear', { mov: { fecha: '2026-11-04', concepto: 'Nuevo', importe: -1, grupo: 'ocio' } });
  const ids = movs(m, '2026-11').map((x) => x.id);
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.every((x) => /^[a-z0-9]{4}$/.test(x)));
  assert.equal(ids[1], 'aaaa', 'el primero conserva su id');
});

test('mov.editar: cambios, quitar campos, mover de mes; el id no cambia', () => {
  const m = mundo();
  const id = movs(m, '2026-11').find((x) => x.concepto === 'Concierto').id;
  m.op('mov.editar', { mes: '2026-11', id, cambios: { importe: -7000, etiquetas: [], naturaleza: 'consumo' } });
  let x = movs(m, '2026-11').find((y) => y.id === id);
  assert.deepEqual([x.importe, x.etiquetas, x.naturaleza], [-7000, [], 'consumo']);
  m.op('mov.editar', { mes: '2026-11', id, cambios: { naturaleza: null, grupo: null } });
  x = movs(m, '2026-11').find((y) => y.id === id);
  assert.equal(x.naturaleza, undefined);
  assert.equal(x.grupo, null);
  const r = m.op('mov.editar', { mes: '2026-11', id, cambios: { fecha: '2026-12-01' } });
  assert.deepEqual(Object.keys(r.escribir).sort(), ['mes/2026-11.md', 'mes/2026-12.md']);
  assert.equal(movs(m, '2026-11').find((y) => y.id === id), undefined);
  assert.equal(movs(m, '2026-12')[0].concepto, 'Concierto');
  falla(() => m.op('mov.editar', { mes: '2026-12', id: r.resultado.id, cambios: { id: 'zzzz' } }), 'invalida', /no cambia/);
  falla(() => m.op('mov.editar', { mes: '2026-11', id: 'nada', cambios: {} }), 'no_existe');
  falla(() => m.op('mov.editar', { mes: '2031-01', id: 'x', cambios: {} }), 'no_existe');
});

test('mes cerrado: pide confirmación y, si se confirma, queda «editado tras cierre» (§2.5)', () => {
  const m = mundo();
  const id = movs(m, '2026-10')[0].id;
  falla(() => m.op('mov.borrar', { mes: '2026-10', id }), 'mes_cerrado', /¿lo editas igualmente\?/);
  falla(() => m.op('mov.crear', { mov: { fecha: '2026-10-05', concepto: 'x', importe: -1, grupo: 'ocio' } }), 'mes_cerrado');
  const r = m.op('mov.borrar', { mes: '2026-10', id, confirmarCerrado: true });
  assert.equal(valores(leer('mes/2026-10.md', m.fs.get('mes/2026-10.md')), 'Cierre').editado_tras_cierre, true);
  assert.equal(r.papelera.length, 1);
  assert.equal(r.papelera[0].tipo, 'entidad');
  m.op('papelera.restaurar', { entrada: r.papelera[0] });
  assert.equal(movs(m, '2026-10')[0].id, id, 'vuelve a su sitio');
  falla(() => m.op('papelera.restaurar', { entrada: r.papelera[0] }), 'conflicto', /ya existe/);
});

test('recurrentes del mes: confirmar (con cuenta destino del grupo), saltar y desmarcar', () => {
  const m = mundo();
  const r = m.op('rec.confirmar', { mes: '2026-11', rec: 'seguro-coche' });
  const mv = movs(m, '2026-11').find((x) => x.id === r.resultado.id);
  assert.deepEqual([mv.fecha, mv.importe, mv.rec], ['2026-11-14', -32000, 'seguro-coche']);
  assert.equal(valores(leer('mes/2026-11.md', m.fs.get('mes/2026-11.md')), 'Recurrentes')['seguro-coche'], 'confirmado');
  falla(() => m.op('rec.confirmar', { mes: '2026-11', rec: 'seguro-coche' }), 'invalida', /ya está confirmado/);
  falla(() => m.op('rec.confirmar', { mes: '2026-11', rec: 'nada' }), 'no_existe');
  const otro = mundo();
  const doc = leer('mes/2026-11.md', otro.fs.get('mes/2026-11.md'));
  assert.ok(items(doc, 'Movimientos').some((x) => x.rec === 'a-remunerada' && x.a === 'remunerada'));
  const r2 = otro.op('rec.confirmar', { mes: '2026-12', rec: 'a-remunerada' });
  assert.equal(movs(otro, '2026-12').find((x) => x.id === r2.resultado.id).a, 'remunerada', 'el grupo colchón lleva a la remunerada');
  m.op('rec.saltar', { mes: '2026-11', rec: 'agua' });
  m.op('rec.desmarcar', { mes: '2026-11', rec: 'nube' });
  const marcas = valores(leer('mes/2026-11.md', m.fs.get('mes/2026-11.md')), 'Recurrentes');
  assert.equal(marcas.agua, 'saltado');
  assert.equal(marcas.nube, undefined);
});

test('presupuesto del mes: fijar y quitar', () => {
  const m = mundo();
  m.op('pres.fijar', { mes: '2026-11', grupo: 'comida', importe: 40000 });
  assert.deepEqual(valores(leer('mes/2026-11.md', m.fs.get('mes/2026-11.md')), 'Presupuestos'), { ocio: 20000, comida: 40000 });
  m.op('pres.fijar', { mes: '2026-11', grupo: 'ocio', importe: null });
  assert.deepEqual(valores(leer('mes/2026-11.md', m.fs.get('mes/2026-11.md')), 'Presupuestos'), { comida: 40000 });
  falla(() => m.op('pres.fijar', { mes: '2026-11', grupo: 'Mal Id', importe: 1 }), 'invalida');
});

test('listas: crear, editar (renombrar sin cambiar id), borrar a la papelera y restaurar', () => {
  const m = mundo();
  m.op('lista.crear', { ruta: 'grupos.md', valor: { id: 'mascotas', nombre: 'Mascotas', naturaleza: 'consumo', presupuesto: 3000 } });
  falla(() => m.op('lista.crear', { ruta: 'grupos.md', valor: { id: 'mascotas', nombre: 'Otra', naturaleza: 'consumo' } }), 'invalida', /ya existe/);
  falla(() => m.op('lista.crear', { ruta: 'grupos.md', valor: { id: 'x', nombre: 'X', naturaleza: 'gasto' } }), 'invalida');
  m.op('lista.editar', { ruta: 'grupos.md', clave: 'ocio', cambios: { nombre: 'Ocio y planes' } });
  const g = items(leer('grupos.md', m.fs.get('grupos.md')));
  assert.equal(g.find((x) => x.id === 'ocio').nombre, 'Ocio y planes');
  falla(() => m.op('lista.editar', { ruta: 'grupos.md', clave: 'ocio', cambios: { id: 'ocio-2' } }), 'invalida', /no cambia/);
  const r = m.op('lista.borrar', { ruta: 'cuentas.md', clave: 'efectivo' });
  assert.ok(!items(leer('cuentas.md', m.fs.get('cuentas.md'))).some((x) => x.id === 'efectivo'));
  m.op('papelera.restaurar', { entrada: r.papelera[0] });
  assert.equal(items(leer('cuentas.md', m.fs.get('cuentas.md')))[3].id, 'efectivo', 'en su posición');
  falla(() => m.op('lista.crear', { ruta: 'mes/2026-11.md', valor: {} }), 'invalida');
  falla(() => m.op('lista.crear', { ruta: '../fuera.md', valor: {} }), 'invalida');
});

test('bloques: crear, editar (campos, título, cuerpo), borrar y restaurar en su sitio', () => {
  const m = mundo();
  m.op('bloque.crear', { ruta: 'metas.md', id: 'coche', titulo: 'Coche nuevo', campos: { objetivo: 1500000, estado: { estado: 'activa', fecha: null } } });
  falla(() => m.op('bloque.crear', { ruta: 'metas.md', id: 'coche', titulo: 'x', campos: { objetivo: 1 } }), 'invalida', /ya existe/);
  falla(() => m.op('bloque.crear', { ruta: 'metas.md', id: 'mal id', titulo: 'x' }), 'invalida');
  falla(() => m.op('bloque.crear', { ruta: 'metas.md', id: 'x', titulo: 'x', campos: { inventado: 1 } }), 'invalida', /desconocido/);
  m.op('bloque.editar', { ruta: 'metas.md', id: 'japon', titulo: 'Japón 2027', campos: { objetivo: 450000, fecha_deseada: null } });
  const j = bloques(leer('metas.md', m.fs.get('metas.md'))).find((b) => b.id === 'japon');
  assert.equal(j.titulo, 'Japón 2027');
  assert.equal(j.campos.objetivo, 450000);
  assert.equal(j.campos.fecha_deseada, undefined);
  assert.ok(j.campos.se_alimenta_de, 'el resto de campos se conserva');
  const r = m.op('bloque.borrar', { ruta: 'metas.md', id: 'piso' });
  const antes = m.fs.get('metas.md');
  assert.ok(!/## piso/.test(antes));
  m.op('papelera.restaurar', { entrada: r.papelera[0] });
  assert.deepEqual(bloques(leer('metas.md', m.fs.get('metas.md'))).map((b) => b.id), ['colchon', 'japon', 'piso', 'portatil', 'coche']);
  m.op('bloque.editar', { ruta: 'conocimiento/mias/reglas.md', id: 'N-0001', cuerpo: 'Texto nuevo\ncon dos líneas' });
  assert.equal(bloques(leer('conocimiento/mias/reglas.md', m.fs.get('conocimiento/mias/reglas.md')))[0].cuerpo, 'Texto nuevo\ncon dos líneas');
  falla(() => m.op('bloque.editar', { ruta: 'conocimiento/mias/reglas.md', id: 'N-0001', cuerpo: '## rompe' }), 'invalida');
});

test('ajustes y ficheros enteros', () => {
  const m = mundo();
  m.op('ajustes.fijar', { clave: 'tema', valor: 'oscuro' });
  m.op('ajustes.fijar', { clave: 'mes_inicio_dia', valor: 25 });
  const a = valores(leer('ajustes.md', m.fs.get('ajustes.md')));
  assert.deepEqual([a.tema, a.mes_inicio_dia], ['oscuro', 25]);
  falla(() => m.op('ajustes.fijar', { clave: 'tema', valor: 'azul' }), 'invalida');
  falla(() => m.op('ajustes.fijar', { clave: 'mes_inicio_dia', valor: 31 }), 'invalida');
  falla(() => m.op('ajustes.fijar', { clave: 'inventado', valor: 1 }), 'invalida');
  m.op('ajustes.quitar', { clave: 'tema' });
  assert.equal(valores(leer('ajustes.md', m.fs.get('ajustes.md'))).tema, undefined);
  const ruta = 'decisiones/2026-09-03-anado-nasdaq.md';
  const original = m.fs.get(ruta);
  const r = m.op('fichero.borrar', { ruta });
  assert.equal(m.fs.has(ruta), false);
  assert.equal(r.papelera[0].contenido, original);
  m.op('papelera.restaurar', { entrada: r.papelera[0] });
  assert.equal(m.fs.get(ruta), original);
  falla(() => m.op('papelera.restaurar', { entrada: r.papelera[0] }), 'conflicto');
  falla(() => m.op('fichero.borrar', { ruta: 'CONTEXTO/x.md' }), 'invalida');
});

test('no se escribe un fichero de una versión más nueva ni se reescribe si no cambia', () => {
  const m = mundo(new Map([['cuentas.md', '# Cuentas\nesquema: 9\n- a | A | tipo: ahorro\n']]));
  falla(() => m.op('lista.editar', { ruta: 'cuentas.md', clave: 'a', cambios: { nombre: 'B' } }), 'solo_lectura');
  const n = mundo();
  const r = n.op('lista.editar', { ruta: 'grupos.md', clave: 'ocio', cambios: { nombre: 'Ocio' } });
  assert.deepEqual(r.escribir, {}, 'mismo contenido → nada que escribir');
  assert.equal(r.inversa, null);
});

test('propiedad: aplicar una operación y su inversa deja los ficheros idénticos byte a byte (§11)', () => {
  const prng = crearPrng('inversas');
  const conceptos = ['Café', 'Pan | leche', 'Cena #amigos', 'Ñandú', 'Libro «x»'];
  for (let i = 0; i < 150; i++) {
    const m = mundo();
    const antes = new Map(m.fs);
    const meses = ['2026-11', '2026-10', '2026-09', '2027-01'];
    const mes = prng.elegir(meses);
    const lista = m.fs.has(`mes/${mes}.md`) ? movs(m, mes) : [];
    const candidatos = [
      ['mov.crear', { mov: { fecha: `${mes}-${String(prng.entero(1, 28)).padStart(2, '0')}`, concepto: prng.elegir(conceptos), importe: prng.entero(-99999, 99999) || 1, grupo: prng.elegir(['ocio', 'comida', null]), etiquetas: prng.siguiente() < 0.5 ? ['social'] : [] }, confirmarCerrado: true }],
      ...(lista.length ? [['mov.borrar', { mes, id: prng.elegir(lista).id, confirmarCerrado: true }], ['mov.editar', { mes, id: prng.elegir(lista).id, cambios: { importe: prng.entero(-9999, -1), fecha: `${prng.elegir(meses)}-15` }, confirmarCerrado: true }]] : []),
      ['pres.fijar', { mes: '2026-11', grupo: prng.elegir(['ocio', 'comida']), importe: prng.siguiente() < 0.3 ? null : prng.entero(1, 99999) }],
      ['lista.editar', { ruta: 'grupos.md', clave: prng.elegir(['ocio', 'comida', 'salud']), cambios: { nombre: prng.elegir(conceptos), presupuesto: prng.entero(1, 99999) } }],
      ['bloque.editar', { ruta: 'metas.md', id: prng.elegir(['japon', 'colchon']), campos: { objetivo: prng.entero(1, 9999999) } }],
      ['ajustes.fijar', { clave: 'mes_inicio_dia', valor: prng.entero(1, 28) }],
      ['fichero.borrar', { ruta: 'decisiones/2026-10-12-subo-aportacion.md' }],
    ];
    const [nombre, args] = prng.elegir(candidatos);
    const r = m.op(nombre, args, ctx(i));
    if (!r.inversa) continue;
    for (const [k, v] of Object.entries(r.inversa.esperado)) assert.equal(m.fs.get(k) ?? null, v);
    m.op(r.inversa.op, r.inversa.args, ctx(i));
    assert.deepEqual([...m.fs.keys()].sort(), [...antes.keys()].sort(), `${nombre}: mismos ficheros`);
    for (const [k, v] of antes) assert.equal(m.fs.get(k), v, `${nombre} ${JSON.stringify(args).slice(0, 80)}: ${k} idéntico`);
  }
});

test('determinismo: misma entrada, misma semilla → mismos bytes', () => {
  const a = mundo().op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'x', importe: -1, grupo: 'ocio' } }, ctx(42));
  const b = mundo().op('mov.crear', { mov: { fecha: '2026-11-03', concepto: 'x', importe: -1, grupo: 'ocio' } }, ctx(42));
  assert.deepEqual(a.escribir, b.escribir);
});
