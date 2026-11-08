// QA5 · Conocimiento, mezclas, calibración y Descubrimientos: bordes, volumen y flujos que no cubren las pruebas de fase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import * as K from '../../src/core/conocimiento.js';
import * as D from '../../src/core/descubrimientos.js';
import { pendientes } from '../../src/core/resumen.js';
import { construirModelo } from '../../src/core/modelo.js';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { bloques, items, cabeceras } from '../../src/core/formato/motor.js';
import { notasParaTrabajo, limiteContexto, montarPrompt } from '../../src/claude/contexto.js';
import { trabajo } from '../../src/claude/trabajos/index.js';
import { App } from '../../src/server/app.js';
import { generar } from '../../scripts/generar-ejemplo.js';
import { datosGrandes } from '../server/grande.js';
import { FAKE, json } from '../qa/ayuda-claude.js';
import { crearEntorno, pedir, esperar } from '../qa/entorno.js';
import { fechaLocal, sumarDias } from '../../src/core/fechas.js';

const HOY = '2026-11-03';
const BASE = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
const modeloDe = (fs) => construirModelo(Object.fromEntries([...fs].filter(([r]) => r.endsWith('.md')).map(([r, texto]) => [r, { texto, version: 'v' }])));
function mundo(ini = BASE) {
  const fs = new Map(ini);
  return {
    fs,
    aj: {},
    op(n, a) {
      const r = aplicarOp((x) => fs.get(x) ?? null, n, a, { ajustes: { mes_inicio_dia: 1, ...this.aj }, formato: { diaInicio: 1 }, prng: crearPrng(5), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
    modelo: () => modeloDe(fs),
  };
}
const palabras = (pre, n) => Array.from({ length: n }, (_, i) => `${pre}${String(i).padStart(3, '0')}`);

test('dedup: Jaccard 0,59 no, 0,60 sí, 0,61 sí; ±1 día sí, ±2 no; la misma URL siempre', () => {
  const comun = (n) => palabras('com', n);
  const par = (c, a, b) => [[...comun(c), ...palabras('aaa', a)].join(' '), [...comun(c), ...palabras('bbb', b)].join(' ')];
  const [a59, b59] = par(59, 21, 20);
  const [a60, b60] = par(60, 20, 20);
  const [a61, b61] = par(61, 20, 19);
  assert.equal(K.jaccard(a59, b59), 0.59);
  assert.equal(K.jaccard(a60, b60), 0.6);
  assert.equal(K.jaccard(a61, b61), 0.61);
  const f = '2026-11-03';
  const lista = (t, fecha = f, origen = 'Medio · https://a.example/1') => [{ titulo: t, fecha, origen }];
  const nueva = (t, fecha = f) => ({ titulo: t, fecha, origen: 'Otro · https://b.example/2' });
  assert.ok(!K.duplicadoDe(nueva(b59), lista(a59)));
  assert.ok(K.duplicadoDe(nueva(b60), lista(a60)));
  assert.ok(K.duplicadoDe(nueva(b61), lista(a61)));
  assert.ok(K.duplicadoDe(nueva(b60, '2026-11-04'), lista(a60)));
  assert.ok(K.duplicadoDe(nueva(b60, '2026-11-02'), lista(a60)));
  assert.ok(!K.duplicadoDe(nueva(b60, '2026-11-05'), lista(a60)));
  assert.ok(!K.duplicadoDe(nueva(b60, '2026-11-01'), lista(a60)));
  assert.ok(K.duplicadoDe({ titulo: 'Nada que ver', fecha: '2020-01-01', origen: 'X · https://a.example/1' }, lista(a60)), 'la misma URL, siempre');
  assert.ok(K.duplicadoDe({ titulo: 'Nada que ver', fecha: '2020-01-01', origen: 'X · https://a.example/1/.' }, lista(a60)), 'con la puntuación final');
  assert.ok(!K.duplicadoDe({ titulo: 'Nada que ver', fecha: f, origen: null }, lista(a60)), 'sin URL no choca');
});

test('acierto «—» con menos de 5 resueltas; con 5, calcula; pendientes y no medibles no cuentan', () => {
  const p = (e, fuente = 'x') => ({ fuente, estado: e });
  const r = (lista) => K.aciertoPorFuente(lista);
  const v = (o) => o.get('x');
  assert.equal(v(r([p('acertada'), p('acertada'), p('fallida'), p('fallida')])).aciertoPb, null, '4 resueltas: —');
  const cinco = v(r([p('acertada'), p('acertada'), p('acertada'), p('fallida'), p('fallida')]));
  assert.equal(cinco.aciertoPb, 6000);
  const conRuido = v(r([p('acertada'), p('acertada'), p('acertada'), p('fallida'), p('fallida'), p('pendiente'), p('no-medible')]));
  assert.equal(conRuido.aciertoPb, 6000, 'pendiente y no medible no cuentan');
  assert.equal(conRuido.resueltas, 5);
});

test('selectores dinámicos: @postura, @familia y @acierto se recalculan con los datos; en los bordes exactos', () => {
  const resumen = [{ id: 'a', familia: 'yt', postura: -0.3, acierto: { aciertoPb: 6500 } }, { id: 'b', familia: 'yt', postura: -0.31, acierto: { aciertoPb: 6499 } }, { id: 'c', familia: 'prensa', postura: 0, acierto: { aciertoPb: null } }, { id: 'd', familia: 'prensa', postura: null, acierto: { aciertoPb: 10000 } }];
  // el selector, tal como lo escribes en _mezclas.md
  const sel = (t) => items(leer('conocimiento/_mezclas.md', `# M\nesquema: 1\n- m | Mezcla | ${t}\n`))[0].miembros;
  const res = (m) => K.resolverMezcla(sel(m[0]), resumen).fuentes.slice().sort();
  assert.deepEqual(res(['@postura<=-0,3']), ['a', 'b']);
  assert.deepEqual(res(['@familia=yt']), ['a', 'b']);
  assert.deepEqual(res(['@acierto>=65']), ['a', 'd']);
  // cambian los datos, cambia el resultado
  resumen[1].postura = 0.5;
  assert.deepEqual(res(['@postura<=-0,3']), ['a']);
});

test('caducadas fuera de análisis y chat; Mis notas y privadas, fuera de rex-web y pulso', () => {
  const m = mundo();
  m.op('fuente.crear', { nombre: 'Mi privada', familia: items(leer('conocimiento/_familias.md', m.fs.get('conocimiento/_familias.md')))[0].id, privada: true });
  const priv = items(leer('conocimiento/_fuentes.md', m.fs.get('conocimiento/_fuentes.md'))).find((f) => f.privada).id;
  m.op('nota.crear', { fuente: priv, titulo: 'Solo mía', fecha: '2026-10-01', campos: { tipo: 'hecho' }, cuerpo: 'ZZSECRETO' });
  m.op('nota.crear', { fuente: 'base', titulo: 'Caducada', fecha: '2020-01-01', campos: { tipo: 'hecho', caduca: '2021-01-01' }, cuerpo: 'ZZCADUCADA' });
  const M = m.modelo();
  const texto = (id, params) => {
    const t = trabajo(id);
    const e = t.entrada(M, { ...params, hoy: HOY });
    return montarPrompt(t, { ...e, hoy: HOY }).usuario;
  };
  const conPrivada = M.fuentes.map((f) => f.id);
  assert.match(texto('privado', { pregunta: 'x', fuentes: conPrivada }), /ZZSECRETO/, 'control: el trabajo privado sí');
  assert.doesNotMatch(texto('privado', { pregunta: 'x', fuentes: conPrivada }), /ZZCADUCADA/);
  for (const [id, p] of [['rex-web', { pregunta: 'x', fuentes: conPrivada }], ['pulso', { fecha: HOY, temas: [] }], ['descubrir', { modo: 'libre', tema: 'x' }], ['conocimiento', { pregunta: 'x', fuentes: conPrivada }]]) {
    const t = texto(id, p);
    assert.doesNotMatch(t, /ZZSECRETO/, id);
    assert.doesNotMatch(t, /ZZCADUCADA/, id);
  }
});

test('con mucho: 50 fuentes y 2.000 notas; máximo 60 notas y 60.000 caracteres, y dice «se usaron X de Y»', () => {
  const { fs } = datosGrandes();
  const f = new Map([...fs].filter(([r]) => r.endsWith('.md')));
  let filas = '';
  for (let i = 0; i < 50; i++) filas += `- f${i} | Fuente ${i} | familia: yt | prefijo: F${i}X | activa_por_defecto: sí\n`;
  f.set('conocimiento/_fuentes.md', `${f.get('conocimiento/_fuentes.md').trimEnd()}\n${filas}`);
  const M = modeloDe(f);
  assert.ok(K.indiceNotas(M).length >= 2000, `${K.indiceNotas(M).length} notas`);
  const t0 = performance.now();
  const sel = notasParaTrabajo(M, trabajo('privado'), { hoy: HOY, fuentes: M.fuentes.map((x) => x.id) });
  assert.ok(performance.now() - t0 < 1500, 'la selección no se atasca');
  assert.ok(sel.usadas <= 60);
  assert.ok(sel.total > 60, `${sel.total} sin caducar`);
  assert.ok(sel.usadas < sel.total, `se usaron ${sel.usadas} de ${sel.total}`);
  const largo = sel.notas.reduce((a, n) => a + `[${n.id}] ${n.titulo} (${n.tipo}${n.fecha ? `, ${n.fecha}` : ''}${n.postura ? `, ${n.postura}` : ''})\n${n.cuerpo}`.length, 0);
  assert.ok(largo <= 60000, `${largo} caracteres`);
  assert.deepEqual(limiteContexto('10 notas · 500 car.'), { notas: 10, caracteres: 500 });
  const poco = notasParaTrabajo(M, trabajo('privado'), { hoy: HOY, fuentes: M.fuentes.map((x) => x.id), limite: limiteContexto('10 notas · 500 car.') });
  assert.ok(poco.usadas <= 10);
  const t1 = performance.now();
  const r = K.buscarNotas(K.indiceNotas(M), { texto: 'noticia' });
  assert.ok(r.length > 0);
  assert.ok(performance.now() - t1 < 300, `buscador: ${Math.round(performance.now() - t1)} ms`);
});

test('mezcla guardada en el análisis y en el chat; la nota mantiene su id al moverla', () => {
  const m = mundo();
  const a = m.op('analisis.guardar', { fecha: HOY, tarea: 'prueba', titulo: 'T', mezcla: ['base', 'datos'], resultado_md: 'x' });
  assert.deepEqual(cabeceras(leer(a.resultado.ruta, m.fs.get(a.resultado.ruta))).mezcla, ['base', 'datos']);
  const c = m.op('chat.crear', { modo: 'privado', titulo: 'Una charla', mezcla: ['base', 'mias'], fecha: HOY });
  assert.deepEqual(cabeceras(leer(c.resultado.ruta, m.fs.get(c.resultado.ruta))).mezcla, ['base', 'mias']);
  const n = m.op('nota.crear', { fuente: 'pizarra', titulo: 'Para mover', fecha: HOY, campos: { tipo: 'hecho' }, cuerpo: 'x' });
  const r = m.op('nota.mover', { ruta: n.resultado.ruta, id: n.resultado.id, fuente: 'indexado' });
  const ruta = r.resultado.ruta ?? Object.keys(r.escribir).find((x) => x.startsWith('conocimiento/indexado/'));
  assert.ok(bloques(leer(ruta, m.fs.get(ruta))).some((b) => b.id === n.resultado.id));
  assert.ok(!(m.fs.get(n.resultado.ruta) ?? '').includes(`## ${n.resultado.id} `), 'ya no está en la de origen');
});

test('calibración: finhub aparte; finhub-descubrir no se mezcla', () => {
  const lista = [{ fuente: 'finhub', estado: 'acertada', rango: true }, { fuente: 'finhub-descubrir', estado: 'fallida' }, { fuente: 'finhub-descubrir', estado: 'acertada' }, { fuente: 'otra', estado: 'acertada' }];
  const c = K.calibracion(lista);
  assert.ok(c);
  const M = modeloDe(BASE);
  const res = K.resumenFuentes(M, HOY);
  assert.ok(!res.some((f) => f.id === 'finhub-descubrir' && f.activa), 'no es una fuente de la mezcla');
});

test('descubrimientos: versiones, «sin cambios» por ajuste, estados y Pendientes en su fecha', () => {
  const m = mundo();
  const d = { titulo: 'Salud global', tipo: 'sector', postura: 'alcista', confianza: 'media', tesis: 'Tesis suficientemente larga para validar.', saldria_bien_si: 'a', la_invalidaria: 'b', riesgos: 'c', vehiculos: [], citas: [], afirmaciones: [], revisar_en_dias: 30 };
  const c = m.op('descubrimiento.crear', { fecha: HOY, d });
  const id = c.resultado.id;
  const ruta = `conocimiento/descubrimientos/${id}.md`;
  const cuantas = () => (m.fs.get(ruta).match(/^## v\d+/gm) ?? []).length;
  assert.equal(cuantas(), 1);
  m.op('descubrimiento.version', { id, fecha: '2026-11-10', d: { ...d, tesis: 'Otra tesis suficientemente larga para validar.' }, cambios: 'cambia la tesis' });
  assert.equal(cuantas(), 2);
  assert.match(m.fs.get(ruta).split('\n').find((l) => l.startsWith('## v')), /^## v2 · 2026-11-10/, 'la nueva, arriba');
  m.op('descubrimiento.version', { id, fecha: '2026-11-11', sinCambios: true });
  const con = cuantas();
  m.aj.descubrir_sin_cambios = 'nada';
  m.op('descubrimiento.version', { id, fecha: '2026-11-12', sinCambios: true });
  assert.equal(cuantas(), con, 'con «nada», no hay versión nueva');
  m.aj.descubrir_sin_cambios = 'version';
  assert.ok(con >= 2);
  for (const e of ['siguiendo', 'descartado', 'archivado', 'nuevo']) {
    m.op('descubrimiento.estado', { id, estado: e });
    assert.equal(m.modelo().descubrimientos.find((x) => x.id === id).estado, e);
  }
  assert.throws(() => m.op('descubrimiento.estado', { id, estado: 'inventado' }), ErrorOp);
  m.op('descubrimiento.estado', { id, estado: 'siguiendo' });
  const M = m.modelo();
  const dm = M.descubrimientos.find((x) => x.id === id);
  const fecha = dm.revisar;
  assert.ok(fecha, 'al seguir, tiene fecha de revisión');
  const pend = (f) => pendientes(M, { fecha: f, hora: '10:00' }).elementos.find((e) => e.id === 'descubrimientos');
  assert.equal(pend(sumarDias(fecha, -1))?.detalle?.includes('Salud global') ?? false, false, 'antes de su fecha, no');
  assert.match(pend(fecha).detalle, /Salud global/, 'en su fecha, sí');
  assert.match(pend(sumarDias(fecha, 3)).detalle, /Salud global/, 'después, sigue');
});

test('mapa de efectos en los bordes: neto 2 ▲, −2 ▼, ±1 y 0 •, sin notas vacío; sectores editables', () => {
  const nota = (id, e) => ({ id, titulo: id, campos: { fecha: HOY, efectos: { bancos: e } } });
  const c = (...lista) => D.mapaEfectos({ ajustes: { sectores_efectos: ['bancos'] }, mundo: [{ fecha: HOY, notas: lista.map((e, i) => nota(`n${i}`, e)) }] }, HOY, 1).filas[0].celdas[0];
  assert.deepEqual([c('▲', '▲').signo, c('▲', '▲').neto], ['▲', 2]);
  assert.deepEqual([c('▼', '▼').signo, c('▼', '▼').neto], ['▼', -2]);
  assert.equal(c('▲').signo, '•');
  assert.equal(c('▼').signo, '•');
  assert.equal(c('▲', '▼').signo, '•');
  assert.equal(c('•').signo, '•');
  assert.equal(c().signo, '');
  assert.equal(c('▲', '▲', '▲', '▼').signo, '▲');
  assert.equal(c('▲', '▼', '▼', '▼').signo, '▼');
  const m = mundo();
  m.op('descubrir.listas', { sectores: ['bancos', 'nuevo-sector'], filtros: ['sin apalancados'] });
  assert.deepEqual(m.modelo().ajustes.sectores_efectos, ['bancos', 'nuevo-sector']);
});

test('simulador: 0 %, 50 %, fuera de rango; no toca ni un byte; rendimiento con y sin referencia y con huecos', () => {
  const M = modeloDe(BASE);
  const antes = new Map(BASE);
  const d = M.descubrimientos[0];
  const cero = D.simular(M, HOY, d, { pct: 0 });
  assert.ok(!cero.error);
  assert.equal(cero.pesoPb, 0);
  for (const cl of cero.clases) assert.equal(cl.antesPb, cl.despuesPb, cl.nombre);
  const cin = D.simular(M, HOY, d, { pct: 50 });
  assert.ok(!cin.error);
  assert.equal(cin.pesoPb, 5000);
  assert.ok(Math.abs(cin.clases.reduce((a, c) => a + c.despuesPb, 0) - 10000) <= cin.clases.length + 1, 'los pesos suman 100 %');
  for (const de of ['todo', 'aportaciones']) assert.ok(!D.simular(M, HOY, d, { pct: 10, de }).error, de);
  assert.deepEqual([...BASE], [...antes]);
  assert.equal(D.rendimientoDesde({ referencia: null, descubierto: HOY }, M), null, 'sin referencia, —');
  const con = (filas) => ({ serie: (id) => (id === 'r' ? filas : null) });
  assert.equal(D.rendimientoDesde({ referencia: 'r', descubierto: '2026-06-15' }, con([])), null);
  const huecos = D.rendimientoDesde({ referencia: 'r', descubierto: '2026-06-15' }, con([{ mes: '2026-03', valor: 100 }, { mes: '2026-05', valor: 110 }, { mes: '2026-08', valor: 121 }]));
  assert.ok(Math.abs(huecos.ref - 0.1) < 1e-9, 'parte del último cierre antes del descubrimiento');
  assert.equal(huecos.vs, null, 'sin serie de comparación, —');
  assert.equal(D.rendimientoDesde({ referencia: 'r', descubierto: '2026-06-15' }, con([{ mes: '2026-05', valor: 110 }])), null, 'un solo dato no da rendimiento');
});

async function conApp(fn, respuestas = {}) {
  const ent = await crearEntorno({ nombre: 'flujos' });
  const dir = join(ent.base, 'respuestas');
  await fsp.mkdir(dir);
  for (const [k, v] of Object.entries(respuestas)) await fsp.writeFile(join(dir, `${k}.txt`), v);
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false, claude: { comando: [process.execPath, FAKE, '--respuestas', dir] } }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  try {
    await fn(app, (...a) => pedir(srv, ...a), ent);
  } finally {
    await app.parar();
    await ent.limpiar();
  }
}

test('CONTEXTO: asignar, revisar, a procesados/<fuente>/; un nombre repetido no pisa; nada sin confirmar', async () => {
  const hoy = fechaLocal();
  await conApp(async (app, api, ent) => {
    await fsp.mkdir(join(ent.datos, 'CONTEXTO'), { recursive: true });
    await fsp.writeFile(join(ent.datos, 'CONTEXTO/video.txt'), 'transcripción');
    await app.almacen.barrer();
    assert.ok((await api('GET', '/api/estado')).json.contexto.includes('CONTEXTO/video.txt'));
    const r = await app.claude.lanzar({ trabajo: 'ingesta', params: { texto: 'transcripción', fichero: 'video.txt', fuente: 'pizarra' } });
    await app.claude.ejecuciones.get(r.id).promesa;
    const e = app.claude.resultado(r.id);
    assert.equal(e.estado, 'ok', JSON.stringify(e.resultado));
    assert.ok(await fsp.stat(join(ent.datos, 'CONTEXTO/video.txt')), 'hasta confirmar sigue donde estaba');
    const a = await api('POST', '/api/ops', { op: 'ingesta.aplicar', args: { fuente: 'pizarra', fichero: 'video.txt', fecha: hoy, notas: e.resultado.json.notas, predicciones: e.resultado.json.predicciones } });
    assert.equal(a.estado, 200, a.texto);
    assert.ok(Object.keys(a.json.cambios).every((x) => x.startsWith('conocimiento/')), 'solo conocimiento/');
    const p = await api('POST', '/api/contexto/procesado', { fichero: 'video.txt', fuente: 'pizarra' });
    assert.equal(p.json.destino, 'CONTEXTO/procesados/pizarra/video.txt');
    assert.ok(!(await api('GET', '/api/estado')).json.contexto.includes('CONTEXTO/video.txt'), 'ya no está pendiente');
    // otro con el mismo nombre no pisa al anterior
    await fsp.writeFile(join(ent.datos, 'CONTEXTO/video.txt'), 'otra');
    await app.almacen.barrer();
    const p2 = await api('POST', '/api/contexto/procesado', { fichero: 'video.txt', fuente: 'pizarra' });
    assert.equal(p2.json.destino, 'CONTEXTO/procesados/pizarra/video-2.txt');
    assert.equal(await fsp.readFile(join(ent.datos, 'CONTEXTO/procesados/pizarra/video.txt'), 'utf8'), 'transcripción');
    assert.equal((await api('POST', '/api/contexto/procesado', { fichero: 'no-existe.txt', fuente: 'pizarra' })).estado, 404);
  }, { ingesta: json({ notas: [{ titulo: 'Idea del vídeo', tipo: 'opinión', temas: ['bolsa'], activos: [], resumen: 'Resumen de veinte caracteres o más.' }], predicciones: [] }) });
});

test('flujos de IA con el falso: cada uno va a su destino exacto; las cifras son las del código', async () => {
  const hoy = fechaLocal();
  const P = (o, t = 'Hecho.') => json(o, t);
  await conApp(async (app, api) => {
    const correr = async (t, params) => {
      const r = await app.claude.lanzar({ trabajo: t, params });
      await app.claude.ejecuciones.get(r.id).promesa;
      const e = app.claude.resultado(r.id);
      assert.equal(e.estado, 'ok', `${t}: ${JSON.stringify(e.resultado)}`);
      return e;
    };
    const op = async (nombre, args, destino) => {
      const r = await api('POST', '/api/ops', { op: nombre, args });
      assert.equal(r.estado, 200, `${nombre}: ${r.texto}`);
      for (const k of Object.keys(r.json.cambios)) assert.match(k, destino, `${nombre} escribe en ${k}`);
      return r.json;
    };
    const pulso = await correr('pulso', { fecha: sumarDias(hoy, -2), temas: [] });
    await op('pulso.aplicar', { fecha: sumarDias(hoy, -2), hora: '10:00', notas: pulso.resultado.json.notas }, /^conocimiento\/mundo\//);
    const pv = await correr('privado', { pregunta: '¿Cómo voy?' });
    const chat = await op('chat.crear', { modo: 'privado', titulo: '¿Cómo voy?', fecha: hoy }, /^chat\/privado\//);
    await op('chat.turno', { ruta: chat.resultado.ruta, tu: '¿Cómo voy?', rex: pv.resultado.json.respuesta_md, cuando: `${hoy} 10:00`, sesion: pv.resultado.sesion ?? null }, /^chat\/privado\//);
    const web = await correr('rex-web', { pregunta: '¿Qué es el TER?' });
    const cw = await op('chat.crear', { modo: 'web', titulo: 'TER', fecha: hoy }, /^chat\/web\//);
    await op('chat.turno', { ruta: cw.resultado.ruta, tu: 'x', rex: web.resultado.json.respuesta_md, cuando: `${hoy} 10:00` }, /^chat\/web\//);
    await op('analisis.guardar', { fecha: hoy, tarea: 'x', titulo: 'y', resultado_md: 'z' }, /^analisis\/[^/]+\.md$/);
    await op('encaje.guardar', { fecha: hoy, descubrimiento: 'D-002', json: { ya_tienes: 'a', solapamiento: 'b', comentario_md: 'c', citas: [] } }, /^analisis\/encajes\//);
    const des = await correr('descubrir', { modo: 'nuevas' });
    await op('descubrimiento.crear', { fecha: hoy, d: des.resultado.json.descubrimientos[0] }, /^conocimiento\/(descubrimientos\/|predicciones\.md)/);
    const con = await correr('conocimiento', { pregunta: 'x' });
    assert.ok(con.resultado.json);
    await op('semana.guardar', { semana: '2026-W45', periodo: { desde: '2026-11-02', hasta: '2026-11-08' }, secciones: [{ tema: 'a', texto: 'b' }] }, /^conocimiento\/mundo\/semana-/);
    await op('quiz.responder', { fecha: hoy, nota: 'B-0001', resultado: 'acierto' }, /^quiz\/progreso\.md$/);
    await op('tuano.rexDice', { anio: 2026, texto: 'Bien' }, /^tu-ano\/2026\.md$/);
    // cifras: la tasa que Rex recibe es la que calcula el código, no la del modelo
    const t = trabajo('privado');
    const M = modeloDe(new Map(app.almacen.textos().filter((x) => x.legible).map((x) => [x.ruta, x.texto])));
    const e = t.entrada(M, { pregunta: 'x', hoy });
    assert.ok(e.cifras.some((c) => c.nombre === 'patrimonio neto' && /€/.test(c.valor)));
    // privado y encaje nunca escriben en conocimiento/ (salvo la predicción de finhub, que es del código)
    assert.ok(!trabajo('privado').escribe.some((x) => x.startsWith('conocimiento/')));
    await esperar(5);
  }, {
    pulso: P({ notas: [{ titulo: 'Noticia de hace dos días', tipo: 'hecho', fecha: sumarDias(hoy, -2), origen: { medio: 'Medio', url: 'https://m.example/a' }, temas: ['bolsa'], activos: [], resumen: 'Resumen de veinte caracteres o más.' }] }),
    privado: P({ respuesta_md: 'Vas bien.', citas: [], cifras_usadas: [] }),
    'rex-web': P({ respuesta_md: 'El TER es un coste.', citas: ['https://m.example/a'], cifras_usadas: [] }),
    descubrir: P({ descubrimientos: [{ titulo: 'Salud global', tipo: 'sector', postura: 'alcista', confianza: 'baja', tesis: 'Tesis suficientemente larga para validar.', saldria_bien_si: 'a', la_invalidaria: 'b', riesgos: 'c', vehiculos: [], citas: ['https://m.example/a'], afirmaciones: [], revisar_en_dias: 30 }] }),
    conocimiento: P({ fuentes: [], coinciden: 'x', discrepan: 'y', opinion_modelo: 'z' }),
  });
});
