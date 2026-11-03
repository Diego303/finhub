// Ejecuta un trabajo de punta a punta (§0.3, §8): R1 de la especificación y de la entrada, par sesión →
// trabajo, prompt, Claude aislado, extracción y validación del JSON, verificador, registro y cuarentena.
// El motor NO escribe en tus datos: devuelve una propuesta que se aplica con una operación (tu luz verde).
import { randomBytes } from 'node:crypto';
import { problemasR1, problemasEntrada } from './r1.js';
import { montarPrompt } from './contexto.js';
import { ejecutar } from './runner.js';
import { extraerJson, validar } from './validar.js';
import { cifrasNoVerificadas, permitidos, revisarCitas, idsInventados, revisarProbabilidades, recomendaciones } from './verificador.js';
import { registrar, aCuarentena } from './registro.js';
import { slug } from '../core/ids.js';

/** Textos que se muestran al usuario dentro del JSON (para el verificador de cifras). */
const TEXTOS = ['respuesta_md', 'comentario_md', 'tesis', 'resumen', 'argumento', 'coinciden', 'discrepan', 'opinion_modelo', 'ya_tienes', 'solapamiento'];
function textosDe(x, out = []) {
  if (Array.isArray(x)) x.forEach((y) => textosDe(y, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) (TEXTOS.includes(k) && typeof v === 'string' ? out.push(v) : textosDe(v, out));
  return out;
}
const probabilidadesDe = (json) => (json?.escenarios ?? []).map((e) => e.prob);

/** Comprueba la salida: JSON, esquema, reglas del trabajo y verificador. → {ok, json, motivo, avisos, reintentar} */
/** Transformación determinista antes de validar: los «temas» pasan a id (minúsculas, sin tildes, guiones). */
function normalizarTemas(x) {
  if (Array.isArray(x)) x.forEach(normalizarTemas);
  else if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) {
      if (k === 'temas' && Array.isArray(v)) x[k] = [...new Set(v.filter((t) => typeof t === 'string').map(slug).filter((t) => t !== 'x'))];
      else normalizarTemas(v);
    }
}

export function procesarSalida(trabajo, texto, { prompt, params, modelo, bloques }) {
  const { json, texto: visible, error } = extraerJson(texto);
  if (error) return { ok: false, motivo: error };
  normalizarTemas(json);
  const errores = validar(json, trabajo.esquema);
  if (errores.length) return { ok: false, motivo: `no cumple el formato: ${errores.slice(0, 5).join(' · ')}` };
  const reglas = trabajo.comprobar?.(json, { params, modelo }) ?? [];
  if (reglas.length) return { ok: false, motivo: reglas.slice(0, 5).join(' · ') };
  const probs = revisarProbabilidades(probabilidadesDe(json));
  if (probs.length) return { ok: false, motivo: probs.join(' · '), reintentar: true };
  const avisos = [];
  // citas: las que no existen en <datos> se quitan y se avisa (salvo URLs, en los trabajos con internet)
  if (Array.isArray(json.citas)) {
    const r = revisarCitas(json.citas, prompt.ids);
    if (r.inventadas.length) avisos.push(`citas que no existen (quitadas): ${r.inventadas.join(', ')}`);
    json.citas = r.validas;
  }
  const textos = [visible, ...textosDe(json)].join('\n');
  const inventados = idsInventados(textos, prompt.ids);
  if (inventados.length) avisos.push(`ids citados que no están en tus notas: ${inventados.join(', ')}`);
  if (!trabajo.internet) {
    const dudosas = cifrasNoVerificadas(textos, permitidos({ cifras: prompt.cifras, datos: bloques.map((b) => b.contenido).join('\n'), probabilidades: probabilidadesDe(json) }));
    if (dudosas.length) avisos.push(`cifra(s) no verificada(s): ${[...new Set(dudosas.map((d) => d.texto))].slice(0, 8).join(', ')}`);
  }
  const rec = recomendaciones(textos);
  if (rec.length) avisos.push(`lenguaje de recomendación: ${rec.join(', ')}`);
  return { ok: true, json, texto: visible, avisos };
}

