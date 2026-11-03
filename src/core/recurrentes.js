// Calendario de los recurrentes (§2.5): qué toca cada mes y cuándo se cobra.
import { periodoMes, partesMes, diasDelMes, sumarMesesMes, mesesEntre, enPeriodo, mesFinanciero, sumarDias } from './fechas.js';

const PASO = { mes: 1, bimestre: 2, trimestre: 3, semestre: 6, año: 12 };

/** Fecha de cobro del día D dentro del periodo del mes (financiero). */
export function fechaCobro(mes, dia, inicio = 1) {
  const p = periodoMes(mes, inicio);
  const candidatos = [sumarMesesMes(mes, -1), mes].map((m) => {
    const { a, m: mm } = partesMes(m);
    return `${m}-${String(Math.min(dia, diasDelMes(a, mm))).padStart(2, '0')}`;
  });
  return candidatos.find((f) => enPeriodo(f, p)) ?? p.hasta;
}

/**
 * ¿Toca este recurrente en `mes`? → fecha de cobro o null.
 * Anuales: el día DD-MM. Bimestral, trimestral y semestral: cada N meses desde `desde`
 * (si no hay ancla, desde `ancla` = mes de creación que pasa el que llama; sin ninguna, se asume que toca).
 */
export function cobroEnMes(rec, mes, { inicio = 1, ancla = null } = {}) {
  if (rec.pausado) return null;
  if (rec.desde && mes < rec.desde) return null;
  if (rec.hasta && mes > rec.hasta) return null;
  const p = periodoMes(mes, inicio);
  if (rec.cada === 'año') {
    if (!rec.dia?.mes) return null;
    for (const a of new Set([p.desde.slice(0, 4), p.hasta.slice(0, 4)])) {
      const f = `${a}-${String(rec.dia.mes).padStart(2, '0')}-${String(Math.min(rec.dia.dia, diasDelMes(+a, rec.dia.mes))).padStart(2, '0')}`;
      if (enPeriodo(f, p)) return f;
    }
    return null;
  }
  const paso = PASO[rec.cada];
  if (!paso) return null;
  const base = rec.desde ?? ancla;
  if (paso > 1 && base && ((mesesEntre(base, mes) % paso) + paso) % paso !== 0) return null;
  return fechaCobro(mes, rec.dia?.dia ?? 1, inicio);
}

/** Recurrentes que tocan en un mes → [{rec, fecha}] ordenados por fecha. */
export function recurrentesDelMes(recurrentes, mes, opciones = {}) {
  return recurrentes
    .map((rec) => ({ rec, fecha: cobroEnMes(rec, mes, opciones) }))
    .filter((x) => x.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/**
 * Próximos cobros desde `hoy` (incluido) durante `dias` días, saltando los ya confirmados o saltados.
 * `marcas(mes)` → {idRec: 'confirmado'|'saltado'} de ese mes.
 */
export function proximos(recurrentes, hoy, { dias = 30, inicio = 1, marcas = () => ({}) } = {}) {
  const fin = sumarDias(hoy, dias);
  const res = [];
  for (let mes = mesFinanciero(hoy, inicio), i = 0; i < 14 && periodoMes(mes, inicio).desde <= fin; mes = sumarMesesMes(mes, 1), i++) {
    const m = marcas(mes) ?? {};
    for (const { rec, fecha } of recurrentesDelMes(recurrentes, mes, { inicio })) {
      if (fecha >= hoy && fecha <= fin && !m[rec.id]) res.push({ fecha, mes, rec });
    }
  }
  return res.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
