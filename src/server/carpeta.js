// Cambiar de carpeta de datos (§2.6, §9.24): validar, crear, usar existente, copiar o mover.
// Garantías: «copiar» y «mover» verifican cada fichero por hash; si algo falla se deshace lo copiado
// y la carpeta antigua queda intacta; «mover» solo manda la antigua a la PAPELERA DEL SISTEMA con
// confirmación explícita (nunca la borra directamente).
import fsp from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { aRutaWsl, aRutaWindows, dentroDe } from './rutas.js';
import { leerEsquema } from '../core/formato/migraciones.js';

const hash = (buf) => createHash('sha256').update(buf).digest('hex');
const RE_TEMPORAL = /^\.finhub-tmp-/;

async function existe(ruta) {
  return fsp.stat(ruta).then((s) => s, () => null);
}

async function listarTodo(raiz) {
  const res = [];
  const visitar = async (abs, rel) => {
    for (const e of await fsp.readdir(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await visitar(join(abs, e.name), r);
      else if (e.isFile() && !RE_TEMPORAL.test(e.name) && r !== '.finhub/abierto.lock') res.push(r);
    }
  };
  await visitar(raiz, '');
  return res.sort();
}

/** ¿Es una carpeta de finhub? (tiene ajustes.md con «esquema:») */
async function esCarpetaFinhub(ruta) {
  try {
    return leerEsquema(await fsp.readFile(join(ruta, 'ajustes.md'), 'utf8')) !== null;
  } catch {
    return false;
  }
}

/**
 * Valida un destino. → {ok, ruta, rutaWindows, estado: 'no-existe'|'vacia'|'finhub'|'ajena', errores[], avisos[]}
 */
export async function validarDestino(entrada, { actual = null } = {}) {
  const errores = [];
  const avisos = [];
  let ruta;
  try {
    ruta = aRutaWsl(entrada);
  } catch (e) {
    return { ok: false, ruta: null, estado: null, errores: [e.message], avisos };
  }
  const res = { ruta, rutaWindows: aRutaWindows(ruta), estado: null, errores, avisos };
  if (actual && ruta === actual) errores.push('es la misma carpeta que usas ahora');
  else if (actual && dentroDe(ruta, actual)) errores.push('está dentro de la carpeta actual');
  else if (actual && dentroDe(actual, ruta)) errores.push('la carpeta actual está dentro de esa ruta');
  const st = await existe(ruta);
  if (st && !st.isDirectory()) errores.push('esa ruta es un fichero, no una carpeta');
  if (!st) {
    const padre = await existe(dirname(ruta));
    if (!padre || !padre.isDirectory()) errores.push(`no existe la carpeta que la contendría (${aRutaWindows(dirname(ruta))})`);
    else if (!(await puedeEscribir(dirname(ruta)))) errores.push('no hay permisos de escritura en la carpeta que la contendría');
    res.estado = 'no-existe';
  } else if (st.isDirectory()) {
    if (!(await puedeEscribir(ruta))) errores.push('no hay permisos de escritura en esa carpeta');
    const entradas = (await fsp.readdir(ruta).catch(() => [])).filter((n) => n !== 'desktop.ini');
    if (await esCarpetaFinhub(ruta)) res.estado = 'finhub';
    else if (entradas.length) {
      res.estado = 'ajena';
      avisos.push(`la carpeta ya tiene ${entradas.length} elemento(s) que no son de finhub`);
    } else res.estado = 'vacia';
  }
  if (actual && !ruta.startsWith('/mnt/') !== !actual.startsWith('/mnt/')) avisos.push('la nueva carpeta está en otro sistema de ficheros (Windows ↔ WSL)');
  else if (actual && ruta.split('/')[2] !== actual.split('/')[2] && ruta.startsWith('/mnt/')) avisos.push('la nueva carpeta está en otra unidad');
  res.ok = errores.length === 0;
  return res;
}

async function puedeEscribir(dir) {
  const prueba = join(dir, `.finhub-tmp-permisos-${randomBytes(3).toString('hex')}`);
  try {
    await fsp.writeFile(prueba, '');
    await fsp.unlink(prueba);
    return true;
  } catch {
    return false;
  }
}

/** Crea una carpeta de finhub mínima (solo ajustes.md); lo demás lo hace el asistente de la primera vez en la web. */
export async function crearCarpeta(ruta) {
  await fsp.mkdir(ruta, { recursive: true });
  const ajustes = join(ruta, 'ajustes.md');
  if (await existe(ajustes)) throw new Error('ya hay un ajustes.md en esa carpeta');
  await fsp.writeFile(ajustes, '# Ajustes\nesquema: 1\n');
}

/**
 * Copia origen → destino verificando cada fichero por hash. Si falla, borra SOLO lo que creó.
 * `progreso({hechos, total, ruta})`.
 */
export async function copiarVerificando(origen, destino, { progreso = () => {} } = {}) {
  const lista = await listarTodo(origen);
  const creados = [];
  const dirsCreados = [];
  const ocupados = [];
  for (const r of lista) if (await existe(join(destino, r))) ocupados.push(r);
  if (ocupados.length) throw new Error(`la carpeta destino ya tiene ${ocupados.length} fichero(s) con el mismo nombre (p. ej. ${ocupados[0]}): no se sobrescribe nada`);
  try {
    if (!(await existe(destino))) {
      await fsp.mkdir(destino, { recursive: true });
      dirsCreados.push(destino);
    }
    let hechos = 0;
    for (const r of lista) {
      const de = join(origen, r);
      const a = join(destino, r);
      const contenido = await fsp.readFile(de);
      const dir = dirname(a);
      const primera = await fsp.mkdir(dir, { recursive: true });
      // mkdir recursivo devuelve la primera carpeta que creó: se anotan todas las intermedias
      for (let d = dir; primera && d.length >= primera.length; d = dirname(d)) dirsCreados.push(d);
      const tmp = join(dir, `.finhub-tmp-copia-${randomBytes(3).toString('hex')}`);
      await fsp.writeFile(tmp, contenido);
      await fsp.rename(tmp, a);
      creados.push(a);
      if (hash(await fsp.readFile(a)) !== hash(contenido)) throw new Error(`la copia de «${r}» no coincide con el original`);
      progreso({ hechos: ++hechos, total: lista.length, ruta: r });
    }
    return { ficheros: lista.length };
  } catch (e) {
    for (const f of creados.reverse()) await fsp.unlink(f).catch(() => {});
    for (const d of dirsCreados.sort((x, y) => y.length - x.length)) await fsp.rmdir(d).catch(() => {});
    throw new Error(`no se pudo copiar: ${e.message}. La carpeta antigua no se ha tocado.`);
  }
}

/**
 * Manda una carpeta a la papelera del sistema. En /mnt/x/ usa la Papelera de reciclaje de Windows;
 * en WSL, la papelera de freedesktop (~/.local/share/Trash). Nunca borra directamente.
 */
export async function enviarAPapeleraSistema(ruta) {
  if (ruta.startsWith('/mnt/')) {
    const win = aRutaWindows(ruta).replaceAll("'", "''");
    const comando = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${win}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
    await new Promise((ok, mal) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { cwd: '/mnt/c', timeout: 120000 }, (e) => (e ? mal(new Error(`no se pudo enviar a la Papelera de reciclaje: ${e.message}`)) : ok())));
    return { donde: 'Papelera de reciclaje de Windows' };
  }
  const papelera = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'Trash');
  await fsp.mkdir(join(papelera, 'files'), { recursive: true });
  await fsp.mkdir(join(papelera, 'info'), { recursive: true });
  let nombre = basename(ruta);
  while (await existe(join(papelera, 'files', nombre))) nombre = `${basename(ruta)}.${randomBytes(2).toString('hex')}`;
  await fsp.writeFile(join(papelera, 'info', `${nombre}.trashinfo`), `[Trash Info]\nPath=${encodeURI(ruta)}\nDeletionDate=${new Date().toISOString().slice(0, 19)}\n`);
  await fsp.rename(ruta, join(papelera, 'files', nombre));
  return { donde: papelera };
}

