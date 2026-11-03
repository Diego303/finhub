// Papelera de 30 días (§2.5): .finhub/papelera/_indice.jsonl + copia de los ficheros enteros.
// Las entidades y bloques guardan su texto en el índice; los ficheros, en papelera/AAAA-MM-DD/<id>/<ruta>.
import { randomBytes } from 'node:crypto';
import { parsearJsonl, validarPapelera, filaJsonl } from '../core/formato/servicio.js';

export const DIAS = 30;
const INDICE = 'papelera/_indice.jsonl';
const DIA_MS = 24 * 3600 * 1000;

export class Papelera {
  constructor({ almacen, ahora = () => Date.now() }) {
    this.almacen = almacen;
    this.ahora = ahora;
  }

  async listar() {
    const t = await this.almacen.leerServicio(INDICE);
    return t === null ? [] : parsearJsonl(t, validarPapelera).filas;
  }

  async guardarIndice(filas) {
    await this.almacen.escribirServicio(INDICE, filas.map(filaJsonl).join(''));
  }

  /** Guarda entradas que vienen de una operación ({que, ruta, tipo, contenido, seccion?, indice?}). → ids */
  async enviar(entradas) {
    if (!entradas.length) return [];
    const filas = await this.listar();
    const ahora = new Date(this.ahora());
    const ids = [];
    for (const e of entradas) {
      const id = `p-${ahora.toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}`;
      const fila = { id, que: e.que, ruta: e.ruta, tipo: e.tipo, borrado: ahora.toISOString(), expira: new Date(ahora.getTime() + DIAS * DIA_MS).toISOString() };
      if (e.seccion !== undefined && e.seccion !== null) fila.seccion = e.seccion;
      if (Number.isFinite(e.indice)) fila.indice = e.indice;
      if (e.tipo === 'fichero' || e.tipo === 'conflicto') {
        fila.archivo = `papelera/${fila.borrado.slice(0, 10)}/${id}/${e.ruta}`;
        await this.almacen.escribirServicio(fila.archivo, e.contenido);
      } else fila.contenido = e.contenido;
      filas.push(fila);
      ids.push(id);
    }
    await this.guardarIndice(filas);
    return ids;
  }

  /** Entrada completa (con el contenido del fichero) para la operación papelera.restaurar. */
  async entrada(id) {
    const f = (await this.listar()).find((x) => x.id === id);
    if (!f) return null;
    if (f.archivo) {
      const contenido = await this.almacen.leerServicio(f.archivo);
      if (contenido === null) throw new Error(`falta la copia de «${f.ruta}» en la papelera`);
      return { ...f, contenido };
    }
    return f;
  }

  /** Quita entradas del índice (tras restaurar o deshacer) y su copia si era un fichero. */
  async quitar(ids) {
    if (!ids.length) return;
    const filas = await this.listar();
    const quedan = [];
    for (const f of filas) {
      if (ids.includes(f.id)) {
        if (f.archivo) await this.almacen.borrarServicio(f.archivo).catch(() => {});
      } else quedan.push(f);
    }
    await this.guardarIndice(quedan);
  }

  /** Lo que caduca en ≤ `dias` (para avisar antes) y lo ya caducado. */
  async caducidad(dias = 3) {
    const ahora = this.ahora();
    const filas = await this.listar();
    return {
      caducadas: filas.filter((f) => Date.parse(f.expira) <= ahora),
      pronto: filas.filter((f) => Date.parse(f.expira) > ahora && Date.parse(f.expira) - ahora <= dias * DIA_MS),
    };
  }

  /** Borra de verdad lo que pasó de 30 días (el único borrado real; se avisa antes con `caducidad`). */
  async purgar() {
    const { caducadas } = await this.caducidad();
    await this.quitar(caducadas.map((f) => f.id));
    return caducadas;
  }
}
