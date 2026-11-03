// La aplicación del servidor: une almacén, operaciones, deshacer, papelera, copias, candado, SSE y API.
import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen, ErrorAlmacen } from './almacen.js';
import { Candado } from './candado.js';
import { Papelera } from './papelera.js';
import { Copias } from './copias.js';
import { Deshacer } from './deshacer.js';
import { CanalSSE, Difusor } from './sse.js';
import { cambiarCarpeta, validarDestino, enviarAPapeleraSistema } from './carpeta.js';
import { fijarCarpeta } from './config.js';
import { aRutaWindows, carpetasLocales } from './rutas.js';
import { ErrorHttp, comprobarPeticion, leerJson, enviarJson, servirEstatico, rutasEstaticas, CABECERAS_SEGURIDAD } from './http.js';
import { aplicarOp, ErrorOp, operaciones } from '../core/ops/index.js';
import { leer as leerFormato } from '../core/formato/index.js';
import { valores } from '../core/formato/motor.js';
import { ajustesEfectivos } from '../core/formato/config.js';
import { crearPrng } from '../core/prng.js';
import { fechaLocal, mesDe, mesFinanciero, sumarMesesMes } from '../core/fechas.js';

const RAIZ_REPO = join(import.meta.dirname, '..', '..');
export const VERSION_APP = JSON.parse(readFileSync(join(RAIZ_REPO, 'package.json'), 'utf8')).version;

const ESTADO_OP = { invalida: 400, no_existe: 404, solo_lectura: 423, mes_cerrado: 409, conflicto: 409 };
const ESTADO_ALMACEN = { conflicto_version: 409, nube: 503, ilegible: 503, ruta: 400, disco: 500 };

export class App {
  /**
   * @param {object} o
   * @param {string} o.carpeta carpeta de datos (ruta WSL)
   * @param {number} [o.puerto] 0 = cualquiera libre (tests)
   * @param {boolean} [o.ejemplo] carpeta temporal de ejemplo: no se guarda en config
   */
  constructor({ carpeta, puerto = 4747, ejemplo = false, env = process.env, sondeoMs = 2000, barridoMs = 30000, equipo, enviarAPapelera = enviarAPapeleraSistema, guardarConfig = !ejemplo, log = () => {} }) {
    Object.assign(this, { carpeta, puertoPedido: puerto, ejemplo, env, sondeoMs, barridoMs, equipo, enviarAPapelera, guardarConfig, log });
    this.difusor = new Difusor();
    this.deshacer = new Deshacer();
    this.colaOps = Promise.resolve();
    this.estaticos = rutasEstaticas(RAIZ_REPO);
    this.avisosCarpeta = [];
  }

  // ---------- carpeta ----------
  async abrirCarpeta(ruta, { tomarControl = false } = {}) {
    const almacen = await new Almacen({ raiz: ruta }).cargar();
    const ajustes = this.ajustesDe(almacen);
    this.almacen = almacen;
    this.carpeta = ruta;
    this.candado = new Candado({ almacen, equipo: this.equipo, version: VERSION_APP });
    this.candado.alCambiar((e) => this.difusor.enviar('candado', e));
    await this.candado.adquirir({ tomarControl });
    this.candado.arrancar();
    this.papelera = new Papelera({ almacen });
    this.copias = new Copias({ almacen, hoy: () => fechaLocal(), destinoLocal: ajustes.copias === 'local' ? join(carpetasLocales(this.env).datos, 'copias') : null });
    this.purgadas = await this.papelera.purgar().catch(() => []);
    almacen.alCambiar((ev) => this.difusor.enviar('version', { version: ev.version, rutas: ev.rutas, origen: ev.origen }));
    this.arrancarSondeo();
    this.difusor.enviar('carpeta', { ruta });
  }

  async cerrarCarpeta() {
    clearInterval(this.tSondeo);
    clearInterval(this.tBarrido);
    await this.candado?.soltar().catch(() => {});
    this.almacen = null;
  }

  arrancarSondeo() {
    let ocupado = false;
    const tarea = (fn) => async () => {
      if (ocupado || !this.almacen) return;
      ocupado = true;
      try {
        await fn();
      } catch (e) {
        this.log(`sondeo: ${e.message}`);
      } finally {
        ocupado = false;
      }
    };
    this.tSondeo = setInterval(tarea(() => this.almacen.sondeoRapido({ calientes: this.calientes() })), this.sondeoMs);
    this.tBarrido = setInterval(tarea(() => this.almacen.barrer()), this.barridoMs);
    this.tSondeo.unref?.();
    this.tBarrido.unref?.();
  }

