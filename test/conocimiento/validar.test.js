// Tests del validador y del auditor provisionales (pasada 3 y coherencia). Notas INVENTADAS en una carpeta temporal:
// solo prueban las reglas, no describen hechos reales.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validar } from '../../scripts/conocimiento/validar.mjs';
import { auditar } from '../../scripts/conocimiento/auditar.mjs';
import { jaccard, cortoUrl, copiaEn, cifrasAusentes } from '../../scripts/conocimiento/comprobar.mjs';
import { notas } from '../../src/core/formato/conocimiento.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const HOY = '2026-11-08';
/** Carpetas temporales de los tests: se borran todas al terminar. */
const creadas = [];
const temporal = (prefijo) => {
  const d = mkdtempSync(join(tmpdir(), prefijo));
  creadas.push(d);
  return d;
};
after(() => {
  for (const d of creadas) rmSync(d, { recursive: true, force: true });
});
const URL_B = 'https://www.ine.es/prensa/prueba-base.htm';
const URL_M = 'https://www.ecb.europa.eu/press/pr/date/2026/html/prueba.es.html';
const FUENTE_B = 'Página de prueba. El índice inventado de la prueba tenía 1,249 componentes y pesaba un 72.94 por ciento en la región imaginaria, según los datos de ejemplo del 30 de septiembre de 2026.';
const FUENTE_M = 'Comunicado de prueba del 15 de octubre de 2026. El consejo imaginario mantuvo el tipo de prueba en el 2,00 % y explicó sus razones con datos de ejemplo.';

const notaBase = (cambios = {}) => {
  const c = { id: 'B-22001', titulo: 'Componentes del índice inventado de la prueba', tipo: 'dato', fecha: '2026-09-30', origen: `INE · Nota de prueba · ${URL_B} (consultado 2026-11-08)`, temas: 'indices, indexacion', extra: '', texto: 'Según la página de prueba, el índice inventado reunía 1.249 componentes a 30 de septiembre de 2026.\nLa región imaginaria pesaba el 72,94 % del total en esa misma fecha.', ...cambios };
  return `## ${c.id} · ${c.titulo}\n- editada: no\n- tipo: ${c.tipo}\n- fecha: ${c.fecha}\n- fuente: base\n- origen: ${c.origen}\n- temas: ${c.temas}\n${c.extra}${c.texto}\n`;
};
const notaMundo = (cambios = {}) => {
  const c = { id: 'MR-261015-01', titulo: 'El consejo imaginario mantiene el tipo de prueba', tipo: 'hecho', fecha: '2026-10-15', origen: `BCE · Comunicado de prueba · ${URL_M} (consultado 2026-11-08)`, temas: 'bancos-centrales, bce, tipos, retrospectivo', postura: 'neutral', efectos: 'bancos:•', caduca: '2027-04-13', hash: cortoUrl(URL_M), texto: 'El consejo imaginario de la prueba dejó el tipo de prueba sin cambios en el 2,00 % el 15 de octubre de 2026.\nLo explicó con datos de ejemplo.', ...cambios };
  return `## ${c.id} · ${c.titulo}\n- editada: no\n- tipo: ${c.tipo}\n- fecha: ${c.fecha}\n- fuente: mundo\n- origen: ${c.origen}\n- temas: ${c.temas}\n- postura: ${c.postura}\n- efectos: ${c.efectos}\n- caduca: ${c.caduca}\n- hash: ${c.hash}\n${c.texto}\n`;
};

