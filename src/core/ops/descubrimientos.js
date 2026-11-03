// Operaciones de Descubrimientos (§4.9): crear desde la salida de «descubrir», nueva versión («¿qué ha
// cambiado?»), estado (seguir, descartar, archivar), encaje guardado en privado y precios de lo que sigues.
// Borrar = fichero.borrar (papelera). Todas con su inversa exacta (motor).
import { registrar, ErrorOp } from './motor.js';
import { seccionDe, nodoItem, validarEntidad } from './comun.js';
import { siguienteCorrelativo, validarIsin } from '../ids.js';
import { items, valores, fijarCabecera, fijarKv, fijarTexto, anadirBloque, bloques } from '../formato/motor.js';
import { TIPOS_DESCUBRIMIENTO, ESTADOS_DESCUBRIMIENTO } from '../formato/conocimiento.js';
import { esFecha, sumarDias, mesDe } from '../fechas.js';
import { parseMedir } from '../conocimiento.js';
import { formatearPorcentaje } from '../dinero.js';

const DIR = 'conocimiento/descubrimientos/';
const PREDICCIONES = 'conocimiento/predicciones.md';
const RE_EUROS = /\d[\d.,]*\s*(€|eur\b|euros)/i;
const una = (t, max = 1500) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const rutaDe = (id) => `${DIR}${id}.md`;

/** Vehículos → texto («nombre (ISIN …, TER 0,2 %, índice …) · …»); los de ISIN no válido se descartan con aviso. */
function textoVehiculos(vehiculos = [], aviso) {
  const ok = [];
  for (const v of vehiculos) {
    const isin = v.isin ? String(v.isin).trim().toUpperCase() : null;
    if (isin && !validarIsin(isin)) {
      aviso(`vehículo «${una(v.nombre, 80)}» descartado: ISIN ${isin} no válido`);
      continue;
    }
    const extra = [isin, Number.isFinite(v.ter) ? `TER ${formatearPorcentaje(Math.round(v.ter * 100))} %` : null, v.indice ? `índice ${una(v.indice, 120)}` : null].filter(Boolean);
    ok.push({ texto: `${una(v.nombre, 200).replace(/·/g, '-')}${extra.length ? ` (${extra.join(', ')})` : ''}`, isin });
  }
  return { texto: ok.map((x) => x.texto).join(' · ') || null, isins: ok.map((x) => x.isin).filter(Boolean) };
}