  /** Conjunto caliente fijo: lo que más se edita (docs/SINCRONIZACION.md §3). */
  calientes() {
    const hoy = fechaLocal();
    const dia = this.ajustesDe(this.almacen).mes_inicio_dia;
    const mes = mesFinanciero(hoy, dia);
    return ['ajustes.md', 'cuentas.md', 'grupos.md', 'recurrentes.md', 'metas.md', 'hitos.md', 'cartera/activos.md', 'cartera/operaciones.md', 'cartera/objetivo.md', `mes/${mes}.md`, `mes/${sumarMesesMes(mes, -1)}.md`, `mes/${mesDe(hoy)}.md`];
  }

  ajustesDe(almacen) {
    const e = almacen?.obtener('ajustes.md');
    if (!e?.legible) return ajustesEfectivos({});
    return ajustesEfectivos(valores(leerFormato('ajustes.md', e.texto)));
  }

  ctxOps() {
    const ajustes = this.ajustesDe(this.almacen);
    return { ajustes, formato: { diaInicio: ajustes.mes_inicio_dia }, prng: crearPrng(randomInt(1, 2 ** 31)), hoy: fechaLocal(), rutas: [...this.almacen.ficheros.keys()] };
  }

  // ---------- operaciones ----------
  /** Serializa todas las operaciones (una a la vez): ninguna pisa a otra. */
  enCola(fn) {
    const p = this.colaOps.then(fn, fn);
    this.colaOps = p.catch(() => {});
    return p;
  }

  async aplicar({ op, args = {}, versiones = {}, sesion = 'anonima' }) {
    if (typeof op !== 'string') throw new ErrorHttp(400, 'falta «op»');
    if (op === 'ficheros.restaurar' || op === 'papelera.restaurar') throw new ErrorHttp(400, `«${op}» no se puede pedir directamente`);
    return this.enCola(async () => {
      if (this.candado.estado.soloLectura) throw new ErrorHttp(423, this.candado.estado.aviso ?? 'solo lectura', { codigo: 'solo_lectura' });
      const res = aplicarOp((r) => this.almacen.texto(r), op, args, this.ctxOps());
      return this.escribirResultado(res, { op, versiones, sesion });
    });
  }

  async escribirResultado(res, { op, versiones = {}, sesion, conDeshacer = true }) {
    if (!Object.keys(res.escribir).length) return { ok: true, resultado: res.resultado, avisos: res.avisos, version: this.almacen.version, cambios: {} };
    this.copias.antesDeEscribir();
    const idsPapelera = await this.papelera.enviar(res.papelera);
    let cambios;
    try {
      cambios = await this.almacen.escribir(res.escribir, { versiones });
    } catch (e) {
      await this.papelera.quitar(idsPapelera).catch(() => {});
      throw e;
    }
    const deshacer = conDeshacer ? this.deshacer.guardar(sesion, { op, inversa: res.inversa, esperado: res.escribir, papelera: idsPapelera }) : null;
    return { ok: true, resultado: res.resultado, avisos: res.avisos, version: this.almacen.version, cambios, deshacer, papelera: idsPapelera };
  }

  async deshacerUltima({ sesion = 'anonima', id = null }) {
    return this.enCola(async () => {
      if (this.candado.estado.soloLectura) throw new ErrorHttp(423, this.candado.estado.aviso ?? 'solo lectura', { codigo: 'solo_lectura' });
      const e = this.deshacer.tomar(sesion, id);
      if (!e) throw new ErrorHttp(404, 'No hay nada que deshacer');
      for (const [ruta, v] of Object.entries(e.versiones)) {
        if ((this.almacen.obtener(ruta)?.version ?? null) !== v) throw new ErrorHttp(409, `No se puede deshacer: «${ruta}» cambió después`, { codigo: 'cambio_posterior', ruta });
      }
      const res = aplicarOp((r) => this.almacen.texto(r), e.inversa.op, e.inversa.args, this.ctxOps());
      const r = await this.escribirResultado(res, { op: `deshacer ${e.op}`, sesion, conDeshacer: false });
      await this.papelera.quitar(e.papelera);
      return { ...r, deshecho: e.op };
    });
  }

  async restaurarPapelera({ id, sesion = 'anonima' }) {
    return this.enCola(async () => {
      if (this.candado.estado.soloLectura) throw new ErrorHttp(423, this.candado.estado.aviso ?? 'solo lectura', { codigo: 'solo_lectura' });
      const entrada = await this.papelera.entrada(id);
      if (!entrada) throw new ErrorHttp(404, 'Esa entrada ya no está en la papelera');
      const res = aplicarOp((r) => this.almacen.texto(r), 'papelera.restaurar', { entrada }, this.ctxOps());
      const r = await this.escribirResultado(res, { op: 'papelera.restaurar', sesion, conDeshacer: false });
      await this.papelera.quitar([id]);
      return r;
    });
  }

