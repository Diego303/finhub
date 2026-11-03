// Almacén de la carpeta de datos (§2.4, §2.6, docs/SINCRONIZACION.md §3).
// - Índice en memoria {ruta → texto, versión, tamaño, mtime}: la API no toca disco para leer.
// - Sondeo en dos niveles: rápido (carpetas + conjunto caliente) y completo (stat concurrente de todo).
// - Escritura atómica: temporal «.finhub-tmp-*» en la MISMA carpeta + fsync + rename; nunca si no cambió.
// - Un fallo de lectura NUNCA es un fichero vacío: se reintenta y se marca «nube» o «ilegible».
import fsp from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { rutaSegura } from './rutas.js';
import { detectar } from '../core/formato/index.js';

export const ERRORES_NUBE = new Set(['EIO', 'ETIMEDOUT', 'EAGAIN', 'EBUSY', 'ENODATA', 'ECANCELED', 'EINTR', 'ENXIO']);
export const RE_TEMPORAL = /^\.finhub-tmp-/;
export const versionDe = (texto) => createHash('sha1').update(texto).digest('hex').slice(0, 16);

export class ErrorAlmacen extends Error {
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.codigo = codigo; // 'conflicto_version' | 'nube' | 'ilegible' | 'ruta' | 'disco'
    Object.assign(this, extra);
  }
}

/** Patrones de copias en conflicto de clientes de sincronización (configurables, §2.6). */
export const PATRONES_CONFLICTO = [
  { id: 'equipo', descripcion: 'copia con el nombre del equipo (nombre-EQUIPO.md, nombre-EQUIPO-2.md)', re: /^(.+)-([A-Z0-9][A-Z0-9_]{1,30})(-\d+)?\.md$/, base: (m) => `${m[1]}.md` },
  { id: 'copia-numerada', descripcion: 'posible copia duplicada (nombre (1).md)', re: /^(.+) \((\d+)\)\.md$/, base: (m) => `${m[1]}.md` },
  { id: 'conflicted-copy', descripcion: 'copia en conflicto (conflicted copy)', re: /^(.+?) \((?:[^)]*conflicted copy|[^)]*copia en conflicto)[^)]*\)\.md$/i, base: (m) => `${m[1]}.md` },
  { id: 'sync-conflict', descripcion: 'conflicto de Syncthing', re: /^(.+?)\.sync-conflict-[^.]*\.md$/, base: (m) => `${m[1]}.md` },
];

