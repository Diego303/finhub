// F10 «hecho cuando»: cada flujo de IA de punta a punta con la carpeta de ejemplo y el Claude falso
// (respuestas por trabajo y tarea). Se comprueba siempre lo que queda en el disco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { fechaLocal, sumarDias, semanaIso } from '../../src/core/fechas.js';
import { carpetaDeEjemplo, borrarTemporal, entornoAislado, esperar, temporal } from '../server/ayudas.js';

const FAKE = join(import.meta.dirname, '..', 'fake-claude.js');
const HOY = fechaLocal();
const DIA = sumarDias(HOY, -2);
let navegador = null;
let app;
let raiz;
let p;
const limpiar = [];
const errores = [];
const json = (o, texto = 'Hecho.') => `${texto}\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

const RESPUESTAS = {
  pulso: json({ notas: [{ titulo: 'El euro digital avanza en el Parlamento Europeo', tipo: 'hecho', fecha: DIA, origen: { medio: 'Medio de prueba', url: 'https://prueba.example/euro-digital' }, temas: ['Europa', 'banca'], activos: [], resumen: 'El Parlamento aprobó un paso más del euro digital; la banca pide límites a los saldos.' }, { titulo: 'Las bolsas europeas cierran planas', tipo: 'dato', fecha: DIA, origen: { medio: 'Medio de prueba', url: 'https://prueba.example/bolsas' }, temas: ['bolsa'], activos: ['Fondo MSCI World'], postura: 'neutral', resumen: 'Sesión sin cambios en Europa a la espera del banco central.' }] }),
  precios: json({ precios: [{ isin: 'IE00BYX5NX33', valor: 12.345, divisa: 'EUR', fecha: sumarDias(HOY, -1), origen: 'https://gestora.example/msci' }, { isin: 'IE0031786696', valor: 30.5, divisa: 'EUR', fecha: sumarDias(HOY, -1), origen: 'https://gestora.example/em' }] }),
  ingesta: json({ notas: [{ titulo: 'Las comisiones bajas importan a largo plazo', tipo: 'consenso', temas: ['costes'], activos: [], resumen: 'El autor recuerda que el TER se come la rentabilidad a largo plazo.' }, { titulo: 'Espera tipos estables en 2027', tipo: 'opinión', temas: ['tipos'], activos: [], postura: 'neutral', resumen: 'Cree que el banco central no moverá los tipos el año que viene.', cita: 'minuto 3' }, { titulo: 'Una nota que voy a descartar', tipo: 'especulación', temas: [], activos: [], resumen: 'Algo que no me convence y no quiero guardar.' }], predicciones: [{ texto: 'el BCE no baja tipos antes de marzo', medir: `bce-deposito nivel ${HOY}→${sumarDias(HOY, 120)} >= 2`, horizonte: 'marzo' }] }),
  'privado-escenarios-12m': json({ escenarios: [{ nombre: 'base', prob: 60, porque: 'Beneficios en línea con el consenso [M-261103-02].', citas: ['M-261103-02'] }, { nombre: 'optimista', prob: 20, porque: 'Bajadas de tipos antes de lo previsto.', citas: [] }, { nombre: 'pesimista', prob: 20, porque: 'Valoraciones altas [P-0019].', citas: ['P-0019'] }], ideas: [{ titulo: 'Mantener la aportación', tipo: 'opinión', texto: 'La desviación es pequeña salvo en emergentes.', citas: [] }] }),
  'privado-abogado-diablo': json({ respuesta_md: 'El escenario base supone que los beneficios acompañan; si no, el pesimista pesa más.', citas: [], cifras_usadas: [] }),
  privado: json({ respuesta_md: 'Este mes vas bien: tu tasa de ahorro está por encima de tu media.', citas: [], cifras_usadas: ['tasa de ahorro del mes'] }, 'Este mes vas bien.'),
  'privado-explicame': json({ respuesta_md: 'Tu patrimonio neto es lo que tienes menos lo que debes: cuentas más cartera.', citas: [], cifras_usadas: ['patrimonio neto'] }),
  'rex-web': json({ respuesta_md: 'El TER es el coste anual de un fondo, descontado de su valor.', citas: ['https://www.cnmv.es/'], cifras_usadas: [] }),
  'conocimiento-opinan-canales': json({ fuentes: [{ id: 'pizarra', postura: 'bajista', argumento: 'Ve valoraciones altas.', cita: 'P-0019' }, { id: 'indexado', postura: 'neutral', argumento: 'Aportar siempre sin mirar.', cita: 'IND-0031' }], coinciden: 'Ninguno recomienda vender.', discrepan: 'La pizarra espera una corrección [P-0019].', opinion_modelo: 'Las dos posturas son compatibles con aportar poco a poco.' }),
  'privado-pausa-48h': json({ preguntas: ['¿Qué tendría que pasar para que fuera un error?', '¿Cómo encaja con tu objetivo 90/10?', '¿Lo aguantarías en una caída del 30 %?'], resumen: 'Subir el peso de tecnología.' }),
  'conocimiento-resumen-semanal': json({ secciones: [{ tema: 'Bancos centrales', texto: 'El banco central mantiene los tipos. [M-261103-02]' }, { tema: 'Bolsa', texto: 'Semana tranquila con dudas en tecnología. [M-261103-03]' }] }),
  'conocimiento-quiz': json({ preguntas: [{ nota: 'B-0021', pregunta: '¿Qué mide el TER de un fondo?', opciones: ['Su rentabilidad', 'Su coste anual', 'Su riesgo', 'Su tamaño'], correcta: 1, explicacion: 'Es el porcentaje anual que cuesta mantener el fondo.' }] }),
  'privado-tu-ano': json({ texto_md: 'Este año has convertido el ahorro en costumbre y la cartera ha hecho el resto.', citas: [] }),
  'privado-revisar-cartera-base': json({ respuesta_md: 'El borrador está bien diversificado; el monetario cubre el colchón.', citas: [], cifras_usadas: [] }),
};

before(async () => {
  try {
    navegador = await chromium.launch();
  } catch {
    return;
  }
  const aislado = await entornoAislado();
  limpiar.push(aislado.base);
  raiz = await carpetaDeEjemplo();
  limpiar.push(raiz);
  const dir = await temporal('respuestas');
  limpiar.push(dir);
  for (const [k, v] of Object.entries(RESPUESTAS)) await fsp.writeFile(join(dir, `${k}.txt`), v);
  app = await new App({ carpeta: raiz, puerto: 0, env: aislado.env, sondeoMs: 200, barridoMs: 1000, claude: { comando: [process.execPath, FAKE, '--esperar', '150', '--respuestas', dir] } }).iniciar();
  p = await navegador.newPage({ viewport: { width: 1320, height: 1000 } });
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  await p.goto(`${app.url}#panel`);
  await p.waitForFunction(() => document.querySelector('#marco')?.dataset.vista === 'panel' && !document.querySelector('.carga'));
});
after(async () => {
  await navegador?.close();
  await app?.parar();
  for (const d of limpiar) await borrarTemporal(d);
});

