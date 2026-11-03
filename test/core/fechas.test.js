import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import * as F from '../../src/core/fechas.js';
import { crearPrng } from '../../src/core/prng.js';

test('fechas que existen y que no (§9.21: solo fechas, sin horas)', () => {
  for (const f of ['2026-11-03', '2024-02-29', '2000-02-29', '2026-12-31']) assert.ok(F.esFecha(f), f);
  for (const f of ['2026-02-29', '1900-02-29', '2026-11-31', '2026-13-01', '2026-00-10', '26-11-03', '2026-1-3', '2026-11-03T00:00']) assert.equal(F.esFecha(f), false, f);
  assert.ok(F.esMes('2026-11'));
  assert.equal(F.esMes('2026-13'), false);
  assert.ok(F.esHora('23:59'));
  assert.equal(F.esHora('24:00'), false);
});

test('aritmética de días y meses', () => {
  assert.equal(F.aDias('1970-01-01'), 0);
  assert.equal(F.diaSemana('2026-11-03'), 1, 'martes');
  assert.equal(F.sumarDias('2026-02-28', 1), '2026-03-01');
  assert.equal(F.sumarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(F.diasEntre('2026-03-28', '2026-03-30'), 2, 'el cambio de hora no cuenta');
  assert.equal(F.sumarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(F.sumarMeses('2024-01-31', 1), '2024-02-29');
  assert.equal(F.sumarMeses('2026-11-15', -11), '2025-12-15');
  assert.equal(F.sumarMesesMes('2026-11', 2), '2027-01');
  assert.equal(F.mesesEntre('2025-12', '2026-11'), 11);
  assert.equal(F.ultimoDia('2026-02'), '2026-02-28');
});

test('propiedad: aDias y desdeDias son inversas', () => {
  for (let n = F.aDias('1999-12-25'); n < F.aDias('2032-01-07'); n += 1) assert.equal(F.aDias(F.desdeDias(n)), n);
});

test('mes financiero (§4.1): con inicio 25, «noviembre» va del 25 oct al 24 nov', () => {
  assert.deepEqual(F.periodoMes('2026-11', 25), { desde: '2026-10-25', hasta: '2026-11-24' });
  assert.deepEqual(F.periodoMes('2026-01', 25), { desde: '2025-12-25', hasta: '2026-01-24' });
  assert.deepEqual(F.periodoMes('2026-02', 1), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(F.periodoMes('2026-03', 28), { desde: '2026-02-28', hasta: '2026-03-27' });
  assert.equal(F.mesFinanciero('2026-10-25', 25), '2026-11');
  assert.equal(F.mesFinanciero('2026-10-24', 25), '2026-10');
  assert.equal(F.mesFinanciero('2026-12-31', 25), '2027-01', 'el fichero se llama por el mes que termina');
  assert.throws(() => F.periodoMes('2026-11', 29), /1–28/);
  assert.throws(() => F.periodoMes('2026-11', 0));
});

test('propiedad: cada fecha cae en el periodo de su mes financiero y los periodos no se solapan', () => {
  const prng = crearPrng('fechas-mes-financiero');
  for (let i = 0; i < 3000; i++) {
    const dia = prng.entero(1, 28);
    const f = F.desdeDias(prng.entero(F.aDias('2000-01-01'), F.aDias('2040-12-31')));
    const mes = F.mesFinanciero(f, dia);
    const p = F.periodoMes(mes, dia);
    assert.ok(F.enPeriodo(f, p), `${f} con inicio ${dia} → ${mes} ${JSON.stringify(p)}`);
    const sig = F.periodoMes(F.sumarMesesMes(mes, 1), dia);
    assert.equal(F.sumarDias(p.hasta, 1), sig.desde, 'periodos contiguos');
  }
});

test('semanas ISO', () => {
  assert.equal(F.semanaIso('2026-11-03').id, '2026-W45');
  assert.equal(F.semanaIso('2026-12-31').id, '2026-W53');
  assert.equal(F.semanaIso('2027-01-01').id, '2026-W53');
  assert.equal(F.semanaIso('2027-01-04').id, '2027-W01');
  assert.equal(F.semanaIso('2021-01-03').id, '2020-W53');
  assert.deepEqual(F.limitesSemana('2026-11-03'), { desde: '2026-11-02', hasta: '2026-11-08' });
});

test('textos en español', () => {
  assert.equal(F.textoLargo('2026-11-03'), 'martes 3 nov 2026');
  assert.equal(F.textoCorto('2026-12-02'), '2 dic');
  assert.equal(F.tituloMes('2026-11'), 'Noviembre 2026');
});

test('zona horaria (§9.21): mismos resultados con TZ=UTC, Europe/Madrid y America/Los_Angeles', () => {
  const guion = `
    const F = await import(${JSON.stringify(join(import.meta.dirname, '../../src/core/fechas.js'))});
    const r = [F.periodoMes('2026-03', 25), F.mesFinanciero('2026-03-29', 1), F.diasEntre('2026-03-28', '2026-03-30'), F.diasEntre('2026-10-24', '2026-10-26'), F.sumarDias('2026-03-29', 1), F.semanaIso('2026-03-29').id,
      F.fechaLocal(new Date(2026, 2, 29, 2, 30)), F.fechaLocal(new Date(2026, 10, 3, 23, 59))];
    console.log(JSON.stringify(r));`;
  const salidas = ['UTC', 'Europe/Madrid', 'America/Los_Angeles'].map((TZ) => {
    const p = spawnSync(process.execPath, ['--input-type=module', '-e', guion], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    return p.stdout.trim();
  });
  assert.equal(salidas[0], salidas[1]);
  assert.equal(salidas[1], salidas[2]);
  assert.match(salidas[0], /"2026-03-29","2026-11-03"\]$/, 'fechaLocal usa la fecha del reloj local, sin desplazarla');
});