async function enParalelo(lista, n, fn) {
  const res = new Array(lista.length);
  let i = 0;
  const trabajador = async () => {
    while (i < lista.length) {
      const k = i++;
      res[k] = await fn(lista[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabajador));
  return res;
}

export class Almacen {
  /**
   * @param {object} o
   * @param {string} o.raiz carpeta de datos (ruta WSL absoluta)
   * @param {object} [o.fs] implementación de fs/promises (los tests inyectan fallos)
   * @param {number[]} [o.reintentos] esperas entre reintentos de lectura (ms)
   */
  constructor({ raiz, fs = fsp, reintentos = [200, 600, 1500], patrones = PATRONES_CONFLICTO, concurrencia = 64, ahora = () => Date.now() }) {
    this.raiz = raiz;
    this.fs = fs;
    this.reintentos = reintentos;
    this.patrones = patrones;
    this.concurrencia = concurrencia;
    this.ahora = ahora;
    this.ficheros = new Map(); // ruta → {texto, version, tam, mtimeMs, tipo, legible, error}
    this.carpetas = new Map(); // ruta de carpeta ('' = raíz) → mtimeMs
    this.otros = { contexto: [], ajenos: [], conflictos: [] };
    this.version = 0;
    this.oyentes = new Set();
    this.colas = new Map();
    this.caliente = new Map(); // ruta → último uso (ms)
    this.contador = 0;
  }

  // ---------- eventos ----------
  alCambiar(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }
  avisar(rutas, origen) {
    if (!rutas.length) return;
    this.version++;
    for (const fn of this.oyentes) fn({ version: this.version, rutas, origen });
  }

  // ---------- carga y sondeo ----------
  async cargar() {
    const st = await this.fs.stat(this.raiz).catch((e) => {
      throw new ErrorAlmacen('ruta', e.code === 'ENOENT' ? `la carpeta de datos no existe: ${this.raiz}` : `no se puede abrir la carpeta de datos: ${e.message}`);
    });
    if (!st.isDirectory()) throw new ErrorAlmacen('ruta', `no es una carpeta: ${this.raiz}`);
    this.temporalesLimpiados = await this.limpiarTemporales();
    await this.barrer();
    return this;
  }

  /** Recorre la carpeta (sin .finhub/) → {ficheros: [rel], dirs: [rel]} */
  async recorrer() {
    const ficheros = [];
    const dirs = [];
    const visitar = async (rel) => {
      dirs.push(rel);
      let entradas;
      try {
        entradas = await this.fs.readdir(rel ? join(this.raiz, rel) : this.raiz, { withFileTypes: true });
      } catch (e) {
        if (e.code === 'ENOENT') return;
        throw new ErrorAlmacen('ilegible', `no se puede leer la carpeta «${rel || '.'}»: ${e.code}`);
      }
      const subdirs = [];
      for (const e of entradas) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (r !== '.finhub') subdirs.push(r);
        } else if (e.isFile() || e.isSymbolicLink()) ficheros.push(r);
      }
      await enParalelo(subdirs, 8, visitar);
    };
    await visitar('');
    return { ficheros: ficheros.sort(), dirs: dirs.sort() };
  }

  /** Clasifica una ruta: 'dato' | 'conflicto' | 'contexto' | 'temporal' | 'ajeno'. */
  clasificar(rel, existentes) {
    const nombre = basename(rel);
    if (RE_TEMPORAL.test(nombre)) return { clase: 'temporal' };
    if (rel.startsWith('CONTEXTO/')) return { clase: 'contexto' };
    const carpeta = dirname(rel) === '.' ? '' : dirname(rel);
    for (const p of this.patrones) {
      const m = p.re.exec(nombre);
      if (!m) continue;
      const base = carpeta ? `${carpeta}/${p.base(m)}` : p.base(m);
      if (base !== rel && existentes.has(base)) return { clase: 'conflicto', base, patron: p.id, descripcion: p.descripcion };
    }
    return detectar(rel) ? { clase: 'dato' } : { clase: 'ajeno' };
  }

  /** Lee un fichero con reintentos. Nunca devuelve '' por un fallo. */
  async leerDisco(rel, tamEsperado = null) {
    const abs = rutaSegura(this.raiz, rel);
    let ultimo;
    for (let intento = 0; intento <= this.reintentos.length; intento++) {
      try {
        const texto = await this.fs.readFile(abs, 'utf8');
        if (tamEsperado > 0 && texto.length === 0) {
          ultimo = Object.assign(new Error('el fichero tiene tamaño pero no devuelve contenido'), { code: 'EIO' });
        } else return { texto };
      } catch (e) {
        if (e.code === 'ENOENT') return { borrado: true };
        ultimo = e;
        if (!ERRORES_NUBE.has(e.code)) break;
      }
      if (intento < this.reintentos.length) await new Promise((r) => setTimeout(r, this.reintentos[intento]));
    }
    return { error: ERRORES_NUBE.has(ultimo?.code) ? 'nube' : 'ilegible', codigo: ultimo?.code ?? 'desconocido' };
  }

  async refrescar(rel, st) {
    const anterior = this.ficheros.get(rel);
    const r = await this.leerDisco(rel, st?.size ?? null);
    if (r.borrado) {
      if (anterior) {
        this.ficheros.delete(rel);
        return true;
      }
      return false;
    }
    if (r.error) {
      // Si ya teníamos el texto, se conserva el último bueno y se marca; nunca se vacía.
      this.ficheros.set(rel, { ...(anterior ?? { texto: null, version: null }), tam: st?.size ?? null, mtimeMs: st?.mtimeMs ?? null, tipo: detectar(rel)?.formato.tipo ?? null, legible: false, error: r.error, codigo: r.codigo });
      return !anterior || anterior.legible !== false;
    }
    const texto = r.texto;
    const version = versionDe(texto);
    this.ficheros.set(rel, { texto, version, tam: st?.size ?? Buffer.byteLength(texto), mtimeMs: st?.mtimeMs ?? null, tipo: detectar(rel)?.formato.tipo ?? null, legible: true, error: null });
    return !anterior || anterior.version !== version || anterior.legible === false;
  }

  /** Barrido completo: stat concurrente de todo y lectura de lo que cambió. */
  async barrer() {
    const { ficheros, dirs } = await this.recorrer();
    const existentes = new Set(ficheros);
    const datos = [];
    const otros = { contexto: [], ajenos: [], conflictos: [] };
    for (const rel of ficheros) {
      const c = this.clasificar(rel, existentes);
      if (c.clase === 'dato') datos.push(rel);
      else if (c.clase === 'contexto') {
        if (!rel.startsWith('CONTEXTO/procesados/')) otros.contexto.push(rel); // lo procesado ya no está pendiente
      }
      else if (c.clase === 'conflicto') otros.conflictos.push({ ruta: rel, base: c.base, patron: c.patron, descripcion: c.descripcion });
      else if (c.clase === 'ajeno') otros.ajenos.push(rel);
    }
    const cambiados = [];
    const stats = await enParalelo(datos, this.concurrencia, async (rel) => this.fs.stat(join(this.raiz, rel)).catch(() => null));
    await enParalelo(datos, this.concurrencia, async (rel, i) => {
      const st = stats[i];
      const e = this.ficheros.get(rel);
      if (!st) return;
      if (e && e.legible && e.tam === st.size && e.mtimeMs === st.mtimeMs) return;
      if (await this.refrescar(rel, st)) cambiados.push(rel);
    });
    const setDatos = new Set(datos);
    for (const rel of [...this.ficheros.keys()]) {
      if (!setDatos.has(rel)) {
        this.ficheros.delete(rel);
        cambiados.push(rel);
      }
    }
    const dstats = await enParalelo(dirs, this.concurrencia, async (d) => this.fs.stat(d ? join(this.raiz, d) : this.raiz).catch(() => null));
    this.carpetas = new Map(dirs.map((d, i) => [d, dstats[i]?.mtimeMs ?? 0]));
    const cambioOtros = JSON.stringify(otros) !== JSON.stringify(this.otros);
    this.otros = otros;
    this.avisar([...new Set(cambiados)].sort(), 'disco');
    if (cambioOtros && !cambiados.length) this.avisar(['(otros)'], 'disco');
    return cambiados;
  }

  /** Sondeo rápido: si cambió alguna carpeta (altas, bajas, rename) o un fichero caliente, se actualiza. */
  async sondeoRapido({ calientes = [] } = {}) {
    const carpetas = [...this.carpetas.keys()];
    const st = await enParalelo(carpetas, this.concurrencia, (d) => this.fs.stat(d ? join(this.raiz, d) : this.raiz).catch(() => null));
    if (carpetas.some((d, i) => (st[i]?.mtimeMs ?? -1) !== this.carpetas.get(d))) return this.barrer();
    const ahora = this.ahora();
    for (const [r, t] of this.caliente) if (ahora - t > 10 * 60 * 1000) this.caliente.delete(r);
    const rutas = [...new Set([...calientes, ...this.caliente.keys()])].filter((r) => this.ficheros.has(r));
    const cambiados = [];
    await enParalelo(rutas, this.concurrencia, async (rel) => {
      const s = await this.fs.stat(join(this.raiz, rel)).catch(() => null);
      const e = this.ficheros.get(rel);
      if (!s || (e.legible && e.tam === s.size && e.mtimeMs === s.mtimeMs)) return;
      if (await this.refrescar(rel, s)) cambiados.push(rel);
    });
    this.avisar(cambiados.sort(), 'disco');
    return cambiados;
  }

  marcarCaliente(rel) {
    this.caliente.set(rel, this.ahora());
  }

  // ---------- lectura ----------
  obtener(rel) {
    return this.ficheros.get(rel) ?? null;
  }
  /** Texto para las operaciones: null si no existe; error si existe pero no se puede leer. */
  texto(rel) {
    const e = this.ficheros.get(rel);
    if (!e) return null;
    if (!e.legible) throw new ErrorAlmacen(e.error, e.error === 'nube' ? `«${rel}» solo está en la nube o no se puede leer ahora: no se modifica` : `no se puede leer «${rel}»`, { ruta: rel });
    return e.texto;
  }
  noLegibles() {
    return [...this.ficheros].filter(([, e]) => !e.legible).map(([ruta, e]) => ({ ruta, error: e.error, codigo: e.codigo }));
  }

  // ---------- escritura ----------
  /** Encola fn por ruta (escrituras del mismo fichero, en orden). */
  cola(rel, fn) {
    const previa = this.colas.get(rel) ?? Promise.resolve();
    const siguiente = previa.then(fn, fn);
    this.colas.set(rel, siguiente.catch(() => {}));
    return siguiente;
  }

  async escribirAtomico(abs, texto) {
    await this.fs.mkdir(dirname(abs), { recursive: true });
    const tmp = join(dirname(abs), `.finhub-tmp-${process.pid}-${++this.contador}-${randomBytes(3).toString('hex')}`);
    let fh;
    try {
      fh = await this.fs.open(tmp, 'w');
      await fh.writeFile(texto, 'utf8');
      await fh.sync();
      await fh.close();
      fh = null;
      await this.fs.rename(tmp, abs);
    } catch (e) {
      if (fh) await fh.close().catch(() => {});
      await this.fs.unlink(tmp).catch(() => {});
      throw new ErrorAlmacen('disco', `no se pudo escribir «${basename(abs)}»: ${e.code ?? e.message}`);
    }
  }

  /**
   * Escribe varios ficheros de datos {ruta: texto | null(borrar)}.
   * `versiones` {ruta: versión que el cliente vio}: si alguna no coincide → conflicto (409).
   * Si falla a mitad, se restauran los ya escritos (nada queda a medias).
   */
  async escribir(cambios, { versiones = {}, origen = 'local' } = {}) {
    for (const [rel, v] of Object.entries(versiones)) {
      const actual = this.ficheros.get(rel)?.version ?? null;
      if ((v ?? null) !== actual) throw new ErrorAlmacen('conflicto_version', `«${rel}» ha cambiado desde que lo cargaste`, { ruta: rel, version: actual });
    }
    const hechos = [];
    try {
      for (const [rel, texto] of Object.entries(cambios)) {
        if (!detectar(rel)) throw new ErrorAlmacen('ruta', `«${rel}» no es un fichero de datos`);
        const abs = rutaSegura(this.raiz, rel);
        const antes = this.ficheros.get(rel) ?? null;
        if (antes && !antes.legible) throw new ErrorAlmacen(antes.error, `«${rel}» no se puede leer ahora: no se sobrescribe`, { ruta: rel });
        if ((antes?.texto ?? null) === texto) continue;
        await this.cola(rel, async () => {
          if (texto === null) await this.fs.unlink(abs).catch((e) => { if (e.code !== 'ENOENT') throw new ErrorAlmacen('disco', `no se pudo borrar «${rel}»: ${e.code}`); });
          else await this.escribirAtomico(abs, texto);
        });
        hechos.push([rel, antes]);
        if (texto === null) this.ficheros.delete(rel);
        else {
          const st = await this.fs.stat(abs).catch(() => null);
          this.ficheros.set(rel, { texto, version: versionDe(texto), tam: st?.size ?? Buffer.byteLength(texto), mtimeMs: st?.mtimeMs ?? null, tipo: detectar(rel)?.formato.tipo ?? null, legible: true, error: null });
        }
        this.marcarCaliente(rel);
      }
    } catch (e) {
      for (const [rel, antes] of hechos.reverse()) {
        const abs = rutaSegura(this.raiz, rel);
        try {
          if (antes) {
            await this.escribirAtomico(abs, antes.texto);
            this.ficheros.set(rel, antes);
          } else {
            await this.fs.unlink(abs).catch(() => {});
            this.ficheros.delete(rel);
          }
        } catch {
          /* se informa del error original */
        }
      }
      throw e;
    }
    await this.actualizarCarpetas(hechos.map(([r]) => r));
    this.avisar(hechos.map(([r]) => r).sort(), origen);
    return Object.fromEntries(hechos.map(([r]) => [r, this.ficheros.get(r)?.version ?? null]));
  }

  async actualizarCarpetas(rutas) {
    const dirs = new Set();
    for (const r of rutas) {
      const partes = r.split('/');
      for (let i = 0; i < partes.length; i++) dirs.add(partes.slice(0, i).join('/'));
    }
    for (const d of dirs) {
      const st = await this.fs.stat(d ? join(this.raiz, d) : this.raiz).catch(() => null);
      if (st) this.carpetas.set(d, st.mtimeMs);
      else this.carpetas.delete(d);
    }
  }

  // ---------- ficheros de servicio (.finhub/) ----------
  rutaServicio(rel) {
    return rutaSegura(this.raiz, `.finhub/${rel}`);
  }
  async leerServicio(rel) {
    try {
      return await this.fs.readFile(this.rutaServicio(rel), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw new ErrorAlmacen(ERRORES_NUBE.has(e.code) ? 'nube' : 'ilegible', `no se puede leer .finhub/${rel}: ${e.code}`);
    }
  }
  escribirServicio(rel, texto) {
    const abs = this.rutaServicio(rel);
    return this.cola(`.finhub/${rel}`, () => this.escribirAtomico(abs, texto));
  }
  borrarServicio(rel) {
    const abs = this.rutaServicio(rel);
    return this.cola(`.finhub/${rel}`, () => this.fs.unlink(abs).catch((e) => { if (e.code !== 'ENOENT') throw e; }));
  }

  /** Al arrancar: borra los «.finhub-tmp-*» huérfanos (solo ficheros con ese prefijo). */
  async limpiarTemporales() {
    const borrados = [];
    const visitar = async (abs, rel) => {
      let entradas;
      try {
        entradas = await this.fs.readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entradas) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await visitar(join(abs, e.name), r);
        else if (e.isFile() && RE_TEMPORAL.test(e.name)) {
          await this.fs.unlink(join(abs, e.name)).catch(() => {});
          borrados.push(r);
        }
      }
    };
    await visitar(this.raiz, '');
    return borrados;
  }

  /** Todos los textos de datos (para /api/datos y las copias). */
  textos(prefijo = '') {
    return [...this.ficheros].filter(([r]) => r.startsWith(prefijo)).map(([ruta, e]) => ({ ruta, ...e }));
  }
}