const doc = async (ruta) => leer(ruta, await fsp.readFile(join(raiz, ruta), 'utf8'));
async function hasta(fn, que, ms = 8000) {
  const fin = performance.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* aún no */
    }
    if (performance.now() > fin) throw new Error(`no se cumplió: ${que}`);
    await esperar(80);
  }
}
const dialogo = '[role=dialog]';
const ficheros = async (dir) => (await fsp.readdir(join(raiz, dir)).catch(() => [])).filter((f) => f.endsWith('.md'));
const ir = async (vista) => {
  await p.waitForSelector(dialogo, { state: 'detached', timeout: 10000 }); // como un usuario: sin modales abiertos
  // si el clic cae justo mientras se repinta (llegan datos por SSE), se pierde: se repite, como haría una persona
  for (let i = 0; i < 20; i++) {
    await p.$eval(`.tabs [data-accion=vista][data-vista=${vista}]`, (x) => x.click());
    if (await p.waitForFunction((v) => document.querySelector('#marco').dataset.vista === v, vista, { timeout: 1500 }).then(() => true, () => false)) return;
  }
  throw new Error(`no se pudo ir a ${vista}`);
};

test('pulso de un día pasado: fusión y notas en conocimiento/mundo/', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('conocimiento');
  await p.click('[data-accion=abrir-pulso]');
  await p.click(`${dialogo} [data-accion=pulso-dia][data-fecha="${DIA}"]`);
  await p.click(`${dialogo} [data-accion=pulso-hacer]`);
  const ruta = `conocimiento/mundo/${DIA}.md`;
  const d = await hasta(async () => bloques(await doc(ruta)).some((b) => b.titulo.startsWith('El euro digital')) && doc(ruta), 'pulso guardado');
  await p.waitForSelector(dialogo, { state: 'detached' });
  const nueva = bloques(d).find((b) => b.titulo.startsWith('El euro digital'));
  assert.deepEqual([nueva.campos.fuente, nueva.campos.temas], ['mundo', ['europa', 'banca']]);
  assert.equal(cabeceras(d).pulsos.length >= 1, true);
});