  async cambiar({ ruta, modo, confirmarBorrado = false, aceptarAjenos = false }) {
    if (this.ejemplo) throw new ErrorHttp(400, 'En modo ejemplo no se cambia la carpeta');
    return this.enCola(async () => {
      const actual = this.carpeta;
      const progreso = (p) => this.difusor.enviar('progreso', p);
      const res = await cambiarCarpeta({
        entrada: ruta,
        modo,
        actual,
        confirmarBorrado,
        aceptarAjenos,
        progreso,
        enviarAPapelera: async (r) => {
          await this.cerrarCarpeta();
          return this.enviarAPapelera(r);
        },
      }).catch((e) => {
        throw new ErrorHttp(400, e.message);
      });
      if (this.almacen) await this.cerrarCarpeta();
      await this.abrirCarpeta(res.ruta);
      if (this.guardarConfig) await fijarCarpeta(res.ruta, this.env);
      return { ok: true, ...res, rutaWindows: aRutaWindows(res.ruta) };
    });
  }

  // ---------- estado ----------
  estado() {
    const a = this.almacen;
    return {
      app: 'finhub',
      versionApp: VERSION_APP,
      version: a.version,
      carpeta: { ruta: this.carpeta, rutaWindows: aRutaWindows(this.carpeta), ejemplo: this.ejemplo, ficheros: a.ficheros.size },
      soloLectura: this.candado.estado.soloLectura,
      candado: this.candado.estado,
      conflictos: a.otros.conflictos,
      nube: a.noLegibles(),
      contexto: a.otros.contexto,
      ajenos: a.otros.ajenos.length,
      temporalesLimpiados: a.temporalesLimpiados?.length ?? 0,
      purgadas: this.purgadas?.length ?? 0,
      operaciones: operaciones(),
    };
  }

  // ---------- HTTP ----------
  async manejar(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const ruta = url.pathname;
    try {
      comprobarPeticion(req, this.puerto);
      if (ruta.startsWith('/api/')) return await this.api(req, res, ruta, url);
      if (!['GET', 'HEAD'].includes(req.method)) throw new ErrorHttp(405, 'Método no permitido');
      if (ruta.startsWith('/core/')) return await servirEstatico(res, this.estaticos.core, ruta.slice('/core'.length), { metodo: req.method });
      return await servirEstatico(res, this.estaticos.web, ruta === '/' ? '/index.html' : ruta, { metodo: req.method });
    } catch (e) {
      this.responderError(res, e, ruta);
    }
  }

  responderError(res, e, ruta) {
    if (res.headersSent) return res.end();
    if (e instanceof ErrorHttp) {
      const { cerrar, ...extra } = e.extra;
      return enviarJson(res, e.estado, { error: e.message, ...extra }, { cerrar });
    }
    if (e instanceof ErrorOp) return enviarJson(res, ESTADO_OP[e.codigo] ?? 400, { error: e.message, codigo: e.codigo, ...(e.mes ? { mes: e.mes } : {}) });
    if (e instanceof ErrorAlmacen) return enviarJson(res, ESTADO_ALMACEN[e.codigo] ?? 500, { error: e.message, codigo: e.codigo, ...(e.ruta ? { ruta: e.ruta } : {}), ...(e.version !== undefined ? { version: e.version } : {}) });
    this.log(`error en ${ruta}: ${e.stack ?? e}`);
    enviarJson(res, 500, { error: 'Error interno del servidor. Mira el registro del servidor para más detalles.' });
  }

