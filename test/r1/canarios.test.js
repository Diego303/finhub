// QA1 · Canarios de datos privados: la prueba central de R1. Se siembran tokens inconfundibles en cada dato
// PRIVADO y se lanza cada trabajo con todas sus opciones: ningún canario puede aparecer en stdin, argv, env,
// en el cwd ni en el system prompt de un trabajo sin «privado». Primero con el proceso de verdad (Claude falso
// que registra todo lo que recibe) y después con ≥ 200 modelos aleatorios (PRNG con semilla).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { App } from '../../src/server/app.js';
import { ServicioClaude } from '../../src/server/claude.js';
import { TRABAJOS, trabajo } from '../../src/claude/trabajos/index.js';
import { montarPrompt } from '../../src/claude/contexto.js';
import { argumentos } from '../../src/claude/runner.js';
import { problemasEntrada } from '../../src/claude/r1.js';
import { crearPrng } from '../../src/core/prng.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';
import { ficherosEjemplo, modeloDe, FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno, esperar } from '../qa/entorno.js';

const SEMILLA = 20261106;
const IMPORTE = '7.913,37';
const PESO = '37,13';
const CANARIO = /canario|7\.?913[,.]?37|37,13/i; // todo lo privado sembrado (también sin formato)
const HOY = fechaLocal();