test('precios propuestos por Claude: tú los revisas y guardas', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('cartera');
  await p.click('main [data-accion=valores-form]');
  await p.click(`${dialogo} [data-accion=precios-buscar]`);
  await p.waitForSelector(`${dialogo} [data-precio=msci-world]`, { timeout: 10000 });
  assert.match(await p.textContent(`${dialogo} [data-precio=msci-world]`), /12,345 EUR/);
  if (!(await p.inputValue(`${dialogo} #val-emergentes`))) await p.fill(`${dialogo} #val-emergentes`, '4.700');
  if (!(await p.inputValue(`${dialogo} #val-msci-world`))) await p.fill(`${dialogo} #val-msci-world`, '17.600');
  await p.click(`${dialogo} button[type=submit]`);
  const f = sumarDias(HOY, -1);
  const v = await hasta(async () => items(await doc(`cartera/valores/${f}.md`)), 'valores guardados');
  assert.ok(v.find((x) => x.activo === 'msci-world'));
});

test('ingesta de CONTEXTO: revisar, descartar una y guardar; el fichero pasa a procesados', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('conocimiento');
  assert.equal(await p.inputValue('[data-fuente-contexto="pizarra-andres-nov.txt"]'), 'pizarra', 'fuente sugerida por el nombre');
  await p.click('[data-accion=ingesta][data-fichero="pizarra-andres-nov.txt"]');
  await p.waitForSelector(`${dialogo} [data-propuesta="2"]`, { timeout: 10000 });
  await p.uncheck(`${dialogo} [data-cambio=ing-si][data-i="2"]`);
  await p.fill(`${dialogo} [data-entrada-texto=ing-campo][data-i="0"][data-campo=titulo]`, 'Las comisiones bajas importan (editada)');
  await p.click(`${dialogo} [data-accion=ing-guardar]`);
  const ruta = await hasta(async () => (await ficheros('conocimiento/pizarra')).find((f) => f.includes('pizarra-andres-nov')), 'notas guardadas');
  const d = await doc(`conocimiento/pizarra/${ruta}`);
  assert.deepEqual(bloques(d).map((b) => b.titulo), ['Las comisiones bajas importan (editada)', 'Espera tipos estables en 2027']);
  assert.equal(cabeceras(d).documento, 'pizarra-andres-nov.txt');
  await hasta(async () => (await fsp.readdir(join(raiz, 'CONTEXTO/procesados/pizarra'))).includes('pizarra-andres-nov.txt'), 'archivado');
  await assert.rejects(fsp.stat(join(raiz, 'CONTEXTO/pizarra-andres-nov.txt')));
  assert.ok(items(await doc('conocimiento/predicciones.md')).some((x) => x.texto.startsWith('el BCE no baja tipos')));
});

