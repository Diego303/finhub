// Operaciones que aplican lo que propuso Claude, siempre con tu luz verde y con su inversa exacta (§0.3.11):
// pulso (fusión con lo que ya hay), ingesta (notas revisadas y predicciones), análisis, conversaciones de Rex,
// resumen semanal, quiz, «Rex dice» de Tu año y la marca de revisión de un borrador de cartera.
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, nodoItem, validarEntidad } from './comun.js';
import { slug, idNotaMundo, siguienteCorrelativo, normalizar } from '../ids.js';
import { bloques, items, cabeceras, fijarCabecera, fijarTexto, anadirBloque } from '../formato/motor.js';
import { escaparMensaje } from '../formato/textos.js';
import { esFecha, sumarDias, esHora } from '../fechas.js';
import { duplicadoDe, parseMedir } from '../conocimiento.js';

const MUNDO = 'conocimiento/mundo/';

/** Ids de nota de toda la carpeta (para correlativos). */
function idsNotas(tx) {
  const ids = new Set();
  for (const r of tx.rutas('conocimiento/')) {
    if (/\/_[^/]+\.md$/.test(r) || r.startsWith('conocimiento/datos/series/') || r.startsWith('conocimiento/descubrimientos/') || /\/semana-/.test(r) || r.endsWith('predicciones.md')) continue;
    const d = tx.doc(r);
    if (d.tipo === 'notas') for (const b of bloques(d, { incluirExcluidos: true })) ids.add(b.id);
  }
  return ids;
}

const cortoUrl = (u) => {
  let h = 0;
  for (const c of String(u)) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h.toString(36).padStart(6, '0').slice(-6);
};

/** Nombres de activos que devuelve Claude → ids de tus activos (por título o id); los demás se descartan. */
function idsActivos(tx, nombres = []) {
  if (!tx.existe('cartera/activos.md')) return [];
  const activos = bloques(tx.doc('cartera/activos.md'));
  const out = [];
  for (const n of nombres) {
    const k = normalizar(n);
    const a = activos.find((x) => normalizar(x.titulo) === k || x.id === slug(n) || (x.campos.isin && x.campos.isin === String(n).toUpperCase()));
    if (a && !out.includes(a.id)) out.push(a.id);
  }
  return out;
}