/** Siembra un canario en cada dato privado de §0.1. `hostil`: además, Mis notas que intentan parecer públicas. */
function sembrar(fs, { hostil = 0 } = {}) {
  const m = new Map(fs);
  const mes = `mes/${HOY.slice(0, 7)}.md`;
  const anadir = (r, t) => m.set(r, `${(m.get(r) ?? '').trimEnd()}\n${t}\n`);
  m.set(mes, (m.get(mes) ?? `# Mes\nesquema: 1\n## Movimientos\n`).replace('## Movimientos\n', `## Movimientos\n- ${HOY} | CANARIO-MOV ${IMPORTE} | -${IMPORTE} | comida | cuenta: corriente | #canario-etiqueta\n`));
  anadir('cuentas.md', `- canario-cuenta | CANARIO-CUENTA | tipo: ahorro | saldo_inicial: ${IMPORTE} @2026-01-01`);
  anadir('grupos.md', `- canario-grupo | CANARIO-GRUPO | naturaleza: consumo | presupuesto: ${IMPORTE}`);
  anadir('etiquetas.md', '- canario-etiqueta | CANARIO-ETIQUETA');
  anadir('recurrentes.md', `- canario-rec | CANARIO-REC | -${IMPORTE} | comida | cuenta: corriente | cada: mes | dia: 3`);
  anadir('hitos.md', `- H-9999 | ${HOY} | CANARIO-HITO | tipo: mío`);
  anadir('cartera/operaciones.md', `- OP-9999 | ${HOY} | aportacion | msci-world | ${IMPORTE} | nota: CANARIO-OP`);
  m.set('cartera/objetivo.md', m.get('cartera/objetivo.md').replace('- msci-world | 55', `- msci-world | ${PESO}`));
  const fotos = [...m.keys()].filter((r) => r.startsWith('cartera/valores/')).sort();
  m.set(fotos.at(-1), m.get(fotos.at(-1)).replace(/^- msci-world \| [^|\n]+/m, `- msci-world | ${IMPORTE}`));
  anadir('metas.md', `## canario-meta · CANARIO-META\n- objetivo: ${IMPORTE}\n- se_alimenta_de: manual 1.000,00\n- estado: activa`);
  m.set('decisiones/2026-10-01-canario.md', `# CANARIO-DECISION\nesquema: 1\nfecha: 2026-10-01\nestado: decidida\n## Qué\nCANARIO-DECISION ${IMPORTE}\n`);
  m.set('decisiones/2026-10-02-pausa.md', `# CANARIO-PAUSA\nesquema: 1\nfecha: 2026-10-02\nestado: pausa-48h\nvuelve: 2026-10-04 10:00\n## Qué\nCANARIO-PAUSA\n`);
  m.set('analisis/2026-10-03-canario.md', `# Análisis · CANARIO-ANALISIS\nesquema: 1\nfecha: 2026-10-03\ntarea: canario\n## Resultado\nCANARIO-ANALISIS ${IMPORTE}\n`);
  m.set('analisis/encajes/D-007-2026-10-03.md', `# Encaje · CANARIO-ENCAJE\nesquema: 1\nfecha: 2026-10-03\ndescubrimiento: D-007\n## Resultado\nCANARIO-ENCAJE ${IMPORTE}\n`);
  m.set('chat/privado/2026-10-03-canario.md', `# Conversación · CANARIO-CHAT\nesquema: 1\nmodo: privado\ntrabajo: privado\ncreada: 2026-10-03\n## Tú · 2026-10-03 10:00\nCANARIO-CHAT ${IMPORTE}\n`);
  m.set('tu-ano/2026.md', `# Tu 2026\nesquema: 1\nperiodo: enero – noviembre\n## Rex dice\nCANARIO-TUANO ${IMPORTE}\n`);
  m.set('ajustes.md', m.get('ajustes.md').replace(/^- nombre: .*$/m, '- nombre: CANARIO-NOMBRE'));
  const nota = (id, extra = '') => `## ${id} · CANARIO-NOTA ${IMPORTE}\n- tipo: opinión\n- fecha: ${sumarDias(HOY, -2)}\n${extra}CANARIO-NOTA con mi saldo de ${IMPORTE}.\n`;
  m.set('conocimiento/mias/canario.md', `# Mis notas · CANARIO\nesquema: 1\nfuente: mias\n${nota('N-9001')}`);
  // una fuente privada propia, activa por defecto
  anadir('conocimiento/_fuentes.md', '- secreta | Mi fuente secreta | familia: yt | prefijo: SEC | privada: sí | activa_por_defecto: sí');
  m.set('conocimiento/secreta/canario.md', `# Secreta · CANARIO\nesquema: 1\nfuente: secreta\n${nota('SEC-0001')}`);
  // Mis notas activas por defecto y dentro de una mezcla guardada: aun así, nunca salen
  m.set('conocimiento/_fuentes.md', m.get('conocimiento/_fuentes.md').replace(/^(- mias \|.*)activa_por_defecto: \S+/m, '$1activa_por_defecto: sí'));
  // nombres de clases y activos: metadatos, solo con tu casilla
  m.set('cartera/clases.md', m.get('cartera/clases.md').replace('RV desarrollados', 'METACLASE desarrollados'));
  m.set('cartera/activos.md', m.get('cartera/activos.md').replace('Fondo MSCI World', 'METAACTIVO World'));
  if (hostil >= 1) m.set('conocimiento/mias/hostil-campo.md', `# Mis notas\nesquema: 1\nfuente: mias\n${nota('N-9002', '- fuente: mundo\n')}`);
  if (hostil >= 2) m.set('conocimiento/mias/hostil-cab.md', `# Mis notas\nesquema: 1\nfuente: base\n${nota('N-9003', '- fuente: base\n')}`);
  if (hostil >= 3) m.set('conocimiento/_fuentes.md', m.get('conocimiento/_fuentes.md').replace(/^- mias \|.*$/m, '- mias | Mis notas | familia: prensa | privada: no | activa_por_defecto: sí'));
  if (hostil >= 4) m.set('conocimiento/_fuentes.md', m.get('conocimiento/_fuentes.md').replace(/^- mias \|.*\n/m, ''));
  return m;
}

/** Todas las combinaciones de opciones de los trabajos con internet: [trabajo, params, desclasificar] */
function combinaciones(extra = {}) {
  const out = [];
  for (const misActivos of [false, true]) for (const temas of [[], ['bolsa']]) out.push(['pulso', { fecha: sumarDias(HOY, -1), temas, misActivos }, misActivos]);
  out.push(['precios', {}, false], ['precios', { seguimiento: true }, false], ['datos', { ids: ['msci-acwi-nr-eur'] }, false]);
  for (const fuentes of [null, ['mias', 'secreta', 'base']]) out.push(['rex-web', { pregunta: '¿Qué es el TER?', ...(fuentes ? { fuentes } : {}) }, false]);
  for (const modo of ['pulso', 'nuevas', 'seguimiento', 'libre']) {
    for (const profundidad of ['rapida', 'normal', 'fondo']) {
      for (const misClases of [false, true]) out.push(['descubrir', { modo, tema: 'salud', periodo: '3m', profundidad, filtros: ['ETF'], misClases, fuentes: ['mias', 'secreta'], ...(modo === 'seguimiento' ? { id: 'D-007' } : {}), ...extra }, misClases]);
    }
  }
  return out;
}

