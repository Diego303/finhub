// Ficheros de servicio en JSON (docs/FORMATOS.md §5): no son Markdown, pero también se validan.
import { esFecha } from '../fechas.js';

const ok = (valor, avisos = []) => ({ ok: true, valor, avisos });
const mal = (error) => ({ ok: false, error });

function leerJson(texto) {
  try {
    return { ok: true, valor: JSON.parse(String(texto).replace(/^﻿/, '')) };
  } catch (e) {
    return mal(`JSON no válido: ${e.message}`);
  }
}

/** ~/.config/finhub/config.json */
export function parsearConfig(texto) {
  const r = leerJson(texto);
  if (!r.ok) return r;
  const v = r.valor;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return mal('config.json debe ser un objeto');
  const avisos = [];
  if (v.esquema !== 1) avisos.push(`esquema ${v.esquema ?? '(falta)'}: se asume 1`);
  if (v.carpeta !== undefined && typeof v.carpeta !== 'string') return mal('«carpeta» debe ser una ruta');
  const recientes = Array.isArray(v.recientes) ? v.recientes.filter((x) => typeof x === 'string') : [];
  return ok({ esquema: 1, carpeta: v.carpeta ?? null, recientes }, avisos);
}
export const serializarConfig = (c) => JSON.stringify({ esquema: 1, carpeta: c.carpeta ?? null, recientes: c.recientes ?? [] }, null, 2) + '\n';

/** .finhub/abierto.lock */
export function parsearCandado(texto) {
  const r = leerJson(texto);
  if (!r.ok) return r;
  const v = r.valor;
  for (const k of ['equipo', 'inicio', 'latido']) if (typeof v?.[k] !== 'string') return mal(`al candado le falta «${k}»`);
  if (!Number.isInteger(v.pid)) return mal('al candado le falta «pid»');
  return ok({ equipo: v.equipo, pid: v.pid, inicio: v.inicio, latido: v.latido, version: v.version ?? null });
}
export const serializarCandado = (c) => JSON.stringify({ equipo: c.equipo, pid: c.pid, inicio: c.inicio, latido: c.latido, version: c.version ?? null }) + '\n';

/**
 * JSON Lines tolerante: las líneas ilegibles se devuelven aparte (nunca se pierden ni rompen el resto).
 * `validar(obj)` → mensaje de error o null.
 */
export function parsearJsonl(texto, validar = () => null) {
  const filas = [];
  const malas = [];
  String(texto).split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    try {
      const o = JSON.parse(l);
      const e = validar(o);
      if (e) malas.push({ linea: i + 1, texto: l, error: e });
      else filas.push(o);
    } catch (e) {
      malas.push({ linea: i + 1, texto: l, error: e.message });
    }
  });
  return { filas, malas };
}

export const ESTADOS_EJECUCION = ['ok', 'error', 'cancelado', 'timeout', 'cuarentena', 'abortado_guardia'];

/** Una fila de .finhub/registro/AAAA-MM.jsonl. Nunca guarda el texto del prompt. */
export function validarRegistro(o) {
  if (typeof o?.runId !== 'string') return 'falta runId';
  if (typeof o.trabajo !== 'string') return 'falta trabajo';
  if (typeof o.inicio !== 'string') return 'falta inicio';
  if (!ESTADOS_EJECUCION.includes(o.estado)) return `estado «${o.estado}» desconocido`;
  if ('prompt' in o || 'entrada' in o) return 'el registro no puede contener el texto de entrada';
  return null;
}

/** Una fila de .finhub/papelera/_indice.jsonl */
export function validarPapelera(o) {
  if (typeof o?.id !== 'string' || typeof o.ruta !== 'string') return 'faltan id o ruta';
  if (!esFecha(String(o.borrado).slice(0, 10)) || !esFecha(String(o.expira).slice(0, 10))) return 'fechas no válidas';
  return null;
}

export const filaJsonl = (o) => JSON.stringify(o) + '\n';
