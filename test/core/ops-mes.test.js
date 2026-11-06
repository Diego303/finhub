// Operaciones de F4: cerrar, reabrir, editar cerrado con recálculo, mes financiero y catálogos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores, cabeceras } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const BASE = generar();
function mundo(inicial = BASE) {
  const fs = new Map([...inicial].filter(([r]) => r.endsWith('.md')));
  const ctx = (dia = 1) => ({ ajustes: { mes_inicio_dia: dia }, formato: { diaInicio: dia }, prng: crearPrng(9), hoy: '2026-11-03', rutas: [...fs.keys()] });
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    op(nombre, args, dia = 1) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, ctx(dia));
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));

test('cerrar: foto con saldos, cartera y patrimonio; avisos sin bloquear; no se cierra dos veces', () => {
  const m = mundo();
  const r = m.op('mes.cerrar', { mes: '2026-11', leccion: 'menos cenas' });
  const d = m.doc('mes/2026-11.md');
  assert.deepEqual(cabeceras(d).estado, { estado: 'cerrado', fecha: '2026-11-30' });
  const c = valores(d, 'Cierre');
  assert.equal(c.leccion, 'menos cenas');
  assert.equal(c.editado_tras_cierre, false);
  assert.equal(c.patrimonio, Object.values(c.saldos).reduce((a, b) => a + b, 0) + c.cartera);
  assert.ok(r.avisos.some((a) => /recurrente\(s\) sin confirmar/.test(a)));
  assert.ok(r.avisos.some((a) => /no hay valor de la cartera de este mes/.test(a)));
  falla(() => m.op('mes.cerrar', { mes: '2026-11' }), 'invalida', /ya está cerrado/);
});

test('reabrir quita la foto; volver a cerrar hace otra', () => {
  const m = mundo();
  m.op('mes.reabrir', { mes: '2026-10' });
  const d = m.doc('mes/2026-10.md');
  assert.equal(cabeceras(d).estado.estado, 'reabierto');
  assert.equal(valores(d, 'Cierre').saldos, undefined, 'sin foto (la lección, si la hay, se queda: QA-050)');
  falla(() => m.op('mes.reabrir', { mes: '2026-10' }), 'invalida', /no está cerrado/);
  m.op('mes.cerrar', { mes: '2026-10' });
  assert.equal(cabeceras(m.doc('mes/2026-10.md')).estado.estado, 'cerrado');
});

test('editar un mes cerrado (§9.4): marca «editado tras cierre», recalcula su foto y propaga a los siguientes cerrados', () => {
  const m = mundo();
  const antes = { sep: valores(m.doc('mes/2026-09.md'), 'Cierre'), oct: valores(m.doc('mes/2026-10.md'), 'Cierre') };
  m.op('mov.crear', { mov: { fecha: '2026-09-10', concepto: 'Olvidado', importe: -10000, grupo: 'ocio', cuenta: 'corriente' }, confirmarCerrado: true });
  const sep = valores(m.doc('mes/2026-09.md'), 'Cierre');
  const oct = valores(m.doc('mes/2026-10.md'), 'Cierre');
  assert.equal(sep.editado_tras_cierre, true);
  assert.equal(sep.saldos.corriente, antes.sep.saldos.corriente - 10000);
  assert.equal(sep.patrimonio, antes.sep.patrimonio - 10000);
  assert.equal(oct.saldos.corriente, antes.oct.saldos.corriente - 10000, 'se propaga al mes siguiente');
  assert.equal(oct.editado_tras_cierre, false, 'solo se marca el mes editado');
  assert.equal(valores(m.doc('mes/2026-08.md'), 'Cierre').saldos.corriente, valores(leer('mes/2026-08.md', BASE.get('mes/2026-08.md')), 'Cierre').saldos.corriente, 'los anteriores no cambian');
});

