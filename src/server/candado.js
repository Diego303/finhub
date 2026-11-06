// Un equipo a la vez (§2.6): FINANZAS/.finhub/abierto.lock con equipo, pid y latido cada 30 s.
// Candado reciente (< 2 min) de OTRO equipo → solo lectura, con «Tomar el control».
import { hostname } from 'node:os';
import { parsearCandado, serializarCandado } from '../core/formato/servicio.js';

export const LATIDO_MS = 30 * 1000;
export const CADUCA_MS = 2 * 60 * 1000;
const FICHERO = 'abierto.lock';

const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

export class Candado {
  constructor({ almacen, equipo = hostname().toUpperCase(), pid = process.pid, ahora = () => Date.now(), version = null, procesoVivo = vivo }) {
    Object.assign(this, { almacen, equipo, pid, ahora, version, procesoVivo });
    this.estado = { soloLectura: false, otro: null, aviso: null };
    this.inicio = new Date(ahora()).toISOString();
    this.temporizador = null;
    this.oyentes = new Set();
  }

  alCambiar(fn) {
    this.oyentes.add(fn);
  }
  emitir() {
    for (const fn of this.oyentes) fn(this.estado);
  }

  async leer() {
    const t = await this.almacen.leerServicio(FICHERO);
    if (t === null) return null;
    const r = parsearCandado(t);
    return r.ok ? r.valor : { ilegible: true };
  }

  esNuestro = (c) => c && c.equipo === this.equipo && c.pid === this.pid;

  /** ¿El candado de otro sigue vigente? */
  vigente(c) {
    if (!c || c.ilegible) return false;
    if (c.equipo === this.equipo) return c.pid !== this.pid && this.procesoVivo(c.pid);
    const latido = Date.parse(c.latido);
    return Number.isFinite(latido) && this.ahora() - latido < CADUCA_MS;
  }

  async escribir() {
    await this.almacen.escribirServicio(FICHERO, serializarCandado({ equipo: this.equipo, pid: this.pid, inicio: this.inicio, latido: new Date(this.ahora()).toISOString(), version: this.version }));
  }

  /** Al abrir: toma el candado o pasa a solo lectura. */
  async adquirir({ tomarControl = false } = {}) {
    const c = await this.leer();
    if (c && !this.esNuestro(c) && this.vigente(c) && !tomarControl) {
      this.estado = { soloLectura: true, otro: { equipo: c.equipo, desde: c.inicio, latido: c.latido }, aviso: `finhub está abierto en ${c.equipo} desde las ${horaLocal(c.inicio)}` };
      this.emitir();
      return this.estado;
    }
    let aviso = null;
    if (c && !this.esNuestro(c) && !this.vigente(c) && !c.ilegible) aviso = `había un candado viejo de ${c.equipo} (último latido ${horaLocal(c.latido)}): se ignora`;
    if (c && !this.esNuestro(c) && this.vigente(c) && tomarControl) aviso = `has tomado el control: ${c.equipo} pasa a solo lectura`;
    await this.escribir();
    this.estado = { soloLectura: false, otro: null, aviso };
    this.emitir();
    return this.estado;
  }

  /** Cada 30 s: si es nuestro, latido; si otro lo tomó, solo lectura; si somos solo lectura y caducó, lo tomamos. */
  async latir() {
    const c = await this.leer();
    if (this.estado.soloLectura) {
      if (!this.vigente(c)) return this.adquirir();
      if (c && c.latido !== this.estado.otro?.latido) this.estado = { ...this.estado, otro: { equipo: c.equipo, desde: c.inicio, latido: c.latido } };
      return this.estado;
    }
    if (c && !this.esNuestro(c) && !c.ilegible) {
      this.estado = { soloLectura: true, otro: { equipo: c.equipo, desde: c.inicio, latido: c.latido }, aviso: `${c.equipo} ha tomado el control: ahora estás en solo lectura` };
      this.emitir();
      return this.estado;
    }
    await this.escribir();
    return this.estado;
  }

  /** Justo antes de escribir (entre latidos pueden pasar 30 s): si otro tiene el control, solo lectura. */
  async verificar() {
    if (this.estado.soloLectura) return this.estado;
    const c = await this.leer();
    if (c?.ilegible || (c && this.esNuestro(c))) return this.estado;
    if (c && this.vigente(c)) {
      this.estado = { soloLectura: true, otro: { equipo: c.equipo, desde: c.inicio, latido: c.latido }, aviso: `${c.equipo} ha tomado el control: ahora estás en solo lectura` };
      this.emitir();
      return this.estado;
    }
    await this.escribir(); // ha desaparecido, o es de otro y ya caducó
    return this.estado;
  }

  arrancar() {
    this.temporizador = setInterval(() => this.latir().catch(() => {}), LATIDO_MS);
    this.temporizador.unref?.();
  }

  /** Al cerrar: solo borra el candado si es nuestro. */
  async soltar() {
    clearInterval(this.temporizador);
    const c = await this.leer().catch(() => null);
    if (this.esNuestro(c)) await this.almacen.borrarServicio(FICHERO);
  }
}

function horaLocal(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '?' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