/**
 * Cambia de carpeta. modo: 'usar' | 'copiar' | 'mover' | 'crear'.
 * → {ruta, modo, ficheros?, antiguaEnPapelera?, avisos}
 */
export async function cambiarCarpeta({ entrada, modo, actual = null, confirmarBorrado = false, aceptarAjenos = false, progreso, enviarAPapelera = enviarAPapeleraSistema }) {
  const v = await validarDestino(entrada, { actual });
  if (!v.ok) throw new Error(v.errores.join('; '));
  const avisos = [...v.avisos];
  if (modo === 'usar') {
    if (v.estado !== 'finhub') throw new Error('esa carpeta no es de finhub (falta ajustes.md con «esquema:»); elige «copiar», «mover» o una carpeta vacía');
    return { ruta: v.ruta, modo, avisos };
  }
  if (modo === 'crear') {
    if (v.estado === 'finhub') throw new Error('esa carpeta ya es de finhub: usa «usar»');
    if (v.estado === 'ajena' && !aceptarAjenos) throw new Error(`${v.avisos[0]}: confirma que quieres usarla igualmente`);
    await crearCarpeta(v.ruta);
    return { ruta: v.ruta, modo, avisos };
  }
  if (modo !== 'copiar' && modo !== 'mover') throw new Error(`modo desconocido «${modo}»`);
  if (!actual) throw new Error('no hay carpeta actual que copiar o mover');
  if (v.estado === 'finhub') throw new Error('la carpeta destino ya tiene datos de finhub: elige «usar» o una carpeta vacía');
  if (v.estado === 'ajena' && !aceptarAjenos) throw new Error(`${v.avisos[0]}: confirma que quieres copiar ahí igualmente`);
  const { ficheros } = await copiarVerificando(actual, v.ruta, { progreso });
  let antiguaEnPapelera = null;
  if (modo === 'mover') {
    if (confirmarBorrado) antiguaEnPapelera = await enviarAPapelera(actual);
    else avisos.push('la carpeta antigua sigue en su sitio: confirma para mandarla a la papelera');
  }
  return { ruta: v.ruta, modo, ficheros, antiguaEnPapelera, avisos };
}