function revisarTexto(texto, que) {
  const m = CANARIO.exec(texto);
  assert.equal(m, null, `${que}: ha aparecido «${m?.[0]}» en: …${m ? texto.slice(Math.max(0, m.index - 80), m.index + 80) : ''}…`);
}

let ent;
let app;
let trazas;
before(async () => {
  ent = await crearEntorno({ ficheros: sembrar(ficherosEjemplo()), nombre: 'testigos' });
  trazas = join(ent.base, 'trazas');
  await fsp.mkdir(trazas);
  const resp = join(ent.base, 'resp.txt');
  await fsp.writeFile(resp, json({ cualquier: 'cosa' }));
  app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, claude: { comando: [process.execPath, FAKE, '--trazas', trazas, '--respuesta', resp] } }).iniciar();
});
after(async () => {
  await app?.parar();
  await ent?.limpiar();
});

async function lanzarYLeer(id, params, desclasificar) {
  for (const f of await fsp.readdir(trazas)) await fsp.rm(join(trazas, f));
  const { id: run } = await app.claude.lanzar({ trabajo: id, params, desclasificar });
  await app.claude.ejecuciones.get(run).promesa;
  const fs_ = await fsp.readdir(trazas);
  return { ejecucion: app.claude.ejecuciones.get(run), trazas: await Promise.all(fs_.map(async (f) => JSON.parse(await fsp.readFile(join(trazas, f), 'utf8')))) };
}

test('el andamio detecta de verdad: privado y encaje SÍ reciben los canarios (control positivo)', async () => {
  const p = await lanzarYLeer('privado', { pregunta: '¿Cómo voy?' }, false);
  assert.equal(p.trazas.length, 1);
  assert.match(p.trazas[0].stdin, /CANARIO-META/);
  assert.match(p.trazas[0].stdin, /CANARIO-NOTA/, 'Mis notas sí llegan a privado');
  const e = await lanzarYLeer('encaje', { descubrimiento: 'D-007' }, false);
  assert.match(e.trazas[0].stdin, /nivel="privado">\n[\s\S]*METAACTIVO/, 'la cartera llega al encaje');
});

test('proceso real: ningún canario llega a los trabajos con internet, en ninguna combinación', async () => {
  let n = 0;
  for (const [id, params, desclasificar] of combinaciones()) {
    const { ejecucion, trazas: ts } = await lanzarYLeer(id, params, desclasificar);
    const que = `${id} ${JSON.stringify(params)}`;
    if (!ts.length) assert.fail(`${que}: no se lanzó (${JSON.stringify(ejecucion.resultado)})`);
    for (const t of ts) {
      n++;
      revisarTexto(t.stdin, `${que} (stdin)`);
      revisarTexto(t.args.join('\n'), `${que} (argv)`);
      revisarTexto(JSON.stringify(t.env), `${que} (env)`);
      revisarTexto(t.cwd, `${que} (cwd)`);
      assert.deepEqual(t.contenidoCwd, [], `${que}: cwd vacío`);
      for (const texto of [t.stdin, t.args.join('\n'), JSON.stringify(t.env), t.cwd]) assert.ok(!texto.includes(ent.datos), `${que}: la ruta de tus datos`);
      // sin la casilla, ni los nombres
      if (!params.misActivos && id !== 'precios') assert.doesNotMatch(t.stdin, /METAACTIVO/, que);
      if (!params.misClases) assert.doesNotMatch(t.stdin, /METACLASE/, que);
      if (params.misActivos) assert.match(t.stdin, /METAACTIVO/, `${que}: la casilla funciona`);
      if (params.misClases) {
        assert.match(t.stdin, /<datos origen="nombres de tus clases de activo" nivel="metadato">\nMETACLASE/, `${que}: solo nombres`);
      }
    }
  }
  assert.ok(n >= 30, `${n} ejecuciones`);
});

test('sin marcar la casilla en esa ejecución, los metadatos se rechazan antes de lanzar nada', async () => {
  for (const [id, params] of [['pulso', { fecha: sumarDias(HOY, -1), misActivos: true }], ['descubrir', { modo: 'nuevas', misClases: true }]]) {
    const { ejecucion, trazas: ts } = await lanzarYLeer(id, params, false);
    assert.equal(ts.length, 0, id);
    assert.equal(ejecucion.estado, 'rechazado', id);
    assert.match(ejecucion.resultado.mensaje, /R1/);
  }
});

