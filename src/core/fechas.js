// Fechas como cadenas ISO "AAAA-MM-DD", sin horas ni zonas (§9.21). La aritmética usa días
// civiles (algoritmo de H. Hinnant), así que nada depende de TZ ni del cambio de hora.
// Solo `fechaLocal(date)` mira el reloj del sistema, para saber qué día es «hoy» en tu zona.

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
export const diasDelMes = (a, m) => [31, esBisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const dos = (n) => String(n).padStart(2, '0');
const cuatro = (n) => String(n).padStart(4, '0');

/** Descompone "AAAA-MM-DD" → {a, m, d} o null si no existe en el calendario. */
export function partes(fecha) {
  const r = RE_FECHA.exec(String(fecha));
  if (!r) return null;
  const a = +r[1];
  const m = +r[2];
  const d = +r[3];
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > diasDelMes(a, m)) return null;
  return { a, m, d };
}

export const esFecha = (f) => partes(f) !== null;
export const esMes = (s) => RE_MES.test(String(s));
export const esHora = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
export const componer = (a, m, d) => `${cuatro(a)}-${dos(m)}-${dos(d)}`;

/** Días desde 1970-01-01 (puede ser negativo). */
export function aDias(fecha) {
  const p = partes(fecha);
  if (!p) throw new RangeError(`fecha no válida: ${fecha}`);
  const y = p.m <= 2 ? p.a - 1 : p.a;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (p.m + (p.m > 2 ? -3 : 9)) + 2) / 5) + p.d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverso de aDias. */
export function desdeDias(n) {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return componer(yoe + era * 400 + (m <= 2 ? 1 : 0), m, d);
}

export const sumarDias = (f, n) => desdeDias(aDias(f) + n);
export const diasEntre = (desde, hasta) => aDias(hasta) - aDias(desde);
export const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // las ISO se ordenan como texto
/** 0 = lunes … 6 = domingo. */
export const diaSemana = (f) => (((aDias(f) + 3) % 7) + 7) % 7;

/** Suma meses a una fecha; si el día no existe, el último del mes (31 ene + 1 → 28/29 feb). */
export function sumarMeses(fecha, n) {
  const p = partes(fecha);
  if (!p) throw new RangeError(`fecha no válida: ${fecha}`);
  const total = p.a * 12 + (p.m - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return componer(a, m, Math.min(p.d, diasDelMes(a, m)));
}

// ---------- meses "AAAA-MM" ----------
export function partesMes(mes) {
  if (!esMes(mes)) throw new RangeError(`mes no válido: ${mes}`);
  return { a: +mes.slice(0, 4), m: +mes.slice(5, 7) };
}
export const mesDe = (fecha) => String(fecha).slice(0, 7);
export function sumarMesesMes(mes, n) {
  const { a, m } = partesMes(mes);
  const total = a * 12 + (m - 1) + n;
  return `${cuatro(Math.floor(total / 12))}-${dos((total % 12) + 1)}`;
}
export const mesesEntre = (desde, hasta) => {
  const x = partesMes(desde);
  const y = partesMes(hasta);
  return (y.a - x.a) * 12 + (y.m - x.m);
};
export const primerDia = (mes) => `${mes}-01`;
export const ultimoDia = (mes) => {
  const { a, m } = partesMes(mes);
  return componer(a, m, diasDelMes(a, m));
};

// ---------- mes financiero (§4.1) ----------
function validarDiaInicio(diaInicio) {
  if (!Number.isInteger(diaInicio) || diaInicio < 1 || diaInicio > 28) throw new RangeError(`día de inicio no válido: ${diaInicio} (1–28)`);
}

/**
 * Periodo del mes `mes` con inicio el día `diaInicio`. El mes se nombra por el que TERMINA:
 * con inicio 25, «2026-11» va del 2026-10-25 al 2026-11-24.
 */
export function periodoMes(mes, diaInicio = 1) {
  validarDiaInicio(diaInicio);
  if (diaInicio === 1) return { desde: primerDia(mes), hasta: ultimoDia(mes) };
  const anterior = sumarMesesMes(mes, -1);
  return { desde: `${anterior}-${dos(diaInicio)}`, hasta: `${mes}-${dos(diaInicio - 1)}` };
}

/** Mes (financiero) al que pertenece una fecha. */
export function mesFinanciero(fecha, diaInicio = 1) {
  validarDiaInicio(diaInicio);
  const p = partes(fecha);
  if (!p) throw new RangeError(`fecha no válida: ${fecha}`);
  const mes = mesDe(fecha);
  return diaInicio === 1 || p.d < diaInicio ? mes : sumarMesesMes(mes, 1);
}

export const enPeriodo = (fecha, { desde, hasta }) => fecha >= desde && fecha <= hasta;

// ---------- semanas ISO ----------
/** Semana ISO 8601 → {anio, semana, id: "AAAA-Www"}. */
export function semanaIso(fecha) {
  const n = aDias(fecha);
  const jueves = n - diaSemana(fecha) + 3; // el jueves de esa semana decide el año
  const anio = +desdeDias(jueves).slice(0, 4);
  const semana = Math.floor((jueves - aDias(`${anio}-01-01`)) / 7) + 1;
  return { anio, semana, id: `${anio}-W${dos(semana)}` };
}

/** Lunes y domingo de la semana ISO de una fecha. */
export function limitesSemana(fecha) {
  const lunes = sumarDias(fecha, -diaSemana(fecha));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

// ---------- hoy y textos ----------
/** Fecha local del sistema (zona del usuario) para un Date: el único punto que mira la TZ. */
export const fechaLocal = (date = new Date()) => componer(date.getFullYear(), date.getMonth() + 1, date.getDate());
export const horaLocal = (date = new Date()) => `${dos(date.getHours())}:${dos(date.getMinutes())}`;

/** "3 nov" */
export function textoCorto(fecha) {
  const p = partes(fecha);
  return `${p.d} ${MESES_CORTOS[p.m - 1]}`;
}
/** "martes 3 nov 2026" (cabecera de la maqueta) */
export function textoLargo(fecha) {
  const p = partes(fecha);
  return `${DIAS_SEMANA[diaSemana(fecha)]} ${p.d} ${MESES_CORTOS[p.m - 1]} ${p.a}`;
}
/** "Noviembre 2026" (título del fichero del mes) */
export function tituloMes(mes) {
  const { a, m } = partesMes(mes);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`;
}
/** Años (fracción, base 365) entre dos fechas, para XIRR. */
export const anios = (desde, hasta) => diasEntre(desde, hasta) / 365;
