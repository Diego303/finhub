// API de trabajos de Claude con el Claude falso: el trabajo «datos» de punta a punta (propuesta revisada →
// tu confirmación → series), registro, cuarentena, cancelación y rechazos. Nunca el Claude real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, cabeceras } from '../../src/core/formato/motor.js';
import { fechaLocal, sumarMesesMes, mesDe } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, temporal } from './ayudas.js';

const FAKE = join(import.meta.dirname, '..', 'fake-claude.js');
const limpiar = [];
let app;
let raiz;
let base;
let respuestaDatos;

before(async () => {
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  const tmp = await temporal('resp');
  limpiar.push(tmp);
  // filas: 12 meses hasta el mes pasado, uno del mes en curso (se descarta) y un salto del 60 % (se descarta)
  const mesActual = mesDe(fechaLocal());
  const filas = Array.from({ length: 12 }, (_, i) => ({ mes: sumarMesesMes(mesActual, i - 12), valor: 100 + i }));
  filas.push({ mes: mesActual, valor: 112 });
  filas[5] = { ...filas[5], valor: 300 };
  respuestaDatos = join(tmp, 'datos.txt');
  await fsp.writeFile(respuestaDatos, `He usado el ETF de acumulación.\n\n\`\`\`json\n${JSON.stringify({ series: [{ id: 'msci-acwi-nr-eur', filas, origen: 'iShares MSCI ACWI · https://www.ishares.com/x' }] })}\n\`\`\``);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 100, barridoMs: 500, claude: { comando: [process.execPath, FAKE, '--respuesta', respuestaDatos] } }).iniciar();
  base = `http://127.0.0.1:${app.puerto}`;
});
after(async () => {
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'X-Finhub': '1' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { estado: r.status, json: await r.json() };
};
async function terminar(id) {
  for (let i = 0; i < 100; i++) {
    const r = await api('GET', `/api/claude/ejecucion?id=${id}`);
    if (r.json.estado !== 'en_curso') return r.json;
    await esperar(50);
  }
  throw new Error('no terminó');
}

test('trabajo «datos»: estado de las series, propuesta revisada y guardado con tu confirmación', async () => {
  const d = (await api('GET', '/api/claude/datos')).json.series;
  assert.ok(d.find((s) => s.id === 'msci-world-nr-eur').sintetica, 'las del ejemplo son sintéticas');
  assert.equal(d.find((s) => s.id === 'msci-acwi-nr-eur').existe, false);
  assert.equal((await api('POST', '/api/claude/ejecutar', { trabajo: 'datos', params: { ids: ['msci-world-nr-eur'] } })).estado, 400, 'no se completa una serie sintética');
  assert.equal((await api('POST', '/api/claude/ejecutar', { trabajo: 'nada' })).estado, 400);
  const { id } = (await api('POST', '/api/claude/ejecutar', { trabajo: 'datos', params: { ids: ['msci-acwi-nr-eur'] } })).json;
  const r = await terminar(id);
  assert.equal(r.estado, 'ok');
  const s = r.resultado.series[0];
  assert.equal(s.id, 'msci-acwi-nr-eur');
  assert.equal(s.filas.length, 11, '12 meses menos el del salto; el del mes en curso fuera');
  assert.ok(s.avisos.some((a) => /salto de más del 40 %/.test(a)));
  assert.ok(s.avisos.some((a) => /aún no ha terminado/.test(a)));
  // nada se ha escrito todavía
  await assert.rejects(fsp.stat(join(raiz, 'conocimiento/datos/series/msci-acwi-nr-eur.md')));
  // confirmas → operación
  const op = await api('POST', '/api/ops', { op: 'datos.aplicar', args: { series: r.resultado.series } });
  assert.equal(op.estado, 200);
  const doc = leer('conocimiento/datos/series/msci-acwi-nr-eur.md', await fsp.readFile(join(raiz, 'conocimiento/datos/series/msci-acwi-nr-eur.md'), 'utf8'));
  assert.equal(doc.avisos.filter((a) => !/hueco/.test(a.mensaje)).length, 0);
  assert.equal(items(doc, 'Filas').length, 11);
  assert.deepEqual([cabeceras(doc).sintetica, cabeceras(doc).unidad, cabeceras(doc).actualizado], [false, 'indice', fechaLocal()]);
  assert.match(cabeceras(doc).fuente, /ishares/);
  // sobre una sintética, la operación se niega
  assert.equal((await api('POST', '/api/ops', { op: 'datos.aplicar', args: { series: [{ id: 'msci-world-nr-eur', filas: [{ mes: '2026-10', valor: 1 }], fuente: 'x', metodo: 'x' }] } })).estado, 400);
  // registro de la ejecución
  const reg = (await api('GET', '/api/claude/registro')).json.ejecuciones;
  const l = reg.find((x) => x.estado === 'ok' && x.trabajo === 'datos');
  assert.ok(l && l.internet === true && l.privado === false);
  const info = (await api('GET', '/api/claude')).json;
  assert.equal(info.trabajos.length, 9);
  assert.ok(info.hoy.length >= 1);
});

test('salida inválida a cuarentena (visible en la API); cancelar; solo un trabajo igual a la vez', async () => {
  app.claude.comando = [process.execPath, FAKE];
  const { id } = (await api('POST', '/api/claude/ejecutar', { trabajo: 'ingesta', params: { fichero: 'pizarra-andres-nov.txt', fuente: 'pizarra' } })).json;
  const r = await terminar(id);
  assert.equal(r.estado, 'cuarentena');
  const q = (await api('GET', '/api/claude/cuarentena')).json.ficheros;
  assert.ok(q.some((f) => f.trabajo === 'ingesta' && /formato/.test(f.motivo)));
  app.claude.comando = [process.execPath, FAKE, '--escenario', 'colgado-tras-init'];
  const a = (await api('POST', '/api/claude/ejecutar', { trabajo: 'ingesta', params: { fichero: 'pizarra-andres-nov.txt', fuente: 'pizarra' } })).json;
  assert.equal((await api('POST', '/api/claude/ejecutar', { trabajo: 'ingesta', params: { fichero: 'entrevista-gestora.md', fuente: 'gestoras' } })).estado, 409);
  assert.equal((await api('POST', '/api/claude/cancelar', { id: a.id })).json.cancelado, true);
  const c = await terminar(a.id);
  assert.equal(c.estado, 'error');
  assert.match(c.resultado.mensaje, /cancelado/);
});