/** Carpeta temporal con semilla, evidencias y caché de prueba. */
function montar({ base = notaBase(), mundo = notaMundo(), evidencias, fuenteB = FUENTE_B, fuenteM = FUENTE_M } = {}) {
  const r = temporal('validar-');
  for (const d of ['semilla/base', 'semilla/mundo', 'docs/conocimiento/evidencias', '.cache/conocimiento/paginas']) mkdirSync(join(r, d), { recursive: true });
  writeFileSync(join(r, 'semilla/base/inversion-indexada.md'), `# Base · Inversión indexada\nesquema: 1\nfuente: base\n${base}`);
  if (mundo) writeFileSync(join(r, 'semilla/mundo/2026-10-15.md'), `# Mundo 2026-10-15\nesquema: 1\nfuente: mundo\nfecha: 2026-10-15\n${mundo}`);
  const pag = join(r, '.cache/conocimiento/paginas');
  const guardar = (txt) => {
    const sha = createHash('sha256').update(txt).digest('hex');
    writeFileSync(join(pag, `${sha}.gz`), gzipSync(Buffer.from(txt)));
    writeFileSync(join(pag, `${sha}.txt.gz`), gzipSync(Buffer.from(txt)));
    return sha;
  };
  const shaB = guardar(fuenteB);
  const shaM = guardar(fuenteM);
  const p = { veredicto: 'confirmada', por: 'autor', fecha: HOY };
  const q = { veredicto: 'confirmada', por: 'verificador', fecha: HOY };
  const ev = evidencias ?? [
    { nota: 'B-22001', afirmacion: 'El índice de prueba tenía 1.249 componentes.', cifras: ['1.249'], url: URL_B, medio: 'INE', publicada: '2026-10-01', consultada: HOY, apartado: 'Tabla', pagina: shaB, p1: p, p2: q, p3: null },
    { nota: 'MR-261015-01', afirmacion: 'El tipo de prueba siguió en el 2,00 %.', cifras: ['2,00 %'], url: URL_M, medio: 'BCE', publicada: '2026-10-15', consultada: HOY, apartado: 'Decisión', pagina: shaM, p1: p, p2: q, p3: null },
  ];
  writeFileSync(join(r, 'docs/conocimiento/evidencias/prueba.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return { raiz: r, paginas: pag, shaB, shaM };
}
const correr = (m) => validar({ raiz: m.raiz, paginas: m.paginas, hoy: HOY });
const reglas = (r) => r.fallos.filter((f) => f.nivel === 'error').map((f) => f.regla);

test('una nota de Base y una de Mundo correctas pasan sin errores', () => {
  const r = correr(montar());
  assert.deepEqual(r.fallos.filter((f) => f.nivel === 'error'), []);
  assert.equal(r.resumen.notas, 2);
});

test('formato: temas fuera de taxonomía, orden de campos, campos prohibidos, líneas de texto', () => {
  assert.ok(reglas(correr(montar({ base: notaBase({ temas: 'indices, sp500' }) }))).includes('temas.taxonomia'));
  assert.ok(reglas(correr(montar({ base: notaBase({ temas: 'indices, indices' }) }))).includes('temas.repetido'));
  assert.ok(reglas(correr(montar({ base: notaBase({ extra: '- activos: msci-world\n' }) }))).includes('campos.prohibido'));
  assert.ok(reglas(correr(montar({ base: notaBase({ texto: 'Una sola línea con 1.249 componentes y 72,94 % a 30 de septiembre de 2026.' }) }))).includes('texto.lineas'));
  assert.ok(reglas(correr(montar({ base: notaBase({ tipo: 'opinión' }) }))).includes('tipo.base'));
  assert.ok(reglas(correr(montar({ base: notaBase({ id: 'B-1199' }) }))).includes('id.bloque'));
  const desordenada = notaBase().replace('- tipo: dato\n- fecha: 2026-09-30\n', '- fecha: 2026-09-30\n- tipo: dato\n');
  assert.ok(reglas(correr(montar({ base: desordenada }))).includes('campos.orden'));
});

test('origen: https, dominio de la lista, formato y fecha de consulta', () => {
  assert.ok(reglas(correr(montar({ base: notaBase({ origen: 'Blog · Algo · https://www.blog-de-afiliados.example/x (consultado 2026-11-08)' }) }))).includes('origen.dominio'));
  assert.ok(reglas(correr(montar({ base: notaBase({ origen: `INE · Nota · ${URL_B.replace('https', 'http')} (consultado 2026-11-08)` }) }))).includes('origen.https'));
  assert.ok(reglas(correr(montar({ base: notaBase({ origen: `INE ${URL_B}` }) }))).includes('origen.formato'));
  assert.ok(reglas(correr(montar({ base: notaBase({ origen: `INE · Nota · ${URL_B} (consultado 2026-12-01)` }) }))).includes('origen.consultado'));
  // con la regla nueva de la guardia, una ruta larga normal pasa y un trozo base64 sigue parándose
  const ruta = 'https://www.cnmv.es/DocPortal/Publicaciones/Guias/Guia-Fondos-Inversion/Prueba-Muy-Larga-2026.pdf';
  assert.ok(!reglas(correr(montar({ base: notaBase({ origen: `CNMV · Guía · ${ruta} (consultado 2026-11-08)` }) }))).includes('origen.guardia-url'));
  const trozo = `https://www.cnmv.es/x?d=${'QUJD'.repeat(15)}`;
  assert.ok(reglas(correr(montar({ base: notaBase({ origen: `CNMV · Guía · ${trozo} (consultado 2026-11-08)` }) }))).includes('origen.guardia-url'));
});

test('normativa: verificar, caduca 31-12 y norma BOE-A', () => {
  const r = reglas(correr(montar({ base: notaBase({ temas: 'fiscalidad, irpf' }) })));
  assert.ok(r.includes('normativa.verificar') && r.includes('normativa.boe'));
  const r2 = reglas(correr(montar({ base: notaBase({ temas: 'fiscalidad, irpf', extra: '- verificar: 2026\n' }) })));
  assert.ok(r2.includes('normativa.caduca'));
  assert.ok(reglas(correr(montar({ base: notaBase({ extra: '- caduca: 2026-12-31\n' }) }))).includes('caduca.base'));
});

test('vocabulario prohibido, y la negación de «garantizado» no cuenta', () => {
  const t = (x) => reglas(correr(montar({ base: notaBase({ texto: `${x}\nSegún la página de prueba, 1.249 componentes y el 72,94 % a 30 de septiembre de 2026.` }) })));
  assert.ok(t('Quien compra este índice inventado tiene mucho de la región.').includes('vocabulario'));
  assert.ok(t('Es buen momento para entrar en el índice inventado.').includes('vocabulario'));
  assert.ok(t('Ofrece una rentabilidad garantizada en el índice inventado.').includes('vocabulario'));
  assert.ok(!t('La rentabilidad del índice inventado no está garantizada.').includes('vocabulario'));
  assert.ok(!t('Las participaciones se adquieren a valor liquidativo.').includes('vocabulario'));
});

test('Mundo: id del día, retrospectivo, caduca por tipo, hash, efectos y fichero futuro', () => {
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ id: 'MR-261016-01' }) }))).includes('id.bloque'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ temas: 'bancos-centrales, bce' }) }))).includes('temas.retrospectivo'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ caduca: '2027-01-13' }) }))).includes('caduca.tipo'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ hash: 'abc123' }) }))).includes('hash'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ efectos: 'bancos:▲, aerolineas:▼' }) }))).includes('efectos'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ temas: 'bce, retrospectivo, resumen-mensual', caduca: '2027-10-15' }) }))).includes('resumen.fecha'));
});

