// Trabajos de Claude en el servidor (§8): monta la entrada con tus datos (el servidor es el único que los
// lee), ejecuta el motor aislado, avisa del progreso por SSE, guarda registro y cuarentena en .finhub/ y
// deja el resultado como PROPUESTA: nada se escribe en tus datos sin una operación que lances tú.
import { readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { ejecutarTrabajo } from '../claude/motor.js';
import { trabajo as trabajoDe, resumenTrabajos } from '../claude/trabajos/index.js';
import { Sesiones, leerRegistro } from '../claude/registro.js';
import { carpetasLocales } from './rutas.js';
import { construirModelo } from '../core/modelo.js';
import { parseManifiesto, revisarFilas } from '../core/datos.js';
import { leerTareas, leerRoles } from '../claude/tareas.js';
import { rangos12m, filasCartera, historicoMezcla, componentesDe } from '../core/herramientas.js';
import { tuAnio, tarjetas } from '../core/tu-ano.js';
import { items, textoSeccion } from '../core/formato/motor.js';
import { limitesSemana } from '../core/fechas.js';
import { readdirSync } from 'node:fs';
import { fechaLocal, mesDe, sumarDias, esFecha } from '../core/fechas.js';
import { isinsSeguidos } from '../core/descubrimientos.js';
import { textoInforme } from '../claude/trabajos/encaje.js';
import { MODOS_DESCUBRIR, PROFUNDIDAD } from '../claude/trabajos/descubrir.js';

const RAIZ_REPO = join(import.meta.dirname, '..', '..');
function temasValidos(temas = []) {
  if (!Array.isArray(temas) || temas.some((t) => typeof t !== 'string')) throw Object.assign(new Error('temas no válidos'), { estado: 400 });
  return temas.slice(0, 20).map((t) => t.slice(0, 60));
}
const CONSERVAR = 20; // ejecuciones terminadas que se recuerdan en memoria

export class ServicioClaude {
  /** app: la App (almacén, difusor, ajustes) · comando: ['claude'] o el falso en los tests */
  constructor(app, { comando = ['claude'] } = {}) {
    this.app = app;
    this.comando = comando;
    const loc = carpetasLocales(app.env);
    this.sandboxBase = join(loc.cache, 'sandbox');
    this.sesiones = new Sesiones(join(loc.datos, 'sesiones.json'));
    this.ejecuciones = new Map();
  }

  servicio() {
    const a = this.app.almacen;
    return { leer: (rel) => a.leerServicio(rel), escribir: (rel, t) => a.escribirServicio(rel, t) };
  }

  modelo() {
    const ficheros = {};
    for (const e of this.app.almacen.textos('')) if (e.legible) ficheros[e.ruta] = { texto: e.texto, version: e.version };
    return construirModelo(ficheros);
  }

  /** Tareas y roles: los del repo (semilla/) y los de tu carpeta, que mandan si se llaman igual. */
  tareasYRoles() {
    const semilla = (tipo) => {
      const dir = join(RAIZ_REPO, 'semilla', tipo);
      return Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => [n, readFileSync(join(dir, n), 'utf8')]));
    };
    const carpeta = (tipo) => Object.fromEntries([...this.app.almacen.textos(`${tipo}/`)].filter((e) => e.legible).map((e) => [e.ruta.slice(tipo.length + 1), e.texto]));
    return { tareas: leerTareas({ semilla: semilla('tareas'), carpeta: carpeta('tareas') }), roles: leerRoles({ semilla: semilla('roles'), carpeta: carpeta('roles') }) };
  }

  /** Texto de un fichero de CONTEXTO (la bandeja de la carpeta), solo para la ingesta. */
  async leerContexto(fichero) {
    if (!/^[^/\\]+$/.test(fichero ?? '') || /^\.+$/.test(fichero) || fichero.startsWith('.')) throw Object.assign(new Error('fichero de CONTEXTO no válido'), { estado: 400 });
    if (!this.app.almacen.otros.contexto.includes(`CONTEXTO/${fichero}`)) throw Object.assign(new Error(`no está en CONTEXTO: ${fichero}`), { estado: 404 });
    return this.app.almacen.fs.readFile(join(this.app.almacen.raiz, 'CONTEXTO', fichero), 'utf8');
  }

  /** Mueve un fichero procesado a CONTEXTO/procesados/<fuente>/ (no se borra nada). */
  async archivarContexto(fichero, fuente) {
    if (!/^[^/\\]+$/.test(fichero ?? '') || /^\.+$/.test(fichero) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fuente ?? '')) throw Object.assign(new Error('datos no válidos'), { estado: 400 });
    const a = this.app.almacen;
    const origen = join(a.raiz, 'CONTEXTO', fichero);
    const dir = join(a.raiz, 'CONTEXTO', 'procesados', fuente);
    await a.fs.mkdir(dir, { recursive: true });
    let destino = join(dir, fichero);
    for (let n = 2; await a.fs.stat(destino).then(() => true, () => false); n++) destino = join(dir, fichero.replace(/(\.[^.]+)?$/, `-${n}$1`));
    await a.fs.rename(origen, destino);
    await a.barrer();
    return { destino: destino.slice(a.raiz.length + 1) };
  }

  manifiesto() {
    return parseManifiesto(readFileSync(join(RAIZ_REPO, 'semilla', 'datos-manifiesto.md'), 'utf8'));
  }

  /** Estado de las series del manifiesto en tu carpeta (para el trabajo «datos»). */
  estadoDatos(modelo = this.modelo()) {
    return this.manifiesto().map((s) => {
      const existente = modelo.series.find((x) => x.id === s.id);
      const filas = existente ? modelo.serie(s.id) : [];
      return { ...s, existe: !!existente, sintetica: !!existente?.sintetica, ultimo: filas.at(-1)?.mes ?? null, ultimoValor: filas.at(-1)?.valor ?? null, primero: filas[0]?.mes ?? null, primeroValor: filas[0]?.valor ?? null, filas: filas.length, actualizado: existente?.actualizado ?? null };
    });
  }

  /** Parámetros que monta el servidor (el navegador solo elige qué). */
  parametros(id, params, modelo) {
    if (id === 'datos') {
      const pedidas = new Set(params.ids ?? []);
      const series = this.estadoDatos(modelo).filter((s) => pedidas.has(s.id) && !s.sintetica);
      if (!series.length) throw Object.assign(new Error('elige al menos una serie que no sea sintética'), { estado: 400 });
      return { series };
    }
    if (id === 'privado' || id === 'conocimiento') return this.parametrosTarea(id, params, modelo);
    if (id === 'rex-web') {
      if (typeof params.pregunta !== 'string' || !params.pregunta.trim()) throw Object.assign(new Error('escribe la pregunta'), { estado: 400 });
      return { pregunta: params.pregunta.slice(0, 8000), temas: temasValidos(params.temas) };
    }
    if (id === 'pulso') {
      if (!esFecha(params.fecha) || params.fecha > fechaLocal()) throw Object.assign(new Error('elige un día que ya haya pasado o el de hoy'), { estado: 400 });
      temasValidos(params.temas);
      const activos = params.misActivos ? modelo.activos.filter((a) => !a.campos.archivado).map((a) => a.titulo) : null;
      return { fecha: params.fecha, temas: temasValidos(params.temas), activos };
    }
    if (id === 'precios' && params.seguimiento) {
      const activos = isinsSeguidos(modelo);
      if (!activos.length) throw Object.assign(new Error('no sigues ningún descubrimiento con ISIN de referencia'), { estado: 400 });
      return { activos };
    }
    if (id === 'descubrir') return this.parametrosDescubrir(params, modelo);
    if (id === 'encaje') {
      const d = modelo.descubrimientos.find((x) => x.id === params.descubrimiento);
      if (!d) throw Object.assign(new Error('elige un descubrimiento'), { estado: 400 });
      const de = params.de === 'aportaciones' || (typeof params.de === 'string' && params.de.startsWith('activo:') && modelo.activos.some((a) => `activo:${a.id}` === params.de)) ? params.de : 'todo';
      const t = this.tareasYRoles().tareas.get('encaje');
      return { descubrimiento: d.id, pct: Math.min(50, Math.max(0, Number(params.pct) || 5)), de, tarea: t?.trabajo === 'encaje' ? { id: t.id, instrucciones: t.instrucciones } : null };
    }
    if (id === 'precios') {
      const ids = new Set(params.ids ?? []);
      const activos = modelo.activos.filter((a) => a.campos.isin && !a.campos.archivado && (!ids.size || ids.has(a.id))).map((a) => ({ isin: a.campos.isin, nombre: a.titulo, divisa: a.campos.divisa ?? 'EUR' }));
      if (!activos.length) throw Object.assign(new Error('ningún activo con ISIN'), { estado: 400 });
      return { activos };
    }
    return params;
  }

  /** Descubrir (§5 Descubrimientos): modo, periodo, tema, filtros, nombres de clases (si los activas) y profundidad. */
  parametrosDescubrir(params, modelo) {
    const hoy = fechaLocal();
    const modo = MODOS_DESCUBRIR.includes(params.modo) ? params.modo : 'libre';
    const t = this.tareasYRoles().tareas.get(`descubrir-${modo}`);
    let anterior = null;
    if (modo === 'seguimiento') {
      const d = modelo.descubrimientos.find((x) => x.id === params.id);
      if (!d || !d.versiones.length) throw Object.assign(new Error('elige el descubrimiento que quieres revisar'), { estado: 400 });
      anterior = { id: d.id, titulo: d.titulo, version: d.versiones[0].id, fecha: d.versiones[0].titulo, texto: textoInforme(d) };
    }
    const DIAS = { hoy: 0, '1s': 7, '1m': 30, '3m': 91 };
    let desde = null;
    let hasta = null;
    if (params.periodo === 'rango') {
      if (!esFecha(params.desde) || !esFecha(params.hasta) || params.desde > params.hasta) throw Object.assign(new Error('el rango de fechas no es válido'), { estado: 400 });
      ({ desde, hasta } = params);
    } else if (params.periodo in DIAS) [desde, hasta] = [sumarDias(hoy, -DIAS[params.periodo]), hoy];
    if (modo === 'libre' && !String(params.tema ?? '').trim()) throw Object.assign(new Error('escribe la pregunta'), { estado: 400 });
    const filtros = (Array.isArray(params.filtros) ? params.filtros : []).filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 60)).slice(0, 10);
    return { modo, desde, hasta, tema: String(params.tema ?? '').slice(0, 2000), filtros, clases: params.misClases ? modelo.clases.map((c) => c.nombre) : null, profundidad: params.profundidad in PROFUNDIDAD ? params.profundidad : 'normal', tarea: t?.trabajo === 'descubrir' ? { id: t.id, instrucciones: t.instrucciones } : null, anterior };
  }

  /** Tarea, rol y contexto extra de privado y conocimiento (los monta el servidor con tus datos). */
  parametrosTarea(id, params, modelo) {
    const hoy = fechaLocal();
    const { tareas, roles } = this.tareasYRoles();
    const t = params.tarea ? tareas.get(params.tarea) : null;
    if (params.tarea && (!t || t.trabajo !== id)) throw Object.assign(new Error(`la tarea «${params.tarea}» no es del trabajo «${id}»`), { estado: 400 });
    const r = params.rol ? roles.get(params.rol) : null;
    if (params.rol && (!r || r.trabajo !== id)) throw Object.assign(new Error(`el rol «${params.rol}» no es del trabajo «${id}»`), { estado: 400 });
    // R1 (§0.1): borradores, análisis e ideas son tuyos: solo los recibe el trabajo «privado»
    if (id !== 'privado' && (params.borrador || params.analisis || params.idea)) throw Object.assign(new Error('eso son datos tuyos: solo los puede recibir el trabajo «privado»'), { estado: 400 });
    const p = { pregunta: params.pregunta ?? null, fuentes: Array.isArray(params.fuentes) ? params.fuentes : null, temas: params.temas ?? [], tarea: t ? { id: t.id, instrucciones: t.instrucciones, esquema: t.esquema } : null, rol: r ? { texto: r.texto } : null, cifrasExtra: [], bloquesExtra: [] };
    const pct = (pb) => `${pb > 0 ? '+' : ''}${(pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
    if (t?.rangos) {
      const rg = rangos12m(historicoMezcla(componentesDe(filasCartera(modelo), modelo.clases), (x) => modelo.serie(x)));
      if (!rg.error) p.cifrasExtra.push({ nombre: 'rango 12 m pesimista (p5–p25)', valor: `${pct(rg.pesimista[0])} … ${pct(rg.pesimista[1])}` }, { nombre: 'rango 12 m base (p25–p75)', valor: `${pct(rg.base[0])} … ${pct(rg.base[1])}` }, { nombre: 'rango 12 m optimista (p75–p95)', valor: `${pct(rg.optimista[0])} … ${pct(rg.optimista[1])}` }, { nombre: 'peor caso histórico a 12 m', valor: rg.aviso ? `${pct(rg.peor)} (${rg.aviso})` : pct(rg.peor) });
    }
    if (t?.id === 'tu-ano') for (const c of tarjetas(tuAnio(modelo, +hoy.slice(0, 4), hoy))) p.cifrasExtra.push({ nombre: c.titulo, valor: `${c.valor} (${c.sub})` });
    if (params.borrador) {
      const d = modelo.doc(params.borrador);
      if (!d || d.tipo !== 'borrador') throw Object.assign(new Error('borrador no válido'), { estado: 400 });
      p.bloquesExtra.push({ origen: 'borrador de cartera', nivel: 'privado', contenido: `${d.titulo}\n${items(d).map((f) => `${f.nombre} (${f.clase ?? 'sin clase'}): ${(f.peso / 100).toLocaleString('es-ES')} %`).join('\n')}` });
    }
    if (params.analisis) {
      const d = modelo.doc(params.analisis);
      if (!d || d.tipo !== 'analisis') throw Object.assign(new Error('análisis no válido'), { estado: 400 });
      p.bloquesExtra.push({ origen: `análisis ${params.analisis}`, nivel: 'privado', contenido: textoSeccion(d, 'Resultado') ?? '' });
    }
    if (params.idea) p.bloquesExtra.push({ origen: 'idea a revisar', nivel: 'privado', contenido: String(params.idea).slice(0, 4000) });
    if (params.semana) Object.assign(p, limitesSemana(params.semana));
    if (params.quiz) p.quiz = Math.min(8, Math.max(3, +params.quiz || 6));
    return p;
  }

  /** Lanza un trabajo. → {id} · el progreso llega por SSE («claude») y el resultado con resultado(id). */
  async lanzar({ trabajo: id, params = {}, desclasificar = false, resume = null }) {
    const t = trabajoDe(id);
    if (!t) throw Object.assign(new Error(`trabajo desconocido «${id}»`), { estado: 400 });
    if ([...this.ejecuciones.values()].some((e) => e.estado === 'en_curso' && e.trabajo === id)) throw Object.assign(new Error(`ya hay un trabajo «${id}» en marcha`), { estado: 409 });
    const modelo = this.modelo();
    let p;
    if (id === 'ingesta') {
      if (!modelo.fuentes.some((f) => f.id === params.fuente) || ['mundo', 'datos', 'base'].includes(params.fuente)) throw Object.assign(new Error('elige la fuente del documento'), { estado: 400 });
      p = { texto: await this.leerContexto(params.fichero), fichero: params.fichero, fuente: params.fuente };
    } else p = this.parametros(id, params, modelo);
    const ac = new AbortController();
    const hoy = fechaLocal();
    const ej = { id: null, trabajo: id, estado: 'en_curso', inicio: new Date().toISOString(), ac, texto: '' };
    const provisional = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    ej.id = provisional;
    this.ejecuciones.set(provisional, ej);
    const enviar = (e) => this.app.difusor.enviar('claude', { ...e, id: provisional, trabajo: id });
    ej.promesa = ejecutarTrabajo({
      trabajo: t,
      modelo,
      params: p,
      hoy,
      desclasificar,
      resume,
      servicio: this.servicio(),
      sesiones: this.sesiones,
      runner: { comando: this.comando, sandboxBase: this.sandboxBase, env: this.app.env },
      modeloClaude: modelo.ajustes.claude_modelo?.[id] ?? t.modelo,
      senal: ac.signal,
      alEvento: (e) => {
        if (e.tipo === 'texto') ej.texto += e.delta;
        if (e.tipo !== 'fin') enviar(e);
      },
    })
      .then((r) => {
        Object.assign(ej, { estado: r.estado, resultado: this.propuesta(id, r, p, modelo), registro: r.registro.id });
        enviar({ tipo: 'fin', estado: r.estado });
      })
      .catch((e) => {
        Object.assign(ej, { estado: 'error', resultado: { estado: 'error', mensaje: e.message } });
        enviar({ tipo: 'fin', estado: 'error' });
      })
      .finally(() => this.podar());
    return { id: provisional };
  }

  /** Resultado para la web. Para «datos», las filas ya revisadas (lo que se guardaría si confirmas). */
  propuesta(id, r, params, modelo) {
    const base = { estado: r.estado, mensaje: r.mensaje ?? null, motivo: r.motivo ?? null, avisos: r.avisos ?? [], texto: r.texto ?? '', seleccion: r.seleccion ?? null, sesion: r.sesion ?? null, cifras: r.cifras ?? [], modelo: r.modeloUsado ?? null, ejecucion: r.registro?.id ?? null, fuentes: params.fuentes ?? null };
    if (r.estado !== 'ok') return base;
    if (id === 'datos') {
      const mesActual = mesDe(fechaLocal());
      const series = r.json.series.map((s) => {
        const m = params.series.find((x) => x.id === s.id);
        const existentes = modelo.series.some((x) => x.id === s.id) ? modelo.serie(s.id) : [];
        const rev = revisarFilas(existentes, s.filas, { id: s.id, unidad: m.unidad, mesActual });
        return { id: s.id, titulo: m.que, unidad: m.unidad, fuente: s.origen, metodo: m.metodo, filas: rev.filas, avisos: rev.avisos, desde: rev.filas[0]?.mes ?? null, hasta: rev.filas.at(-1)?.mes ?? null };
      });
      const faltan = params.series.filter((p) => !series.some((s) => s.id === p.id)).map((p) => p.id);
      return { ...base, series, faltan };
    }
    return { ...base, json: r.json };
  }

  resultado(id) {
    const e = this.ejecuciones.get(id);
    if (!e) return null;
    return { id: e.id, trabajo: e.trabajo, estado: e.estado, inicio: e.inicio, texto: e.texto, resultado: e.resultado ?? null };
  }

  /** Sandboxes de más de un día: los dejó un servidor que murió. Solo «sbx-*» (otra instancia viva usa los recientes). */
  async limpiarSandboxesViejos({ ahora = Date.now() } = {}) {
    const nombres = await fsp.readdir(this.sandboxBase).catch(() => []);
    for (const n of nombres.filter((x) => x.startsWith('sbx-'))) {
      const d = join(this.sandboxBase, n);
      const st = await fsp.stat(d).catch(() => null);
      if (st && ahora - st.mtimeMs > 24 * 3600 * 1000) await fsp.rm(d, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Cancela todo lo que esté en marcha y espera a que termine (al parar el servidor o cambiar de carpeta). */
  async cancelarTodos() {
    const enCurso = [...this.ejecuciones.values()].filter((e) => e.estado === 'en_curso');
    for (const e of enCurso) e.ac.abort();
    await Promise.allSettled(enCurso.map((e) => e.promesa));
  }

  cancelar(id) {
    const e = this.ejecuciones.get(id);
    if (!e || e.estado !== 'en_curso') return false;
    e.ac.abort();
    return true;
  }

  podar() {
    const terminadas = [...this.ejecuciones.values()].filter((e) => e.estado !== 'en_curso');
    for (const e of terminadas.slice(0, Math.max(0, terminadas.length - CONSERVAR))) this.ejecuciones.delete(e.id);
  }

  async info() {
    const hoy = fechaLocal();
    const reg = await leerRegistro(this.servicio(), mesDe(hoy)).catch(() => []);
    return { trabajos: resumenTrabajos(), hoy: reg.filter((l) => l.inicio.slice(0, 10) === hoy || new Date(l.inicio).toLocaleDateString('sv-SE') === hoy).reverse(), enCurso: [...this.ejecuciones.values()].filter((e) => e.estado === 'en_curso').map((e) => ({ id: e.id, trabajo: e.trabajo, inicio: e.inicio })), version: reg.at(-1)?.version ?? null };
  }

  async registro(mes) {
    return (await leerRegistro(this.servicio(), mes)).reverse();
  }

  /** Una salida en cuarentena, para verla (texto de Claude y motivo). */
  async verCuarentena(fichero) {
    if (!/^[\w.-]+\.json$/.test(fichero ?? '')) throw Object.assign(new Error('fichero no válido'), { estado: 400 });
    const t = await this.app.almacen.leerServicio(`cuarentena/${fichero}`);
    if (t === null) throw Object.assign(new Error('ya no está en la cuarentena'), { estado: 404 });
    const j = JSON.parse(t);
    return { fichero, trabajo: j.trabajo, fecha: j.fecha, motivo: j.motivo, texto: String(j.texto ?? '').slice(0, 20000) };
  }

  async cuarentena() {
    const fs = this.app.almacen.fs;
    const dir = this.app.almacen.rutaServicio('cuarentena');
    let nombres = [];
    try {
      nombres = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort().reverse().slice(0, 50);
    } catch {
      return [];
    }
    const out = [];
    for (const n of nombres) {
      try {
        const j = JSON.parse(await this.app.almacen.leerServicio(`cuarentena/${n}`));
        out.push({ fichero: n, trabajo: j.trabajo, fecha: j.fecha, motivo: j.motivo });
      } catch {
        /* ilegible: se omite */
      }
    }
    return out;
  }
}
