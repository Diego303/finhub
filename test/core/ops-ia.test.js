// F10: operaciones que aplican lo propuesto por Claude (siempre con tu luz verde y con inversa exacta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer } from '../../src/core/formato/index.js';
import { items, bloques, cabeceras, textoSeccion } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const HOY = '2026-11-03';
function mundo() {
  const fs = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
  return {
    fs,
    doc: (r) => leer(r, fs.get(r)),
    op(nombre, args) {
      const r = aplicarOp((x) => fs.get(x) ?? null, nombre, args, { formato: { diaInicio: 1 }, prng: crearPrng(1), hoy: HOY, hora: '10:00', rutas: [...fs.keys()] });
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? fs.delete(k) : fs.set(k, v));
      return r;
    },
  };
}
const falla = (fn, codigo, re) => assert.throws(fn, (e) => e instanceof ErrorOp && e.codigo === codigo && (!re || re.test(e.message)));
const nota = (titulo, url, extra = {}) => ({ titulo, tipo: 'hecho', fecha: HOY, origen: { medio: 'Medio', url }, temas: ['Bancos centrales'], activos: ['Fondo MSCI World', 'Algo que no tengo'], resumen: `Resumen de «${titulo}» con palabras propias.`, ...extra });

test('pulso: fusión con lo que ya hay (misma URL o título casi igual), ids M-AAMMDD-NN, hora en «pulsos»', () => {
  const m = mundo();
  const ruta = `conocimiento/mundo/${HOY}.md`;
  const antes = bloques(m.doc(ruta));
  const r = m.op('pulso.aplicar', { fecha: HOY, hora: '12:30', notas: [nota('Nueva noticia sobre el euro digital', 'https://a.example/1'), nota(antes[0].titulo, 'https://otra.example/9'), nota('Otra distinta', antes[1].campos.origen.split(' · ')[1]), nota('Nueva noticia sobre el euro digital y la banca', 'https://a.example/2')] });
  assert.deepEqual([r.resultado.nuevas, r.resultado.repetidas], [1, 3]);
  const d = m.doc(ruta);
  assert.equal(d.avisos.length, 0);
  const nueva = bloques(d).find((b) => b.id === r.resultado.ids[0]);
  assert.match(nueva.id, /^M-261103-\d{2}$/);
  assert.deepEqual([nueva.campos.temas, nueva.campos.activos, nueva.campos.pulso, nueva.campos.fuente], [['bancos-centrales'], ['msci-world'], '12:30', 'mundo']);
  assert.ok(cabeceras(d).pulsos.includes('12:30'));
  // un día sin pulso: se crea el fichero
  const otro = m.op('pulso.aplicar', { fecha: '2026-10-15', hora: '09:00', notas: [nota('Del día 15', 'https://b.example/1', { fecha: '2026-10-15' })] });
  assert.equal(otro.resultado.nuevas, 1);
  assert.deepEqual(cabeceras(m.doc('conocimiento/mundo/2026-10-15.md')).pulsos, ['09:00']);
  falla(() => m.op('pulso.aplicar', { fecha: 'ayer', hora: '09:00', notas: [] }), 'invalida');
});

test('ingesta: notas revisadas a su fuente con ids de su prefijo, predicciones; reingesta sin pisar lo editado', () => {
  const m = mundo();
  const notas = [{ titulo: 'Las comisiones bajas importan', tipo: 'consenso', temas: ['costes'], activos: [], resumen: 'El autor recuerda que el TER se come la rentabilidad a largo plazo.' }, { titulo: 'Espera tipos estables este año', tipo: 'opinión', temas: ['tipos'], activos: [], postura: 'neutral', resumen: 'Cree que el banco central no moverá los tipos este año.', cita: 'minuto 3' }];
  const r = m.op('ingesta.aplicar', { fuente: 'pizarra', fichero: 'pizarra-andres-nov.txt', fecha: HOY, notas, predicciones: [{ texto: 'el BCE no baja tipos', medir: 'bce-deposito nivel 2026-11-01→2026-12-31 >= 2', horizonte: 'fin de 2026' }, { texto: 'algo vago', horizonte: 'algún día' }] });
  const { ruta } = r.resultado;
  assert.equal(ruta, 'conocimiento/pizarra/2026-11-03-pizarra-andres-nov.md');
  const d = m.doc(ruta);
  assert.equal(d.avisos.length, 0);
  assert.equal(cabeceras(d).documento, 'pizarra-andres-nov.txt');
  assert.deepEqual(bloques(d).map((b) => b.id), ['P-0021', 'P-0022']);
  assert.equal(bloques(d)[1].campos.origen, 'pizarra-andres-nov.txt · minuto 3');
  const preds = items(m.doc('conocimiento/predicciones.md')).filter((p) => r.resultado.predicciones.includes(p.id));
  assert.deepEqual(preds.map((p) => [p.fuente, p.medir ?? null, p.nota]), [['pizarra', 'bce-deposito nivel 2026-11-01→2026-12-31 >= 2', 'P-0021'], ['pizarra', null, 'P-0021']]);
  // edito una y vuelvo a procesar el mismo documento: lo repetido no se añade ni se pisa, y se avisa
  m.op('nota.editar', { ruta, id: 'P-0021', cuerpo: 'Mi versión corregida.' });
  const re = m.op('ingesta.aplicar', { fuente: 'pizarra', fichero: 'pizarra-andres-nov.txt', fecha: HOY, notas: [...notas, { titulo: 'Una idea nueva del mismo vídeo', tipo: 'opinión', temas: [], activos: [], resumen: 'Algo que no estaba en la primera pasada.' }], predicciones: [] });
  assert.deepEqual([re.resultado.ruta, re.resultado.nuevas, re.resultado.repetidas], [ruta, 1, 2]);
  assert.ok(re.avisos.some((a) => /editaste: no se pisa/.test(a)));
  assert.equal(bloques(m.doc(ruta)).find((b) => b.id === 'P-0021').cuerpo, 'Mi versión corregida.');
  falla(() => m.op('ingesta.aplicar', { fuente: 'base', fichero: 'x', fecha: HOY, notas }), 'invalida');
});

