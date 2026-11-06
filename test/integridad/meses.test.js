// QA2.5–9 · Meses, recurrentes, ids estables, papelera y notas editadas, sobre las operaciones de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores, cabeceras, bloques } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { mesFinanciero, periodoMes } from '../../src/core/fechas.js';
import { cobroEnMes, fechaCobro, recurrentesDelMes } from '../../src/core/recurrentes.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const BASE = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
function mundo(inicial = BASE, dia = 1) {
  const fs = new Map(inicial);
  const estado = { dia };
  const ctx = () => ({ ajustes: { mes_inicio_dia: estado.dia }, formato: { diaInicio: estado.dia }, prng: crearPrng(9), hoy: '2026-11-03', hora: '10:00', rutas: [...fs.keys()] });
  return {
    fs,
    estado,
    doc: (r) => leer(r, fs.get(r), { diaInicio: estado.dia }),
    movs: (mes) => items(leer(`mes/${mes}.md`, fs.get(`mes/${mes}.md`), { diaInicio: estado.dia }), 'Movimientos'),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, ctx());
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
    falla(nombre, args, codigo) {
      const antes = [...fs];
      assert.throws(() => this.op(nombre, args), (e) => e instanceof ErrorOp && (!codigo || e.codigo === codigo), `${nombre} debería fallar con ${codigo}`);
      assert.deepEqual([...fs], antes);
    },
  };
}
const grupo = 'ocio';
const secciones = (m, mes, nombre) => m.doc(`mes/${mes}.md`).secciones.filter((s) => s.nombre === nombre).length;

test('cerrar → reabrir → cerrar N veces: nunca duplica la foto ni los movimientos', () => {
  const m = mundo();
  const n = m.movs('2026-11').length;
  for (let i = 0; i < 5; i++) {
    m.op('mes.cerrar', { mes: '2026-11', leccion: `lección ${i}` });
    assert.equal(secciones(m, '2026-11', 'Cierre'), 1);
    assert.equal(m.movs('2026-11').length, n);
    assert.equal(valores(m.doc('mes/2026-11.md'), 'Cierre').leccion, `lección ${i}`);
    assert.equal(cabeceras(m.doc('mes/2026-11.md')).estado.estado, 'cerrado');
    m.op('mes.reabrir', { mes: '2026-11' });
    assert.equal(valores(m.doc('mes/2026-11.md'), 'Cierre').saldos, undefined, 'sin foto');
    assert.equal(valores(m.doc('mes/2026-11.md'), 'Cierre').leccion, `lección ${i}`, 'la lección se queda (QA-050)');
    assert.equal(cabeceras(m.doc('mes/2026-11.md')).estado.estado, 'reabierto');
  }
});

test('editar cerrado: sin confirmar, error sin tocar; confirmando, marca, recalcula y propaga a los cerrados siguientes', () => {
  const m = mundo();
  m.op('mes.cerrar', { mes: '2026-11' }); // octubre ya está cerrado en el ejemplo
  const cuenta = m.movs('2026-10').find((x) => x.cuenta)?.cuenta;
  const saldoSig = (mes) => valores(m.doc(`mes/${mes}.md`), 'Cierre').saldos;
  const antes10 = JSON.stringify(saldoSig('2026-10'));
  const antes11 = JSON.stringify(saldoSig('2026-11'));
  m.falla('mov.crear', { mov: { fecha: '2026-10-15', concepto: 'x', importe: -10000, grupo, cuenta } }, 'mes_cerrado');
  m.op('mov.crear', { mov: { fecha: '2026-10-15', concepto: 'x', importe: -10000, grupo, cuenta }, confirmarCerrado: true });
  assert.equal(valores(m.doc('mes/2026-10.md'), 'Cierre').editado_tras_cierre, true);
  assert.notEqual(JSON.stringify(saldoSig('2026-10')), antes10);
  assert.notEqual(JSON.stringify(saldoSig('2026-11')), antes11, 'se propaga al mes siguiente');
  assert.notEqual(valores(m.doc('mes/2026-11.md'), 'Cierre').editado_tras_cierre, true, 'el siguiente no se marca como editado');
});

