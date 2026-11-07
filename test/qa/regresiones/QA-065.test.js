// QA-065: una descripción de la fuente de más de 300 caracteres mandaba a cuarentena 205 meses de datos correctos. Un límite para contener texto
// disparatado no debe tirar un trabajo que ya se ha pagado. Y se mantiene la regla de la URL, y una línea sola: va a un campo de cabecera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar } from '../../../src/claude/validar.js';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { crearPrng } from '../../../src/core/prng.js';

const D = trabajo('datos');
const con = (origen) => ({ series: [{ id: 'msci-world-nr-eur', filas: [{ mes: '2020-01', valor: 1 }], origen }] });
const params = { series: [{ id: 'msci-world-nr-eur', unidad: 'indice' }] };

test('una descripción larga vale; una disparatada, no; sin URL, tampoco', () => {
  const larga = `Cotización de cierre mensual, vía https://x.example/a. ${'detalle '.repeat(60)}`.trim();
  assert.ok(larga.length > 300 && larga.length < 1000);
  assert.deepEqual(validar(con(larga), D.esquema), []);
  assert.ok(validar(con(`https://x.example ${'x'.repeat(1100)}`), D.esquema).length > 0);
  assert.match(D.comprobar(con('sin dirección'), { params }).join(), /URL/);
});

test('una fuente larga, o con saltos de línea, se guarda en una sola línea', () => {
  const fs = new Map();
  const larga = `Línea uno https://x.example/a\nLínea dos ${'y '.repeat(200)}`;
  const r = aplicarOp((x) => fs.get(x) ?? null, 'datos.aplicar', { series: [{ id: 'serie-x', titulo: 'x', unidad: 'indice', fuente: larga, metodo: 'm\nn', filas: [{ mes: '2026-09', valor: 100 }] }] }, { rutas: [], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} });
  const t = r.escribir['conocimiento/datos/series/serie-x.md'];
  assert.match(t, /fuente: Línea uno https:\/\/x\.example\/a Línea dos/);
  assert.doesNotMatch(t, /^Línea dos/m);
});