test('análisis: fichero privado con cifras, resultado, JSON y avisos; su rango queda como predicción de finhub', () => {
  const m = mundo();
  const r = m.op('analisis.guardar', { fecha: HOY, tarea: 'escenarios-12m', rol: 'gestor', mezcla: ['base', 'mundo'], ejecucion: 'abc', modelo: 'claude-opus-5-5', cifras: [{ nombre: 'rango base', valor: '-1 % … +9 %' }], resultado_md: '## Esto no es una sección\nBase 60 %.', json: { escenarios: [] }, avisos: ['cifra no verificada: 7'], prediccion: { texto: 'cartera 12 m en [-1, +9] % (base)', medir: 'cartera twr 2026-11-03→2027-11-03 en -1…9' } });
  assert.equal(r.resultado.ruta, 'analisis/2026-11-03-escenarios-12m-2.md', 'ya había uno ese día');
  const d = m.doc(r.resultado.ruta);
  assert.equal(d.avisos.length, 0);
  assert.deepEqual([cabeceras(d).tarea, cabeceras(d).rol, cabeceras(d).mezcla], ['escenarios-12m', 'gestor', ['base', 'mundo']]);
  assert.match(textoSeccion(d, 'Resultado'), /^\\## Esto no es/);
  assert.match(textoSeccion(d, 'JSON'), /"escenarios"/);
  const p = items(m.doc('conocimiento/predicciones.md')).find((x) => x.id === r.resultado.prediccion);
  assert.deepEqual([p.fuente, p.análisis, p.estado], ['finhub', '2026-11-03-escenarios-12m-2', 'pendiente']);
});

test('conversaciones: crear, turnos (con «## » escapado), sesión, renombrar; semana, quiz, Tu año, borrador', () => {
  const m = mundo();
  const c = m.op('chat.crear', { modo: 'web', titulo: '¿Qué es el TER?', mezcla: ['base'], fecha: HOY }).resultado.ruta;
  assert.equal(c, 'chat/web/2026-11-03-que-es-el-ter.md');
  m.op('chat.turno', { ruta: c, tu: '¿Qué es el TER?', rex: 'Es el coste anual.\n## No es un turno', cuando: `${HOY} 10:05`, sesion: 's-1' });
  const d = m.doc(c);
  assert.equal(d.avisos.length, 0);
  assert.deepEqual(bloques(d).map((b) => b.id), ['Tú', 'Rex']);
  assert.equal(cabeceras(d).sesion, 's-1');
  assert.deepEqual([cabeceras(d).modo, cabeceras(d).trabajo], ['web', 'rex-web']);
  m.op('chat.renombrar', { ruta: c, titulo: 'El TER' });
  assert.equal(m.doc(c).titulo, 'Conversación · El TER');
  falla(() => m.op('chat.crear', { modo: 'otro', titulo: 'x', fecha: HOY }), 'invalida');
  // resumen semanal
  const s = m.op('semana.guardar', { semana: '2026-W45', periodo: { desde: '2026-11-02', hasta: '2026-11-08' }, pulsos: 3, noticias: 9, mezcla: ['mundo'], secciones: [{ tema: 'Bancos centrales', texto: 'El BCE mantiene. [M-261103-02]' }] }).resultado.ruta;
  const sd = m.doc(s);
  assert.equal(sd.avisos.length, 0);
  assert.equal(textoSeccion(sd, 'Bancos centrales'), 'El BCE mantiene. [M-261103-02]');
  // quiz
  m.op('quiz.responder', { fecha: HOY, nota: 'B-0021', resultado: 'acierto' });
  assert.equal(items(m.doc('quiz/progreso.md')).at(-1).nota, 'B-0021');
  falla(() => m.op('quiz.responder', { fecha: HOY, nota: 'B-0021', resultado: 'quizá' }), 'invalida');
  // Tu año
  m.op('tuano.rexDice', { anio: 2026, texto: 'Has convertido el ahorro en costumbre.' });
  assert.equal(textoSeccion(m.doc('tu-ano/2026.md'), 'Rex dice'), 'Has convertido el ahorro en costumbre.');
  // borrador revisado
  m.op('borrador.revisado', { ruta: 'cartera/borradores/2026-10-20-equilibrada.md', analisis: 'analisis/2026-11-03-revisar-cartera-base.md' });
  assert.equal(cabeceras(m.doc('cartera/borradores/2026-10-20-equilibrada.md')).revisado_claude, 'sí · analisis/2026-11-03-revisar-cartera-base.md');
});
