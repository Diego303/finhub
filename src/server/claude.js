// Trabajos de Claude en el servidor (§8): monta la entrada con tus datos (el servidor es el único que los
// lee), ejecuta el motor aislado, avisa del progreso por SSE, guarda registro y cuarentena en .finhub/ y
// deja el resultado como PROPUESTA: nada se escribe en tus datos sin una operación que lances tú.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ejecutarTrabajo } from '../claude/motor.js';
import { trabajo as trabajoDe, resumenTrabajos } from '../claude/trabajos/index.js';
import { Sesiones, leerRegistro } from '../claude/registro.js';
import { carpetasLocales } from './rutas.js';
import { construirModelo } from '../core/modelo.js';
import { parseManifiesto, revisarFilas } from '../core/datos.js';
import { fechaLocal, mesDe } from '../core/fechas.js';

const RAIZ_REPO = join(import.meta.dirname, '..', '..');
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

  manifiesto() {
    return parseManifiesto(readFileSync(join(RAIZ_REPO, 'semilla', 'datos-manifiesto.md'), 'utf8'));
  }

  /** Estado de las series del manifiesto en tu carpeta (para el trabajo «datos»). */
  estadoDatos(modelo = this.modelo()) {
    return this.manifiesto().map((s) => {
      const existente = modelo.series.find((x) => x.id === s.id);
      const filas = existente ? modelo.serie(s.id) : [];
      return { ...s, existe: !!existente, sintetica: !!existente?.sintetica, ultimo: filas.at(-1)?.mes ?? null, filas: filas.length, actualizado: existente?.actualizado ?? null };
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
    if (id === 'precios') {
      const ids = new Set(params.ids ?? []);
      const activos = modelo.activos.filter((a) => a.campos.isin && !a.campos.archivado && (!ids.size || ids.has(a.id))).map((a) => ({ isin: a.campos.isin, nombre: a.titulo }));
      if (!activos.length) throw Object.assign(new Error('ningún activo con ISIN'), { estado: 400 });
      return { activos };
    }
    return params;
  }

  /** Lanza un trabajo. → {id} · el progreso llega por SSE («claude») y el resultado con resultado(id). */
  lanzar({ trabajo: id, params = {}, desclasificar = false, resume = null }) {
    const t = trabajoDe(id);
    if (!t) throw Object.assign(new Error(`trabajo desconocido «${id}»`), { estado: 400 });
    if ([...this.ejecuciones.values()].some((e) => e.estado === 'en_curso' && e.trabajo === id)) throw Object.assign(new Error(`ya hay un trabajo «${id}» en marcha`), { estado: 409 });
    const modelo = this.modelo();
    const p = this.parametros(id, params, modelo);
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
    const base = { estado: r.estado, mensaje: r.mensaje ?? null, motivo: r.motivo ?? null, avisos: r.avisos ?? [], texto: r.texto ?? '', seleccion: r.seleccion ?? null, sesion: r.sesion ?? null };
    if (r.estado !== 'ok') return base;
    if (id === 'datos') {
      const mesActual = mesDe(fechaLocal());
      const series = r.json.series.map((s) => {
        const m = params.series.find((x) => x.id === s.id);
        const existentes = modelo.series.some((x) => x.id === s.id) ? modelo.serie(s.id) : [];
        const rev = revisarFilas(existentes, s.filas, { unidad: m.unidad, mesActual });
        return { id: s.id, titulo: m.que, unidad: m.unidad, fuente: s.origen, metodo: m.metodo, filas: rev.filas, avisos: rev.avisos, desde: rev.filas[0]?.mes ?? null, hasta: rev.filas.at(-1)?.mes ?? null };
      });
      return { ...base, series };
    }
    return { ...base, json: r.json };
  }

  resultado(id) {
    const e = this.ejecuciones.get(id);
    if (!e) return null;
    return { id: e.id, trabajo: e.trabajo, estado: e.estado, inicio: e.inicio, texto: e.texto, resultado: e.resultado ?? null };
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
