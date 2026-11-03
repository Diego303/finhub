// Tu año (§4.8): totales, mejor mes, grupo que más bajó, cartera, pulsos, fuente más acertada, metas cumplidas
// y tasa mes a mes. Todo por código; el texto «Rex dice» lo escribe Claude con tu luz verde (F10). Isomórfico.
import { patrimonioEn, totalesPorMes, tasaAgregada } from './panel.js';
import { puntosValor, indiceDeActivo } from './cartera-resumen.js';
import { flujosExternos } from './cartera.js';
import { twr, serieCompleta, indicePropio } from './rentabilidad.js';
import { todosLosMovimientos } from './metas.js';
import { aciertoPorFuente } from './conocimiento.js';
import { proporcionPb, sumar, formatearEuros, formatearPct } from './dinero.js';
import { mesFinanciero, periodoMes, sumarMesesMes, MESES, MESES_CORTOS } from './fechas.js';

/**
 * Resumen del año `anio` (meses financieros de ese año hasta hoy).
 * → {anio, meses, completo, ahorro: {total, pb}, patrimonio: {inicio, fin, cambio}, mejorMes, grupoBaja, cartera: {twr, propio},
 *    pulsos: {dias, pulsos, notas}, fuente, metas: {cumplidas: [titulos], total}, tasas: [{mes, pb}]}
 */
export function tuAnio(modelo, anio, hoy) {
  const inicio = modelo.ajustes.mes_inicio_dia;
  const actual = mesFinanciero(hoy, inicio);
  const porMes = totalesPorMes(modelo);
  const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= actual && porMes.has(m));
  const lista = meses.map((m) => porMes.get(m).totales);
  const finAnterior = periodoMes(`${anio - 1}-12`, inicio).hasta;
  const finAnio = periodoMes(`${anio}-12`, inicio).hasta;
  const fin = hoy < finAnio ? hoy : finAnio;
  const movs = todosLosMovimientos(modelo);
  const pIni = patrimonioEn(modelo, finAnterior, movs).patrimonio;
  const pFin = patrimonioEn(modelo, fin, movs).patrimonio;
  const ahorro = sumar(...lista.map((t) => t.invertido + t.ahorrado));
  const tasas = meses.map((m) => ({ mes: m, pb: porMes.get(m).totales.tasaPb }));
  const mejor = tasas.filter((t) => t.pb !== null).sort((a, b) => b.pb - a.pb)[0] ?? null;

  // grupo que más bajó: consumo por grupo frente a los MISMOS meses del año anterior (si los hay)
  const comparables = meses.filter((m) => porMes.has(sumarMesesMes(m, -12)));
  let grupoBaja = null;
  if (comparables.length >= 3) {
    const suma = (ms, id) => sumar(...ms.map((m) => porMes.get(m).totales.porGrupo.get(id)?.consumo ?? 0));
    const ids = new Set(comparables.flatMap((m) => [...porMes.get(m).totales.porGrupo.keys(), ...porMes.get(sumarMesesMes(m, -12)).totales.porGrupo.keys()]));
    const cambios = [...ids]
      .map((id) => ({ id, ahora: suma(comparables, id), antes: suma(comparables.map((m) => sumarMesesMes(m, -12)), id) }))
      .filter((x) => x.antes >= 10000 && modelo.grupos.find((g) => g.id === x.id)?.naturaleza === 'consumo')
      .map((x) => ({ ...x, nombre: modelo.grupos.find((g) => g.id === x.id).nombre, pb: proporcionPb(x.ahora - x.antes, x.antes) }))
      .sort((a, b) => a.pb - b.pb);
    grupoBaja = cambios[0] && cambios[0].pb < 0 ? { ...cambios[0], meses: comparables.length } : null;
  }

  // cartera en el año: TWR desde la última foto del año anterior; índice propio en los mismos meses
  let cartera = null;
  const puntos = puntosValor({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hoy: fin });
  const desde = [...puntos].reverse().find((p) => p.fecha <= finAnterior) ?? puntos.find((p) => p.fecha.startsWith(String(anio)));
  if (desde) {
    const r = twr(puntos, flujosExternos(modelo.operaciones, { hasta: fin }), { desde: desde.fecha });
    const ms = [];
    for (let m = desde.fecha.slice(0, 7); m <= fin.slice(0, 7); m = sumarMesesMes(m, 1)) ms.push(m);
    const comp = modelo.objetivo.map((o) => {
      const id = indiceDeActivo(modelo.activos.find((a) => a.id === o.activo), modelo.clases);
      const filas = id ? modelo.serie(id) : null;
      return { peso: o.peso, serie: filas ? serieCompleta(filas) : null };
    });
    const validos = ms.filter((m) => comp.every((c) => !c.serie || c.serie.get(m)));
    const ip = comp.length && validos.length > 1 ? indicePropio(comp, validos) : null;
    cartera = { twr: r.tasa, aprox: r.aprox, desde: desde.fecha, propio: ip ? ip.get(validos.at(-1)) / ip.get(validos[0]) - 1 : null };
  }

  const dias = modelo.mundo.filter((d) => d.fecha.startsWith(String(anio)) && d.fecha <= hoy);
  const fuentes = [...aciertoPorFuente(modelo.predicciones).values()].filter((f) => f.aciertoPb !== null).sort((a, b) => b.aciertoPb - a.aciertoPb);
  const fuente = fuentes[0] ? { ...fuentes[0], nombre: modelo.fuentes.find((x) => x.id === fuentes[0].fuente)?.nombre ?? fuentes[0].fuente } : null;
  const cumplidas = modelo.metas.filter((x) => x.campos.estado?.estado === 'cumplida' && (x.campos.estado.fecha ?? '').startsWith(String(anio)));
  const vivas = modelo.metas.filter((x) => x.campos.estado?.estado !== 'archivada' && !(x.campos.estado?.estado === 'cumplida' && !(x.campos.estado.fecha ?? '').startsWith(String(anio))));
  return {
    anio,
    meses,
    completo: hoy >= finAnio,
    ahorro: { total: ahorro, pb: tasaAgregada(lista), entradas: sumar(...lista.map((t) => t.entradas)) },
    patrimonio: { inicio: pIni, fin: pFin, cambio: pFin - pIni },
    mejorMes: mejor,
    grupoBaja,
    cartera,
    pulsos: { dias: dias.filter((d) => d.pulsos.length).length, pulsos: sumar(...dias.map((d) => d.pulsos.length)), notas: sumar(...dias.map((d) => d.notas.length)) },
    fuente,
    metas: { cumplidas: cumplidas.map((x) => x.titulo), total: vivas.length },
    tasas,
    consumo: sumar(...lista.map((t) => t.consumo)),
  };
}

