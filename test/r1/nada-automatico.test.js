// QA1 · Nada automático (§1.4) y Claude no cambia tus datos (§0.3.11): el tiempo pasa (reloj simulado: días y
// cambios de mes) y no se lanza ningún proceso de Claude; un trabajo solo propone hasta que tú confirmas.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { App } from '../../src/server/app.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno, esperar } from '../qa/entorno.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';

async function huella(dir, { sinServicio = true } = {}) {
  const out = {};
  const ver = async (d) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const r = join(d, e.name);
      if (e.isDirectory()) {
        if (!(sinServicio && e.name === '.finhub')) await ver(r);
      } else out[relative(dir, r)] = createHash('sha1').update(await fsp.readFile(r)).digest('hex');
    }
  };
  await ver(dir);
  return out;
}

test('pasan días y cambian los meses: 0 procesos de Claude sin un POST tuyo; con el POST, 1', async () => {
  const ent = await crearEntorno({ nombre: 'automatico' });
  const trazas = join(ent.base, 'trazas');
  await fsp.mkdir(trazas);
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, sondeoMs: 3600000, barridoMs: 3600000, claude: { comando: [process.execPath, FAKE, '--trazas', trazas] } }).iniciar();
  try {
    const inicio = await huella(ent.datos);
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.now() });
    try {
      for (let i = 0; i < 24 * 40; i++) {
        mock.timers.tick(3600000); // 40 días, de hora en hora: cruza varios cambios de día y de mes
        if (i % 24 === 0) await new Promise((ok) => setImmediate(ok));
      }
    } finally {
      mock.timers.reset();
    }
    await esperar(300);
    // leer de todo (lo que hace la web al abrir cada pestaña) tampoco lanza nada
    const ruta = (r) => new Request(`${app.url.replace(/\/$/, '')}${r}`, { headers: { Origin: app.url.replace(/\/$/, '') } });
    for (const r of ['/api/estado', '/api/datos', '/api/version', '/api/claude', '/api/claude/datos', '/api/claude/tareas', '/api/papelera', '/api/claude/registro', '/api/claude/cuarentena']) assert.equal((await fetch(ruta(r))).status, 200, r);
    assert.deepEqual(await fsp.readdir(trazas), [], 'ningún proceso de Claude');
    assert.deepEqual(app.claude.ejecuciones.size, 0);
    assert.deepEqual(await huella(ent.datos), inicio, 'y nada ha cambiado en tu carpeta');
    const { id } = await app.claude.lanzar({ trabajo: 'rex-web', params: { pregunta: 'x' } });
    await app.claude.ejecuciones.get(id).promesa;
    assert.equal((await fsp.readdir(trazas)).length, 1, 'con tu luz verde, uno');
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('Claude solo propone: precios, datos, pulso, revisión de la cartera base… hasta confirmar no cambia nada', async () => {
  const ent = await crearEntorno({ nombre: 'propone' });
  const resp = join(ent.base, 'respuestas');
  await fsp.mkdir(resp);
  const hoy = fechaLocal();
  await fsp.writeFile(join(resp, 'precios.txt'), json({ precios: [{ isin: 'IE00BYX5NX33', valor: 99.5, divisa: 'EUR', fecha: hoy, origen: 'https://g.example/x' }] }));
  await fsp.writeFile(join(resp, 'datos.txt'), json({ series: [{ id: 'msci-acwi-nr-eur', filas: [{ mes: '2026-09', valor: 100 }, { mes: '2026-10', valor: 101 }], origen: 'https://g.example/x' }] }));
  await fsp.writeFile(join(resp, 'pulso.txt'), json({ notas: [{ titulo: 'Noticia propuesta', tipo: 'hecho', fecha: hoy, origen: { medio: 'Me', url: 'https://g.example/a' }, temas: [], activos: [], resumen: 'Un resumen de veinte caracteres o más.' }] }));
  await fsp.writeFile(join(resp, 'privado-revisar-cartera-base.txt'), json({ respuesta_md: 'Bien diversificada.', citas: [], cifras_usadas: [] }));
  await fsp.writeFile(join(resp, 'descubrir-descubrir-nuevas.txt'), json({ descubrimientos: [] }));
  await fsp.writeFile(join(resp, 'encaje-encaje.txt'), json({ ya_tienes: 'x', solapamiento: 'x', comentario_md: 'Comentario largo.', citas: [], cifras_usadas: [] }));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, claude: { comando: [process.execPath, FAKE, '--respuestas', resp] } }).iniciar();
  try {
    const antes = await huella(ent.datos);
    for (const [trabajo, params] of [['precios', {}], ['datos', { ids: ['msci-acwi-nr-eur'] }], ['pulso', { fecha: sumarDias(hoy, -1) }], ['privado', { tarea: 'revisar-cartera-base', borrador: 'cartera/borradores/2026-10-20-equilibrada.md' }], ['descubrir', { modo: 'nuevas' }], ['encaje', { descubrimiento: 'D-007' }]]) {
      const { id } = await app.claude.lanzar({ trabajo, params });
      await app.claude.ejecuciones.get(id).promesa;
      const e = app.claude.ejecuciones.get(id);
      assert.ok(['ok', 'cuarentena'].includes(e.estado), `${trabajo}: ${e.resultado?.mensaje}`);
      assert.deepEqual(await huella(ent.datos), antes, `${trabajo}: tus datos no se tocan hasta confirmar`);
    }
    // al confirmar, datos solo escribe en conocimiento/datos/series/
    const r = await app.aplicar({ op: 'datos.aplicar', args: { series: [{ id: 'msci-acwi-nr-eur', titulo: 'x', unidad: 'indice', fuente: 'https://g.example', metodo: 'x', filas: [{ mes: '2026-09', valor: 100 }] }] } });
    assert.deepEqual(Object.keys(r.cambios), ['conocimiento/datos/series/msci-acwi-nr-eur.md']);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});

test('ciclo de vida: el mismo trabajo dos veces (409), dos trabajos distintos a la vez, y cerrar el SSE no deja procesos', async () => {
  const ent = await crearEntorno({ nombre: 'vida' });
  const guion = join(ent.base, 'g.json');
  await fsp.writeFile(guion, JSON.stringify([{ init: {} }, { esperar: 500 }, { responder: json({ respuesta_md: 'x', citas: [], cifras_usadas: [] }) }]));
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, claude: { comando: [process.execPath, FAKE, '--guion', guion] } }).iniciar();
  try {
    const url = app.url.replace(/\/$/, '');
    const ac = new AbortController();
    const sse = await fetch(`${url}/api/eventos`, { headers: { Origin: url }, signal: ac.signal });
    assert.equal(sse.status, 200);
    const a = await app.claude.lanzar({ trabajo: 'rex-web', params: { pregunta: 'x' } });
    await assert.rejects(app.claude.lanzar({ trabajo: 'rex-web', params: { pregunta: 'y' } }), (e) => e.estado === 409);
    const b = await app.claude.lanzar({ trabajo: 'privado', params: { pregunta: 'x' } });
    ac.abort(); // el cliente se va: el trabajo sigue y acaba solo
    await Promise.all([a, b].map((x) => app.claude.ejecuciones.get(x.id).promesa));
    assert.equal(app.claude.ejecuciones.get(a.id).estado, 'ok');
    assert.equal(app.claude.ejecuciones.get(b.id).estado, 'ok');
    assert.deepEqual(await fsp.readdir(app.claude.sandboxBase), []);
    assert.equal(app.difusor.canales.size, 0, 'sin conexiones SSE colgadas');
  } finally {
    await app.parar();
    await ent.limpiar();
  }
});