test('análisis: escenarios con rangos del código, guardado, predicción registrada y abogado del diablo', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('analisis');
  await p.waitForSelector('[data-cambio=an-tarea][value=escenarios-12m]');
  await p.check('[data-cambio=an-tarea][value=escenarios-12m]');
  await p.selectOption('#an-rol', 'gestor');
  await p.click('[data-accion=an-analizar]');
  await p.waitForFunction(() => /base[\s\S]*60 %/.test(document.querySelector('[data-resultado-analisis]')?.textContent ?? ''), null, { timeout: 10000 });
  const ruta = await hasta(async () => (await ficheros('analisis')).find((f) => f.startsWith(HOY) && f.includes('escenarios-12m') && f !== '2026-11-03-escenarios-12m.md'), 'análisis guardado');
  const d = await doc(`analisis/${ruta}`);
  assert.deepEqual([cabeceras(d).tarea, cabeceras(d).rol], ['escenarios-12m', 'gestor']);
  assert.match(textoSeccion(d, 'Cifras (código)'), /rango 12 m base/);
  const pred = items(await doc('conocimiento/predicciones.md')).find((x) => x.fuente === 'finhub' && x.análisis === ruta.slice(0, -3));
  assert.match(pred.medir, /^cartera twr .* en -?\d+…-?\d+$/);
  await p.click('[data-accion=an-diablo]');
  await p.waitForSelector('[data-diablo]', { timeout: 10000 });
  assert.match(await p.textContent('[data-diablo]'), /el pesimista pesa más/);
});

test('Rex: chat privado (con sesión), chat web (con aviso), renombrar y borrar; Explícame', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('rex');
  await p.fill('#pregunta-rex', '¿Cómo voy este mes?');
  await p.press('#pregunta-rex', 'Enter');
  const ruta = await hasta(async () => (await ficheros('chat/privado')).find((f) => f.includes('como-voy-este-mes')), 'conversación creada');
  const d = await hasta(async () => bloques(await doc(`chat/privado/${ruta}`)).length === 2 && doc(`chat/privado/${ruta}`), 'turno guardado');
  assert.match(bloques(d)[1].cuerpo, /tasa de ahorro/);
  assert.ok(cabeceras(d).sesion, 'guarda la sesión para reanudar');
  await p.fill('#pregunta-rex', '¿Y el mes pasado?');
  await p.press('#pregunta-rex', 'Enter');
  await hasta(async () => bloques(await doc(`chat/privado/${ruta}`)).length === 4, 'segundo turno');
  // modo web: aviso fijo y fichero aparte
  await p.click('[data-accion=chat-modo][data-id=web]');
  await p.waitForSelector('[data-aviso-web]');
  await p.fill('#pregunta-rex', '¿Qué es el TER?');
  await p.press('#pregunta-rex', 'Enter');
  const web = await hasta(async () => (await ficheros('chat/web')).find((f) => f.includes('que-es-el-ter')), 'chat web');
  await hasta(async () => bloques(await doc(`chat/web/${web}`)).length === 2, 'turno web');
  assert.equal(cabeceras(await doc(`chat/web/${web}`)).modo, 'web');
  // renombrar y borrar
  await p.click(`[data-accion=chat-ren][data-ruta="chat/web/${web}"]`);
  await p.fill(`[id="ren-chat/web/${web}"]`, 'Sobre el TER');
  await p.press(`[id="ren-chat/web/${web}"]`, 'Enter');
  await hasta(async () => (await doc(`chat/web/${web}`)).titulo === 'Conversación · Sobre el TER', 'renombrada');
  await p.click(`[data-accion=chat-borrar][data-ruta="chat/web/${web}"]`);
  await p.click(`${dialogo} [data-si]`);
  await hasta(async () => !(await ficheros('chat/web')).includes(web), 'borrada');
  // Explícame desde el Panel
  await ir('panel');
  await p.click('[data-accion=explicame][data-cifra="patrimonio neto"]');
  await p.waitForSelector('[data-accion=explicame-ir]');
  await p.click('[data-accion=explicame-ir]');
  const ex = await hasta(async () => (await ficheros('chat/privado')).find((f) => f.includes('explicame')), 'explícame');
  await hasta(async () => bloques(await doc(`chat/privado/${ex}`)).some((b) => /cuentas más cartera/.test(b.cuerpo)), 'respuesta de explícame');
});

