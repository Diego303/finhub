// «Pendientes hoy» (§4.8), calculado por código. Nada se ejecuta solo: cada elemento es tu luz verde.
// El resumen al abrir y Tu año llegan en F7.
import { mesFinanciero, periodoMes, diasEntre, sumarDias, textoCorto, MESES, partesMes } from './fechas.js';
import { recurrentesDelMes, proximos } from './recurrentes.js';
import { formatearEuros } from './dinero.js';
import { RE_MEDIR } from './formato/conocimiento.js';

const PRINCIPALES = ['pulso', 'movimientos', 'recurrentes', 'valores'];

/** Qué elementos están activados en `ajustes.pendientes` ("pulso diario | movimientos 1d | …"). */
export function pendientesActivos(texto) {
  const ids = String(texto ?? '').split('|').map((t) => t.trim().split(/\s+/)[0]).filter(Boolean);
  return new Set([...ids, 'descubrimientos']);
}

const nombreMes = (mes) => MESES[partesMes(mes).m - 1];

/**
 * → {elementos: [{id, titulo, detalle, hecho, principal, accion?: {texto, destino}}], hechos, total, proximos: [{fecha, texto, importe?}]}
 * `ahora`: {fecha, hora}; `contexto`: rutas de CONTEXTO/ (las da el servidor).
 */
