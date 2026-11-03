// Copias diarias (§2.4): la primera escritura de cada día copia los ficheros de datos en
// .finhub/copias/AAAA-MM-DD/ (o fuera, en ~/.local/share/finhub/copias/<carpeta>/, con «copias: local»).
// Se guardan las 14 últimas. Se escriben desde la memoria, sin volver a leer el disco.
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const MANTENER = 14;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export class Copias {
  constructor({ almacen, destinoLocal = null, fs = fsp, hoy }) {
    this.almacen = almacen;
    this.fs = fs;
    this.hoy = hoy;
    this.destinoLocal = destinoLocal; // carpeta base si «copias: local»
    this.hechaHoy = null;
    this.enCurso = null;
  }

  base() {
    if (!this.destinoLocal) return join(this.almacen.raiz, '.finhub', 'copias');
    return join(this.destinoLocal, createHash('sha1').update(this.almacen.raiz).digest('hex').slice(0, 12));
  }

  /** Antes de la primera escritura del día. Devuelve la promesa de la copia (no bloquea la escritura). */
  antesDeEscribir() {
    const dia = this.hoy();
    if (this.hechaHoy === dia) return this.enCurso;
    this.hechaHoy = dia;
    this.enCurso = this.copiar(dia).catch((e) => {
      this.hechaHoy = null;
      this.error = e.message;
    });
    return this.enCurso;
  }

  async copiar(dia) {
    const dir = join(this.base(), dia);
    const existe = await this.fs.stat(dir).then(() => true, () => false);
    if (existe) return { dia, ficheros: 0, yaExistia: true };
    const tmp = `${dir}.finhub-tmp-${process.pid}`;
    await this.fs.rm(tmp, { recursive: true, force: true });
    const textos = this.almacen.textos().filter((e) => e.legible);
    const lista = [...textos];
    const trabajar = async () => {
      while (lista.length) {
        const e = lista.pop();
        const destino = join(tmp, e.ruta);
        await this.fs.mkdir(join(destino, '..'), { recursive: true });
        await this.fs.writeFile(destino, e.texto);
      }
    };
    await Promise.all(Array.from({ length: 16 }, trabajar));
    await this.fs.rename(tmp, dir);
    await this.rotar();
    return { dia, ficheros: textos.length };
  }

  /** Deja las 14 copias más recientes (solo carpetas con nombre de fecha). */
  async rotar() {
    const nombres = (await this.fs.readdir(this.base()).catch(() => [])).filter((n) => RE_DIA.test(n)).sort();
    const sobran = nombres.slice(0, Math.max(0, nombres.length - MANTENER));
    for (const n of sobran) await this.fs.rm(join(this.base(), n), { recursive: true, force: true });
    return sobran;
  }
}