test('evidencias: faltan, sin confirmar, mismo verificador, fuera de caché y D+1 en retrospectiva', () => {
  const m = montar();
  const ev = readFileSync(join(m.raiz, 'docs/conocimiento/evidencias/prueba.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const con = (f) => {
    const x = montar({ evidencias: f(structuredClone(ev)) });
    return reglas(correr(x));
  };
  assert.ok(con((e) => e.slice(1)).includes('evidencias.falta'));
  assert.ok(con((e) => (e[0].p2.veredicto = 'matiz', e)).includes('evidencias.p2'));
  assert.ok(con((e) => (e[0].p2.por = 'autor', e)).includes('evidencias.p2'));
  assert.ok(con((e) => (e[0].pagina = 'f'.repeat(64), e)).includes('evidencias.cache'));
  assert.ok(con((e) => (e[1].publicada = '2026-10-17', e)).includes('retro.d1'));
  assert.ok(!con((e) => (e[1].publicada = '2026-10-16', e)).includes('retro.d1'));
  assert.ok(con((e) => (e[1].publicada = null, e)).includes('retro.d1'));
});

test('copia y cifras contra la fuente en caché', () => {
  const copiada = 'Comunicado de prueba. El consejo imaginario mantuvo el tipo de prueba en el 2,00 % y explicó sus razones con datos de ejemplo.\nOtra línea.';
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ texto: copiada }) }))).includes('copia'));
  assert.ok(reglas(correr(montar({ mundo: notaMundo({ texto: 'El consejo imaginario dejó el tipo en el 2,25 % el 15 de octubre de 2026.\nLo explicó con datos de ejemplo.' }) }))).includes('cifras'));
  // redondeo a un decimal: 72,94 en la fuente vale para 72,9 en la nota; en enteros no se redondea
  assert.deepEqual(cifrasAusentes('pesaba el 72,9 %', ['72.94 per cent']), []);
  assert.deepEqual(cifrasAusentes('pesaba el 73 %', ['72.94 per cent']), ['73']);
  assert.deepEqual(cifrasAusentes('1.249 componentes', ['1,249 constituents']), []);
  assert.equal(copiaEn('El Banco Central dijo algo corto', 'otro texto'), null);
});

