// Todo lo que enseña la pestaña Metas, calculado por código (§4.4, §5 Metas). Isomórfico.
import { progresoMetas, consumo12 } from './metas.js';
import { estadoCartera } from './cartera.js';
import { aportacionMensualInversion } from './cartera-resumen.js';
import { componentesDe, historicoMezcla, proyectarHistorico, proyectarManual, parseSupuestos, inflacionMedia, libertadFinanciera, SERIE_IPC } from './proyeccion.js';

/** Perfiles para proyectar: tu objetivo (si lo hay) y las plantillas ([{perfil, titulo, filas}]). */
export function perfiles(modelo, plantillas = []) {
  const lista = [];
  if (modelo.objetivo.length) {
    const filas = modelo.objetivo.map((o) => {
      const a = modelo.activos.find((x) => x.id === o.activo);
      return { nombre: a?.titulo ?? o.activo, peso: o.peso, clase: a?.campos.clase ?? null };
    });
    lista.push({ id: 'objetivo', titulo: 'Tu objetivo', filas });
  }
  for (const p of plantillas) lista.push({ id: p.perfil, titulo: p.titulo, filas: p.filas });
  return lista;
}

/**
 * opciones: {perfil (id), plantillas, aportacion (céntimos/mes), anios, real}
 * → {metas, consumo, perfiles, perfil, proyeccion | {error}, libertad, inicial, aportacion, anios, real, avisos}
 */
export function resumenMetas(modelo, hoy, { perfil = null, plantillas = [], aportacion = null, anios = 20, real = true } = {}) {
  const metas = progresoMetas(modelo, hoy);
  const consumo = consumo12(modelo, hoy);
  const ps = perfiles(modelo, plantillas);
  const elegido = ps.find((p) => p.id === perfil) ?? ps[0] ?? null;
  const inicial = estadoCartera({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: hoy }).valor;
  const aporta = aportacion ?? aportacionMensualInversion(modelo);
  const base = { metas, consumo, perfiles: ps, perfil: elegido, inicial, aportacion: aporta, anios, real };
  if (!elegido) return { ...base, proyeccion: { error: 'sin perfil: fija un objetivo en Cartera o añade plantillas' }, libertad: null, avisos: [] };
  const componentes = componentesDe(elegido.filas, modelo.clases);
  let proyeccion;
  let avisos = [];
  if (modelo.ajustes.proyeccion === 'manual') {
    const supuestos = parseSupuestos(modelo.ajustes.proyeccion_manual);
    if (supuestos.error) proyeccion = { error: `supuestos de proyección en Ajustes: ${supuestos.error}` };
    else {
      proyeccion = proyectarManual({ inicial, aportacion: aporta, anios, componentes, supuestos, real, inflacion: inflacionMedia(modelo.serie(SERIE_IPC)) ?? undefined });
      avisos = proyeccion.avisos;
    }
  } else {
    const historico = historicoMezcla(componentes, (id) => modelo.serie(id));
    avisos = historico.avisos;
    proyeccion = proyectarHistorico({ inicial, aportacion: aporta, anios, historico, real });
  }
  const libertad = proyeccion.error ? null : libertadFinanciera(proyeccion, consumo.consumo, modelo.ajustes.libertad_multiplicador ?? 25);
  return { ...base, proyeccion, libertad, avisos };
}