/** Texto de las 8 tarjetas (el mismo en la web y en el PNG). → [{titulo, valor, sub, color}] */
export function tarjetas(t) {
  const eur = (c) => formatearEuros(c, 0);
  const pct = (x) => (x === null || x === undefined ? '—' : formatearPct(Math.round(x * 10000)));
  const sube = t.patrimonio.cambio >= 0;
  return [
    { titulo: 'Ahorraste e invertiste', valor: eur(t.ahorro.total), sub: t.ahorro.pb === null ? 'sin entradas' : `${Math.round(t.ahorro.pb / 100)} % de lo que entró`, color: '#1D9E75' },
    { titulo: sube ? 'Tu patrimonio creció' : 'Tu patrimonio bajó', valor: `${sube ? '+' : '−'}${eur(Math.abs(t.patrimonio.cambio))}`, sub: `de ${eur(t.patrimonio.inicio)} a ${eur(t.patrimonio.fin)}`, color: '#D85A30' },
    { titulo: 'Tu mejor mes', valor: t.mejorMes ? MESES[+t.mejorMes.mes.slice(5) - 1] : '—', sub: t.mejorMes ? `tasa de ahorro del ${Math.round(t.mejorMes.pb / 100)} %` : 'sin meses con entradas', color: '#378ADD' },
    { titulo: 'El grupo que más bajó', valor: t.grupoBaja ? `${t.grupoBaja.nombre} ${formatearPct(t.grupoBaja.pb, 0)}` : '—', sub: t.grupoBaja ? `vs ${t.anio - 1} (${t.grupoBaja.meses} meses)` : `sin datos de ${t.anio - 1} para comparar`, color: '#7F77DD' },
    { titulo: 'Tu cartera', valor: t.cartera ? pct(t.cartera.twr) : '—', sub: t.cartera ? `índice propio ${pct(t.cartera.propio)}` : 'sin fotos de valor', color: '#D85A30' },
    { titulo: 'Pulsos hechos', valor: String(t.pulsos.pulsos), sub: `${t.pulsos.notas} noticias en tu base`, color: '#1D9E75' },
    { titulo: 'Tu fuente más acertada', valor: t.fuente ? t.fuente.nombre : '—', sub: t.fuente ? `${Math.round(t.fuente.aciertoPb / 100)} % de acierto (${t.fuente.resueltas} resueltas)` : 'hacen falta 5 predicciones resueltas', color: '#378ADD' },
    { titulo: 'Metas cumplidas', valor: `${t.metas.cumplidas.length} de ${t.metas.total}`, sub: t.metas.cumplidas.length ? `${t.metas.cumplidas.join(', ')} ✓` : 'este año, ninguna aún', color: '#BA7517' },
  ];
}

/** «enero – noviembre · se completa el 31 de diciembre» */
export function periodoTexto(t) {
  if (!t.meses.length) return 'aún sin meses';
  const de = MESES[+t.meses[0].slice(5) - 1];
  const a = MESES[+t.meses.at(-1).slice(5) - 1];
  return `${de === a ? de : `${de} – ${a}`}${t.completo ? '' : ' · se completa el 31 de diciembre'}`;
}

export const etiquetaMes = (mes) => MESES_CORTOS[+mes.slice(5) - 1];
