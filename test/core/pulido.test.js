// F12 en el núcleo: guarida de Rex (humor, hucha, accesorios), ajustes por texto con su gramática, roles y
// tareas propios, la primera vez (inicio.crear) y el aviso de tramos de otro año (§9.19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as R from '../../src/core/rex.js';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { construirModelo } from '../../src/core/modelo.js';
import { leer } from '../../src/core/formato/index.js';
import { items, valores } from '../../src/core/formato/motor.js';
import { carpetaNueva } from '../../src/core/inicio.js';
import { resumenCartera } from '../../src/core/cartera-resumen.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
const BASE = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].map(([r, texto]) => [r, { texto, version: 'v' }])));
function mundo(inicial = BASE) {
  const fs = new Map(inicial);
  return {
    fs,
    modelo: () => modeloDe(fs),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, re) => assert.throws(fn, (e) => e instanceof ErrorOp && (!re || re.test(e.message)));

test('Rex: humor por la tasa del mes, hucha por las metas y accesorios por sus reglas', () => {
  const M = modeloDe(BASE);
  assert.deepEqual(R.parseHumor('contento>=30 | tranquilo>=15 | preocupado<15').map((r) => [r.humor, r.op, r.pb]), [['contento', '>=', 3000], ['tranquilo', '>=', 1500], ['preocupado', '<', 1500]]);
  assert.ok(R.parseHumor('contento 30').error);
  const h = R.humorRex(M, HOY);
  assert.equal(h.tasaPb, R.tasaReciente(M, HOY));
  assert.equal(h.humor, h.tasaPb >= 3000 ? 'contento' : h.tasaPb >= 1500 ? 'tranquilo' : 'preocupado');
  // el mismo modelo con otro umbral: preocupado
  assert.equal(R.humorRex({ ...M, ajustes: { ...M.ajustes, rex_humor: 'contento>=90 | preocupado<90' } }, HOY).humor, 'preocupado');
  const hucha = R.huchaRex(M, HOY);
  assert.ok(hucha > 0 && hucha <= 10000);
  const acc = R.accesoriosRex(M, HOY);
  assert.deepEqual(acc.lista.map((a) => a.id), ['gafas', 'corbata', 'japon', 'corona']);
  assert.equal(acc.lista.find((a) => a.id === 'gafas').logrado, true, 'el ejemplo tiene meses con más del 30 %');
  assert.equal(acc.lista.find((a) => a.id === 'corona').logrado, false);
  assert.ok(R.parseAccesorios('sombrero:llueve').error);
  assert.equal(R.accesoriosRex({ ...M, ajustes: { ...M.ajustes, accesorios: 'mal' } }, HOY).error.length > 0, true);
  // sin metas: hucha null; sin movimientos: tranquilo
  assert.equal(R.huchaRex({ ...M, metas: [] }, HOY), null);
});

test('ajustes.textos: valida cada texto con su formato y su gramática; vacío = por defecto; un solo deshacer', () => {
  const m = mundo();
  m.op('ajustes.textos', { valores: { rex_humor: 'contento>=40 | preocupado<40', libertad_multiplicador: '30', tema: 'oscuro' } });
  const v = valores(leer('ajustes.md', m.fs.get('ajustes.md')));
  assert.deepEqual([v.rex_humor, v.libertad_multiplicador, v.tema], ['contento>=40 | preocupado<40', 30, 'oscuro']);
  falla(() => m.op('ajustes.textos', { valores: { rex_humor: 'feliz siempre' } }), /rex_humor/);
  falla(() => m.op('ajustes.textos', { valores: { crisis_periodos: '2008 crisis' } }), /crisis_periodos/);
  falla(() => m.op('ajustes.textos', { valores: { libertad_multiplicador: 'mucho' } }), /libertad_multiplicador/);
  falla(() => m.op('ajustes.textos', { valores: { inventado: 'x' } }), /desconocido/);
  const r = m.op('ajustes.textos', { valores: { tema: '' } });
  assert.equal(valores(leer('ajustes.md', m.fs.get('ajustes.md'))).tema, undefined, 'vacío: se quita la clave');
  assert.equal(m.modelo().ajustes.tema, 'auto', 'y vuelve el valor por defecto');
  m.op(r.inversa.op, r.inversa.args);
  assert.equal(valores(leer('ajustes.md', m.fs.get('ajustes.md'))).tema, 'oscuro');
});

test('texto.guardar: tu versión de un rol o una tarea, validada; nada fuera de roles/ y tareas/', () => {
  const m = mundo();
  const t = '# Tarea · Mi resumen\nesquema: 1\ntrabajo: privado\n## Trabajo\nResume mi mes en tres frases.\n';
  m.op('texto.guardar', { ruta: 'tareas/mi-resumen.md', texto: t });
  assert.equal(m.fs.get('tareas/mi-resumen.md'), t);
  falla(() => m.op('texto.guardar', { ruta: 'tareas/mala.md', texto: '# Tarea · Mala\nesquema: 1\n## Trabajo\nsin trabajo\n' }), /trabajo/);
  falla(() => m.op('texto.guardar', { ruta: 'mes/2026-11.md', texto: t }), /roles\/ y tareas\//);
  falla(() => m.op('texto.guardar', { ruta: 'tareas/../ajustes.md', texto: t }));
});

test('inicio.crear: de una carpeta vacía a tus cuentas, grupos, etiquetas, recurrentes y la Base', () => {
  const vacia = new Map([['ajustes.md', '# Ajustes\nesquema: 1\n']]);
  assert.equal(carpetaNueva(modeloDe(vacia)), true);
  assert.equal(carpetaNueva(modeloDe(BASE)), false);
  const m = mundo(vacia);
  const dir = join(import.meta.dirname, '..', '..', 'semilla', 'base');
  const ficheros = Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => [n, readFileSync(join(dir, n), 'utf8')]));
  const r = m.op('inicio.crear', { fecha: HOY, nombre: 'Alex', mes_inicio_dia: 25, tema: 'auto', cuentas: [{ nombre: 'Cuenta corriente', tipo: 'corriente', saldo: 125000 }, { nombre: 'Remunerada', tipo: 'ahorro', saldo: 300000, colchon: true }], grupos: ['sueldo', 'vivienda', 'comida', 'cartera', 'colchon'], recurrentes: [{ concepto: 'Nómina', importe: 250000, grupo: 'sueldo', dia: 1 }, { concepto: 'Alquiler', importe: -75000, grupo: 'vivienda', dia: 1 }], base: { ficheros } });
  assert.deepEqual([r.resultado.cuentas, r.resultado.grupos, r.resultado.recurrentes], [2, 5, 2]);
  assert.ok(r.resultado.base >= 150);
  for (const ruta of ['ajustes.md', 'cuentas.md', 'grupos.md', 'etiquetas.md', 'recurrentes.md']) assert.deepEqual(leer(ruta, m.fs.get(ruta)).avisos, [], ruta);
  const M = m.modelo();
  assert.equal(carpetaNueva(M), false);
  assert.equal(M.ajustes.mes_inicio_dia, 25);
  assert.equal(M.cuentas.find((c) => c.id === 'remunerada').colchon, true);
  assert.equal(M.grupos.find((g) => g.id === 'colchon').cuenta, 'remunerada');
  assert.deepEqual(items(leer('recurrentes.md', m.fs.get('recurrentes.md'))).map((x) => [x.id, x.importe, x.cuenta]), [['nomina', 250000, 'cuenta-corriente'], ['alquiler', -75000, 'cuenta-corriente']]);
  // no se repite sobre una carpeta que ya tiene datos, ni sin cuentas o sin grupos de gasto
  falla(() => m.op('inicio.crear', { fecha: HOY, cuentas: [{ nombre: 'x', tipo: 'corriente' }], grupos: ['comida'] }), /ya está hecha/);
  const otra = mundo(vacia);
  falla(() => otra.op('inicio.crear', { fecha: HOY, cuentas: [], grupos: ['comida'] }), /al menos una cuenta/);
  falla(() => otra.op('inicio.crear', { fecha: HOY, cuentas: [{ nombre: 'x', tipo: 'corriente' }], grupos: ['sueldo'] }), /grupo de gasto/);
  falla(() => otra.op('inicio.crear', { fecha: HOY, cuentas: [{ nombre: 'x', tipo: 'corriente' }], grupos: ['comida'], recurrentes: [{ concepto: 'Gym', importe: -3000, grupo: 'salud' }] }), /no está entre los elegidos/);
  // un solo deshacer: la inversa deja la carpeta como estaba
  const r2 = otra.op('inicio.crear', { fecha: HOY, cuentas: [{ nombre: 'x', tipo: 'corriente' }], grupos: ['comida'] });
  otra.op(r2.inversa.op, r2.inversa.args);
  assert.deepEqual([...otra.fs.keys()], ['ajustes.md']);
  assert.equal(otra.fs.get('ajustes.md'), vacia.get('ajustes.md'));
});

test('§9.19: al cambiar de año, los tramos de un año anterior piden «verificar»', () => {
  const M = modeloDe(BASE);
  assert.equal(resumenCartera(M, HOY).impuestosAviso, null);
  assert.match(resumenCartera(M, '2027-01-10').impuestosAviso, /tramos de 2026: verifica los de 2027/);
});