registrar({
  /**
   * {fecha, hora, notas: [salida de «pulso»]} · las añade a conocimiento/mundo/<fecha>.md. Lo repetido (misma URL
   * o título casi igual a ±1 día, también dentro del mismo pulso) se descarta. → {nuevas, repetidas, ids}
   */
  'pulso.aplicar'(tx, { fecha, hora, notas = [] }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (!esHora(hora)) throw new ErrorOp('invalida', `hora no válida «${hora}»`);
    const ruta = `${MUNDO}${fecha}.md`;
    const doc = tx.doc(ruta, { crear: true, ctxFormato: { fecha, fuente: 'mundo' } });
    if (!tx.texto(ruta)) {
      doc.titulo = `Mundo ${fecha}`;
      fijarCabecera(doc, 'fuente', 'mundo');
      fijarCabecera(doc, 'fecha', fecha);
    }
    const cercanas = [-1, 0, 1].flatMap((d) => {
      const r = `${MUNDO}${sumarDias(fecha, d)}.md`;
      return tx.existe(r) ? bloques(tx.doc(r)).map((b) => ({ titulo: b.titulo, fecha: b.campos.fecha, origen: b.campos.origen })) : [];
    });
    const ids = bloques(doc, { incluirExcluidos: true }).map((b) => b.id);
    const nuevas = [];
    let repetidas = 0;
    for (const n of notas) {
      const cand = { titulo: n.titulo, fecha: n.fecha, origen: `${n.origen.medio} · ${n.origen.url}` };
      if (duplicadoDe(cand, cercanas)) {
        repetidas++;
        continue;
      }
      const id = idNotaMundo(fecha, ids);
      ids.push(id);
      cercanas.push(cand);
      const campos = { editada: false, tipo: n.tipo, fecha: n.fecha, fuente: 'mundo', origen: cand.origen, temas: (n.temas ?? []).map(slug).filter((t) => t !== 'x'), activos: idsActivos(tx, n.activos), postura: n.postura ?? null, efectos: n.efectos && Object.keys(n.efectos).length ? n.efectos : null, caduca: sumarDias(fecha, 90), pulso: hora, hash: cortoUrl(n.origen.url) };
      anadirBloque(doc, { id, titulo: n.titulo.replace(/\n/g, ' '), campos: Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))), cuerpo: n.resumen });
      nuevas.push(id);
    }
    const pulsos = cabeceras(doc).pulsos ?? [];
    if (!pulsos.includes(hora)) fijarCabecera(doc, 'pulsos', [...pulsos, hora].sort());
    tx.tocar(ruta);
    return { nuevas: nuevas.length, repetidas, ids: nuevas, ruta };
  },

  /**
   * {fuente, fichero, fecha, notas: [revisadas], predicciones: [{texto, medir?, horizonte}]} · las notas de un
   * documento de CONTEXTO. Si ese documento ya se procesó, solo se añade lo nuevo y las notas que editaste no
   * se tocan (§9.11). → {ruta, nuevas, repetidas, predicciones}
   */
  'ingesta.aplicar'(tx, { fuente, fichero, fecha, notas = [], predicciones = [] }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (['mundo', 'datos', 'base'].includes(fuente)) throw new ErrorOp('invalida', `la ingesta no escribe en «${fuente}»`);
    const f = items(tx.doc('conocimiento/_fuentes.md')).find((x) => x.id === fuente);
    if (!f) throw new ErrorOp('no_existe', `no existe la fuente «${fuente}»`);
    const previa = tx.rutas(`conocimiento/${fuente}/`).find((r) => cabeceras(tx.doc(r)).documento === fichero);
    let ruta = previa;
    if (!ruta) {
      const base = `conocimiento/${fuente}/${fecha}-${slug(String(fichero).replace(/\.[a-z0-9]+$/i, ''))}`;
      ruta = `${base}.md`;
      for (let n = 2; tx.existe(ruta); n++) ruta = `${base}-${n}.md`;
    }
    const doc = tx.doc(ruta, { crear: true });
    if (!previa) {
      doc.titulo = `${f.nombre} · ${String(fichero).replace(/\.[a-z0-9]+$/i, '')}`;
      for (const [k, v] of [['fuente', fuente], ['fecha', fecha], ['origen', `CONTEXTO/${fichero}`], ['documento', fichero]]) fijarCabecera(doc, k, v);
    }
    const existentes = bloques(doc).map((b) => ({ titulo: b.titulo, fecha: b.campos.fecha, editada: b.campos.editada }));
    const todos = idsNotas(tx);
    const prefijo = f.prefijo ?? normalizar(f.id).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
    const nuevas = [];
    let repetidas = 0;
    for (const n of notas) {
      const cand = { titulo: n.titulo, fecha };
      const dup = duplicadoDe(cand, existentes);
      if (dup) {
        repetidas++;
        if (dup.editada) tx.aviso(`«${n.titulo}» ya estaba y la editaste: no se pisa`);
        continue;
      }
      const id = siguienteCorrelativo(prefijo, [...todos], 4);
      todos.add(id);
      existentes.push(cand);
      const campos = { editada: false, tipo: n.tipo, fecha, fuente, origen: `${fichero}${n.cita ? ` · ${n.cita}` : ''}`, temas: (n.temas ?? []).map(slug).filter((t) => t !== 'x'), activos: idsActivos(tx, n.activos), postura: n.postura ?? null };
      anadirBloque(doc, { id, titulo: n.titulo.replace(/\n/g, ' '), campos: Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))), cuerpo: n.resumen });
      nuevas.push(id);
    }
    if (nuevas.length) tx.tocar(ruta);
    const preds = [];
    for (const p of predicciones) {
      const medir = p.medir && parseMedir(p.medir) ? p.medir : null;
      preds.push(tx.sub('prediccion.crear', { fuente, texto: `${p.texto}${p.horizonte ? ` (${p.horizonte})` : ''}`, medir, nota: nuevas[0] ?? null }).id);
    }
    return { ruta, nuevas: nuevas.length, repetidas, predicciones: preds, ids: nuevas };
  },

  /**
   * {fecha, tarea, rol?, mezcla, ejecucion, modelo, cifras, resultado_md, json, avisos, prediccion?: {texto, medir}}
   * → analisis/AAAA-MM-DD-<tarea>.md (PRIVADO) y, si hay rango, la predicción de finhub. → {ruta, prediccion}
   */
  'analisis.guardar'(tx, { fecha, tarea, titulo = null, rol = null, mezcla = [], ejecucion = null, modelo = null, cifras = [], resultado_md = '', json = null, avisos = [], prediccion = null }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    const base = `analisis/${fecha}-${slug(tarea)}`;
    let ruta = `${base}.md`;
    for (let n = 2; tx.existe(ruta); n++) ruta = `${base}-${n}.md`;
    const doc = tx.doc(ruta, { crear: true });
    doc.titulo = `Análisis · ${String(titulo ?? tarea).replace(/\n/g, ' ')} · ${fecha}`;
    for (const [k, v] of [['fecha', fecha], ['tarea', slug(tarea)], ['rol', rol ? slug(rol) : null], ['mezcla', mezcla], ['ejecucion', ejecucion], ['modelo', modelo]]) if (v !== null && v !== undefined) fijarCabecera(doc, k, v);
    const sinAlmohadilla = (t) => String(t ?? '').replace(/^#/gm, '\\#');
    fijarTexto(doc, 'Cifras (código)', cifras.map((c) => `- ${c.nombre}: ${c.valor}`).join('\n') || '(ninguna)');
    fijarTexto(doc, 'Resultado', sinAlmohadilla(resultado_md) || '(vacío)');
    if (json) fijarTexto(doc, 'JSON', `\`\`\`json\n${JSON.stringify(json, null, 1)}\n\`\`\``);
    if (avisos.length) fijarTexto(doc, 'Avisos', avisos.map((a) => `- ${sinAlmohadilla(a)}`).join('\n'));
    tx.tocar(ruta);
    let id = null;
    if (prediccion?.texto) id = tx.sub('prediccion.crear', { fuente: 'finhub', texto: prediccion.texto, medir: prediccion.medir ?? null }).id;
    if (id) {
      const pd = tx.doc('conocimiento/predicciones.md');
      const n = seccionDe(pd, null).nodos.find((x) => x.k === 'item' && x.valor.id === id);
      n.valor = validarEntidad(pd.spec.preambulo, { ...n.valor, análisis: ruta.slice(9, -3) }, 'la predicción');
      tx.tocar('conocimiento/predicciones.md');
    }
    return { ruta, prediccion: id };
  },

  /** {modo: privado|web, titulo, mezcla, fecha} → {ruta} */
  'chat.crear'(tx, { modo, titulo, mezcla = [], fecha }) {
    if (!['privado', 'web'].includes(modo)) throw new ErrorOp('invalida', 'modo no válido');
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    const t = String(titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Conversación';
    const base = `chat/${modo}/${fecha}-${slug(t)}`;
    let ruta = `${base}.md`;
    for (let n = 2; tx.existe(ruta); n++) ruta = `${base}-${n}.md`;
    const doc = tx.doc(ruta, { crear: true, ctxFormato: { modo } });
    doc.titulo = `Conversación · ${t}`;
    for (const [k, v] of [['modo', modo], ['trabajo', modo === 'web' ? 'rex-web' : 'privado'], ['mezcla', mezcla], ['creada', fecha]]) fijarCabecera(doc, k, v);
    tx.tocar(ruta);
    return { ruta };
  },

  /** {ruta, tu, rex, cuando: 'AAAA-MM-DD HH:MM', sesion?} · añade una pregunta y su respuesta. */
  'chat.turno'(tx, { ruta, tu, rex, cuando, sesion = null }) {
    if (!/^chat\/(privado|web)\/[^/]+\.md$/.test(ruta ?? '')) throw new ErrorOp('invalida', 'conversación no válida');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cuando ?? '')) throw new ErrorOp('invalida', 'momento no válido');
    const doc = tx.doc(ruta);
    if (doc.conflictoModo) throw new ErrorOp('invalida', 'esta conversación tiene un conflicto de modo: no se reanuda (R1)');
    anadirBloque(doc, { id: 'Tú', titulo: cuando, cuerpo: escaparMensaje(String(tu).trim()) });
    anadirBloque(doc, { id: 'Rex', titulo: cuando, cuerpo: escaparMensaje(String(rex).trim()) });
    if (sesion) fijarCabecera(doc, 'sesion', sesion);
    tx.tocar(ruta);
  },

  /** {ruta, titulo} */
  'chat.renombrar'(tx, { ruta, titulo }) {
    const t = String(titulo ?? '').replace(/\s+/g, ' ').trim();
    if (!t) throw new ErrorOp('invalida', 'el título no puede quedar vacío');
    const doc = tx.doc(ruta);
    doc.titulo = `Conversación · ${t.slice(0, 100)}`;
    tx.tocar(ruta);
  },

  /** {semana: AAAA-Www, periodo: {desde, hasta}, pulsos, noticias, mezcla, secciones: [{tema, texto}]} */
  'semana.guardar'(tx, { semana, periodo, pulsos = 0, noticias = 0, mezcla = [], secciones = [] }) {
    if (!/^\d{4}-W\d{2}$/.test(semana ?? '')) throw new ErrorOp('invalida', 'semana no válida');
    if (!secciones.length) throw new ErrorOp('invalida', 'el resumen está vacío');
    const ruta = `${MUNDO}semana-${semana}.md`;
    const doc = tx.doc(ruta, { crear: true, ctxFormato: { semana } });
    doc.secciones = [doc.secciones[0]];
    doc.titulo = `Semana ${semana}`;
    for (const [k, v] of [['periodo', periodo], ['pulsos', pulsos], ['noticias', noticias], ['mezcla', mezcla]]) fijarCabecera(doc, k, v);
    for (const s of secciones) fijarTexto(doc, String(s.tema).replace(/[\n#]/g, ' ').trim(), String(s.texto).replace(/^#/gm, '\\#'));
    tx.tocar(ruta);
    return { ruta };
  },

  /** {fecha, nota, resultado: acierto|fallo} → quiz/progreso.md */
  'quiz.responder'(tx, { fecha, nota, resultado }) {
    const doc = tx.doc('quiz/progreso.md', { crear: true });
    const valor = validarEntidad(doc.spec.preambulo, { fecha, nota, resultado }, 'la respuesta');
    seccionDe(doc, null, { crear: true }).nodos.push(nodoItem(valor));
    tx.tocar('quiz/progreso.md');
  },

  /** {anio, texto} → tu-ano/AAAA.md · «## Rex dice» */
  'tuano.rexDice'(tx, { anio, texto }) {
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new ErrorOp('invalida', 'año no válido');
    const ruta = `tu-ano/${anio}.md`;
    const doc = tx.doc(ruta, { crear: true, ctxFormato: { anio } });
    fijarTexto(doc, 'Rex dice', String(texto).replace(/^#/gm, '\\#').trim());
    tx.tocar(ruta);
  },

  /** {ruta (borrador), analisis (ruta)} · marca el borrador como revisado por Claude, enlazando el comentario. */
  'borrador.revisado'(tx, { ruta, analisis }) {
    if (!/^cartera\/borradores\/[^/]+\.md$/.test(ruta ?? '') || !/^analisis\/[^/]+\.md$/.test(analisis ?? '')) throw new ErrorOp('invalida', 'rutas no válidas');
    fijarCabecera(tx.doc(ruta), 'revisado_claude', `sí · ${analisis}`);
    tx.tocar(ruta);
  },
});
