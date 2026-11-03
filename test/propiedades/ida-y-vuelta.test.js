// Propiedades de ida y vuelta (§11): para entidades aleatorias, parsear(serializar(x)) = x y
// serializar es idempotente; con ruido aleatorio en los ficheros, nunca se rompe ni se pierde nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPrng } from '../../src/core/prng.js';
import { FORMATOS, leer } from '../../src/core/formato/index.js';
import { serializar, items, bloques, anadirItem, anadirBloque, fijarKv } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const prng = crearPrng('propiedades-formatos');
const CARACTERES = 'abcdefghijklmnñopqrstuvwxyzáéíóúüÁÉÑ0123456789  .,;:-_/()¿?¡!%€$&@«»·—|#\\\'"';
function texto(maxLen = 30) {
  let s = '';
  const n = prng.entero(1, maxLen);
  for (let i = 0; i < n; i++) s += CARACTERES[prng.entero(0, CARACTERES.length - 1)];
  s = s.trim().normalize('NFC');
  return s || 'x';
}
const idSlug = () => Array.from({ length: prng.entero(1, 3) }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'.slice(0, prng.entero(3, 36)).split('').filter(() => prng.siguiente() < 0.3).join('') || 'z').join('-');
const importe = () => prng.entero(-99999999, 99999999) || 1;
const fecha = () => `20${prng.entero(10, 39)}-${String(prng.entero(1, 12)).padStart(2, '0')}-${String(prng.entero(1, 28)).padStart(2, '0')}`;
const etiquetas = () => [...new Set(Array.from({ length: prng.entero(0, 3) }, () => ['fijo', 'social', 'suscripción', 'año-2026', 'x_y'][prng.entero(0, 4)]))];

function idaYVuelta(tipo, construir, leerValores, ctx = {}) {
  for (let i = 0; i < 300; i++) {
    const d = FORMATOS[tipo].nuevo(ctx);
    const esperados = construir(d);
    const t = serializar(d);
    const d2 = FORMATOS[tipo].parsear(t, ctx);
    assert.deepEqual(leerValores(d2), esperados, `${tipo}: ida y vuelta\n${t}`);
    assert.equal(serializar(d2), t, `${tipo}: idempotente`);
  }
}

test('propiedad: movimientos aleatorios (textos con | # \\ « » ·) vuelven idénticos', () => {
  idaYVuelta('mes', (d) => {
    const lista = [];
    const ids = new Set();
    for (let k = 0; k < prng.entero(1, 12); k++) {
      let id;
      do id = Array.from({ length: 4 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[prng.entero(0, 35)]).join(''); while (ids.has(id));
      ids.add(id);
      const v = { etiquetas: etiquetas(), fecha: fecha(), concepto: texto(), importe: importe(), grupo: prng.siguiente() < 0.1 ? null : idSlug(), cuenta: idSlug(), id };
      if (prng.siguiente() < 0.2) v.compensa = idSlug();
      if (prng.siguiente() < 0.2) v.a = idSlug();
      if (prng.siguiente() < 0.1) v.ajuste = true;
      if (prng.siguiente() < 0.1) v.op = `OP-${String(prng.entero(1, 9999)).padStart(4, '0')}`;
      anadirItem(d, 'Movimientos', v);
      lista.push(v);
    }
    return lista;
  }, (d) => items(d, 'Movimientos', { incluirExcluidos: true }), { mes: '2026-11' });
});

test('propiedad: cuentas, recurrentes y operaciones aleatorias vuelven idénticas', () => {
  idaYVuelta('cuentas', (d) => {
    const usados = new Set();
    const lista = [];
    for (let k = 0; k < prng.entero(1, 6); k++) {
      const id = idSlug();
      if (usados.has(id)) continue;
      usados.add(id);
      const v = { id, nombre: texto(), tipo: ['corriente', 'ahorro', 'inversion', 'efectivo', 'deuda'][prng.entero(0, 4)] };
      if (prng.siguiente() < 0.5) v.colchon = true;
      if (prng.siguiente() < 0.5) v.saldo_inicial = { importe: importe(), fecha: fecha() };
      anadirItem(d, null, v);
      lista.push(v);
    }
    return lista;
  }, (d) => items(d));
  idaYVuelta('operaciones', (d) => {
    const lista = [];
    for (let k = 1; k <= prng.entero(1, 8); k++) {
      const tipo = ['aportacion', 'venta', 'traspaso', 'dividendo', 'comision', 'ajuste'][prng.entero(0, 5)];
      const v = { id: `OP-${String(k).padStart(4, '0')}`, fecha: fecha(), tipo, activo: tipo === 'traspaso' ? { origen: idSlug(), destino: idSlug() } : { activo: idSlug() }, importe: ['comision', 'ajuste'].includes(tipo) ? importe() : Math.abs(importe()) };
      if (prng.siguiente() < 0.5) v.participaciones = prng.entero(1, 1e9);
      if (prng.siguiente() < 0.3) v.nota = texto();
      anadirItem(d, null, v);
      lista.push(v);
    }
    return lista;
  }, (d) => items(d));
});

test('propiedad: notas aleatorias (título, campos y cuerpo) vuelven idénticas', () => {
  idaYVuelta('notas', (d) => {
    const lista = [];
    for (let k = 1; k <= prng.entero(1, 5); k++) {
      const campos = { tipo: ['dato', 'hecho', 'consenso', 'opinión', 'especulación'][prng.entero(0, 4)], fecha: fecha(), origen: texto(50), temas: [idSlug(), idSlug()], editada: prng.siguiente() < 0.5 };
      const cuerpo = Array.from({ length: prng.entero(1, 3) }, () => texto(60)).join('\n');
      const b = { id: `B-${String(k).padStart(4, '0')}`, titulo: texto(40).replace(/^#+/, 'x'), campos, cuerpo: /^- [\p{Ll}\d_]/u.test(cuerpo) ? 'x' + cuerpo : cuerpo };
      anadirBloque(d, b);
      lista.push(b);
    }
    return lista;
  }, (d) => bloques(d).map(({ id, titulo, campos, cuerpo }) => ({ id, titulo, campos, cuerpo })), { fuente: 'base' });
});

test('propiedad: ajustes con valores aleatorios vuelven idénticos', () => {
  idaYVuelta('ajustes', (d) => {
    const v = { nombre: texto(), mes_inicio_dia: prng.entero(1, 28), libertad_multiplicador: prng.entero(1, 100), proyeccion_manual: texto(40) };
    for (const [k, x] of Object.entries(v)) fijarKv(d, null, k, x);
    return v;
  }, (d) => Object.fromEntries(d.secciones[0].nodos.filter((n) => n.k === 'kv').map((n) => [n.clave, n.valor])));
});

test('propiedad: con ruido aleatorio en los ficheros del ejemplo nada se rompe, nada se pierde y es idempotente', () => {
  const RUIDO = ['- ', '-', '## ', '## x · ', 'texto suelto', '- a | b | c', 'clave: valor', '  # comentario', '- 2026-02-30 | x | 1 | g', '- k: v  # c', '\\## escapado', '«»', '| | |', '- #solo #etiquetas', '# Otro título', 'esquema: 2', ''];
  const mapa = generar();
  const rutas = [...mapa.keys()].filter((r) => leer(r, mapa.get(r)));
  for (let i = 0; i < 400; i++) {
    const ruta = rutas[prng.entero(0, rutas.length - 1)];
    const lineas = mapa.get(ruta).split('\n');
    const insertadas = [];
    for (let k = 0; k < prng.entero(1, 4); k++) {
      const l = RUIDO[prng.entero(0, RUIDO.length - 1)];
      lineas.splice(prng.entero(1, lineas.length - 1), 0, l);
      insertadas.push(l);
    }
    const t = lineas.join('\n');
    let d;
    assert.doesNotThrow(() => (d = leer(ruta, t)), `${ruta} con ruido`);
    const s1 = serializar(d);
    assert.equal(serializar(leer(ruta, s1)), s1, `${ruta}: idempotente con ruido`);
    const salida = s1.split('\n');
    for (const l of insertadas) {
      if (/^(- |##|esquema:|clave:|-$)/.test(l) || l.trim() === '' || /^ +#/.test(l)) continue; // pueden ser construcciones válidas y canonizarse
      assert.ok(salida.includes(l), `${ruta}: la línea de ruido «${l}» se conserva`);
    }
  }
});