test('duplicados: la regla de la app (Jaccard ≥ 0,6) y una URL por nota en Mundo', () => {
  const dos = notaMundo() + notaMundo({ id: 'MR-261015-02', titulo: 'El consejo imaginario mantiene el tipo de la prueba', hash: cortoUrl(URL_M) });
  const r = reglas(correr(montar({ mundo: dos })));
  assert.ok(r.includes('duplicado.url') && r.includes('duplicado.titulo') && r.includes('hash.repetido'));
});

test('las reglas copiadas de la app dan las cifras del inventario del maestro (§6)', () => {
  // títulos originales del zip (en la P2 se cambian para deshacer estos pares)
  assert.equal(jaccard('Peso por países del MSCI World', 'Peso por sectores del MSCI World').toFixed(2), '0.71');
  assert.equal(jaccard('Qué es el MSCI World', 'Qué es el MSCI World Small Cap').toFixed(2), '0.60');
  assert.equal(jaccard('Países del MSCI Emerging Markets', 'Concentración del MSCI Emerging Markets').toFixed(2), '0.67');
  assert.equal(cortoUrl('https://example.com/a').length, 6);
});

test('los parsers dan ida y vuelta exacta en toda la Base actual (comprueba los módulos reconstruidos)', () => {
  for (const f of readdirSync(join(RAIZ, 'semilla/base')).filter((x) => x.endsWith('.md'))) {
    const texto = readFileSync(join(RAIZ, 'semilla/base', f), 'utf8');
    const doc = notas.parsear(texto, { fuente: 'base' });
    assert.equal(notas.serializar(doc), texto, f);
  }
});

test('auditor: decisiones encadenadas, saltos imposibles y conceptos con dos cifras', () => {
  const nota = (id, fecha, texto, temas = 'bancos-centrales, bce, tipos, retrospectivo') => {
    const u = `https://www.ecb.europa.eu/press/pr/date/2026/html/${id}.html`;
    return `## ${id} · Decisión de prueba número ${id}\n- editada: no\n- tipo: hecho\n- fecha: ${fecha}\n- fuente: mundo\n- origen: BCE · Prueba · ${u} (consultado 2026-11-08)\n- temas: ${temas}\n- caduca: 2027-04-13\n- hash: ${cortoUrl(u)}\n${texto}\nSegunda línea.\n`;
  };
  const r = temporal('auditar-');
  mkdirSync(join(r, 'semilla/mundo'), { recursive: true });
  mkdirSync(join(r, 'semilla/base'), { recursive: true });
  writeFileSync(join(r, 'semilla/mundo/2026-03-12.md'), `# Mundo 2026-03-12\nesquema: 1\nfuente: mundo\nfecha: 2026-03-12\n${nota('MR-260312-01', '2026-03-12', 'El BCE bajó el tipo de depósito del 2,50 % al 2,25 %.')}`);
  writeFileSync(join(r, 'semilla/mundo/2026-04-17.md'), `# Mundo 2026-04-17\nesquema: 1\nfuente: mundo\nfecha: 2026-04-17\n${nota('MR-260417-01', '2026-04-17', 'El BCE bajó el tipo de depósito del 2,50 % al 2,00 %.')}`);
  writeFileSync(join(r, 'semilla/mundo/2026-06-05.md'), `# Mundo 2026-06-05\nesquema: 1\nfuente: mundo\nfecha: 2026-06-05\n${nota('MR-260605-01', '2026-06-05', 'El BCE subió el tipo de depósito del 2,00 % al 3,50 %.')}`);
  const a = auditar({ raiz: r });
  const rs = a.revisar.map((x) => x.regla);
  assert.ok(rs.includes('serie.hueco'), 'la segunda decisión no parte del tipo anterior');
  assert.ok(rs.includes('serie.salto'), '150 pb de golpe');
});
