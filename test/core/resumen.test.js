// Calendario de recurrentes, modelo de la interfaz y «Pendientes hoy» (§4.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobroEnMes, recurrentesDelMes, proximos, fechaCobro } from '../../src/core/recurrentes.js';
import { construirModelo } from '../../src/core/modelo.js';
import { pendientes, pendientesActivos } from '../../src/core/resumen.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const r = (o) => ({ id: 'x', concepto: 'X', importe: -100, grupo: 'ocio', ...o });

test('cobroEnMes: mensual, anual, cada N meses con ancla, pausado, desde/hasta y mes financiero', () => {
  assert.equal(cobroEnMes(r({ cada: 'mes', dia: { dia: 31, mes: null } }), '2026-02'), '2026-02-28');
  assert.equal(cobroEnMes(r({ cada: 'año', dia: { dia: 14, mes: 11 } }), '2026-11'), '2026-11-14');
  assert.equal(cobroEnMes(r({ cada: 'año', dia: { dia: 14, mes: 11 } }), '2026-10'), null);
  assert.equal(cobroEnMes(r({ cada: 'año', dia: { dia: 29, mes: 2 } }), '2027-02'), '2027-02-28');
  const agua = r({ cada: 'bimestre', dia: { dia: 10, mes: null }, desde: '2026-01' });
  assert.deepEqual(['2026-01', '2026-02', '2026-03', '2026-12', '2027-01'].map((m) => !!cobroEnMes(agua, m)), [true, false, true, false, true]);
  assert.equal(cobroEnMes(r({ cada: 'trimestre', dia: { dia: 1, mes: null } }), '2026-05', { ancla: '2026-02' }), '2026-05-01');
  assert.equal(cobroEnMes(r({ cada: 'trimestre', dia: { dia: 1, mes: null } }), '2026-06', { ancla: '2026-02' }), null);
  assert.equal(cobroEnMes(r({ cada: 'mes', dia: { dia: 5, mes: null }, pausado: true }), '2026-11'), null);
  assert.equal(cobroEnMes(r({ cada: 'mes', dia: { dia: 5, mes: null }, desde: '2026-12' }), '2026-11'), null);
  assert.equal(cobroEnMes(r({ cada: 'mes', dia: { dia: 5, mes: null }, hasta: '2026-10' }), '2026-11'), null);
  assert.equal(cobroEnMes(r({ cada: 'mes', dia: { dia: 28, mes: null } }), '2026-11', { inicio: 25 }), '2026-10-28', 'con inicio 25, el 28 cae en octubre');
  assert.equal(cobroEnMes(r({ cada: 'año', dia: { dia: 26, mes: 10 } }), '2026-11', { inicio: 25 }), '2026-10-26', 'anual en el tramo de octubre del mes financiero');
  assert.equal(fechaCobro('2026-11', 1, 25), '2026-11-01');
  assert.equal(cobroEnMes(r({ cada: 'semana', dia: { dia: 1, mes: null } }), '2026-11'), null);
});

test('recurrentes del mes y próximos 30 días (sin los ya confirmados o saltados)', () => {
  const lista = [r({ id: 'a', cada: 'mes', dia: { dia: 20, mes: null } }), r({ id: 'b', cada: 'mes', dia: { dia: 2, mes: null } }), r({ id: 'c', cada: 'año', dia: { dia: 14, mes: 11 } })];
  assert.deepEqual(recurrentesDelMes(lista, '2026-11').map((x) => x.rec.id), ['b', 'c', 'a']);
  const p = proximos(lista, '2026-11-10', { dias: 30, marcas: (m) => (m === '2026-11' ? { c: 'saltado' } : {}) });
  assert.deepEqual(p.map((x) => `${x.fecha} ${x.rec.id}`), ['2026-11-20 a', '2026-12-02 b']);
});

const MAPA = generar();
const ficheros = Object.fromEntries([...MAPA].filter(([ruta]) => ruta.endsWith('.md')).map(([ruta, texto]) => [ruta, { texto, version: 'v' }]));

