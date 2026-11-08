// QA-045 (cifras, 1 céntimo): las medias de céntimos usaban Math.round (mitad hacia arriba) en vez del redondeo bancario
// que manda en el dinero de finhub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaCerrados } from '../../../src/core/mes.js';
import { progresoMeta } from '../../../src/core/metas.js';

const mes = (m, consumo) => ({ mes: m, estado: 'cerrado', totales: { consumo, entradas: 0, invertido: 0, ahorrado: 0, porGrupo: new Map([['a', { consumo }]]) } });

test('media de meses cerrados: mitad al par', () => {
  const dos = mediaCerrados([mes('2026-01', 1), mes('2026-02', 4)], '2026-03');
  assert.equal(dos.consumo, 2, '2,5 → 2');
  assert.equal(dos.porGrupo.get('a'), 2);
  assert.equal(mediaCerrados([mes('2026-01', 3), mes('2026-02', 4)], '2026-03').consumo, 4, '3,5 → 4');
});

test('aportación media de 3 meses: mitad al par (4,5 no se da con 3, pero sí la suma exacta)', () => {
  const movs = [{ fecha: '2026-10-01', importe: -3, grupo: 'g' }, { fecha: '2026-09-01', importe: -3, grupo: 'g' }, { fecha: '2026-08-01', importe: -4, grupo: 'g' }];
  const r = progresoMeta({ id: 'm', titulo: 'M', campos: { objetivo: 100, se_alimenta_de: { tipo: 'grupo', valor: 'g' }, aportacion: { media3m: true } } }, { cuentas: [], movimientos: movs, hoy: '2026-11-15' });
  assert.equal(r.aportacion, 3);
});
