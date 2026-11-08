// QA8 · Sesión prolongada (FINHUB_MINUTOS, 30 por defecto; `pnpm test:larga`): operaciones aleatorias y sondeo sobre un servidor de
// verdad, con clientes SSE que entran y salen. La memoria no crece (tras forzar la recolección), ni los temporizadores, ni
// los listeners, ni las conexiones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { App } from '../../src/server/app.js';
import { crearPrng } from '../../src/core/prng.js';
import { crearEntorno, pedir, esperar } from '../qa/entorno.js';

const MINUTOS = Number(process.env.FINHUB_MINUTOS ?? 30);

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const heap = () => {
  gc();
  gc();
  return v8.getHeapStatistics().used_heap_size;
};
const activos = () => process.getActiveResourcesInfo().reduce((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});

test(`${MINUTOS} minutos de uso: sin fugas de memoria, temporizadores, listeners ni SSE`, { timeout: (MINUTOS + 5) * 60000 }, async () => {
  const ent = await crearEntorno({ nombre: 'larga' });
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, sondeoMs: 500, barridoMs: 3000 }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  const prng = crearPrng(20261106);
  const fin = performance.now() + MINUTOS * 60000;
  const muestras = [];
  let n = 0;
  let ids = [];
  try {
    await esperar(1000);
    const inicioHeap = heap();
    const recursos0 = activos();
    let siguiente = performance.now() + 30000;
    while (performance.now() < fin) {
      const c = prng.entero(0, 9);
      const fecha = `2026-${String(prng.entero(9, 12)).padStart(2, '0')}-${String(prng.entero(1, 28)).padStart(2, '0')}`;
      if (c < 5) {
        const r = await pedir(srv, 'POST', '/api/ops', { op: 'mov.crear', args: { mov: { fecha, concepto: `Larga ${n}`, importe: -prng.entero(100, 9000), grupo: 'ocio' }, confirmarCerrado: true } });
        assert.equal(r.estado, 200, r.texto);
        ids.push(r.json.resultado);
      } else if (c < 7 && ids.length) {
        const x = ids.splice(prng.entero(0, ids.length - 1), 1)[0];
        assert.equal((await pedir(srv, 'POST', '/api/ops', { op: 'mov.borrar', args: { mes: x.mes, id: x.id, confirmarCerrado: true } })).estado, 200);
      } else if (c === 7) {
        // un cliente SSE que entra y se va
        const ac = new AbortController();
        const r = await fetch(`${srv.url}/api/eventos`, { headers: { Origin: srv.url }, signal: ac.signal });
        assert.equal(r.status, 200);
        await esperar(20);
        ac.abort();
        await r.body?.cancel?.().catch(() => {});
      } else if (c === 8) {
        await pedir(srv, 'GET', '/api/datos');
        await pedir(srv, 'GET', '/api/estado');
      } else {
        // edición a mano: el sondeo la recoge
        const r = join(ent.datos, 'hitos.md');
        await fsp.appendFile(r, `- H-${String(10000 + n)} | ${fecha} | mío | a mano\n`);
      }
      n++;
      await esperar(60);
      if (performance.now() > siguiente) {
        siguiente = performance.now() + 30000;
        muestras.push(heap());
      }
    }
    await esperar(200);
    assert.equal(app.difusor.canales.size, 0, 'SSE colgados');
    const recursos = activos();
    assert.ok((recursos.Timeout ?? 0) <= (recursos0.Timeout ?? 0) + 3, `temporizadores: ${JSON.stringify(recursos0)} → ${JSON.stringify(recursos)}`);
    assert.ok((recursos.TCPSocketWrap ?? 0) <= (recursos0.TCPSocketWrap ?? 0) + 10, `conexiones: ${JSON.stringify(recursos)}`);
    assert.ok(app.almacen.oyentes.size <= 2, `oyentes: ${app.almacen.oyentes.size}`);
    let colas = 0;
    for (const s of app.deshacer.sesiones.values()) colas += s.length;
    assert.ok(colas <= 60, `deshacer: ${colas}`);
    const m = Math.floor(muestras.length / 2);
    const primera = muestras.slice(0, m);
    const segunda = muestras.slice(m);
    const media = (l) => l.reduce((a, b) => a + b, 0) / (l.length || 1);
    console.log(`operaciones: ${n} · heap inicio ${Math.round(inicioHeap / 1e6)} MB · media 1ª mitad ${Math.round(media(primera) / 1e6)} MB · 2ª mitad ${Math.round(media(segunda) / 1e6)} MB`);
    // los datos crecen con la sesión (cada fichero se guarda en memoria): se tolera lo que suma el propio texto
    const datos = app.almacen.textos().reduce((a, e) => a + (e.texto?.length ?? 0), 0);
    if (muestras.length >= 4) assert.ok(media(segunda) - media(primera) < Math.max(20e6, datos), `crece ${Math.round((media(segunda) - media(primera)) / 1e6)} MB`);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