export function pendientes(modelo, { fecha: hoy, hora = '00:00' }, { contexto = [] } = {}) {
  const activos = pendientesActivos(modelo.ajustes.pendientes);
  const inicio = modelo.ajustes.mes_inicio_dia;
  const mes = mesFinanciero(hoy, inicio);
  const periodo = periodoMes(mes, inicio);
  const datosMes = modelo.mes(mes);
  const elementos = [];
  const anadir = (e) => activos.has(e.id) && elementos.push({ principal: PRINCIPALES.includes(e.id), ...e });

  // pulso: hecho si hoy ya hay pulso; si no, cuántos días de los últimos 14 no tienen
  const conPulso = new Set(modelo.mundo.filter((d) => d.notas.length || d.pulsos.length).map((d) => d.fecha));
  const hoyPulsos = modelo.mundo.find((d) => d.fecha === hoy)?.pulsos ?? [];
  const sinPulso = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, -i)).filter((f) => !conPulso.has(f)).length;
  anadir({ id: 'pulso', titulo: 'Pulso de noticias', hecho: conPulso.has(hoy), detalle: conPulso.has(hoy) ? `hoy: ${hoyPulsos.join(' + ') || 'hecho'}${hoyPulsos.length > 1 ? ' · fusionados' : ''}` : `hoy sin hacer · ${sinPulso} días sin pulso`, accion: { texto: conPulso.has(hoy) ? 'otro' : 'hacer', destino: 'pulso' } });

  // movimientos: el último anotado (de este mes o del anterior)
  const todos = [datosMes, modelo.mes(modelo.meses.filter((m) => m < mes).at(-1))].filter(Boolean).flatMap((m) => m.movimientos);
  const ultimo = todos.reduce((u, m) => (!u || m.fecha >= u.fecha ? m : u), null);
  const alDia = ultimo && diasEntre(ultimo.fecha, hoy) <= 1;
  anadir({ id: 'movimientos', titulo: 'Gastos y entradas al día', hecho: !!alDia, detalle: ultimo ? `último anotado: ${textoCorto(ultimo.fecha)} · ${ultimo.concepto}` : 'aún no hay movimientos este mes', accion: alDia ? null : { texto: 'anotar', destino: 'mes' } });

  // recurrentes del mes: confirmados o saltados frente a los que tocan
  const tocan = recurrentesDelMes(modelo.recurrentes, mes, { inicio });
  const marcas = datosMes?.marcas ?? {};
  const resueltos = tocan.filter((t) => marcas[t.rec.id]).length;
  anadir({ id: 'recurrentes', titulo: `Recurrentes de ${nombreMes(mes)}`, hecho: resueltos === tocan.length, detalle: `${resueltos} de ${tocan.length} confirmados`, accion: resueltos === tocan.length ? null : { texto: 'revisar', destino: 'recurrentes' } });

  // valor de la cartera: la última foto (semanal)
  const foto = modelo.fotos.at(-1);
  const reciente = foto && diasEntre(foto.fecha, hoy) <= 7;
  anadir({ id: 'valores', titulo: 'Valor de tu cartera', hecho: !!reciente, detalle: foto ? `${reciente && foto.fecha === hoy ? 'actualizado hoy' : `última vez: ${textoCorto(foto.fecha)}`} · ${foto.filas.length} activos` : 'aún sin valores', accion: reciente ? null : { texto: 'actualizar', destino: 'valores' } });

  // los demás solo aparecen cuando hay algo que hacer
  const revisar = modelo.descubrimientos.filter((d) => d.estado === 'siguiendo' && d.revisar && d.revisar <= hoy);
  if (revisar.length) anadir({ id: 'descubrimientos', titulo: 'Descubrimientos para revisar', hecho: false, detalle: revisar.map((d) => `«${d.titulo}» (${textoCorto(d.revisar)})`).join(' · '), accion: { texto: 'ver', destino: 'descubrimientos' } });
  const viejas = modelo.series.filter((s) => !s.actualizado || s.actualizado < hoy.slice(0, 8) + '01');
  if (viejas.length || !modelo.series.length) anadir({ id: 'datos', titulo: `Datos de mercado (${nombreMes(mes).slice(0, 3)})`, hecho: false, detalle: modelo.series.length ? `${viejas.length} series sin actualizar este mes` : 'aún no hay series: créalas con tu luz verde', accion: { texto: 'actualizar', destino: 'datos' } });
  const diasParaFin = diasEntre(hoy, periodo.hasta);
  if (datosMes?.estado.estado !== 'cerrado' && (diasParaFin <= 3 || Number(hoy.slice(8)) >= 28)) anadir({ id: 'cierre', titulo: `Cerrar ${nombreMes(mes)}`, hecho: false, detalle: `el mes termina el ${textoCorto(periodo.hasta)}`, accion: { texto: 'cerrar', destino: 'cierre' } });
  const ahora = `${hoy} ${hora}`;
  const listas = modelo.decisiones.filter((d) => d.estado === 'lista' || (d.estado === 'pausa-48h' && d.vuelve && `${d.vuelve.fecha} ${d.vuelve.hora}` <= ahora));
  if (listas.length) anadir({ id: 'pausas', titulo: 'Pausas listas para revisar', hecho: false, detalle: listas.map((d) => `«${d.titulo}»`).join(' · '), accion: { texto: 'revisar', destino: 'pausas' } });
  const vencidas = modelo.predicciones.filter((p) => p.estado === 'pendiente' && RE_MEDIR.exec(p.medir ?? '')?.[4] < hoy);
  if (vencidas.length) anadir({ id: 'predicciones', titulo: 'Predicciones por resolver', hecho: false, detalle: `${vencidas.length} con la fecha pasada`, accion: { texto: 'resolver', destino: 'predicciones' } });
  if (contexto.length) anadir({ id: 'contexto', titulo: 'Textos en CONTEXTO', hecho: false, detalle: `${contexto.length} por procesar`, accion: { texto: 'procesar', destino: 'contexto' } });

  // próximos 30 días: recurrentes sin confirmar y el cierre de mes
  const lista = proximos(modelo.recurrentes, hoy, { dias: 30, inicio, marcas: (m) => modelo.mes(m)?.marcas }).map((p) => ({ fecha: p.fecha, texto: p.rec.concepto.toLowerCase(), importe: formatearEuros(Math.abs(p.rec.importe)) }));
  if (datosMes?.estado.estado !== 'cerrado') lista.push({ fecha: periodo.hasta, texto: `cerrar ${nombreMes(mes)}`, destino: 'cierre' });
  lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  const principales = elementos.filter((e) => e.principal);
  return { mes, elementos, hechos: principales.filter((e) => e.hecho).length, total: principales.length, proximos: lista.slice(0, 6) };
}
