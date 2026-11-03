// Operaciones de F5: operaciones con enlace al movimiento, fotos de valor, objetivo y borradores,
// con el recálculo de las fotos de los meses cerrados. Más el resumen de la pestaña Cartera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores, cabeceras, bloques } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { resumenCartera } from '../../src/core/cartera-resumen.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const BASE = generar();
const HOY = '2026-11-03';
function mundo(inicial = BASE) {
  const fs = new Map([...inicial].filter(([r]) => r.endsWith('.md')));
  const ctx = () => ({ ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng: crearPrng(9), hoy: HOY, rutas: [...fs.keys()] });
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, ctx());
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
    modelo: () => construirModelo(Object.fromEntries([...fs].map(([r, texto]) => [r, { texto, version: 'v' }]))),
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));
const OPS = 'cartera/operaciones.md';
const op = (m, id) => items(m.doc(OPS)).find((o) => o.id === id);
const mov = (m, mes, id) => items(m.doc(`mes/${mes}.md`), 'Movimientos').find((x) => x.id === id);

test('operación nueva: id correlativo, enlace op ↔ mov y aviso si el activo no existe', () => {
  const m = mundo();
  const r = m.op('operacion.crear', { op: { fecha: '2026-11-02', tipo: 'aportacion', activo: { activo: 'msci-world' }, importe: 20000, participaciones: 4500000 }, mov: { mes: '2026-11', id: 'nasl' } });
  assert.equal(r.resultado.id, 'OP-0269');
  assert.deepEqual(Object.keys(r.escribir).sort(), [OPS, 'mes/2026-11.md']);
  assert.equal(op(m, 'OP-0269').mov, '2026-11/nasl');
  assert.equal(op(m, 'OP-0269').participaciones, 4500000);
  assert.equal(mov(m, '2026-11', 'nasl').op, 'OP-0269');
  const r2 = m.op('operacion.crear', { op: { fecha: '2026-11-03', tipo: 'aportacion', activo: { activo: 'oro-fisico' }, importe: 5000 } });
  assert.equal(r2.resultado.id, 'OP-0270');
  assert.ok(r2.avisos.some((a) => /«oro-fisico» no está en tus activos/.test(a)));
});

test('operación: validaciones de traspaso, importe y mes cerrado', () => {
  const m = mundo();
  const base = { fecha: '2026-11-02', importe: 1000 };
  falla(() => m.op('operacion.crear', { op: { ...base, tipo: 'traspaso', activo: { activo: 'msci-world' } } }), 'invalida', /traspaso necesita/);
  falla(() => m.op('operacion.crear', { op: { ...base, tipo: 'aportacion', activo: { origen: 'msci-world', destino: 'emergentes' } } }), 'invalida', /solo los traspasos/);
  falla(() => m.op('operacion.crear', { op: { ...base, tipo: 'traspaso', activo: { origen: 'msci-world', destino: 'msci-world' } } }), 'invalida', /el mismo/);
  falla(() => m.op('operacion.crear', { op: { ...base, fecha: '2026-13-01', tipo: 'aportacion', activo: { activo: 'msci-world' } } }), 'invalida');
  // enlazar con un movimiento de un mes cerrado pide confirmación; con ella, se hace
  falla(() => m.op('operacion.crear', { op: { ...base, fecha: '2026-10-02', tipo: 'aportacion', activo: { activo: 'msci-world' } }, mov: { mes: '2026-10', id: 'mc85' } }), 'mes_cerrado');
  assert.equal(items(m.doc(OPS)).length, 268, 'nada se escribió');
  m.op('operacion.crear', { op: { ...base, fecha: '2026-10-02', tipo: 'aportacion', activo: { activo: 'msci-world' } }, mov: { mes: '2026-10', id: 'mc85' }, confirmarCerrado: true });
  assert.equal(mov(m, '2026-10', 'mc85').op, 'OP-0269');
});

test('editar conserva el id; borrar va a la papelera y quita el enlace del movimiento', () => {
  const m = mundo();
  m.op('operacion.crear', { op: { fecha: '2026-11-02', tipo: 'aportacion', activo: { activo: 'emergentes' }, importe: 20000 }, mov: { mes: '2026-11', id: 'nasl' } });
  m.op('operacion.editar', { id: 'OP-0269', cambios: { importe: 25000, nota: 'corregido' } });
  assert.equal(op(m, 'OP-0269').importe, 25000);
  assert.equal(op(m, 'OP-0269').nota, 'corregido');
  m.op('operacion.editar', { id: 'OP-0269', cambios: { nota: null } });
  assert.equal(op(m, 'OP-0269').nota, undefined);
  falla(() => m.op('operacion.editar', { id: 'OP-0269', cambios: { id: 'OP-9999' } }), 'invalida', /no cambia/);
  const r = m.op('operacion.borrar', { id: 'OP-0269' });
  assert.equal(r.papelera.length, 1);
  assert.equal(op(m, 'OP-0269'), undefined);
  assert.equal(mov(m, '2026-11', 'nasl').op, undefined);
  // la inversa devuelve exactamente lo anterior
  const antes = new Map(m.fs);
  m.op('operacion.crear', { op: { fecha: '2026-11-02', tipo: 'dividendo', activo: { activo: 'msci-world' }, importe: 1234 } });
  const r2 = m.op('operacion.borrar', { id: 'OP-0269' });
  m.op(r2.inversa.op, r2.inversa.args);
  assert.ok(op(m, 'OP-0269'));
  const r3 = m.op('operacion.borrar', { id: 'OP-0269' });
  assert.ok(r3.inversa);
  assert.equal(m.fs.get(OPS), antes.get(OPS));
});