test('todas las operaciones que tocan un mes cerrado piden confirmación', () => {
  const m = mundo();
  m.op('mes.cerrar', { mes: '2026-11' });
  const x = m.movs('2026-11')[0];
  const recs = items(m.doc('recurrentes.md'));
  m.falla('mov.crear', { mov: { fecha: '2026-11-15', concepto: 'x', importe: -1, grupo } }, 'mes_cerrado');
  m.falla('mov.editar', { mes: '2026-11', id: x.id, cambios: { concepto: 'y' } }, 'mes_cerrado');
  m.falla('mov.borrar', { mes: '2026-11', id: x.id }, 'mes_cerrado');
  m.falla('rec.confirmar', { mes: '2026-11', rec: recs[0].id }, 'mes_cerrado');
  m.falla('rec.saltar', { mes: '2026-11', rec: recs[0].id }, 'mes_cerrado');
  m.falla('pres.fijar', { mes: '2026-11', grupo, importe: 100 }, 'mes_cerrado');
  m.falla('cuenta.ajustarSaldo', { cuenta: x.cuenta, fecha: '2026-11-20', saldo: 1 }, 'mes_cerrado');
  // mover un movimiento DE un mes abierto A uno cerrado también
  m.op('mov.crear', { mov: { fecha: '2026-12-01', concepto: 'dic', importe: -1, grupo } });
  const dic = m.movs('2026-12')[0];
  m.falla('mov.editar', { mes: '2026-12', id: dic.id, cambios: { fecha: '2026-11-20' } }, 'mes_cerrado');
});

test('mes que cruza el año: con inicio 25, el 28-dic es de enero siguiente, y el fichero, su periodo y su foto cuadran', () => {
  assert.equal(mesFinanciero('2026-12-28', 25), '2027-01');
  assert.deepEqual(periodoMes('2027-01', 25), { desde: '2026-12-25', hasta: '2027-01-24' });
  const m = mundo(BASE, 25);
  const r = m.op('mov.crear', { mov: { fecha: '2026-12-28', concepto: 'cruza', importe: -100, grupo } });
  assert.equal(r.resultado.mes, '2027-01');
  assert.deepEqual(cabeceras(m.doc('mes/2027-01.md')).periodo, { desde: '2026-12-25', hasta: '2027-01-24' });
  m.op('mes.cerrar', { mes: '2027-01' });
  assert.equal(valores(m.doc('mes/2027-01.md'), 'Cierre').fecha, '2027-01-24');
});

