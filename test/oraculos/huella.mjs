// Huella de los cálculos con datos fijos: en cualquier zona horaria tiene que salir lo mismo.
import { createHash } from 'node:crypto';
import { construirModelo } from '../../src/core/modelo.js';
import { kpisPanel, flujoDelMes, lineaDeTiempo, resumenAlAbrir } from '../../src/core/panel.js';
import { pendientes } from '../../src/core/resumen.js';
import { progresoMetas } from '../../src/core/metas.js';
import { estadoCartera } from '../../src/core/cartera.js';
import { mesFinanciero, periodoMes, sumarDias, diasEntre, semanaIso, limitesSemana, sumarMeses } from '../../src/core/fechas.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const M = construirModelo(Object.fromEntries([...generar()].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
const salida = [];
// fechas alrededor de los cambios de hora de Madrid y Los Ángeles
for (const hoy of ['2026-11-03', '2026-03-29', '2026-03-28', '2026-10-25', '2026-11-01', '2026-03-08', '2026-12-31', '2027-01-01', '2028-02-29']) {
  salida.push([hoy, kpisPanel(M, hoy), flujoDelMes(M, hoy), lineaDeTiempo(M, hoy), progresoMetas(M, hoy).map((x) => [x.id, x.llevas, x.fechaEstimada]), pendientes(M, { fecha: hoy, hora: '10:00' }).elementos.map((e) => [e.id, e.hecho, e.detalle]), resumenAlAbrir(M, { fecha: hoy, hora: '10:00' }), [...estadoCartera({ activos: M.activos, operaciones: M.operaciones, fotos: M.fotos, hasta: hoy }).porActivo.values()].map((p) => [p.id, p.valor, p.coste]), mesFinanciero(hoy, 25), periodoMes(hoy.slice(0, 7), 25), sumarDias(hoy, 1), sumarDias(hoy, -1), diasEntre(hoy, '2030-01-01'), semanaIso(hoy), limitesSemana(hoy), sumarMeses(hoy, 1)]);
}
const texto = JSON.stringify(salida, (k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v));
process.stdout.write(createHash('sha256').update(texto).digest('hex'));