test('Rex: ¿qué opinan?, pausa de 48 h, resumen semanal y quiz', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('rex');
  await p.click('[data-accion=rex-modo][data-modo=opinan]');
  await p.fill('#opinan-pregunta', '¿Está cara la bolsa americana?');
  await p.press('#opinan-pregunta', 'Enter');
  await p.waitForSelector('[data-opinan]', { timeout: 10000 });
  assert.match(await p.textContent('[data-opinan]'), /La pizarra de Andrés/);
  // pausa
  await p.click('[data-accion=rex-modo][data-modo=pausa]');
  await p.fill('#pausa-idea', 'Subir tecnología al 15 %');
  await p.click('form[data-form=pausa] button[type=submit]');
  const ruta = await hasta(async () => (await ficheros('decisiones')).find((f) => f.includes('subir-tecnologia')), 'pausa creada');
  const d = await doc(`decisiones/${ruta}`);
  assert.equal(cabeceras(d).estado, 'pausa-48h');
  assert.match(textoSeccion(d, 'Preguntas de Rex'), /^1\. ¿Qué tendría que pasar/);
  // resumen semanal
  await p.click('[data-accion=rex-modo][data-modo=semana]');
  await p.click('[data-accion=semana-hacer]');
  const s = `conocimiento/mundo/semana-${semanaIso(HOY).id}.md`;
  await hasta(async () => textoSeccion(await doc(s), 'Bancos centrales'), 'resumen semanal');
  // quiz
  await p.click('[data-accion=rex-modo][data-modo=quiz]');
  const antes = items(await doc('quiz/progreso.md')).length;
  await p.click('[data-accion=quiz-nuevo]');
  await p.waitForSelector('[data-quiz="0"]', { timeout: 10000 });
  await p.click('[data-accion=quiz-responder][data-i="0"][data-k="1"]');
  await hasta(async () => items(await doc('quiz/progreso.md')).length === antes + 1, 'respuesta del quiz');
  assert.equal(items(await doc('quiz/progreso.md')).at(-1).resultado, 'acierto');
});

test('Tu año «Rex dice» y revisión de la cartera base', async (t) => {
  if (!navegador) return t.skip('sin Chromium');
  await ir('tuano');
  await p.click('[data-accion=tuano-rex]');
  await hasta(async () => /convertido el ahorro/.test(textoSeccion(await doc(`tu-ano/${HOY.slice(0, 4)}.md`), 'Rex dice')), 'rex dice');
  await p.waitForSelector('[data-rex-dice]');
  await ir('cartera');
  await p.click('[data-accion=cartera-generar]');
  await p.check(`${dialogo} [data-cambio=generar-revisar]`);
  await p.click(`${dialogo} [data-accion=generar-crear]`);
  const borrador = await hasta(async () => (await ficheros('cartera/borradores')).find((f) => f.startsWith(HOY)), 'borrador');
  await hasta(async () => /^sí · analisis\//.test(cabeceras(await doc(`cartera/borradores/${borrador}`)).revisado_claude ?? ''), 'revisado');
  await p.click(`[data-accion=borrador-ver][data-ruta="cartera/borradores/${borrador}"]`);
  await p.waitForSelector(`${dialogo} [data-revision-base]`);
  assert.deepEqual(errores, []);
});