test('valores: foto del día, sustituye la fila del mismo activo y recalcula la foto del mes cerrado', () => {
  const m = mundo();
  const cierreAntes = valores(m.doc('mes/2026-09.md'), 'Cierre');
  const ruta = 'cartera/valores/2026-09-30.md';
  const fila = items(m.doc(ruta)).find((f) => f.activo === 'msci-world');
  const r = m.op('valores.guardar', { fecha: '2026-09-30', filas: [{ activo: 'msci-world', valor: fila.valor + 50000 }] });
  assert.ok(r.escribir[ruta]);
  assert.ok(r.escribir['mes/2026-09.md'], 'el cierre de septiembre se recalcula');
  const filas = items(m.doc(ruta)).filter((f) => f.activo === 'msci-world');
  assert.equal(filas.length, 1);
  assert.equal(filas[0].valor, fila.valor + 50000);
  const cierre = valores(m.doc('mes/2026-09.md'), 'Cierre');
  assert.equal(cierre.cartera, cierreAntes.cartera + 50000);
  assert.equal(cierre.patrimonio, cierreAntes.patrimonio + 50000);
  // nuevo día: crea el fichero
  m.op('valores.guardar', { fecha: HOY, filas: [{ activo: 'msci-world', valor: 1800000 }] });
  assert.equal(items(m.doc(`cartera/valores/${HOY}.md`))[0].origen, 'manual');
  falla(() => m.op('valores.guardar', { fecha: 'ayer', filas: [{ activo: 'x', valor: 1 }] }), 'invalida');
  falla(() => m.op('valores.guardar', { fecha: HOY, filas: [] }), 'invalida', /no hay valores/);
  falla(() => m.op('valores.guardar', { fecha: HOY, filas: [{ activo: 'msci-world', valor: -1 }] }), 'invalida', /negativo/);
});

test('objetivo: debe sumar 100 %, sin repetidos; redondeo y umbral', () => {
  const m = mundo();
  falla(() => m.op('objetivo.fijar', { pesos: [{ activo: 'msci-world', peso: 6000 }, { activo: 'emergentes', peso: 3000 }] }), 'invalida', /suman 90 %/);
  falla(() => m.op('objetivo.fijar', { pesos: [{ activo: 'msci-world', peso: 5000 }, { activo: 'msci-world', peso: 5000 }] }), 'invalida', /dos veces/);
  m.op('objetivo.fijar', { pesos: [{ activo: 'msci-world', peso: 7000 }, { activo: 'emergentes', peso: 3000, minimo: 5000 }, { activo: 'etf-ndx', peso: 0 }], redondeo: 500, umbral: 200 });
  const d = m.doc('cartera/objetivo.md');
  assert.deepEqual(items(d).map((o) => [o.activo, o.peso, o.minimo ?? null]), [['msci-world', 7000, null], ['emergentes', 3000, 5000]]);
  assert.equal(cabeceras(d).redondeo, 500);
  assert.equal(cabeceras(d).umbral_desviacion, 200);
  // solo ajustes: los pesos no cambian
  m.op('objetivo.fijar', { redondeo: 1000 });
  assert.equal(items(m.doc('cartera/objetivo.md')).length, 2);
});