  async api(req, res, ruta, url) {
    const metodo = req.method;
    const cuerpo = metodo === 'POST' ? await leerJson(req) : null;
    const sesion = String(req.headers['x-finhub-sesion'] ?? cuerpo?.sesion ?? 'anonima').slice(0, 64);
    const R = `${metodo} ${ruta}`;
    switch (R) {
      case 'GET /api/salud':
        return enviarJson(res, 200, { ok: true, app: 'finhub', pid: process.pid, puerto: this.puerto, carpeta: this.carpeta, ejemplo: this.ejemplo, versionApp: VERSION_APP });
      case 'GET /api/version':
        return enviarJson(res, 200, { version: this.almacen.version, soloLectura: this.candado.estado.soloLectura });
      case 'GET /api/estado':
        return enviarJson(res, 200, this.estado());
      case 'GET /api/datos': {
        const prefijo = url.searchParams.get('prefijo') ?? '';
        const ficheros = {};
        for (const e of this.almacen.textos(prefijo)) ficheros[e.ruta] = e.legible ? { texto: e.texto, version: e.version, tipo: e.tipo } : { error: e.error, tipo: e.tipo };
        return enviarJson(res, 200, { version: this.almacen.version, ficheros });
      }
      case 'GET /api/fichero': {
        const r = url.searchParams.get('ruta') ?? '';
        const e = this.almacen.obtener(r);
        if (!e) throw new ErrorHttp(404, `No existe «${r}»`);
        this.almacen.marcarCaliente(r);
        if (!e.legible) throw new ErrorAlmacen(e.error, `«${r}» no se puede leer ahora`, { ruta: r });
        return enviarJson(res, 200, { ruta: r, texto: e.texto, version: e.version, tipo: e.tipo });
      }
      case 'POST /api/ops':
        return enviarJson(res, 200, await this.aplicar({ ...cuerpo, sesion }));
      case 'POST /api/deshacer':
        return enviarJson(res, 200, await this.deshacerUltima({ sesion, id: cuerpo.id ?? null }));
      case 'GET /api/papelera': {
        const filas = await this.papelera.listar();
        return enviarJson(res, 200, { entradas: filas.map(({ contenido, ...f }) => ({ ...f, vista: contenido ? contenido.slice(0, 200) : null })), ...(await this.papelera.caducidad()) });
      }
      case 'POST /api/papelera/restaurar':
        return enviarJson(res, 200, await this.restaurarPapelera({ id: cuerpo.id, sesion }));
      case 'POST /api/candado/tomar':
        return enviarJson(res, 200, await this.enCola(() => this.candado.adquirir({ tomarControl: true })));
      case 'GET /api/semilla': {
        // plantillas y textos por defecto del repo (públicos, sin datos): semilla/<tipo>/*.md
        const tipo = url.searchParams.get('tipo') ?? '';
        if (!/^(plantillas-cartera|roles|tareas)$/.test(tipo)) throw new ErrorHttp(404, 'No encontrado');
        const dir = join(RAIZ_REPO, 'semilla', tipo);
        const ficheros = {};
        for (const n of (await fsp.readdir(dir).catch(() => [])).filter((x) => x.endsWith('.md')).sort()) ficheros[n] = await fsp.readFile(join(dir, n), 'utf8');
        return enviarJson(res, 200, { tipo, ficheros });
      }
      case 'GET /api/carpeta':
        return enviarJson(res, 200, { ruta: this.carpeta, rutaWindows: aRutaWindows(this.carpeta), ejemplo: this.ejemplo });
      case 'POST /api/carpeta/validar':
        return enviarJson(res, 200, await validarDestino(cuerpo.ruta, { actual: this.carpeta }));
      case 'POST /api/carpeta/cambiar':
        return enviarJson(res, 200, await this.cambiar(cuerpo));
      case 'GET /api/eventos': {
        const canal = new CanalSSE(res);
        this.difusor.anadir(canal);
        canal.enviar('hola', { version: this.almacen.version, soloLectura: this.candado.estado.soloLectura });
        return;
      }
      default:
        throw new ErrorHttp(404, 'No encontrado');
    }
  }

  // ---------- arranque y parada ----------
  async iniciar({ host = '127.0.0.1', intentos = 20 } = {}) {
    await this.abrirCarpeta(this.carpeta);
    this.servidor = http.createServer((req, res) => this.manejar(req, res));
    this.servidor.requestTimeout = 120000;
    this.servidor.headersTimeout = 20000;
    let puerto = this.puertoPedido;
    for (let i = 0; ; i++) {
      try {
        await new Promise((ok, mal) => {
          const fallo = (e) => mal(e);
          this.servidor.once('error', fallo);
          this.servidor.listen(puerto, host, () => {
            this.servidor.off('error', fallo);
            ok();
          });
        });
        break;
      } catch (e) {
        if (e.code !== 'EADDRINUSE' || puerto === 0 || i >= intentos) throw e;
        puerto++;
      }
    }
    this.puerto = this.servidor.address().port;
    this.url = `http://127.0.0.1:${this.puerto}/`;
    this.token = randomBytes(8).toString('hex');
    return this;
  }

  async parar() {
    this.difusor.cerrarTodo();
    await new Promise((ok) => {
      if (!this.servidor) return ok();
      this.servidor.close(() => ok());
      this.servidor.closeAllConnections?.();
    });
    await this.cerrarCarpeta();
  }
}

export { CABECERAS_SEGURIDAD };