/**
 * opciones: {trabajo, modelo (de finhub), params, hoy, desclasificar, resume, servicio, sesiones, runner: {comando, sandboxBase, env}, alEvento, senal}
 * → {id, estado: ok|cuarentena|error|rechazado, json?, texto?, avisos, mensaje?, seleccion?, registro}
 */
export async function ejecutarTrabajo({ trabajo, modelo, params = {}, hoy, desclasificar = false, resume = null, servicio, sesiones, runner, alEvento = () => {}, senal = null, modeloClaude = null }) {
  const id = randomBytes(4).toString('hex');
  const inicio = new Date().toISOString();
  const t0 = Date.now();
  const linea = { id, trabajo: trabajo.id, inicio, internet: trabajo.internet, privado: trabajo.privado, externo: trabajo.externo };
  const fin = async (r) => {
    Object.assign(linea, { duracionMs: Date.now() - t0, estado: r.estado, motivo: r.motivo ?? r.mensaje ?? null, avisos: r.avisos ?? [] });
    await registrar(servicio, linea).catch(() => {});
    alEvento({ tipo: 'fin', id, estado: r.estado });
    return { id, ...r, registro: linea };
  };
  const r1 = problemasR1(trabajo);
  if (r1.length) return fin({ estado: 'rechazado', mensaje: `R1: ${r1.join(' · ')}` });
  const entrada = trabajo.entrada(modelo, { ...params, hoy });
  const bloques = entrada.bloques ?? [];
  const pe = problemasEntrada(trabajo, bloques, { desclasificar });
  linea.entradas = bloques.map((b) => `${b.origen}:${b.nivel}${b.ids ? `(${b.ids.length})` : ''}`);
  if (pe.length) return fin({ estado: 'rechazado', mensaje: `R1: ${pe.join(' · ')}` });
  if (resume) {
    try {
      await sesiones.comprobar(resume, trabajo.id);
    } catch (e) {
      return fin({ estado: 'rechazado', mensaje: e.message });
    }
  }
  const prompt = montarPrompt(trabajo, { ...entrada, bloques, hoy });
  alEvento({ tipo: 'inicio', id, trabajo: trabajo.id, seleccion: entrada.seleccion ? { usadas: entrada.seleccion.usadas, total: entrada.seleccion.total } : null });
  let intento = 0;
  for (;;) {
    const r = await ejecutar(trabajo, { sistema: prompt.sistema, usuario: prompt.usuario, modelo: modeloClaude ?? trabajo.modelo, resume, ...runner, senal, alEvento: (e) => alEvento({ ...e, id }) });
    Object.assign(linea, { modelo: r.init?.modelo ?? null, version: r.init?.version ?? null, herramientas: r.herramientas, turnos: r.resultado?.turnos ?? null, coste: r.resultado?.coste ?? null, sesion: trabajo.sesion ? r.sesion : null });
    if (r.estado !== 'ok') return fin({ estado: 'error', codigo: r.codigo, mensaje: r.mensaje, motivo: [r.mensaje, ...(r.motivos ?? [])].filter(Boolean).join(' · ') });
    if (trabajo.sesion && r.sesion) await sesiones.guardar(r.sesion, trabajo.id).catch(() => {});
    const p = procesarSalida(trabajo, r.texto, { prompt, params: { ...params, hoy }, modelo, bloques });
    if (p.ok) return fin({ estado: 'ok', json: p.json, texto: p.texto, avisos: p.avisos, sesion: trabajo.sesion ? r.sesion : null, seleccion: entrada.seleccion ? { usadas: entrada.seleccion.usadas, total: entrada.seleccion.total } : null });
    if (p.reintentar && intento++ === 0) continue;
    const rel = await aCuarentena(servicio, { id, trabajo: trabajo.id, inicio, motivo: p.motivo, texto: r.texto, json: null }).catch(() => null);
    return fin({ estado: 'cuarentena', motivo: p.motivo, mensaje: `La salida de Claude no pasó la validación (${p.motivo}): está en .finhub/${rel ?? 'cuarentena/'} y no ha tocado tus datos.` });
  }
}