/** Citas: ids de nota tal cual; URLs como «web:URL» (sin comas: es una lista separada por comas). */
const textoCitas = (citas = []) => [...new Set(citas.map((c) => String(c).trim()).filter(Boolean).map((c) => (/^https?:\/\//i.test(c) ? `web:${c.replace(/,/g, '%2C')}` : c.replace(/,/g, ' '))))].slice(0, 20);

const textoAfirmaciones = (af = []) => af.map((a) => `[${a.tipo}] ${una(a.texto, 400).replace(/·/g, '-')}`).join(' · ') || null;

/** Comprueba lo que un descubrimiento público nunca puede llevar (§9.25) y monta los campos de una versión. */
function camposVersion(tx, d, { cambios = null } = {}) {
  for (const k of ['titulo', 'tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos']) if (RE_EUROS.test(String(d[k] ?? ''))) throw new ErrorOp('invalida', `«${k}» contiene un importe en euros: un descubrimiento es público y no lleva cifras tuyas`);
  const veh = textoVehiculos(d.vehiculos, tx.aviso);
  return {
    campos: { cambios: cambios ? una(cambios) : null, tesis: una(d.tesis), saldria_bien_si: una(d.saldria_bien_si, 800) || null, la_invalidaria: una(d.la_invalidaria, 800) || null, riesgos: una(d.riesgos, 1200) || null, vehiculos: veh.texto, citas: textoCitas(d.citas), afirmaciones: textoAfirmaciones(d.afirmaciones) },
    isins: veh.isins,
  };
}

/** Registra la predicción del descubrimiento (fuente finhub-descubrir, §4.9) y la enlaza. → id | null */
function registrarPrediccion(tx, id, prediccion) {
  if (!prediccion?.texto) return null;
  let medir = prediccion.medir ? una(prediccion.medir, 200) : null;
  if (medir && !parseMedir(medir)) {
    tx.aviso(`la predicción no se podrá resolver sola: «${medir}» no tiene el formato de medir`);
    medir = null;
  }
  const texto = `${una(prediccion.texto, 300)}${prediccion.horizonte ? ` (horizonte: ${una(prediccion.horizonte, 60)})` : ''}`;
  const pr = tx.sub('prediccion.crear', { fuente: 'finhub-descubrir', texto, medir }).id;
  const pd = tx.doc(PREDICCIONES);
  const n = seccionDe(pd, null).nodos.find((x) => x.k === 'item' && x.valor.id === pr);
  n.valor = validarEntidad(pd.spec.preambulo, { ...n.valor, descubrimiento: id }, 'la predicción');
  tx.tocar(PREDICCIONES);
  return pr;
}

function existentes(tx) {
  return tx.rutas(DIR).map((r) => r.slice(DIR.length, -3));
}

registrar({
  /** {sectores, filtros} · sectores del mapa de efectos y filtros del panel, juntos (un solo deshacer). */
  'descubrir.listas'(tx, { sectores = [], filtros = [] }) {
    tx.sub('ajustes.fijar', { clave: 'sectores_efectos', valor: sectores });
    tx.sub('ajustes.fijar', { clave: 'descubrir_filtros', valor: filtros });
  },

  /**
   * {fecha, origen, d: {titulo, tipo, postura, confianza, tesis, saldria_bien_si, la_invalidaria, riesgos,
   *  vehiculos: [{nombre, isin?, ter?, indice?}], citas, afirmaciones: [{tipo, texto}], prediccion?, revisar_en_dias}}
   * → {id, ruta, prediccion}
   */
  'descubrimiento.crear'(tx, { fecha, origen = null, d }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (!d || !una(d.titulo)) throw new ErrorOp('invalida', 'el descubrimiento necesita un título');
    if (!TIPOS_DESCUBRIMIENTO.includes(d.tipo)) throw new ErrorOp('invalida', `tipo «${d.tipo}» no válido`);
    const id = siguienteCorrelativo('D', existentes(tx), 3);
    const ruta = rutaDe(id);
    const { campos, isins } = camposVersion(tx, d);
    const doc = tx.doc(ruta, { crear: true });
    doc.titulo = `${id} · ${una(d.titulo, 140).replace(/·/g, '-')}`;
    const dias = Math.min(365, Math.max(7, Math.round(+d.revisar_en_dias || 30)));
    for (const [k, v] of [['tipo', d.tipo], ['estado', 'nuevo'], ['postura', d.postura], ['confianza', d.confianza], ['origen', origen ? una(origen, 200) : null], ['descubierto', fecha], ['revisar', sumarDias(fecha, dias)], ['referencia', isins[0] ?? null], ['vs', 'msci-world-nr-eur']]) if (v) fijarKv(doc, null, k, v);
    const pr = registrarPrediccion(tx, id, d.prediccion);
    anadirBloque(doc, { id: 'v1', titulo: fecha, campos: { ...campos, predicciones: pr ? [pr] : null } });
    tx.tocar(ruta);
    return { id, ruta, prediccion: pr };
  },

  /**
   * {id, fecha, d (como en crear), cambios, sinCambios?} · «¿qué ha cambiado?»: nueva `## vN` arriba.
   * Sin cambios relevantes: según ajustes.descubrir_sin_cambios, nueva versión «sin cambios relevantes»
   * (por defecto) o solo se aplaza la revisión. → {version | null}
   */
  'descubrimiento.version'(tx, { id, fecha, d = null, cambios = null, sinCambios = false }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    const ruta = rutaDe(id);
    if (!/^D-\d{3,}$/.test(id ?? '') || !tx.existe(ruta)) throw new ErrorOp('no_existe', `no existe el descubrimiento «${id}»`);
    const doc = tx.doc(ruta);
    const previas = bloques(doc, { incluirExcluidos: true });
    const ultima = previas[0];
    const dias = Math.min(365, Math.max(7, Math.round(+(d?.revisar_en_dias ?? 30))));
    if (valores(doc).estado !== 'descartado') fijarKv(doc, null, 'revisar', sumarDias(fecha, dias));
    const modo = tx.ctx.ajustes?.descubrir_sin_cambios ?? 'version';
    let campos;
    if (sinCambios || !d) {
      if (modo === 'nada') {
        tx.tocar(ruta);
        return { version: null };
      }
      campos = { ...Object.fromEntries(Object.entries(ultima?.campos ?? {}).filter(([k]) => k !== 'predicciones' && k !== 'cambios')), cambios: una(cambios) || 'sin cambios relevantes' };
    } else {
      const v = camposVersion(tx, d, { cambios: cambios || 'nueva revisión' });
      campos = v.campos;
      for (const [k, x] of [['postura', d.postura], ['confianza', d.confianza]]) if (x) fijarKv(doc, null, k, x);
      if (!valores(doc).referencia && v.isins[0]) fijarKv(doc, null, 'referencia', v.isins[0]);
      const pr = registrarPrediccion(tx, id, d.prediccion);
      if (pr) campos.predicciones = [pr];
    }
    const n = Math.max(0, ...previas.map((b) => (/^v\d+$/.test(b.id) ? +b.id.slice(1) : 0))) + 1;
    anadirBloque(doc, { id: `v${n}`, titulo: fecha, campos }, { alPrincipio: true });
    tx.tocar(ruta);
    return { version: `v${n}` };
  },

  /** {id, estado: nuevo|siguiendo|descartado|archivado} · al seguir sin fecha de revisión, a 30 días. */
  'descubrimiento.estado'(tx, { id, estado }) {
    if (!ESTADOS_DESCUBRIMIENTO.includes(estado)) throw new ErrorOp('invalida', `estado «${estado}» no válido`);
    const ruta = rutaDe(id);
    if (!/^D-\d{3,}$/.test(id ?? '') || !tx.existe(ruta)) throw new ErrorOp('no_existe', `no existe el descubrimiento «${id}»`);
    const doc = tx.doc(ruta);
    fijarKv(doc, null, 'estado', estado);
    if (estado === 'siguiendo' && !valores(doc).revisar) fijarKv(doc, null, 'revisar', sumarDias(tx.ctx.hoy, 30));
    tx.tocar(ruta);
  },

  /**
   * {fecha, descubrimiento, version, ejecucion, modelo, cifras: [{nombre, valor}], json: {ya_tienes, solapamiento,
   *  comentario_md, citas}, avisos} → {ruta} · en analisis/encajes/ (privado), nunca junto al descubrimiento.
   */
  'encaje.guardar'(tx, { fecha, descubrimiento, version = null, ejecucion = null, modelo = null, mezcla = [], cifras = [], json = {}, avisos = [] }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    if (!/^D-\d{3,}$/.test(descubrimiento ?? '') || !tx.existe(rutaDe(descubrimiento))) throw new ErrorOp('no_existe', `no existe el descubrimiento «${descubrimiento}»`);
    const base = `analisis/encajes/${descubrimiento}-${fecha}`;
    let ruta = `${base}.md`;
    for (let n = 2; tx.existe(ruta); n++) ruta = `${base}-${n}.md`;
    const d = tx.doc(rutaDe(descubrimiento));
    const doc = tx.doc(ruta, { crear: true });
    doc.titulo = `Encaje · ${d.titulo.split(' · ').slice(1).join(' · ') || descubrimiento}`;
    for (const [k, v] of [['fecha', fecha], ['descubrimiento', descubrimiento], ['version', version], ['mezcla', mezcla], ['ejecucion', ejecucion], ['modelo', modelo]]) if (v !== null && v !== undefined) fijarCabecera(doc, k, v);
    const sin = (t) => String(t ?? '').replace(/^#/gm, '\\#').trim();
    fijarTexto(doc, 'Cifras (código)', cifras.map((c) => `- ${c.nombre}: ${c.valor}`).join('\n') || '(ninguna)');
    if (json.ya_tienes) fijarTexto(doc, 'Ya tienes', sin(json.ya_tienes));
    if (json.solapamiento) fijarTexto(doc, 'Solapamiento', sin(json.solapamiento));
    fijarTexto(doc, 'Resultado', sin(json.comentario_md) || '(vacío)');
    if (json.citas?.length) fijarTexto(doc, 'Citas', json.citas.map((c) => `- ${sin(c)}`).join('\n'));
    if (avisos.length) fijarTexto(doc, 'Avisos', avisos.map((a) => `- ${sin(a)}`).join('\n'));
    tx.tocar(ruta);
    return { ruta };
  },

  /**
   * {precios: [{isin, valor, fecha, origen}]} · precios de lo que sigues (§4.9) → serie «<isin en minúsculas>»
   * en Datos, una fila por mes (el último precio del mes manda). Solo ISIN de descubrimientos que sigues.
   */
  'precios.seguimiento'(tx, { precios = [] }) {
    const seguidos = new Set(tx.rutas(DIR).map((r) => valores(tx.doc(r))).filter((v) => v.estado === 'siguiendo' && v.referencia).map((v) => v.referencia));
    const escritas = [];
    for (const p of precios) {
      if (!seguidos.has(p.isin)) throw new ErrorOp('invalida', `${p.isin} no es la referencia de un descubrimiento que sigues`);
      if (!esFecha(p.fecha) || !(p.valor > 0)) throw new ErrorOp('invalida', `precio no válido para ${p.isin}`);
      const id = p.isin.toLowerCase();
      const ruta = `conocimiento/datos/series/${id}.md`;
      const existe = tx.existe(ruta);
      const doc = tx.doc(ruta, { crear: true });
      if (!existe) {
        doc.titulo = `Serie · Precio ${p.isin} (seguimiento)`;
        for (const [k, v] of [['id', id], ['unidad', 'indice'], ['frecuencia', 'mensual'], ['divisa', p.divisa ?? 'EUR'], ['fuente', 'precios publicados (trabajo «precios», confirmados por ti)'], ['metodo', 'último precio publicado de cada mes'], ['sintetica', false]]) fijarCabecera(doc, k, v);
      }
      const sec = seccionDe(doc, 'Filas', { crear: true });
      const mes = mesDe(p.fecha);
      const valor = validarEntidad(doc.spec.secciones.Filas.items, { mes, valor: Math.round(p.valor * 1e6) }, `el precio de ${p.isin}`);
      const i = sec.nodos.findIndex((n) => n.k === 'item' && n.valor.mes === mes);
      const ultimo = items(doc, 'Filas').at(-1)?.mes ?? null;
      if (i >= 0) sec.nodos[i] = nodoItem(valor);
      else if (!ultimo || mes > ultimo) sec.nodos.push(nodoItem(valor));
      else throw new ErrorOp('invalida', `${p.isin}: ya hay precios posteriores a ${mes}`);
      fijarCabecera(doc, 'actualizado', tx.ctx.hoy);
      tx.tocar(ruta);
      escritas.push({ isin: p.isin, mes });
    }
    if (!escritas.length) throw new ErrorOp('invalida', 'no hay precios que guardar');
    return { series: escritas };
  },
});
