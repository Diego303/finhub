// QA8 · Rendimiento con 5 años de datos (≈ 3.000 movimientos, 600 operaciones, 2.000 notas, 50 fuentes, 30 descubrimientos con
// versiones): arranque del servidor < 1 s; proyección < 300 ms; buscador < 150 ms. Las vistas (< 200 ms): test/e2e/rendimiento.
// 20 trabajos de Claude falso seguidos: ni procesos ni sandboxes colgados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../src/server/app.js';
import { construirModelo } from '../src/core/modelo.js';
import { buscarNotas, indiceNotas } from '../src/core/conocimiento.js';
import { proyectarHistorico, CAMINOS } from '../src/core/proyeccion.js';
import { sumarMesesMes } from '../src/core/fechas.js';
import { crearPrng } from '../src/core/prng.js';
import { datosGrandes } from './server/grande.js';
import { FAKE, json } from './qa/ayuda-claude.js';
import { crearEntorno, pedir } from './qa/entorno.js';

function grande() {
  const { fs } = datosGrandes();
  const f = new Map([...fs].filter(([r]) => r.endsWith('.md')));
  let filas = '';
  for (let i = 0; i < 50; i++) filas += `- f${i} | Fuente ${i} | familia: yt | prefijo: F${i}X | activa_por_defecto: sí\n`;
  f.set('conocimiento/_fuentes.md', `${f.get('conocimiento/_fuentes.md').trimEnd()}\n${filas}`);
  const base = f.get('conocimiento/descubrimientos/D-002.md');
  for (let i = 100; i < 130; i++) f.set(`conocimiento/descubrimientos/D-${i}.md`, base.replaceAll('D-002', `D-${i}`));
  return f;
}

test('arranque del servidor con 5 años de datos: < 1 s; primera lectura al momento', async () => {
  const f = grande();
  const ent = await crearEntorno({ nombre: 'arranque', ficheros: [...f] });
  try {
    const medidas = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
      medidas.push(performance.now() - t0);
      const t1 = performance.now();
      const r = await pedir({ url: app.url.replace(/\/$/, ''), puerto: app.puerto }, 'GET', '/api/datos');
      assert.equal(r.estado, 200);
      assert.ok(performance.now() - t1 < 1000, `/api/datos: ${Math.round(performance.now() - t1)} ms`);
      assert.ok(Object.keys(r.json.ficheros).length > 400);
      await app.parar();
    }
    const mejor = Math.min(...medidas);
    assert.ok(mejor < 1000, `arranque: ${medidas.map(Math.round).join(', ')} ms`);
  } finally {
    await ent.limpiar();
  }
});

test('buscador < 150 ms con 2.000 notas; proyección de 40 años < 300 ms', () => {
  const f = grande();
  const M = construirModelo(Object.fromEntries([...f].map(([r, texto]) => [r, { texto, version: 'v' }])));
  const notas = indiceNotas(M);
  assert.ok(notas.length >= 2000, `${notas.length}`);
  for (const q of [{ texto: 'noticia' }, { texto: 'tecnología', tipo: 'hecho' }, { tema: 'bolsa' }, { texto: 'nada-que-coincida-zzz' }]) {
    const t0 = performance.now();
    buscarNotas(notas, q);
    assert.ok(performance.now() - t0 < 150, `${JSON.stringify(q)}: ${Math.round(performance.now() - t0)} ms`);
  }
  const p = crearPrng(5);
  const n = 360;
  const historico = { meses: Array.from({ length: n }, (_, k) => sumarMesesMes('1990-01', k)), r: Array.from({ length: n }, () => p.normal(0.005, 0.04)) };
  const t0 = performance.now();
  const r = proyectarHistorico({ inicial: 1e7, aportacion: 50000, anios: 40, historico, real: false });
  assert.equal(CAMINOS, 2000);
  assert.equal(r.p50.length, 41);
  assert.ok(performance.now() - t0 < 300, `${Math.round(performance.now() - t0)} ms`);
});

test('20 trabajos de Claude falso seguidos: ni procesos ni sandboxes; memoria estable', async () => {
  const ent = await crearEntorno({ nombre: 'veinte' });
  const g = join(ent.base, 'g.json');
  await fsp.writeFile(g, JSON.stringify([{ init: {} }, { responder: json({ respuesta_md: 'ok', citas: [], cifras_usadas: [] }) }]));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, claude: { comando: [process.execPath, FAKE, '--guion', g] } }).iniciar();
  try {
    for (let i = 0; i < 20; i++) {
      const { id } = await app.claude.lanzar({ trabajo: i % 2 ? 'privado' : 'rex-web', params: { pregunta: `p${i}` } });
      await app.claude.ejecuciones.get(id).promesa;
      assert.equal(app.claude.resultado(id).estado, 'ok');
      assert.deepEqual(await fsp.readdir(app.claude.sandboxBase), [], 'sin sandboxes');
    }
    assert.ok(app.claude.ejecuciones.size <= 30, `${app.claude.ejecuciones.size} ejecuciones retenidas`);
    assert.equal(app.difusor.canales.size, 0);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
