// Registro de ejecuciones (§0.3.12) en .finhub/registro/AAAA-MM.jsonl, cuarentena (§0.3.10) en
// .finhub/cuarentena/ y el par sesión → trabajo (§0.3.8) fuera de la carpeta (es de esta máquina).
import fsp from 'node:fs/promises';
import { dirname } from 'node:path';

const colas = new WeakMap();

/** servicio: {leer(rel) → texto|null, escribir(rel, texto)} (los ficheros .finhub/ del almacén). */
export function registrar(servicio, linea) {
  // leer y reescribir no es atómico: en cola por servicio, para que dos trabajos a la vez no pierdan líneas
  const rel = `registro/${linea.inicio.slice(0, 7)}.jsonl`;
  const previa = colas.get(servicio) ?? Promise.resolve();
  const hecha = previa.catch(() => {}).then(async () => {
    const previo = (await servicio.leer(rel)) ?? '';
    await servicio.escribir(rel, `${previo}${JSON.stringify(linea)}\n`);
  });
  colas.set(servicio, hecha);
  return hecha;
}

export async function leerRegistro(servicio, mes) {
  const t = (await servicio.leer(`registro/${mes}.jsonl`)) ?? '';
  return t.split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

export async function aCuarentena(servicio, { id, trabajo, inicio, motivo, texto, json }) {
  const rel = `cuarentena/${inicio.replace(/[:.]/g, '').slice(0, 15)}-${trabajo}-${id}.json`;
  await servicio.escribir(rel, `${JSON.stringify({ id, trabajo, fecha: inicio, motivo, texto, json }, null, 1)}\n`);
  return rel;
}

/** Par sesión → trabajo: una sesión solo se reanuda con el MISMO trabajo (docs/CLAUDE-CLI.md §5). */
export class Sesiones {
  constructor(ruta) {
    this.ruta = ruta;
    this.mapa = null;
  }
  async cargar() {
    if (this.mapa) return this.mapa;
    try {
      this.mapa = JSON.parse(await fsp.readFile(this.ruta, 'utf8'));
    } catch {
      this.mapa = {};
    }
    return this.mapa;
  }
  async comprobar(sesion, trabajo) {
    const m = await this.cargar();
    if (!m[sesion]) throw Object.assign(new Error('esa conversación no es de finhub o ya no existe'), { codigo: 'sesion' });
    if (m[sesion] !== trabajo) throw Object.assign(new Error(`esa conversación es del trabajo «${m[sesion]}»: no se puede reanudar como «${trabajo}»`), { codigo: 'sesion' });
  }
  async guardar(sesion, trabajo) {
    const m = await this.cargar();
    if (m[sesion] && m[sesion] !== trabajo) throw Object.assign(new Error('sesión ya asociada a otro trabajo'), { codigo: 'sesion' });
    m[sesion] = trabajo;
    await fsp.mkdir(dirname(this.ruta), { recursive: true });
    const tmp = `${this.ruta}.finhub-tmp-${process.pid}`;
    await fsp.writeFile(tmp, JSON.stringify(m));
    await fsp.rename(tmp, this.ruta);
  }
}