test('modelo: lee toda la carpeta de ejemplo; los ficheros ilegibles se listan y nunca se tratan como vacíos', () => {
  const m = construirModelo({ ...ficheros, 'metas.md': { error: 'nube' } });
  assert.equal(m.cuentas.length, 5);
  assert.equal(m.meses.length, 12);
  assert.equal(m.mes('2026-11').movimientos.length, 16);
  assert.equal(m.mes('2026-10').estado.estado, 'cerrado');
  assert.equal(m.fotos.at(-1).fecha, '2026-10-31');
  assert.equal(m.descubrimientos.length, 5);
  assert.equal(m.descubrimientos.find((d) => d.id === 'D-007').titulo, 'Infraestructura eléctrica y redes');
  assert.ok(m.notas > 50);
  assert.deepEqual(m.noLegibles, [{ ruta: 'metas.md', error: 'nube' }]);
  assert.deepEqual(m.metas, [], 'sin datos, pero sabiendo que no se pudo leer');
  assert.equal(m.ajustes.nombre, 'Alex');
  assert.equal(m.mes('2030-01'), null);
});

test('pendientes hoy: estado de cada elemento, contador x/4 y próximos (§4.8)', () => {
  const m = construirModelo(ficheros);
  const p = pendientes(m, { fecha: '2026-11-03', hora: '09:00' }, { contexto: ['CONTEXTO/a.txt'] });
  const por = Object.fromEntries(p.elementos.map((e) => [e.id, e]));
  assert.equal(p.mes, '2026-11');
  assert.deepEqual([p.hechos, p.total], [3, 4]);
  assert.equal(por.pulso.detalle, 'hoy: 01:31 + 08:02 · fusionados');
  assert.equal(por.recurrentes.detalle, '9 de 12 confirmados');
  assert.equal(por.recurrentes.accion.destino, 'recurrentes');
  assert.match(por.valores.detalle, /última vez: 31 oct · 6 activos/);
  assert.equal(por.contexto.detalle, '1 por procesar');
  assert.equal(por.pausas.detalle, '«Subir el ETF Nasdaq 100 al 10 %»');
  assert.equal(por.cierre, undefined, 'aún no toca cerrar');
  assert.deepEqual(p.proximos.slice(0, 2).map((x) => `${x.fecha} ${x.texto} ${x.importe}`), ['2026-11-12 agua 42 €', '2026-11-14 seguro coche 320 €']);
  assert.ok(p.proximos.some((x) => x.texto === 'cerrar noviembre' && x.destino === 'cierre'));
  const tarde = pendientes(m, { fecha: '2026-11-29', hora: '10:00' });
  const t = Object.fromEntries(tarde.elementos.map((e) => [e.id, e]));
  assert.equal(t.cierre.titulo, 'Cerrar noviembre');
  assert.match(t.pulso.detalle, /hoy sin hacer · 14 días sin pulso/);
  assert.equal(t.pausas.detalle.split(' · ').length, 2, 'la pausa de 48 h ya volvió');
  assert.equal(tarde.hechos, 0);
});

test('pendientes configurables y sin datos', () => {
  assert.deepEqual([...pendientesActivos('pulso diario | valores semanal(dom)')].sort(), ['descubrimientos', 'pulso', 'seguimiento', 'valores']);
  const m = construirModelo({ ...ficheros, 'ajustes.md': { texto: '# Ajustes\nesquema: 1\n- pendientes: pulso diario | valores semanal\n', version: 'v' } });
  assert.deepEqual(pendientes(m, { fecha: '2026-11-03' }).elementos.map((e) => e.id), ['pulso', 'valores']);
  const vacio = pendientes(construirModelo({}), { fecha: '2026-11-03' });
  assert.deepEqual(vacio.elementos.map((e) => [e.id, e.hecho]), [['pulso', false], ['movimientos', false], ['recurrentes', true], ['valores', false], ['datos', false]]);
  assert.equal(vacio.elementos[1].detalle, 'aún no hay movimientos este mes');
});