test('editar el saldo inicial de una cuenta recalcula todos los cierres', () => {
  const m = mundo();
  const antes = valores(m.doc('mes/2026-10.md'), 'Cierre').saldos.remunerada;
  m.op('lista.editar', { ruta: 'cuentas.md', clave: 'remunerada', cambios: { saldo_inicial: { importe: 400000, fecha: '2025-12-01' } } });
  assert.equal(valores(m.doc('mes/2026-10.md'), 'Cierre').saldos.remunerada, antes + 6000);
  assert.equal(valores(m.doc('mes/2025-12.md'), 'Cierre').saldos.remunerada, 400000 + 20000);
});

test('mes financiero (§9.3): pasar a inicio 25 reparte TODOS los movimientos, con avisos; la inversa lo deja todo igual', () => {
  const m = mundo();
  const antes = new Map(m.fs);
  const total = (mm) => [...mm.fs.keys()].filter((r) => r.startsWith('mes/')).reduce((a, r) => a + items(leer(r, mm.fs.get(r)), 'Movimientos').length, 0);
  const n0 = total(m);
  const r = m.op('mes.cambiarInicio', { dia: 25 });
  assert.equal(total(m), n0, 'ningún movimiento se pierde');
  const nov = m.doc('mes/2026-11.md');
  assert.deepEqual(cabeceras(nov).periodo, { desde: '2026-10-25', hasta: '2026-11-24' });
  assert.ok(items(nov, 'Movimientos').every((x) => x.fecha >= '2026-10-25' && x.fecha <= '2026-11-24'));
  for (const ruta of [...m.fs.keys()].filter((x) => x.startsWith('mes/'))) {
    const d = m.doc(ruta);
    const p = cabeceras(d).periodo;
    assert.ok(items(d, 'Movimientos').every((x) => x.fecha >= p.desde && x.fecha <= p.hasta), `${ruta}: solo movimientos de su periodo`);
  }
  assert.ok(items(m.doc('mes/2026-01.md'), 'Movimientos').some((x) => x.fecha >= '2025-12-25'), 'el 25–31 dic pasa a «enero»');
  assert.equal(valores(m.doc('ajustes.md')).mes_inicio_dia, 25);
  assert.ok(r.resultado.cambiados.includes('2026-10'));
  assert.equal(valores(m.doc('mes/2026-10.md'), 'Cierre').editado_tras_cierre, true);
  assert.match(r.avisos[0], /meses cerrados con movimientos repartidos/);
  const mo = construirModelo(Object.fromEntries([...m.fs].map(([k, v]) => [k, { texto: v, version: 'x' }])));
  assert.equal(mo.mes('2026-11').periodo.desde, '2026-10-25', 'el modelo lo lee con el nuevo día');
  m.op(r.inversa.op, r.inversa.args);
  for (const [k, v] of antes) assert.equal(m.fs.get(k), v, k);
  assert.equal(m.fs.size, antes.size);
  falla(() => m.op('mes.cambiarInicio', { dia: 29 }), 'invalida');
});

test('recurrentes: editar «también este mes» cambia el movimiento confirmado; «desde el siguiente» no; pausar', () => {
  const m = mundo();
  m.op('rec.editar', { id: 'gimnasio', cambios: { importe: -4500 }, aplicar: 'siguiente', mes: '2026-11' });
  assert.equal(items(m.doc('mes/2026-11.md'), 'Movimientos').find((x) => x.rec === 'gimnasio').importe, -3990);
  m.op('rec.editar', { id: 'gimnasio', cambios: { importe: -4900, concepto: 'Gimnasio nuevo' }, aplicar: 'esteMes', mes: '2026-11' });
  const g = items(m.doc('mes/2026-11.md'), 'Movimientos').find((x) => x.rec === 'gimnasio');
  assert.deepEqual([g.importe, g.concepto], [-4900, 'Gimnasio nuevo']);
  assert.equal(items(m.doc('mes/2026-10.md'), 'Movimientos').find((x) => x.rec === 'gimnasio').importe, -3990, 'otros meses no se tocan');
  assert.equal(items(m.doc('recurrentes.md')).find((x) => x.id === 'gimnasio').importe, -4900);
  const r = m.op('rec.editar', { id: 'seguro-coche', cambios: { importe: -33000 }, aplicar: 'esteMes', mes: '2026-11' });
  assert.match(r.avisos[0], /aún no había movimiento/);
  m.op('rec.pausar', { id: 'revista' });
  assert.equal(items(m.doc('recurrentes.md')).find((x) => x.id === 'revista').pausado, true);
  falla(() => m.op('rec.editar', { id: 'gimnasio', cambios: { cada: 'semana' } }), 'invalida');
});

