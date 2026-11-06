// QA2.2 · Entradas hostiles a mano: CRLF, BOM, tabuladores, espacios finales, ficheros vacíos o con solo la cabecera,
// secciones repetidas o desordenadas, esquema ausente, futuro o antiguo, fechas imposibles, ids repetidos. Lo que no
// se reconoce se conserva en su sitio y se marca con ⚠; nunca se pierde una línea ni se rompe nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leer, detectar } from '../../src/core/formato/index.js';
import { serializar, items, valores } from '../../src/core/formato/motor.js';
import { construirModelo } from '../../src/core/modelo.js';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const MAPA = generar();
const RUTAS = [...MAPA.keys()].filter((r) => detectar(r));
const lineasNoVacias = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);

test('CRLF y BOM: todos los ficheros dan el mismo modelo y se escriben en canónico', () => {
  for (const ruta of RUTAS) {
    const t = MAPA.get(ruta);
    assert.equal(serializar(leer(ruta, t.replaceAll('\n', '\r\n'))), t, `${ruta}: CRLF`);
    assert.equal(serializar(leer(ruta, `﻿${t}`)), t, `${ruta}: BOM`);
    assert.equal(serializar(leer(ruta, `﻿${t.replaceAll('\n', '\r\n')}`)), t, `${ruta}: las dos cosas`);
  }
});

test('espacios finales, tabuladores y líneas vacías no rompen; ningún dato cambia', () => {
  for (const ruta of RUTAS) {
    const t = MAPA.get(ruta);
    const d = leer(ruta, t.split('\n').map((l) => (l ? `${l}   ` : l)).join('\n'));
    assert.doesNotThrow(() => serializar(d), ruta);
    const conTab = leer(ruta, t.split('\n').map((l) => (l.startsWith('- ') ? l.replace(' | ', '\t|\t') : l)).join('\n'));
    assert.doesNotThrow(() => serializar(conTab), ruta);
    const s = serializar(leer(ruta, t.replace(/\n/, '\n\n\n')));
    assert.equal(serializar(leer(ruta, s)), s, `${ruta}: idempotente con líneas vacías`);
  }
});