test('borrador: se crea desde una plantilla y al aceptarlo crea activos y fija el objetivo', () => {
  const m = mundo();
  const filas = [
    { id: 'msci-world', nombre: 'Fondo MSCI World', peso: 6000, clase: 'rv-desarrollados' },
    { id: 'rf-global', nombre: 'Fondo RF global', peso: 3000, clase: 'renta-fija' },
    { id: 'monetario', nombre: 'Fondo monetario', peso: 1000, clase: 'efectivo' },
  ];
  const opsAntes = m.fs.get(OPS);
  const r = m.op('borrador.crear', { plantilla: { perfil: 'mia', titulo: 'Mía 60/40', filas }, fecha: HOY });
  assert.equal(r.resultado.ruta, `cartera/borradores/${HOY}-mia.md`);
  assert.equal(m.op('borrador.crear', { plantilla: { perfil: 'mia', titulo: 'Mía', filas }, fecha: HOY }).resultado.ruta, `cartera/borradores/${HOY}-mia-2.md`);
  const d = m.doc(r.resultado.ruta);
  assert.equal(cabeceras(d).estado, 'borrador');
  assert.equal(d.avisos.length, 0);
  falla(() => m.op('borrador.crear', { plantilla: { perfil: 'x', filas: filas.slice(0, 2) }, fecha: HOY }), 'invalida', /suman 90 %/);
  const ac = m.op('borrador.aceptar', { ruta: r.resultado.ruta });
  assert.deepEqual(ac.resultado.creados, ['rf-global', 'monetario']);
  const activos = bloques(m.doc('cartera/activos.md'));
  assert.equal(activos.find((a) => a.id === 'rf-global').campos.clase, 'renta-fija');
  assert.deepEqual(items(m.doc('cartera/objetivo.md')).map((o) => [o.activo, o.peso]), filas.map((f) => [f.id, f.peso]));
  assert.equal(cabeceras(m.doc(r.resultado.ruta)).estado, 'aceptado');
  assert.equal(m.fs.get(OPS), opsAntes, 'las operaciones no se tocan');
  falla(() => m.op('borrador.aceptar', { ruta: r.resultado.ruta }), 'invalida', /ya está aceptado/);
  falla(() => m.op('borrador.aceptar', { ruta: 'mes/2026-11.md' }), 'invalida', /borrador no válido/);
});

test('plantillas de semilla: válidas, suman 100 %, sin ISIN y iguales a las del ejemplo', () => {
  const dir = join(import.meta.dirname, '../../semilla/plantillas-cartera');
  const nombres = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  assert.deepEqual(nombres, ['conservadora.md', 'crecimiento.md', 'equilibrada.md', 'total.md']);
  for (const n of nombres) {
    const texto = fs.readFileSync(join(dir, n), 'utf8');
    const d = leer(`cartera/plantillas/${n}`, texto);
    assert.equal(d.tipo, 'plantilla', n);
    assert.equal(d.avisos.length, 0, `${n}: ${JSON.stringify(d.avisos)}`);
    assert.equal(items(d).reduce((s, f) => s + f.peso, 0), 10000, n);
    assert.ok(items(d).every((f) => !f.isin), `${n} sin ISIN`);
    assert.equal(texto, BASE.get(`cartera/plantillas/${n}`), `${n} igual que en el ejemplo`);
  }
});

test('resumen de la cartera del ejemplo: coherente y en céntimos', () => {
  const m = mundo().modelo();
  const t0 = performance.now();
  const r = resumenCartera(m, HOY, { indices: ['msci-world-nr-eur', 'sp500-eur'] });
  assert.ok(performance.now() - t0 < 1000, 'rápido');
  const e = r.estado;
  assert.ok(Number.isInteger(e.valor) && Number.isInteger(e.coste) && Number.isInteger(r.impuesto));
  assert.equal(e.plusvalia, e.valor - e.coste);
  assert.equal(e.valor, [...e.porActivo.values()].reduce((s, p) => s + p.valor, 0));
  assert.ok(e.faltanValores, 'hay aportaciones de noviembre tras la foto del 31 oct');
  assert.ok(r.twr12.tasa !== null && r.tir12.tasa !== null && r.twrTotal.anualizada !== null);
  assert.equal(r.comparativa.meses.length, 12);
  assert.equal(r.comparativa.cartera[0], 100);
  assert.equal(r.comparativa.indices.length, 2);
  for (const l of r.comparativa.indices) assert.ok(l.valores.every((v) => v !== null) && l.tendrias.valor > 0);
  assert.ok(r.comparativa.propio.tendrias.valor > 0);
  // reparto: suma la aportación por defecto (recurrentes de inversión del mes)
  assert.equal(r.reparto.aportacion, 60000);
  assert.equal(r.reparto.filas.reduce((s, f) => s + f.importe, 0), 60000);
  assert.ok(r.reparto.filas.every((f) => f.importe % 1000 === 0 && f.importe >= 0));
  for (const dim of ['region', 'sector', 'divisa']) {
    const ex = r.exposicion(dim);
    assert.equal(ex.total, e.valor);
    assert.ok(Math.abs(ex.filas.reduce((s, f) => s + f.pb, 0) - 10000) <= ex.filas.length);
  }
  assert.equal(r.clases.reduce((s, c) => s + c.objetivoPb, 0), 10000);
  // con objetivo que no suma 100 no se reparte y se dice por qué
  const m2 = mundo();
  m2.fs.set('cartera/objetivo.md', m2.fs.get('cartera/objetivo.md').replace(/\| 55\b/, '| 50'));
  const r2 = resumenCartera(m2.modelo(), HOY, { aportacion: 100000 });
  assert.equal(r2.reparto.filas, null);
  assert.match(r2.reparto.motivo, /suman 95 %/);
});