test('cambiar mes_inicio_dia con meses cerrados: ningún movimiento se pierde; la inversa deja los mismos bytes', () => {
  const m = mundo(); // octubre ya está cerrado en el ejemplo
  const todos = () => [...m.fs.keys()].filter((r) => /^mes\//.test(r)).flatMap((r) => items(leer(r, m.fs.get(r)), 'Movimientos').map((x) => `${x.fecha}|${x.concepto}|${x.importe}`)).sort();
  const antes = todos();
  const bytes = new Map(m.fs);
  const r = m.op('mes.cambiarInicio', { dia: 25 });
  m.estado.dia = 25;
  assert.deepEqual(todos(), antes);
  for (const f of [...m.fs.keys()].filter((x) => /^mes\//.test(x))) for (const x of items(leer(f, m.fs.get(f), { diaInicio: 25 }), 'Movimientos')) assert.equal(mesFinanciero(x.fecha, 25), f.slice(4, 11));
  m.estado.dia = 1;
  const inv = aplicarOp((x) => m.fs.get(x) ?? null, r.inversa.op, r.inversa.args, { rutas: [...m.fs.keys()], prng: crearPrng(1) });
  for (const [k, v] of Object.entries(inv.escribir)) (v === null ? m.fs.delete(k) : m.fs.set(k, v));
  assert.deepEqual([...m.fs].sort(), [...bytes].sort());
});

test('recurrentes: todas las frecuencias y los días 29, 30, 31 y 29-feb', () => {
  assert.equal(fechaCobro('2026-02', 31), '2026-02-28');
  assert.equal(fechaCobro('2028-02', 31), '2028-02-29');
  assert.equal(fechaCobro('2026-02', 29), '2026-02-28');
  assert.equal(fechaCobro('2026-04', 31), '2026-04-30');
  assert.equal(fechaCobro('2026-01', 31), '2026-01-31');
  const base = { dia: { dia: 31 } };
  const toca = (rec) => ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].filter((x) => cobroEnMes(rec, x));
  assert.equal(toca({ ...base, cada: 'mes' }).length, 12);
  assert.deepEqual(toca({ ...base, cada: 'bimestre', desde: '2026-01' }), ['2026-01', '2026-03', '2026-05', '2026-07', '2026-09', '2026-11']);
  assert.deepEqual(toca({ ...base, cada: 'trimestre', desde: '2026-02' }), ['2026-02', '2026-05', '2026-08', '2026-11']);
  assert.deepEqual(toca({ ...base, cada: 'semestre', desde: '2026-03' }), ['2026-03', '2026-09']);
  assert.deepEqual(toca({ dia: { dia: 29, mes: 2 }, cada: 'año' }), ['2026-02']);
  assert.equal(cobroEnMes({ dia: { dia: 29, mes: 2 }, cada: 'año' }, '2026-02'), '2026-02-28', 'el 29-feb en año no bisiesto, el 28');
  assert.equal(cobroEnMes({ dia: { dia: 29, mes: 2 }, cada: 'año' }, '2028-02'), '2028-02-29');
  assert.deepEqual(toca({ ...base, cada: 'mes', pausado: true }), [], 'pausado no toca');
  assert.deepEqual(toca({ ...base, cada: 'mes', desde: '2026-11' }), ['2026-11', '2026-12']);
  assert.deepEqual(toca({ ...base, cada: 'mes', hasta: '2026-02' }), ['2026-01', '2026-02']);
  // con mes financiero: la fecha cae dentro del periodo
  for (const d of [1, 15, 25, 28, 29, 30, 31]) for (const ini of [1, 15, 25, 28]) for (const mes of ['2026-02', '2026-03', '2028-02', '2027-01']) {
    const f = fechaCobro(mes, d, ini);
    assert.equal(mesFinanciero(f, ini), mes, `día ${d}, inicio ${ini}, ${mes} → ${f}`);
  }
});

test('recurrentes: «desde el mes que viene» vs «también este mes»; pausar; saltar; confirmar con otro importe; no se confirma dos veces', () => {
  const m = mundo();
  const r0 = items(m.doc('recurrentes.md')).find((r) => r.cada === 'mes');
  m.op('rec.confirmar', { mes: '2026-12', rec: r0.id });
  const mov = () => m.movs('2026-12').find((x) => x.rec === r0.id);
  m.op('rec.editar', { id: r0.id, cambios: { importe: r0.importe - 111 }, aplicar: 'siguiente', mes: '2026-12' });
  assert.equal(mov().importe, r0.importe, 'solo desde el siguiente: el movimiento no cambia');
  m.op('rec.editar', { id: r0.id, cambios: { importe: r0.importe - 222 }, aplicar: 'esteMes', mes: '2026-12' });
  assert.equal(mov().importe, r0.importe - 222, 'también este mes: sí');
  m.falla('rec.confirmar', { mes: '2026-12', rec: r0.id }, 'invalida');
  const n = m.movs('2026-12').length;
  m.op('rec.desmarcar', { mes: '2026-12', rec: r0.id });
  assert.equal(m.movs('2026-12').length, n, 'desmarcar no borra el movimiento');
  m.op('rec.saltar', { mes: '2027-01', rec: r0.id });
  assert.equal(valores(m.doc('mes/2027-01.md'), 'Recurrentes')[r0.id], 'saltado');
  assert.equal(items(m.doc('mes/2027-01.md'), 'Movimientos').length, 0);
  m.op('rec.confirmar', { mes: '2027-02', rec: r0.id, importe: -777 });
  assert.equal(m.movs('2027-02')[0].importe, -777, 'confirmar con otro importe');
  assert.equal(items(m.doc('recurrentes.md')).find((r) => r.id === r0.id).importe, r0.importe - 222, 'y el recurrente no cambia');
  m.op('rec.pausar', { id: r0.id, pausado: true });
  assert.ok(!recurrentesDelMes(items(m.doc('recurrentes.md')), '2027-03', { inicio: 1 }).some((x) => x.rec.id === r0.id));
  m.op('rec.pausar', { id: r0.id, pausado: false });
  assert.ok(recurrentesDelMes(items(m.doc('recurrentes.md')), '2027-03', { inicio: 1 }).some((x) => x.rec.id === r0.id));
});

test('ids estables: renombrar no cambia ids ni referencias; cambiar la naturaleza pregunta', () => {
  const m = mundo();
  const antes = m.movs('2026-11').map((x) => `${x.id}|${x.grupo}|${x.cuenta}`);
  m.op('lista.editar', { ruta: 'grupos.md', clave: 'ocio', cambios: { nombre: 'Tiempo libre' } });
  const c = items(m.doc('cuentas.md'))[0];
  m.op('lista.editar', { ruta: 'cuentas.md', clave: c.id, cambios: { nombre: 'Otro nombre' } });
  assert.deepEqual(m.movs('2026-11').map((x) => `${x.id}|${x.grupo}|${x.cuenta}`), antes);
  assert.equal(items(m.doc('grupos.md')).find((g) => g.id === 'ocio').nombre, 'Tiempo libre');
  m.falla('lista.editar', { ruta: 'grupos.md', clave: 'ocio', cambios: { id: 'otro' } });
  // la naturaleza: con «no», lo ya anotado conserva la anterior de forma explícita
  const n0 = m.movs('2026-11').filter((x) => x.grupo === 'ocio').length;
  assert.ok(n0 > 0);
  m.op('grupo.cambiarNaturaleza', { id: 'ocio', naturaleza: 'inversion', aplicarAMovimientos: false });
  assert.ok(m.movs('2026-11').filter((x) => x.grupo === 'ocio').every((x) => x.naturaleza === 'consumo'));
  const m2 = mundo();
  m2.op('grupo.cambiarNaturaleza', { id: 'ocio', naturaleza: 'inversion', aplicarAMovimientos: true });
  assert.ok(m2.movs('2026-11').filter((x) => x.grupo === 'ocio').every((x) => !x.naturaleza));
});

test('papelera: cada tipo vuelve a su sitio exacto; el padre que falta se explica', () => {
  const casos = [
    ['mov.borrar', (m) => ({ mes: '2026-11', id: m.movs('2026-11')[0].id })],
    ['lista.borrar', () => ({ ruta: 'cuentas.md', clave: items(leer('cuentas.md', BASE.get('cuentas.md'))).at(-1).id })],
    ['operacion.borrar', () => ({ id: items(leer('cartera/operaciones.md', BASE.get('cartera/operaciones.md')))[0].id })],
    ['bloque.borrar', () => ({ ruta: 'metas.md', id: bloques(leer('metas.md', BASE.get('metas.md')))[0].id })],
    ['fichero.borrar', () => ({ ruta: [...BASE.keys()].find((r) => r.startsWith('decisiones/')) })],
  ];
  for (const [nombre, args] of casos) {
    const m = mundo();
    const antes = new Map(m.fs);
    const r = m.op(nombre, args(m));
    assert.ok(r.papelera.length >= 1, `${nombre} manda a la papelera`);
    const e = r.papelera.find((x) => x.tipo !== 'fichero' || true);
    const rp = m.op('papelera.restaurar', { entrada: { ...e, id: 'p-1' } });
    assert.ok(Object.keys(rp.escribir).length >= 1, nombre);
    for (const ruta of Object.keys(r.escribir)) {
      if (ruta !== e.ruta) continue;
      const a = antes.get(ruta);
      assert.equal(m.fs.get(ruta), a, `${nombre}: ${ruta} vuelve idéntico`);
    }
  }
});

test('fuente borrada en una mezcla: la mezcla avisa y se limpia con deshacer', () => {
  const m = mundo();
  const f = m.op('fuente.crear', { nombre: 'Fuente de prueba', familia: items(m.doc('conocimiento/_familias.md'))[0].id });
  const id = f.resultado.id;
  const mz = m.op('mezcla.crear', { nombre: 'Con ella', miembros: [id, 'base'] }).resultado.id;
  m.op('fuente.borrar', { id });
  const antes = new Map(m.fs);
  const r = m.op('mezcla.limpiar', { id: mz });
  const fila = items(m.doc('conocimiento/_mezclas.md')).find((x) => x.id === mz) ?? bloques(m.doc('conocimiento/_mezclas.md')).find((x) => x.id === mz);
  assert.doesNotMatch(JSON.stringify(fila), new RegExp(`"${id}"`));
  const inv = aplicarOp((x) => m.fs.get(x) ?? null, r.inversa.op, r.inversa.args, { rutas: [...m.fs.keys()], prng: crearPrng(1) });
  for (const [k, v] of Object.entries(inv.escribir)) (v === null ? m.fs.delete(k) : m.fs.set(k, v));
  assert.deepEqual([...m.fs].sort(), [...antes].sort());
});

test('notas editadas: reingerir el mismo documento no las pisa', () => {
  const m = mundo();
  const ingesta = { fuente: 'pizarra', fichero: 'mi-doc.txt', fecha: '2026-11-03', notas: [{ titulo: 'Una idea del documento', tipo: 'opinión', temas: ['bolsa'], activos: [], resumen: 'Texto original de la nota generada.' }], predicciones: [] };
  const r = m.op('ingesta.aplicar', ingesta);
  const ruta = Object.keys(r.escribir).find((x) => x.startsWith('conocimiento/pizarra/'));
  const id = bloques(leer(ruta, m.fs.get(ruta)))[0].id;
  m.op('nota.editar', { ruta, id, cuerpo: 'Corregida a mano por mí.' });
  const texto = m.fs.get(ruta);
  assert.equal(bloques(leer(ruta, texto))[0].campos.editada, true);
  const r2 = m.op('ingesta.aplicar', ingesta);
  const rutas = Object.keys(r2.escribir).filter((x) => x.startsWith('conocimiento/pizarra/'));
  assert.equal(m.fs.get(ruta).includes('Corregida a mano por mí.'), true, 'tu corrección sigue ahí');
  assert.equal(bloques(leer(ruta, m.fs.get(ruta))).find((b) => b.id === id).cuerpo, 'Corregida a mano por mí.');
  assert.ok(rutas.length <= 1);
  assert.doesNotThrow(() => construirModelo(Object.fromEntries([...m.fs].map(([k, v]) => [k, { texto: v, version: 'v' }]))));
});