test('grupos: cambiar la naturaleza aplicándola o no a lo anotado; borrar con reasignación o dejando «sin grupo»', () => {
  const m = mundo();
  const r = m.op('grupo.cambiarNaturaleza', { id: 'formacion', naturaleza: 'inversion', aplicarAMovimientos: false });
  assert.ok(r.resultado.movimientos > 0);
  assert.ok(items(m.doc('mes/2026-11.md'), 'Movimientos').filter((x) => x.grupo === 'formacion').every((x) => x.naturaleza === 'consumo'), 'lo anotado conserva su naturaleza');
  const n = mundo();
  n.op('grupo.cambiarNaturaleza', { id: 'formacion', naturaleza: 'inversion', aplicarAMovimientos: true });
  assert.ok(items(n.doc('mes/2026-11.md'), 'Movimientos').filter((x) => x.grupo === 'formacion').every((x) => !x.naturaleza), 'lo anotado sigue al grupo');
  const b = n.op('grupo.borrar', { id: 'regalos', destino: 'ocio' });
  assert.equal(items(n.doc('mes/2025-12.md'), 'Movimientos').find((x) => x.concepto === 'Regalos de Navidad').grupo, 'ocio');
  assert.equal(b.papelera.length, 1);
  const s = n.op('grupo.borrar', { id: 'salud' });
  assert.match(s.avisos[0], /quedan «sin grupo»/);
  falla(() => n.op('grupo.borrar', { id: 'ocio', destino: 'nada' }), 'no_existe');
});

test('etiquetas: renombrar en todos los ficheros (conservando la posición) y borrar', () => {
  const m = mundo();
  m.op('etiqueta.renombrar', { de: '#social', a: 'amigos' });
  const todas = [...m.fs.keys()].filter((r) => r.startsWith('mes/')).flatMap((r) => items(m.doc(r), 'Movimientos'));
  assert.ok(!todas.some((x) => x.etiquetas.includes('social')));
  assert.ok(todas.some((x) => x.etiquetas.includes('amigos')));
  assert.ok(items(m.doc('etiquetas.md')).some((e) => e.id === 'amigos'));
  falla(() => m.op('etiqueta.renombrar', { de: 'fijo', a: 'dos palabras' }), 'invalida');
  const r = m.op('etiqueta.borrar', { id: 'suscripción' });
  assert.ok(!items(m.doc('recurrentes.md')).some((x) => x.etiquetas.includes('suscripción')));
  assert.equal(r.papelera[0].ruta, 'etiquetas.md');
});

test('ajustar saldo: un movimiento «ajuste» por la diferencia, neutro en el mes', () => {
  const m = mundo();
  const r = m.op('cuenta.ajustarSaldo', { cuenta: 'efectivo', fecha: '2026-11-03', saldo: 9000 });
  assert.equal(r.resultado.diferencia, 9000 - 14000);
  const aj = items(m.doc('mes/2026-11.md'), 'Movimientos').find((x) => x.ajuste);
  assert.deepEqual([aj.importe, aj.naturaleza, aj.cuenta, aj.grupo], [-5000, 'traspaso', 'efectivo', null]);
  assert.deepEqual(m.op('cuenta.ajustarSaldo', { cuenta: 'efectivo', fecha: '2026-11-03', saldo: 9000 }).escribir, {}, 'ya cuadra: nada');
  falla(() => m.op('cuenta.ajustarSaldo', { cuenta: 'nada', fecha: '2026-11-03', saldo: 1 }), 'no_existe');
});