test('con «mis clases»: solo nombres; ningún importe, peso ni porcentaje de tu cartera en todo el prompt', async () => {
  const m = modeloDe(sembrar(ficherosEjemplo()));
  const importes = new Set();
  const fmt = (c) => (Math.abs(c) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const o of m.operaciones) if (o.importe) importes.add(fmt(o.importe));
  for (const f of m.fotos) for (const x of f.filas) if (x.valor) importes.add(fmt(x.valor));
  const pesos = m.objetivo.map((o) => `${(o.peso / 100).toLocaleString('es-ES')} %`);
  for (const modo of ['pulso', 'nuevas', 'libre']) {
    const { trazas: ts } = await lanzarYLeer('descubrir', { modo, tema: 'salud', periodo: '3m', misClases: true }, true);
    const bloqueClases = /nivel="metadato">\n([^\n]*)\n<\/datos>/.exec(ts[0].stdin)[1];
    assert.doesNotMatch(bloqueClases, /\d/, 'el bloque de clases no lleva ningún número');
    for (const i of importes) assert.ok(!ts[0].stdin.includes(i), `importe ${i} en descubrir ${modo}`);
    for (const p of pesos) assert.ok(!bloqueClases.includes(p), p);
  }
});

test('«conocimiento» e «ingesta» (sin privado) tampoco reciben nada tuyo', async () => {
  const c = await lanzarYLeer('conocimiento', { tarea: 'opinan-canales', pregunta: '¿Está cara la bolsa?', fuentes: ['mias', 'secreta', 'base', 'indexado'] }, false);
  revisarTexto(c.trazas[0].stdin, 'conocimiento');
  await fsp.writeFile(join(ent.datos, 'CONTEXTO', 'de-fuera.txt'), 'Texto de fuera.');
  await app.almacen.barrer();
  const i = await lanzarYLeer('ingesta', { fichero: 'de-fuera.txt', fuente: 'pizarra' }, false);
  revisarTexto(i.trazas[0].stdin, 'ingesta');
});

test(`≥ 200 modelos aleatorios (semilla ${SEMILLA}): ninguna entrada de un trabajo sin «privado» lleva un canario`, async () => {
  const prng = crearPrng(SEMILLA);
  const base = ficherosEjemplo();
  const stub = (fs) => new ServicioClaude({ env: ent.env, almacen: { textos: () => [...fs].map(([ruta, texto]) => ({ ruta, texto, legible: true, version: 'v' })) } });
  const conPrivado = new Set(TRABAJOS.filter((t) => t.privado).map((t) => t.id));
  let revisadas = 0;
  for (let i = 0; i < 200; i++) {
    const hostil = prng.entero(0, 4);
    const fs = sembrar(base, { hostil });
    // ruido: quita ficheros al azar, para probar modelos incompletos
    for (const r of [...fs.keys()]) if (prng.siguiente() < 0.02 && !/ajustes|_fuentes|clases|activos|descubrimientos/.test(r)) fs.delete(r);
    const m = modeloDe(fs);
    const s = stub(fs);
    const todas = combinaciones();
    const lista = [todas[prng.entero(0, todas.length - 1)], todas[prng.entero(0, todas.length - 1)]];
    for (const [id, crudos, desclasificar] of lista) {
      const t = trabajo(id);
      assert.ok(!conPrivado.has(id));
      let params;
      try {
        params = s.parametros(id, crudos, m);
      } catch (e) {
        if (e.estado) continue; // el modelo no tiene lo necesario para este trabajo (p. ej. sin descubrimientos)
        throw e;
      }
      const e = t.entrada(m, { ...params, hoy: HOY });
      assert.deepEqual(problemasEntrada(t, e.bloques, { desclasificar }), [], `semilla ${SEMILLA}, modelo ${i}, ${id}`);
      const p = montarPrompt(t, { ...e, hoy: HOY, esquema: e.esquema ?? t.esquema });
      const que = `semilla ${SEMILLA}, modelo ${i} (hostil ${hostil}), ${id} ${JSON.stringify(crudos)}`;
      revisarTexto(p.usuario, que);
      revisarTexto(p.sistema, que);
      revisarTexto(argumentos(t, { sistema: p.sistema, maxTurns: e.maxTurns }).join('\n'), que);
      revisadas++;
    }
    if (i % 20 === 0) await esperar(0);
  }
  assert.ok(revisadas >= 300, `${revisadas} entradas revisadas`);
});