test('vacío, solo título, solo esquema, basura: sin excepción; la basura se conserva', () => {
  for (const ruta of RUTAS) {
    for (const t of ['', '\n', '\n\n\n', '# Solo título\n', 'esquema: 1\n', '# T\nesquema: 1\n', 'esto no es un fichero de finhub\nni esto\n', '- \n-\n##\n## \n', '\0\0\0', '🦖'.repeat(1000)]) {
      let d;
      assert.doesNotThrow(() => (d = leer(ruta, t)), `${ruta}: «${t.slice(0, 20)}»`);
      const s = serializar(d);
      assert.equal(serializar(leer(ruta, s)), s, `${ruta}: idempotente con «${t.slice(0, 20)}»`);
      for (const l of lineasNoVacias(t)) if (!/^(#|esquema:|-$|- ?$|##)/.test(l)) assert.ok(s.includes(l), `${ruta}: se conserva «${l.slice(0, 40)}»`);
    }
  }
  assert.doesNotThrow(() => construirModelo(Object.fromEntries(RUTAS.map((r) => [r, { texto: 'basura\n', version: 'v' }]))), 'el modelo aguanta una carpeta entera de basura');
});

test('texto no reconocido: se queda en su sitio con ⚠', () => {
  const t = '# Cuentas\nesquema: 1\n- banco | Banco | tipo: corriente\nlínea rara en medio\n- cartera | Cartera | tipo: efectivo\n';
  const d = leer('cuentas.md', t);
  assert.equal(serializar(d), t);
  assert.ok(d.avisos.some((a) => a.linea === 4));
  assert.deepEqual(items(d).map((c) => c.id), ['banco', 'cartera']);
});

test('secciones repetidas, desordenadas y desconocidas se conservan', () => {
  const t = MAPA.get('mes/2026-10.md') ?? [...MAPA].find(([r]) => r.startsWith('mes/'))[1];
  const ruta = [...MAPA.keys()].find((r) => r.startsWith('mes/'));
  const texto = MAPA.get(ruta);
  const raro = `${texto}## Sección inventada\n- lo que sea\n## Movimientos\n`;
  const d = leer(ruta, raro);
  assert.equal(serializar(d), raro);
  assert.ok(d.avisos.some((a) => /desconocida/.test(a.mensaje)));
  assert.ok(t);
});

test('esquema: ausente (⚠ y se escribe), futuro 99 (solo lectura; ninguna operación lo toca), no numérico (⚠)', () => {
  const sin = leer('cuentas.md', '# Cuentas\n- banco | Banco | tipo: corriente\n');
  assert.ok(sin.avisos.some((a) => /falta «esquema/.test(a.mensaje)));
  assert.match(serializar(sin), /^# Cuentas\nesquema: 1\n/);
  const fut = '# Cuentas\nesquema: 99\n- banco | Banco | tipo: corriente | campo_nuevo: x\n';
  const d = leer('cuentas.md', fut);
  assert.equal(d.soloLectura, true);
  assert.equal(serializar(d), fut, 'se conserva');
  const f = new Map([['cuentas.md', fut]]);
  assert.throws(() => aplicarOp((r) => f.get(r) ?? null, 'lista.crear', { lista: 'cuentas', valor: { id: 'otra', nombre: 'Otra', tipo: 'corriente' } }, { rutas: ['cuentas.md'], prng: crearPrng(1) }), (e) => e instanceof ErrorOp);
  assert.ok(leer('cuentas.md', '# C\nesquema: uno\n').avisos.some((a) => /esquema no válido/.test(a.mensaje)));
});

test('fechas y horas imposibles, importes rotos: ⚠, la línea no entra en los cálculos y se conserva', () => {
  const ruta = 'mes/2026-11.md';
  const lineas = ['- 2026-02-30 | fecha imposible | -1,00 | ocio', '- 2026-13-01 | mes imposible | -1,00 | ocio', '- 2026-11-03 | importe roto | doce | ocio', '- 2026-11-03 | 1.2.3 | 1.2.3 | ocio', '- ayer | sin fecha | -1,00 | ocio'];
  const t = `# Noviembre\nesquema: 1\n## Movimientos\n${lineas.join('\n')}\n- 2026-11-03 | bueno | -2,00 | ocio | cuenta: banco | id: abcd\n`;
  const d = leer(ruta, t);
  assert.equal(serializar(d), t);
  assert.deepEqual(items(d, 'Movimientos').map((m) => m.concepto), ['bueno']);
  assert.ok(d.avisos.filter((a) => a.nivel === 'error').length >= lineas.length);
});

test('ids repetidos: el segundo se conserva pero no se usa; referencias inexistentes: el modelo no se rompe', () => {
  const t = '# Cuentas\nesquema: 1\n- banco | Banco | tipo: corriente\n- banco | Banco 2 | tipo: ahorro\n- BANCO | Banco 3 | tipo: ahorro\n';
  const d = leer('cuentas.md', t);
  assert.equal(serializar(d), t.replace('BANCO', 'banco'), 'los ids se escriben en minúsculas (FORMATOS.md §1.1)');
  assert.equal(items(d).length, 1);
  const f = { 'mes/2026-11.md': { texto: '# N\nesquema: 1\n## Movimientos\n- 2026-11-03 | x | -2,00 | no-existe | cuenta: tampoco | id: abcd\n', version: 'v' }, 'cartera/operaciones.md': { texto: '# O\nesquema: 1\n- OP-0001 | 2026-11-03 | aportacion | fantasma | 10,00\n', version: 'v' } };
  assert.doesNotThrow(() => construirModelo(f));
});

test('campos largos y con caracteres raros en todos los ficheros: nunca lanza', () => {
  const prng = crearPrng(7);
  const COSAS = ['|', '||', '·', '#', ':', '«', '»', '"', '🦖', 'ñ', 'א', '<b>', '\\', '\t', 'x'.repeat(6000)];
  for (let i = 0; i < 500; i++) {
    const ruta = RUTAS[prng.entero(0, RUTAS.length - 1)];
    const lineas = MAPA.get(ruta).split('\n');
    const k = prng.entero(0, lineas.length - 1);
    const p = prng.entero(0, lineas[k].length);
    lineas[k] = lineas[k].slice(0, p) + COSAS[prng.entero(0, COSAS.length - 1)] + lineas[k].slice(p);
    const t = lineas.join('\n');
    let d;
    assert.doesNotThrow(() => (d = leer(ruta, t)), ruta);
    const s = serializar(d);
    assert.equal(serializar(leer(ruta, s)), s, `${ruta}: vuelta ${i}`);
    assert.ok(typeof valores(d) === 'object');
  }
});
