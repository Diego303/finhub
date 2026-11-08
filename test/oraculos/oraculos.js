// Oráculos independientes de finhub: escritos SOLO desde docs/PLAN.md y docs/FORMATOS.md.
// Sin imports de src/. Código deliberadamente simple: bucles claros y sin optimizar.
//
// Convenciones (ver README.md):
//  - Importes: céntimos enteros. Porcentajes de entrada: puntos básicos (pb, 19 % = 1900).
//  - Las rentabilidades y los pesos calculados son fracciones en coma flotante (0,10 = 10 %).
//  - «no concluyente» se devuelve como { estado: 'no concluyente', motivo }.
//  - Redondeo a céntimos: mitad al par. Con enteros, exacto por BigInt; en simulaciones, float.

export const NO_CONCLUYENTE = 'no concluyente';

// ───────────────────────── Redondeo ─────────────────────────

/** num/den redondeado a entero, mitad al par. Aritmética exacta con BigInt. */
export function dividirMitadPar(num, den) {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new RangeError('división por cero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d;
  let r = n % d;
  if (r < 0n) {
    q -= 1n;
    r += d;
  }
  const doble = r * 2n;
  if (doble > d || (doble === d && q % 2n !== 0n)) q += 1n;
  return Number(q);
}

/** Float a entero, mitad al par (para resultados de simulaciones). Nunca devuelve -0. */
export function redondearMitadPar(x) {
  const piso = Math.floor(x);
  const dif = x - piso;
  let r;
  if (dif > 0.5) r = piso + 1;
  else if (dif < 0.5) r = piso;
  else r = piso % 2 === 0 ? piso : piso + 1;
  return r + 0;
}

// ───────────────────────── Fechas (§4.1, FORMATOS §1.1, §9.21): solo texto y UTC ─────────────────────────

function partes(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new RangeError(`fecha ilegible: ${fecha}`);
  return { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function dosCifras(n) {
  return String(n).padStart(2, '0');
}

export function esBisiesto(a) {
  if (a % 400 === 0) return true;
  if (a % 100 === 0) return false;
  return a % 4 === 0;
}

export function diasDelMes(a, m) {
  const tabla = [31, esBisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return tabla[m - 1];
}

export function fechaValida(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return false;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return false;
  const dia = Number(m[3]);
  return dia >= 1 && dia <= diasDelMes(Number(m[1]), mes);
}

function diaAbsoluto(fecha) {
  const { a, m, d } = partes(fecha);
  return Date.UTC(a, m - 1, d) / 86400000;
}

/** Días de a hasta b (b − a). */
export function diasEntre(a, b) {
  return diaAbsoluto(b) - diaAbsoluto(a);
}

export function sumarDias(fecha, n) {
  return new Date((diaAbsoluto(fecha) + n) * 86400000).toISOString().slice(0, 10);
}

/** Suma n meses; si el día no existe en el mes de llegada, el último del mes. */
export function sumarMeses(fecha, n) {
  const { a, m, d } = partes(fecha);
  const total = a * 12 + (m - 1) + n;
  const a2 = Math.floor(total / 12);
  const m2 = total - a2 * 12 + 1;
  const d2 = Math.min(d, diasDelMes(a2, m2));
  return `${a2}-${dosCifras(m2)}-${dosCifras(d2)}`;
}

export function mesSiguiente(mes) {
  let a = Number(mes.slice(0, 4));
  let m = Number(mes.slice(5, 7)) + 1;
  if (m === 13) {
    m = 1;
    a += 1;
  }
  return `${a}-${dosCifras(m)}`;
}

export function mesAnterior(mes) {
  let a = Number(mes.slice(0, 4));
  let m = Number(mes.slice(5, 7)) - 1;
  if (m === 0) {
    m = 12;
    a -= 1;
  }
  return `${a}-${dosCifras(m)}`;
}

/** FORMATOS: mes_inicio_dia es 1–28; fuera de rango se usa el defecto (1) y se avisa. */
export function normalizarMesInicioDia(valor) {
  if (Number.isInteger(valor) && valor >= 1 && valor <= 28) return { dia: valor, aviso: false };
  return { dia: 1, aviso: true };
}

function comprobarInicio(inicio) {
  if (!Number.isInteger(inicio) || inicio < 1 || inicio > 28) {
    throw new RangeError(`mes_inicio_dia fuera de 1–28: ${inicio}`);
  }
}

/** Periodo del mes «mes» (el que TERMINA) con ese día de inicio: { desde, hasta }. */
export function periodoDeMes(mes, inicio = 1) {
  comprobarInicio(inicio);
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  if (inicio === 1) {
    return { desde: `${mes}-01`, hasta: `${mes}-${dosCifras(diasDelMes(a, m))}` };
  }
  return { desde: `${mesAnterior(mes)}-${dosCifras(inicio)}`, hasta: `${mes}-${dosCifras(inicio - 1)}` };
}

/** Mes financiero (nombre del fichero) al que pertenece una fecha. */
export function mesDeFecha(fecha, inicio = 1) {
  comprobarInicio(inicio);
  const mes = fecha.slice(0, 7);
  if (inicio === 1) return mes;
  return partes(fecha).d >= inicio ? mesSiguiente(mes) : mes;
}

/** Recurrente mensual: «dia: 31» en un mes sin 31 → último del mes (FORMATOS, recurrentes.md). */
export function fechaCobroMensual(mes, dia) {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return `${mes}-${dosCifras(Math.min(dia, diasDelMes(a, m)))}`;
}

/** Recurrente anual: «dia: DD-MM». 29-02 en año no bisiesto → 28-02; fecha imposible → null. */
export function fechaCobroAnual(ano, diaMes) {
  const d = Number(diaMes.slice(0, 2));
  const m = Number(diaMes.slice(3, 5));
  if (m < 1 || m > 12) return null;
  if (m === 2 && d === 29) return `${ano}-02-${dosCifras(diasDelMes(ano, 2))}`;
  const fecha = `${ano}-${dosCifras(m)}-${dosCifras(d)}`;
  return fechaValida(fecha) ? fecha : null;
}

// ───────────────────────── Mes (§4.1) ─────────────────────────

const SIN_GRUPO = 'sin grupo';

function naturalezaDe(mov, grupos) {
  if (mov.naturaleza) return mov.naturaleza;
  const g = grupos[mov.grupo];
  return g ? g.naturaleza : null;
}

/**
 * Totales del mes. Signos del fichero: gastos negativos, ingresos positivos.
 * Una compensación (compensa) nunca es una entrada: resta del consumo de su grupo, aunque deje
 * ese grupo en negativo (el plan no pone suelo).
 */
export function resumenMes(movimientos, grupos) {
  let entradas = 0;
  let invertido = 0;
  let ahorrado = 0;
  let traspasos = 0;
  let ajustes = 0;
  let sinGrupo = 0;
  let compensaciones = 0;
  const consumoPorGrupo = {};
  const sumarConsumo = (grupo, cantidad) => {
    consumoPorGrupo[grupo] = (consumoPorGrupo[grupo] ?? 0) + cantidad;
  };

  for (const mov of movimientos) {
    if (mov.compensa) {
      sumarConsumo(mov.compensa, -mov.importe);
      compensaciones += mov.importe;
      continue;
    }
    if (mov.ajuste) {
      ajustes += mov.importe;
      continue;
    }
    const nat = naturalezaDe(mov, grupos);
    if (nat === 'ingreso') entradas += mov.importe;
    else if (nat === 'consumo') sumarConsumo(mov.grupo ?? SIN_GRUPO, -mov.importe);
    else if (nat === 'inversion') invertido += -mov.importe;
    else if (nat === 'ahorro') ahorrado += -mov.importe;
    else if (nat === 'traspaso') traspasos += mov.importe;
    else sinGrupo += mov.importe;
  }

  let consumo = 0;
  for (const g of Object.keys(consumoPorGrupo)) consumo += consumoPorGrupo[g];

  const queda = entradas - consumo - invertido - ahorrado;
  let tasaAhorro = NO_CONCLUYENTE;
  let tasaAhorroPb = NO_CONCLUYENTE;
  if (entradas !== 0) {
    tasaAhorro = (invertido + ahorrado) / entradas;
    tasaAhorroPb = dividirMitadPar(BigInt(invertido + ahorrado) * 10000n, BigInt(entradas));
  }
  return { entradas, consumo, consumoPorGrupo, compensaciones, invertido, ahorrado, traspasos, ajustes, sinGrupo, queda, tasaAhorro, tasaAhorroPb };
}

/** El del mes sobrescribe al del grupo (también si es 0). null si no hay ninguno. */
export function presupuestoEfectivo(delGrupo, delMes) {
  if (delMes !== undefined && delMes !== null) return delMes;
  if (delGrupo !== undefined && delGrupo !== null) return delGrupo;
  return null;
}

/** verde ≤ 90 %, ámbar ≤ 100 %, rojo > 100 %. Comparación entera, sin floats. */
export function colorPresupuesto(consumo, presupuesto) {
  if (presupuesto === null || presupuesto === undefined) return null;
  if (consumo * 100 <= presupuesto * 90) return 'verde';
  if (consumo * 100 <= presupuesto * 100) return 'ambar';
  return 'rojo';
}

/**
 * Media de los últimos 6 meses CERRADOS anteriores a mesReferencia.
 * meses: [{ mes, estado: 'cerrado'|'abierto'|'reabierto', consumoPorGrupo: {grupo: céntimos} }]
 * Un grupo ausente en un mes cuenta 0; se divide por los meses usados. Sin cerrados: medias null.
 */
export function mediaUltimos6Cerrados(meses, mesReferencia) {
  const cerrados = [];
  for (const m of meses) {
    if (m.estado === 'cerrado' && m.mes < mesReferencia) cerrados.push(m);
  }
  cerrados.sort((x, y) => (x.mes < y.mes ? -1 : 1));
  const usados = cerrados.slice(-6);
  if (usados.length === 0) return { mesesUsados: [], porGrupo: {}, total: null };

  const sumas = {};
  let sumaTotal = 0;
  for (const m of usados) {
    for (const g of Object.keys(m.consumoPorGrupo)) {
      sumas[g] = (sumas[g] ?? 0) + m.consumoPorGrupo[g];
      sumaTotal += m.consumoPorGrupo[g];
    }
  }
  const porGrupo = {};
  for (const g of Object.keys(sumas)) porGrupo[g] = dividirMitadPar(sumas[g], usados.length);
  return { mesesUsados: usados.map((m) => m.mes), porGrupo, total: dividirMitadPar(sumaTotal, usados.length) };
}

// ───────────────────────── Saldos y patrimonio (§4.2) ─────────────────────────

/**
 * Saldo = saldo inicial + Σ movimientos con esa cuenta. Con «a:» el movimiento tiene dos patas:
 * mov.cuenta recibe el importe (con su signo) y mov.a recibe el opuesto; los céntimos se conservan.
 */
export function saldoCuenta(id, saldoInicial, movimientos) {
  let saldo = saldoInicial;
  for (const mov of movimientos) {
    if (mov.cuenta === id) saldo += mov.importe;
    if (mov.a === id) saldo -= mov.importe;
  }
  return saldo;
}

/** Importe del movimiento «ajuste» que deja el saldo en el valor real. */
export function importeAjusteSaldo(saldoActual, saldoReal) {
  return saldoReal - saldoActual;
}

/**
 * cuentas: [{ id, tipo, saldo }]; activos: [{ id, valor: céntimos|null, aportadoNeto }].
 * Las cuentas de deuda restan su valor absoluto. Un activo con valor null va por aportado neto
 * y queda marcado en activosSinValorar.
 */
export function patrimonioNeto(cuentas, activos = []) {
  let enCuentas = 0;
  for (const c of cuentas) {
    if (c.tipo === 'deuda') enCuentas -= Math.abs(c.saldo);
    else enCuentas += c.saldo;
  }
  let valorCartera = 0;
  const activosSinValorar = [];
  for (const a of activos) {
    if (a.valor === null || a.valor === undefined) {
      valorCartera += a.aportadoNeto;
      activosSinValorar.push(a.id);
    } else {
      valorCartera += a.valor;
    }
  }
  return { patrimonio: enCuentas + valorCartera, enCuentas, valorCartera, activosSinValorar };
}

/** Colchón en meses (float). */
export function colchonMeses(saldoColchon, consumoMedio) {
  if (consumoMedio === null || consumoMedio === undefined || consumoMedio <= 0) {
    return { estado: NO_CONCLUYENTE, motivo: 'sin consumo medio' };
  }
  return { estado: 'ok', meses: saldoColchon / consumoMedio };
}

// ───────────────────────── Impuesto (§4.3, ajustes.md) ─────────────────────────

/** Tramos del plan, en céntimos y pb. hasta null = sin límite. */
export const TRAMOS_PLAN = [
  { desde: 0, hasta: 600000, pb: 1900 },
  { desde: 600000, hasta: 5000000, pb: 2100 },
  { desde: 5000000, hasta: 20000000, pb: 2300 },
  { desde: 20000000, hasta: 30000000, pb: 2700 },
  { desde: 30000000, hasta: null, pb: 3000 },
];

/** Tramos progresivos sobre la plusvalía positiva. Se suma exacto y se redondea al final. */
export function impuestoEstimado(plusvalia, tramos = TRAMOS_PLAN) {
  if (plusvalia <= 0) return 0;
  let acumulado = 0n;
  for (const t of tramos) {
    const techo = t.hasta === null ? plusvalia : Math.min(plusvalia, t.hasta);
    if (techo > t.desde) acumulado += BigInt(techo - t.desde) * BigInt(t.pb);
  }
  return dividirMitadPar(acumulado, 10000n);
}

// ───────────────────────── Cartera (§4.3, §3.2, §9.5, §9.6) ─────────────────────────

function consumirFifo(lotes, participaciones) {
  let queda = participaciones;
  let coste = 0;
  while (queda > 0 && lotes.length > 0) {
    const lote = lotes[0];
    if (queda >= lote.p) {
      coste += lote.coste;
      queda -= lote.p;
      lotes.shift();
    } else {
      const parte = dividirMitadPar(BigInt(lote.coste) * BigInt(queda), BigInt(lote.p));
      lote.coste -= parte;
      lote.p -= queda;
      coste += parte;
      queda = 0;
    }
  }
  return { coste, sinCubrir: queda };
}

function ordenarPorFecha(lista) {
  // sort es estable: a igual fecha se respeta el orden de entrada.
  return [...lista].sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
}

/**
 * operaciones: [{ fecha, tipo, activo, destino?, importe, participaciones? }]
 *   tipo: aportacion | venta | traspaso | dividendo | comision | ajuste
 *   participaciones: entero ×10⁶ (FORMATOS, tipo cantidad).
 * fotos: [{ fecha, valores: { activo: céntimos } }]
 */
export function resumenCartera({ operaciones, fotos = [], tramos = TRAMOS_PLAN }) {
  const ops = ordenarPorFecha(operaciones);
  const fotosOrden = ordenarPorFecha(fotos);

  const ids = [];
  const anotar = (id) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const op of ops) {
    anotar(op.activo);
    anotar(op.destino);
  }
  for (const f of fotosOrden) for (const id of Object.keys(f.valores)) anotar(id);

  // FIFO solo si todo lo que entra y sale de ese activo lleva participaciones.
  const fifo = {};
  for (const id of ids) fifo[id] = false;
  const vistos = {};
  for (const op of ops) {
    if (op.tipo === 'aportacion' || op.tipo === 'venta' || op.tipo === 'traspaso') vistos[op.activo] = true;
  }
  for (const id of ids) fifo[id] = vistos[id] === true;
  for (const op of ops) {
    if (op.tipo === 'aportacion' || op.tipo === 'venta' || op.tipo === 'traspaso') {
      if (op.participaciones === undefined || op.participaciones === null) fifo[op.activo] = false;
    }
    if (op.tipo === 'traspaso' && op.destino) fifo[op.destino] = false;
  }

  const aportado = {};
  const lotes = {};
  const avisos = {};
  for (const id of ids) {
    aportado[id] = 0;
    lotes[id] = [];
    avisos[id] = [];
  }

  for (const op of ops) {
    const id = op.activo;
    if (op.tipo === 'aportacion') {
      aportado[id] += op.importe;
      if (fifo[id]) lotes[id].push({ p: op.participaciones, coste: op.importe });
    } else if (op.tipo === 'venta') {
      if (fifo[id]) {
        const { coste, sinCubrir } = consumirFifo(lotes[id], op.participaciones);
        aportado[id] -= coste;
        if (sinCubrir > 0) avisos[id].push('venta-mayor-que-lo-aportado');
      } else {
        if (op.importe > aportado[id]) avisos[id].push('venta-mayor-que-lo-aportado');
        aportado[id] -= Math.min(op.importe, aportado[id]);
      }
    } else if (op.tipo === 'traspaso') {
      let coste;
      if (fifo[id]) {
        coste = consumirFifo(lotes[id], op.participaciones).coste;
      } else {
        coste = Math.min(op.importe, aportado[id]);
      }
      aportado[id] -= coste;
      aportado[op.destino] += coste;
    }
  }

  const porActivo = {};
  let valorTotal = 0;
  let aportadoTotal = 0;
  for (const id of ids) {
    let fechaFoto = null;
    let valorFoto = null;
    for (const f of fotosOrden) {
      if (Object.hasOwn(f.valores, id)) {
        fechaFoto = f.fecha;
        valorFoto = f.valores[id];
      }
    }
    const fila = {
      aportadoNeto: aportado[id],
      coste: aportado[id],
      costeAproximado: !fifo[id],
      sinValorar: false,
      faltanValores: false,
      valor: 0,
      plusvalia: 0,
      avisos: avisos[id],
    };
    if (valorFoto === null) {
      fila.sinValorar = true;
      fila.valor = aportado[id];
    } else {
      let valor = valorFoto;
      let primeraFoto = null;
      for (const f of fotosOrden) {
        if (primeraFoto === null && Object.hasOwn(f.valores, id)) primeraFoto = f.fecha;
      }
      for (const op of ops) {
        const toca = op.activo === id || op.destino === id;
        if (toca && op.fecha < primeraFoto && !fila.avisos.includes('operacion-antes-de-la-primera-foto')) {
          fila.avisos.push('operacion-antes-de-la-primera-foto');
        }
        if (!toca || op.fecha <= fechaFoto) continue;
        let flujo = 0;
        if (op.tipo === 'aportacion' && op.activo === id) flujo = op.importe;
        if (op.tipo === 'venta' && op.activo === id) flujo = -op.importe;
        if (op.tipo === 'traspaso' && op.activo === id) flujo = -op.importe;
        if (op.tipo === 'traspaso' && op.destino === id) flujo = op.importe;
        if (flujo !== 0) {
          valor += flujo;
          fila.faltanValores = true;
        }
      }
      if (valor < 0) {
        fila.avisos.push('valor-negativo-a-cero');
        valor = 0;
      }
      fila.valor = valor;
    }
    fila.plusvalia = fila.valor - fila.coste;
    porActivo[id] = fila;
    valorTotal += fila.valor;
    aportadoTotal += fila.aportadoNeto;
  }

  const plusvalia = valorTotal - aportadoTotal;
  return {
    porActivo,
    valor: valorTotal,
    aportadoNeto: aportadoTotal,
    plusvalia,
    impuesto: impuestoEstimado(plusvalia, tramos),
  };
}

/** Flujos para la TIR, signo del inversor: aportación −, venta +, dividendo +, comisión con su signo. */
export function flujosParaXirr(operaciones, fechaFinal, valorFinal) {
  const flujos = [];
  for (const op of operaciones) {
    if (op.tipo === 'aportacion') flujos.push({ fecha: op.fecha, importe: -op.importe });
    else if (op.tipo === 'venta') flujos.push({ fecha: op.fecha, importe: op.importe });
    else if (op.tipo === 'dividendo') flujos.push({ fecha: op.fecha, importe: op.importe });
    else if (op.tipo === 'comision') flujos.push({ fecha: op.fecha, importe: op.importe });
  }
  flujos.push({ fecha: fechaFinal, importe: valorFinal });
  return flujos;
}

// ───────────────────────── TWR (§4.3) ─────────────────────────

/**
 * Dietz modificado entre fotos consecutivas, encadenado.
 * fotos: [{ fecha, valor }]; flujos: [{ fecha, importe }] con + = entra en la cartera.
 * Un flujo pertenece al periodo (t0, t1]: el del día t0 se considera ya dentro de esa foto.
 * R = (V1 − V0 − ΣF) / (V0 + Σ wF), w = (T − t) / T.
 */
export function twrDietz(fotos, flujos = []) {
  const orden = ordenarPorFecha(fotos);
  const aprox = orden.length < 3;
  const avisos = [];
  if (orden.length < 2) return { estado: NO_CONCLUYENTE, motivo: 'menos de dos fotos', aprox: true, avisos };

  for (const f of flujos) {
    if (f.fecha < orden[0].fecha) {
      avisos.push('flujo-antes-de-la-primera-foto');
      break;
    }
  }

  const periodos = [];
  let factor = 1;
  for (let i = 1; i < orden.length; i++) {
    const t0 = orden[i - 1];
    const t1 = orden[i];
    const T = diasEntre(t0.fecha, t1.fecha);
    if (T <= 0) return { estado: NO_CONCLUYENTE, motivo: 'fotos con la misma fecha', aprox, avisos };
    let suma = 0;
    let ponderada = 0;
    for (const f of flujos) {
      if (f.fecha > t0.fecha && f.fecha <= t1.fecha) {
        const w = (T - diasEntre(t0.fecha, f.fecha)) / T;
        suma += f.importe;
        ponderada += w * f.importe;
      }
    }
    const denominador = t0.valor + ponderada;
    if (denominador <= 0) return { estado: NO_CONCLUYENTE, motivo: 'capital medio no positivo', aprox, avisos };
    const r = (t1.valor - t0.valor - suma) / denominador;
    periodos.push({ desde: t0.fecha, hasta: t1.fecha, r });
    factor *= 1 + r;
  }
  const dias = diasEntre(orden[0].fecha, orden[orden.length - 1].fecha);
  return {
    estado: 'ok',
    twr: factor - 1,
    twrAnualizado: Math.pow(factor, 365 / dias) - 1,
    aprox,
    periodos,
    avisos,
  };
}

// ───────────────────────── XIRR (§4.3, §9.7) ─────────────────────────

const X_MIN = 1e-9;
const X_MAX = 1e30;
const PASOS_REJILLA = 20000;

function vanEn(flujos, x) {
  let suma = 0;
  for (const f of flujos) suma += f.importe / Math.pow(x, f.t / 365);
  return suma;
}

function derivadaEn(flujos, x) {
  let suma = 0;
  for (const f of flujos) suma += (-(f.t / 365) * f.importe) / Math.pow(x, f.t / 365 + 1);
  return suma;
}

/**
 * XIRR. flujos: [{ fecha, importe }], signo del inversor. Base ACT/365.
 * Se agrupan por día. Una rejilla en log(1+r) cuenta las raíces en r ∈ (−1 + 1e-9, 1e30):
 * ninguna o varias → no concluyente. Con una raíz: Newton desde 0,1 y, si se sale del intervalo o
 * no converge, bisección. Tolerancia 1e-7 sobre r.
 * Límite conocido: dos raíces más juntas que el paso de la rejilla (0,45 % en 1+r) cuentan como ninguna.
 */
export function xirr(flujosEntrada, { tolerancia = 1e-7 } = {}) {
  const porDia = new Map();
  for (const f of flujosEntrada) porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + f.importe);
  const fechas = [...porDia.keys()].sort();
  const flujos = [];
  for (const fecha of fechas) {
    if (porDia.get(fecha) !== 0) flujos.push({ fecha, importe: porDia.get(fecha) });
  }
  if (flujos.length < 2) return { estado: NO_CONCLUYENTE, motivo: 'un solo día con flujos' };

  let hayPositivo = false;
  let hayNegativo = false;
  for (const f of flujos) {
    if (f.importe > 0) hayPositivo = true;
    if (f.importe < 0) hayNegativo = true;
  }
  if (!hayPositivo || !hayNegativo) return { estado: NO_CONCLUYENTE, motivo: 'todos los flujos del mismo signo' };

  for (const f of flujos) f.t = diasEntre(flujos[0].fecha, f.fecha);

  const logMin = Math.log(X_MIN);
  const paso = (Math.log(X_MAX) - logMin) / PASOS_REJILLA;
  let cambios = 0;
  let a = null;
  let b = null;
  let anteriorX = null;
  let anteriorV = null;
  for (let k = 0; k <= PASOS_REJILLA; k++) {
    const x = Math.exp(logMin + k * paso);
    const v = vanEn(flujos, x);
    if (Number.isNaN(v) || v === 0) continue;
    if (anteriorV !== null && Math.sign(v) !== Math.sign(anteriorV)) {
      cambios++;
      a = anteriorX;
      b = x;
    }
    anteriorX = x;
    anteriorV = v;
  }
  if (cambios === 0) return { estado: NO_CONCLUYENTE, motivo: 'sin solución' };
  if (cambios > 1) return { estado: NO_CONCLUYENTE, motivo: 'varias soluciones', soluciones: cambios };

  // Newton-Raphson desde r = 0,1.
  let x = 1.1;
  for (let i = 0; i < 50; i++) {
    const siguiente = x - vanEn(flujos, x) / derivadaEn(flujos, x);
    if (!Number.isFinite(siguiente) || siguiente < a || siguiente > b) break;
    if (Math.abs(siguiente - x) < tolerancia) return { estado: 'ok', tasa: siguiente - 1, metodo: 'newton' };
    x = siguiente;
  }

  // Bisección de respaldo.
  let bajo = a;
  let alto = b;
  let vBajo = vanEn(flujos, bajo);
  for (let i = 0; i < 400; i++) {
    const medio = (bajo + alto) / 2;
    if (alto - bajo < tolerancia || medio === bajo || medio === alto) break;
    const v = vanEn(flujos, medio);
    if (v === 0) {
      bajo = medio;
      alto = medio;
      break;
    }
    if (Math.sign(v) === Math.sign(vBajo)) {
      bajo = medio;
      vBajo = v;
    } else {
      alto = medio;
    }
  }
  return { estado: 'ok', tasa: (bajo + alto) / 2 - 1, metodo: 'biseccion' };
}

// ───────────────────────── Comparativa e índice propio (§4.3) ─────────────────────────

/**
 * Cada flujo (+ compra, − vende) mueve unidades al cierre de su mes natural; el valor final es
 * unidades × último cierre de la serie. serie: { 'AAAA-MM': nivel }. Un flujo cuyo mes no está en la
 * serie hace el resultado no concluyente (§9.8: no se interpola aquí).
 */
export function comparativaMismasAportaciones(flujos, serie) {
  const meses = Object.keys(serie).sort();
  if (meses.length === 0) return { estado: NO_CONCLUYENTE, motivo: 'serie vacía' };
  let unidades = 0;
  const faltan = [];
  for (const f of flujos) {
    const mes = f.fecha.slice(0, 7);
    if (serie[mes] === undefined) faltan.push(mes);
    else unidades += f.importe / serie[mes];
  }
  if (faltan.length > 0) return { estado: NO_CONCLUYENTE, motivo: 'meses sin datos', faltan };
  const ultimo = serie[meses[meses.length - 1]];
  return { estado: 'ok', unidades, valorFinal: redondearMitadPar(unidades * ultimo) };
}

/** Mezcla con pesos fijos, rebalanceada cada mes, base 100, en los meses comunes a todas las series. */
export function mezclarSeries(pesos, series) {
  const claves = Object.keys(pesos).filter((c) => pesos[c] > 0);
  let sumaPesos = 0;
  for (const c of claves) sumaPesos += pesos[c];
  if (claves.length === 0) return { meses: [], niveles: [] };
  for (const c of claves) {
    if (!series[c]) return { meses: [], niveles: [] };
  }
  const meses = Object.keys(series[claves[0]])
    .filter((m) => claves.every((c) => series[c][m] !== undefined))
    .sort();
  const niveles = [];
  for (let i = 0; i < meses.length; i++) {
    if (i === 0) {
      niveles.push(100);
      continue;
    }
    let r = 0;
    for (const c of claves) {
      r += (pesos[c] / sumaPesos) * (series[c][meses[i]] / series[c][meses[i - 1]] - 1);
    }
    niveles.push(niveles[i - 1] * (1 + r));
  }
  return { meses, niveles };
}

/**
 * objetivo: { activo: pb }; activos: { activo: { clase } }; clases: { clase: { indice } };
 * series: { indice: { mes: nivel } }.
 */
export function indicePropio({ objetivo, activos, clases, series }) {
  const pesos = {};
  let suma = 0;
  for (const a of Object.keys(objetivo)) {
    const indice = clases[activos[a]?.clase]?.indice;
    if (!indice) return { estado: NO_CONCLUYENTE, motivo: `sin índice para ${a}` };
    pesos[indice] = (pesos[indice] ?? 0) + objetivo[a];
    suma += objetivo[a];
  }
  if (suma !== 10000) return { estado: NO_CONCLUYENTE, motivo: 'el objetivo no suma 100' };
  const { meses, niveles } = mezclarSeries(pesos, series);
  if (meses.length === 0) return { estado: NO_CONCLUYENTE, motivo: 'sin meses comunes' };
  return { estado: 'ok', pesos, meses, niveles };
}

// ───────────────────────── Reparto de la aportación (§4.3, objetivo.md) ─────────────────────────

/**
 * activos: [{ id, valor, objetivoPb, minimo? }]. redondeo en céntimos (10 € = 1000).
 * Objetivos que no suman 100 → { estado: 'no calcula' } (FORMATOS).
 */
export function repartoAportacion({ aportacion, activos, redondeo = 1000 }) {
  let sumaPb = 0;
  let valorTotal = 0;
  for (const a of activos) {
    sumaPb += a.objetivoPb;
    valorTotal += a.valor;
  }
  if (sumaPb !== 10000) return { estado: 'no calcula', motivo: 'los objetivos no suman 100' };

  const T = BigInt(valorTotal + aportacion);
  // Déficits ×10000 para no perder nada: max(0, pb × T − valor × 10000).
  const deficit = [];
  let sumaDeficit = 0n;
  for (const a of activos) {
    let d = BigInt(a.objetivoPb) * T - BigInt(a.valor) * 10000n;
    if (d < 0n) d = 0n;
    deficit.push(d);
    sumaDeficit += d;
  }
  if (sumaDeficit === 0n) {
    // Todo en objetivo: por pesos.
    for (let i = 0; i < activos.length; i++) {
      deficit[i] = BigInt(activos[i].objetivoPb);
      sumaDeficit += deficit[i];
    }
  }

  const asignado = [];
  let suma = 0;
  for (let i = 0; i < activos.length; i++) {
    const unidades = dividirMitadPar(BigInt(aportacion) * deficit[i], sumaDeficit * BigInt(redondeo));
    asignado.push(unidades * redondeo);
    suma += asignado[i];
  }

  // Orden de mayor a menor déficit; en empate, el primero de la lista.
  const orden = activos.map((_, i) => i);
  orden.sort((x, y) => {
    if (deficit[x] > deficit[y]) return -1;
    if (deficit[x] < deficit[y]) return 1;
    return x - y;
  });

  let resto = aportacion - suma;
  const avisos = [];

  // Mínimo: nada entre 0 y el mínimo; lo que no llega pasa al resto.
  for (let i = 0; i < activos.length; i++) {
    const minimo = activos[i].minimo ?? 0;
    if (asignado[i] > 0 && asignado[i] < minimo) {
      resto += asignado[i];
      asignado[i] = 0;
      avisos.push(`minimo:${activos[i].id}`);
    }
  }

  if (resto > 0) {
    let receptor = -1;
    for (const i of orden) {
      if (asignado[i] + resto >= (activos[i].minimo ?? 0)) {
        receptor = i;
        break;
      }
    }
    if (receptor === -1) {
      receptor = orden[0];
      avisos.push('minimo-inalcanzable');
    }
    asignado[receptor] += resto;
    resto = 0;
  } else if (resto < 0) {
    // Se pasó al redondear: se quita del de mayor déficit y, si no basta, del siguiente.
    for (const i of orden) {
      const quita = Math.min(asignado[i], -resto);
      asignado[i] -= quita;
      resto += quita;
      if (resto === 0) break;
    }
  }

  const reparto = {};
  const deficits = {};
  for (let i = 0; i < activos.length; i++) {
    reparto[activos[i].id] = asignado[i];
    deficits[activos[i].id] = dividirMitadPar(deficit[i], 10000n);
  }
  return { estado: 'ok', reparto, deficits, avisos };
}

/**
 * Propiedades válidas para cualquier lectura razonable del reparto. Pensada para pasarle también la
 * salida real: reparto = { id: céntimos }. Devuelve la lista de violaciones (vacía = correcto).
 */
export function comprobarReparto(reparto, { aportacion, activos, redondeo = 1000 }) {
  const violaciones = [];
  let suma = 0;
  let noMultiplos = 0;
  for (const a of activos) {
    const x = reparto[a.id] ?? 0;
    suma += x;
    if (x < 0) violaciones.push(`negativo:${a.id}`);
    if (x % redondeo !== 0) noMultiplos++;
    if (a.minimo && x > 0 && x < a.minimo && aportacion >= a.minimo) violaciones.push(`bajo-minimo:${a.id}`);
  }
  if (suma !== aportacion) violaciones.push(`suma:${suma}≠${aportacion}`);
  if (noMultiplos > 1) violaciones.push(`no-multiplos:${noMultiplos}`);
  return violaciones;
}

// ───────────────────────── Percentiles y PRNG ─────────────────────────

/** Percentil p (0–100) con interpolación lineal (tipo 7) sobre una lista ya ordenada. */
export function percentil(ordenados, p) {
  const n = ordenados.length;
  if (n === 0) return null;
  const pos = (p / 100) * (n - 1);
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
}

/** Mulberry32 (§2.1, prng.js): devuelve una función que da floats en [0, 1). */
export function mulberry32(semilla) {
  let a = semilla | 0;
  return function siguiente() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── Proyección y libertad (§4.4) ─────────────────────────

/** «rv 5,5 · 14 | rf 1,5 · 4» → { rv: { realPb: 550, volPb: 1400 }, … } */
export function parsearProyeccionManual(texto) {
  const salida = {};
  for (const trozo of texto.split('|')) {
    const m = /^\s*(\S+)\s+([\d,.]+)\s*·\s*([\d,.]+)\s*$/.exec(trozo);
    if (!m) throw new RangeError(`supuesto ilegible: ${trozo}`);
    salida[m[1]] = {
      realPb: Math.round(Number(m[2].replace(',', '.')) * 100),
      volPb: Math.round(Number(m[3].replace(',', '.')) * 100),
    };
  }
  return salida;
}

function caminosBootstrap({ rentMensuales, ipcMensual, valorInicial, aportacionMensual, anos, real, caminos, azar }) {
  const n = rentMensuales.length;
  const porAno = [];
  for (let y = 0; y < anos; y++) porAno.push([]);
  for (let c = 0; c < caminos; c++) {
    let v = valorInicial;
    for (let y = 0; y < anos; y++) {
      const inicio = Math.floor(azar() * (n - 12 + 1));
      for (let k = 0; k < 12; k++) {
        let r = rentMensuales[inicio + k];
        if (real) r = (1 + r) / (1 + ipcMensual[inicio + k]) - 1;
        v = v * (1 + r) + aportacionMensual;
      }
      porAno[y].push(v);
    }
  }
  return porAno;
}

function caminosNormales({ media, vol, valorInicial, aportacionMensual, anos, caminos, azar }) {
  const mediaMes = Math.pow(1 + media, 1 / 12) - 1;
  const volMes = vol / Math.sqrt(12);
  const porAno = [];
  for (let y = 0; y < anos; y++) porAno.push([]);
  for (let c = 0; c < caminos; c++) {
    let v = valorInicial;
    for (let y = 0; y < anos; y++) {
      for (let k = 0; k < 12; k++) {
        const u1 = 1 - azar();
        const u2 = azar();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const r = Math.max(-1, mediaMes + volMes * z);
        v = v * (1 + r) + aportacionMensual;
      }
      porAno[y].push(v);
    }
  }
  return porAno;
}

/**
 * modo 'datos': rentMensuales (fracciones), ipcMensual (si real), bootstrap de bloques de 12 meses
 *   consecutivos (sin dar la vuelta a la serie).
 * modo 'manual': pesos { clase: pb } y supuestos { clase: { realPb, volPb } }, normal mensual.
 *   Los supuestos del plan son reales: con real=false se avisa y el resultado sigue siendo real.
 * Devuelve { estado, anos:[1..N], p10:[céntimos], p50, p90, avisos }.
 */
export function proyeccion({
  modo = 'datos',
  rentMensuales,
  ipcMensual,
  pesos,
  supuestos,
  valorInicial = 0,
  aportacionMensual = 0,
  anos,
  real = true,
  semilla = 1,
  caminos = 2000,
}) {
  const avisos = [];
  const azar = mulberry32(semilla);
  let porAno;
  if (modo === 'manual') {
    let suma = 0;
    let media = 0;
    let varianza = 0;
    for (const c of Object.keys(pesos)) suma += pesos[c];
    for (const c of Object.keys(pesos)) {
      if (!supuestos[c]) return { estado: NO_CONCLUYENTE, motivo: `sin supuestos para ${c}`, avisos };
      const w = pesos[c] / suma;
      media += (w * supuestos[c].realPb) / 10000;
      varianza += Math.pow((w * supuestos[c].volPb) / 10000, 2);
    }
    if (!real) avisos.push('supuestos-manuales-reales');
    porAno = caminosNormales({ media, vol: Math.sqrt(varianza), valorInicial, aportacionMensual, anos, caminos, azar });
  } else {
    if (!rentMensuales || rentMensuales.length < 12) return { estado: NO_CONCLUYENTE, motivo: 'menos de 12 meses de historia', avisos };
    if (real && (!ipcMensual || ipcMensual.length < rentMensuales.length)) return { estado: NO_CONCLUYENTE, motivo: 'sin IPC', avisos };
    porAno = caminosBootstrap({ rentMensuales, ipcMensual, valorInicial, aportacionMensual, anos, real, caminos, azar });
  }
  const salida = { estado: 'ok', anos: [], p10: [], p50: [], p90: [], avisos };
  for (let y = 0; y < anos; y++) {
    const ordenados = porAno[y].sort((x, z) => x - z);
    salida.anos.push(y + 1);
    salida.p10.push(redondearMitadPar(percentil(ordenados, 10)));
    salida.p50.push(redondearMitadPar(percentil(ordenados, 50)));
    salida.p90.push(redondearMitadPar(percentil(ordenados, 90)));
  }
  return salida;
}

/**
 * El plan no fija ni el valor de la semilla ni cómo se consumen los sorteos, así que el valor exacto
 * no es comparable: esto comprueba propiedades de una salida {p10,p50,p90} de CUALQUIER implementación.
 */
export function comprobarProyeccion(salida, { anos }) {
  const violaciones = [];
  for (const clave of ['p10', 'p50', 'p90']) {
    if (salida[clave].length !== anos) violaciones.push(`longitud:${clave}`);
  }
  for (let y = 0; y < salida.p50.length; y++) {
    if (!(salida.p10[y] <= salida.p50[y])) violaciones.push(`p10>p50:${y + 1}`);
    if (!(salida.p50[y] <= salida.p90[y])) violaciones.push(`p50>p90:${y + 1}`);
  }
  return violaciones;
}

/** Objetivo = consumo12m × multiplicador. Año = primer año en que p50 lo SUPERA (estricto). */
export function libertadFinanciera({ consumo12m, multiplicador = 25, p50PorAno }) {
  const objetivo = consumo12m * multiplicador;
  for (let i = 0; i < p50PorAno.length; i++) {
    if (p50PorAno[i] > objetivo) return { objetivo, ano: i + 1, texto: null };
  }
  return { objetivo, ano: null, texto: `más de ${p50PorAno.length} años` };
}

// ───────────────────────── Escenarios y crisis (§4.5) ─────────────────────────

/** Rentabilidades móviles a 12 meses de una serie de niveles consecutivos. */
export function rentabilidadesMoviles12m(niveles) {
  const salida = [];
  for (let i = 12; i < niveles.length; i++) salida.push(niveles[i] / niveles[i - 12] - 1);
  return salida;
}

/** pesimista = p5–p25, base = p25–p75, optimista = p75–p95, peor = mínimo. Percentil tipo 7. */
export function rangos12m(niveles) {
  const moviles = rentabilidadesMoviles12m(niveles).sort((x, y) => x - y);
  if (moviles.length === 0) return { estado: NO_CONCLUYENTE, motivo: 'menos de 13 meses' };
  const p = (x) => percentil(moviles, x);
  return {
    estado: 'ok',
    pesimista: [p(5), p(25)],
    base: [p(25), p(75)],
    optimista: [p(75), p(95)],
    peor: moviles[0],
    n: moviles.length,
  };
}

function listaMeses(desde, hasta) {
  const salida = [];
  let m = desde;
  while (m <= hasta) {
    salida.push(m);
    m = mesSiguiente(m);
  }
  return salida;
}

/**
 * Pesos fijos (rebalanceo mensual) sobre la trayectoria real de cada clase.
 * pesos: { clase: pb }; series: { clase: { mes: nivel } }; parecida: { clase: clase } (clases.md).
 * Clase sin datos en el periodo → su «parecida» (siguiendo la cadena), indicada en aproximaciones.
 * Sin parecida con datos → no concluyente. La trayectoria sigue tras «hasta» mientras haya datos.
 * La caída se mide hasta «hasta»; la recuperación es volver a valorInicial después del mínimo.
 * Con aportación: V = V × (1 + r) + aportación, a final de cada mes.
 */
export function pruebaCrisis({ pesos, series, desde, hasta, valorInicial, aportacionMensual = 0, parecida = {} }) {
  const periodo = listaMeses(desde, hasta);
  const cubre = (clase) => series[clase] && periodo.every((m) => series[clase][m] !== undefined);

  const usadas = {};
  const aproximaciones = [];
  let sumaPesos = 0;
  for (const clase of Object.keys(pesos)) {
    if (pesos[clase] <= 0) continue;
    sumaPesos += pesos[clase];
    let candidata = clase;
    const vistas = new Set();
    while (candidata && !vistas.has(candidata) && !cubre(candidata)) {
      vistas.add(candidata);
      candidata = parecida[candidata];
    }
    if (!candidata || !cubre(candidata)) return { estado: NO_CONCLUYENTE, motivo: `sin datos para ${clase}`, aproximaciones };
    if (candidata !== clase) aproximaciones.push({ clase, con: candidata });
    usadas[clase] = series[candidata];
  }

  const meses = [...periodo];
  let siguiente = mesSiguiente(hasta);
  while (Object.keys(usadas).every((c) => usadas[c][siguiente] !== undefined)) {
    meses.push(siguiente);
    siguiente = mesSiguiente(siguiente);
  }

  const rent = [];
  for (let i = 1; i < meses.length; i++) {
    let r = 0;
    for (const c of Object.keys(usadas)) {
      r += (pesos[c] / sumaPesos) * (usadas[c][meses[i]] / usadas[c][meses[i - 1]] - 1);
    }
    rent.push(r);
  }

  const sinAportar = [valorInicial];
  const aportando = [valorInicial];
  for (const r of rent) {
    sinAportar.push(sinAportar[sinAportar.length - 1] * (1 + r));
    aportando.push(aportando[aportando.length - 1] * (1 + r) + aportacionMensual);
  }

  let pico = valorInicial;
  let caida = 0;
  let idxMinimo = 0;
  for (let i = 0; i < periodo.length; i++) {
    if (sinAportar[i] > pico) pico = sinAportar[i];
    const dd = sinAportar[i] / pico - 1;
    if (dd < caida) {
      caida = dd;
      idxMinimo = i;
    }
  }

  const recuperar = (camino) => {
    if (caida === 0) return { desdeInicio: 0, desdeMinimo: 0 };
    for (let i = idxMinimo + 1; i < camino.length; i++) {
      if (camino[i] >= valorInicial) return { desdeInicio: i, desdeMinimo: i - idxMinimo };
    }
    return { desdeInicio: null, desdeMinimo: null };
  };

  return {
    estado: 'ok',
    caidaMaxima: caida,
    valorEnMinimo: redondearMitadPar(sinAportar[idxMinimo]),
    mesMinimo: meses[idxMinimo],
    recuperacionSinAportar: recuperar(sinAportar),
    recuperacionAportando: recuperar(aportando),
    aproximaciones,
  };
}

// ───────────────────────── Herramientas (§4.6) ─────────────────────────

function tasaMensualEfectiva(rPb) {
  return Math.pow(1 + rPb / 10000, 1 / 12) - 1;
}

/** Valor futuro de una renta mensual a final de mes. rPb anual efectivo. */
function valorFuturoMensual(mensual, rPb, meses) {
  if (rPb === 0) return mensual * meses;
  const i = tasaMensualEfectiva(rPb);
  return (mensual * (Math.pow(1 + i, meses) - 1)) / i;
}

/**
 * consumo12mPorGrupo: { grupo: céntimos }; mapaIpc: { grupo: componente };
 * tasasPb: { componente: pb }; generalPb: pb.
 * Se excluyen y se avisan los grupos sin mapear o con componente sin tasa; también los de peso ≤ 0.
 */
export function ipcPersonal({ consumo12mPorGrupo, mapaIpc, tasasPb, generalPb }) {
  let sumaPesos = 0;
  let sumaPonderada = 0;
  const sinMapear = [];
  for (const grupo of Object.keys(consumo12mPorGrupo)) {
    const peso = consumo12mPorGrupo[grupo];
    const componente = mapaIpc[grupo];
    if (componente === undefined || tasasPb[componente] === undefined) {
      sinMapear.push(grupo);
      continue;
    }
    if (peso <= 0) continue;
    sumaPesos += peso;
    sumaPonderada += peso * tasasPb[componente];
  }
  if (sumaPesos === 0) return { estado: NO_CONCLUYENTE, motivo: 'sin grupos mapeados', sinMapear };
  const personal = sumaPonderada / sumaPesos;
  return { estado: 'ok', personalPb: personal, diferenciaPb: personal - generalPb, sinMapear };
}

/**
 * periodicidad 'puntual': importe × (1+r)^n. 'mensual': renta a final de mes con tasa mensual
 * equivalente (1+r)^(1/12)−1. diasLibertad = valor ÷ (consumo anual ÷ 365).
 */
export function costeOportunidad({ importe, periodicidad = 'puntual', rPb, anos, consumoAnual }) {
  let valor;
  if (periodicidad === 'puntual') valor = importe * Math.pow(1 + rPb / 10000, anos);
  else valor = valorFuturoMensual(importe, rPb, anos * 12);
  const valorFuturo = redondearMitadPar(valor);
  const diasLibertad = consumoAnual > 0 ? valor / (consumoAnual / 365) : null;
  return { valorFuturo, diasLibertad };
}

/**
 * fondos: [{ id, terPb, brutaPb? }]. Rentabilidad anual neta = bruta − TER, pasada a mensual
 * equivalente. Aportación a final de mes. curvas: valor en céntimos al final de cada mes.
 */
export function comparadorFondos({ inicial = 0, mensual = 0, anos, brutaPb, fondos }) {
  const curvas = {};
  const finales = {};
  for (const fondo of fondos) {
    const netaPb = (fondo.brutaPb ?? brutaPb) - fondo.terPb;
    const i = netaPb === 0 ? 0 : tasaMensualEfectiva(netaPb);
    let v = inicial;
    const curva = [];
    for (let m = 0; m < anos * 12; m++) {
      v = v * (1 + i) + mensual;
      curva.push(redondearMitadPar(v));
    }
    curvas[fondo.id] = curva;
    finales[fondo.id] = curva.length > 0 ? curva[curva.length - 1] : inicial;
  }
  const valores = Object.values(finales);
  return { finales, curvas, diferenciaFinal: Math.max(...valores) - Math.min(...valores) };
}

/**
 * base: { ingresosMensuales, consumoMensual, aportacionMensual, multiplicador?, meta?: { faltan } }
 * modificadores: [{ tipo:'pausa', meses } | { tipo:'ingresos', delta } | { tipo:'gasto', delta } | { tipo:'puntual', importe }]
 * Se suman, así que el orden no importa.
 */
export function escenarioVida(base, modificadores = []) {
  let pausa = 0;
  let deltaIngresos = 0;
  let deltaGasto = 0;
  let puntual = 0;
  for (const m of modificadores) {
    if (m.tipo === 'pausa') pausa += m.meses;
    if (m.tipo === 'ingresos') deltaIngresos += m.delta;
    if (m.tipo === 'gasto') deltaGasto += m.delta;
    if (m.tipo === 'puntual') puntual += m.importe;
  }
  const ingresos = base.ingresosMensuales + deltaIngresos;
  const consumo = base.consumoMensual + deltaGasto;
  const aportacion = Math.max(0, base.aportacionMensual + deltaIngresos - deltaGasto);
  const mesesActivos = Math.max(0, 12 - pausa);

  const tasaAhorro = ingresos > 0 ? (aportacion * mesesActivos) / (ingresos * 12) : NO_CONCLUYENTE;
  const libertadObjetivo = consumo * 12 * (base.multiplicador ?? 25);

  let metaMeses = null;
  if (base.meta && aportacion > 0) {
    metaMeses = Math.ceil((base.meta.faltan + puntual) / aportacion) + pausa;
  }
  return { ingresos, consumo, aportacion, tasaAhorro, libertadObjetivo, metaMeses };
}

/** Interés compuesto, tasa anual efectiva; aportación a final de mes. */
export function interesCompuesto({ inicial = 0, mensual = 0, rPb, anos }) {
  const meses = anos * 12;
  const final = inicial * Math.pow(1 + rPb / 10000, anos) + valorFuturoMensual(mensual, rPb, meses);
  const valorFinal = redondearMitadPar(final);
  const aportado = inicial + mensual * meses;
  return { valorFinal, aportado, intereses: valorFinal - aportado };
}

/** Cuota mensual para llegar a objetivo en n meses a r % anual efectivo. */
export function cuotaMeta({ objetivo, actual = 0, rPb = 0, meses }) {
  if (meses <= 0) return null;
  if (objetivo <= actual && rPb === 0) return 0;
  if (rPb === 0) return dividirMitadPar(objetivo - actual, meses);
  const i = tasaMensualEfectiva(rPb);
  const factor = Math.pow(1 + i, meses);
  const cuota = ((objetivo - actual * factor) * i) / (factor - 1);
  return Math.max(0, redondearMitadPar(cuota));
}

/**
 * Compara el patrimonio final de dos personas con el mismo dinero. El plan solo enumera los
 * supuestos: el método es lectura del oráculo (ver dudas, baja confianza salvo con r = 0).
 * Comprar: paga entrada e impuestos al inicio y luego cuota + gastos. Alquilar: invierte entrada e
 * impuestos. Cada mes, quien paga menos invierte la diferencia a la rentabilidad alternativa.
 */
export function alquilarOComprar({
  precio,
  entrada,
  impuestosPb = 0,
  ibiAnual = 0,
  comunidadAnual = 0,
  mantenimientoAnual = 0,
  revalorizacionPb = 0,
  tipoPb = 0,
  anos,
  rentabilidadPb = 0,
  alquilerMensual,
  subidaAlquilerPb = 0,
}) {
  const meses = anos * 12;
  const prestamo = precio - entrada;
  const t = tipoPb / 10000 / 12;
  const cuota = t === 0 ? prestamo / meses : (prestamo * t) / (1 - Math.pow(1 + t, -meses));
  const gastos = (ibiAnual + comunidadAnual + mantenimientoAnual) / 12;
  const i = rentabilidadPb === 0 ? 0 : tasaMensualEfectiva(rentabilidadPb);

  let carteraComprar = 0;
  let carteraAlquilar = entrada + (precio * impuestosPb) / 10000;
  let alquiler = alquilerMensual;
  for (let m = 1; m <= meses; m++) {
    carteraComprar *= 1 + i;
    carteraAlquilar *= 1 + i;
    const costeComprar = cuota + gastos;
    if (costeComprar > alquiler) carteraAlquilar += costeComprar - alquiler;
    else carteraComprar += alquiler - costeComprar;
    if (m % 12 === 0) alquiler *= 1 + subidaAlquilerPb / 10000;
  }
  const vivienda = precio * Math.pow(1 + revalorizacionPb / 10000, anos);
  const comprar = redondearMitadPar(vivienda + carteraComprar);
  const alquilar = redondearMitadPar(carteraAlquilar);
  return { comprar, alquilar, diferencia: comprar - alquilar, cuotaMensual: redondearMitadPar(cuota) };
}

const VECES_AL_ANO = { mes: 12, bimestre: 6, trimestre: 4, semestre: 2, 'año': 1 };

/**
 * recurrentes: [{ id, importe, cada, etiquetas:[], uso:'sí'|'no', pausado? }]. Solo #suscripción.
 * Las pausadas se listan con su coste, pero no suman al total ni al ahorro.
 * Ahorro si cancelas: las marcadas uso 'no'. Su coste de oportunidad, como renta mensual ahorro/12.
 */
export function radarSuscripciones(recurrentes, { rPb = 0, anos = 0 } = {}) {
  const lista = [];
  let costeAnualTotal = 0;
  let ahorroAnual = 0;
  for (const r of recurrentes) {
    if (!(r.etiquetas ?? []).includes('suscripción')) continue;
    const costeAnual = Math.abs(r.importe) * VECES_AL_ANO[r.cada];
    lista.push({ id: r.id, costeAnual, uso: r.uso });
    if (r.pausado) continue;
    costeAnualTotal += costeAnual;
    if (r.uso === 'no') ahorroAnual += costeAnual;
  }
  const costeOportunidadAhorro = redondearMitadPar(valorFuturoMensual(ahorroAnual / 12, rPb, anos * 12));
  return { lista, costeAnualTotal, ahorroAnual, costeOportunidadAhorro };
}

// ───────────────────────── Metas (§4.4) ─────────────────────────

/** Σ de un grupo para alimentar una meta: valor absoluto de la suma de sus movimientos. */
export function sumaGrupoMeta(movimientos, grupo) {
  let suma = 0;
  for (const m of movimientos) {
    if (m.grupo === grupo) suma += m.importe;
  }
  return Math.abs(suma);
}

/**
 * meta: { objetivo, origen: { tipo:'cuenta', id } | { tipo:'grupo', id } | { tipo:'manual', importe } }
 * datos: { saldos: { cuenta: céntimos }, sumasGrupo: { grupo: céntimos } }
 * Encuadre: «llevas» por debajo del 50 %; desde el 50 % incluido, «te faltan».
 */
export function progresoMeta(meta, datos = {}) {
  let actual = 0;
  if (meta.origen.tipo === 'cuenta') actual = datos.saldos?.[meta.origen.id] ?? 0;
  if (meta.origen.tipo === 'grupo') actual = datos.sumasGrupo?.[meta.origen.id] ?? 0;
  if (meta.origen.tipo === 'manual') actual = meta.origen.importe;
  const faltan = Math.max(0, meta.objetivo - actual);
  const llevas = actual * 100 < meta.objetivo * 50;
  return {
    actual,
    faltan,
    progreso: actual / meta.objetivo,
    progresoPb: dividirMitadPar(BigInt(actual) * 10000n, BigInt(meta.objetivo)),
    encuadre: llevas ? 'llevas' : 'te faltan',
    importeEncuadre: llevas ? actual : faltan,
  };
}

/** Media de 3 meses: suma de los 3 últimos entre 3 (un mes sin aportar cuenta 0). */
export function aportacionMedia3m(aportesPorMes) {
  let suma = 0;
  for (const x of aportesPorMes.slice(-3)) suma += x;
  return dividirMitadPar(suma, 3);
}

/** meses = techo(falta ÷ aportación); fecha = hoy + meses. */
export function fechaEstimadaMeta({ faltan, aportacion, hoy }) {
  if (faltan <= 0) return { estado: 'ok', meses: 0, fecha: hoy };
  if (!(aportacion > 0)) return { estado: NO_CONCLUYENTE, motivo: 'sin aportación' };
  const meses = Math.ceil(faltan / aportacion);
  return { estado: 'ok', meses, fecha: sumarMeses(hoy, meses) };
}

// ───────────────────────── Conocimiento (§4.7, §6, §9.12) ─────────────────────────

/** Minúsculas, sin tildes ni puntuación; devuelve el conjunto de palabras. */
export function tokensTitulo(titulo) {
  const limpio = titulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return new Set(limpio === '' ? [] : limpio.split(' '));
}

/** { interseccion, union } exactas, para comparar sin floats. */
export function jaccardTitulos(a, b) {
  const ta = tokensTitulo(a);
  const tb = tokensTitulo(b);
  let interseccion = 0;
  for (const t of ta) {
    if (tb.has(t)) interseccion++;
  }
  return { interseccion, union: ta.size + tb.size - interseccion };
}

/** a, b: { url?, titulo, fecha }. Misma URL (sin mirar fechas), o Jaccard ≥ 0,6 dentro de ±1 día. */
export function esDuplicado(a, b) {
  if (a.url && b.url && a.url === b.url) return true;
  if (Math.abs(diasEntre(a.fecha, b.fecha)) > 1) return false;
  const { interseccion, union } = jaccardTitulos(a.titulo, b.titulo);
  if (union === 0) return false;
  return interseccion * 10 >= union * 6;
}

const VALOR_POSTURA = { alcista: 1, neutral: 0, bajista: -1 };

/** Media ponderada por 0,5^(edad/90). Notas sin postura no cuentan. Sin notas: null. */
export function posturaFuente(notas, hoy) {
  let suma = 0;
  let pesos = 0;
  for (const nota of notas) {
    const valor = typeof nota.postura === 'number' ? nota.postura : VALOR_POSTURA[nota.postura];
    if (valor === undefined) continue;
    const edad = Math.max(0, diasEntre(nota.fecha, hoy));
    const peso = Math.pow(0.5, edad / 90);
    suma += peso * valor;
    pesos += peso;
  }
  return pesos === 0 ? null : suma / pesos;
}

/** Acertadas ÷ (acertadas + fallidas). «no-medible» y pendientes no cuentan. Menos de 5: «—». */
export function aciertoFuente(predicciones) {
  let acertadas = 0;
  let fallidas = 0;
  for (const p of predicciones) {
    if (p.estado === 'acertada') acertadas++;
    if (p.estado === 'fallida') fallidas++;
  }
  const resueltas = acertadas + fallidas;
  if (resueltas < 5) return { texto: '—', pct: null, resueltas };
  return { texto: null, pct: (acertadas / resueltas) * 100, resueltas };
}

/** '@postura<=-0,3' → { valido, campo, op, valor }. Campo desconocido → valido: false. */
export function parsearSelector(texto) {
  const m = /^@([a-z]+)(<=|>=|!=|=|<|>)(.+)$/.exec(texto.trim());
  if (!m) return { valido: false };
  const [, campo, op, crudo] = m;
  if (campo === 'familia') {
    if (op !== '=' && op !== '!=') return { valido: false };
    return { valido: true, campo, op, valor: crudo };
  }
  if (campo !== 'postura' && campo !== 'acierto') return { valido: false };
  const valor = Number(crudo.replace('−', '-').replace(',', '.'));
  if (Number.isNaN(valor)) return { valido: false };
  return { valido: true, campo, op, valor };
}

/** fuente: { id, familia, postura: número|null, acierto: número|null }. Sin dato: nunca cumple. */
export function cumpleSelector(selector, fuente) {
  const s = typeof selector === 'string' ? parsearSelector(selector) : selector;
  if (!s.valido) return false;
  const dato = fuente[s.campo];
  if (dato === null || dato === undefined) return false;
  switch (s.op) {
    case '=': return dato === s.valor;
    case '!=': return dato !== s.valor;
    case '<': return dato < s.valor;
    case '<=': return dato <= s.valor;
    case '>': return dato > s.valor;
    case '>=': return dato >= s.valor;
    default: return false;
  }
}

/** Une ids y selectores sin repetir. Fuentes inexistentes o selectores inválidos → avisos. */
export function resolverMezcla(elementos, fuentes) {
  const ids = [];
  const avisos = [];
  const anadir = (id) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const el of elementos) {
    if (el.startsWith('@')) {
      const s = parsearSelector(el);
      if (!s.valido) {
        avisos.push(`selector:${el}`);
        continue;
      }
      for (const f of fuentes) {
        if (cumpleSelector(s, f)) anadir(f.id);
      }
    } else if (fuentes.some((f) => f.id === el)) {
      anadir(el);
    } else {
      avisos.push(`fuente-borrada:${el}`);
    }
  }
  return { ids, avisos };
}

// ───────────────────────── Descubrimientos (§4.9) ─────────────────────────

/** ▲ si (alcistas − bajistas) ≥ 2, ▼ si ≤ −2, • en otro caso. */
export function celdaMapaEfectos(posturas) {
  let dif = 0;
  for (const p of posturas) {
    if (p === '▲') dif++;
    if (p === '▼') dif--;
  }
  if (dif >= 2) return '▲';
  if (dif <= -2) return '▼';
  return '•';
}

/**
 * activos: [{ id, valor, clase, terPb, exposicion?: { region: { 'EE.UU.': 71, … } }, rent12m? }]
 * descubrimiento: { clase, terPb, exposicion?, rent12m? }
 * xPb: 0–5000. modo: 'todo' | 'activo' (con activoOrigen) | 'aportaciones' (con aportacion).
 *   todo: cada peso × (1 − x).
 *   activo: x sale de ese activo; si no llega, se limita a su peso y se avisa.
 *   aportaciones: x de la aportación va al descubrimiento y el resto a los activos según su peso.
 * crisis: [{ nombre, desde, hasta, series, parecida? }] → caída por pruebaCrisis con los pesos nuevos.
 * Pesos en fracciones (float); no modifica la entrada.
 */
export function simularDescubrimiento({ activos, xPb, modo, activoOrigen, aportacion = 0, descubrimiento, crisis = [] }) {
  if (!(xPb >= 0 && xPb <= 5000)) return { estado: 'fuera de rango', motivo: 'X debe estar entre 0 y 50' };
  let total = 0;
  for (const a of activos) total += a.valor;
  if (total <= 0) return { estado: NO_CONCLUYENTE, motivo: 'cartera sin valor' };

  const x = xPb / 10000;
  const avisos = [];
  const pesos = {};
  let pesoDescubrimiento = x;
  if (modo === 'todo') {
    for (const a of activos) pesos[a.id] = (a.valor / total) * (1 - x);
  } else if (modo === 'activo') {
    for (const a of activos) pesos[a.id] = a.valor / total;
    if (pesos[activoOrigen] === undefined) return { estado: NO_CONCLUYENTE, motivo: 'activo inexistente' };
    if (x > pesos[activoOrigen]) {
      avisos.push('limitado-al-peso-del-activo');
      pesoDescubrimiento = pesos[activoOrigen];
    }
    pesos[activoOrigen] -= pesoDescubrimiento;
  } else if (modo === 'aportaciones') {
    const nuevoTotal = total + aportacion;
    pesoDescubrimiento = (aportacion * x) / nuevoTotal;
    for (const a of activos) {
      pesos[a.id] = (a.valor + (aportacion * (1 - x) * a.valor) / total) / nuevoTotal;
    }
  } else {
    return { estado: NO_CONCLUYENTE, motivo: 'modo desconocido' };
  }

  const pesosClase = {};
  let terMedioPb = pesoDescubrimiento * descubrimiento.terPb;
  let siLoHubieras = pesoDescubrimiento * (descubrimiento.rent12m ?? 0);
  const exposicion = {};
  const sumarExposicion = (peso, exp) => {
    if (!exp) return;
    for (const dim of Object.keys(exp)) {
      exposicion[dim] = exposicion[dim] ?? {};
      for (const clave of Object.keys(exp[dim])) {
        exposicion[dim][clave] = (exposicion[dim][clave] ?? 0) + peso * exp[dim][clave];
      }
    }
  };
  for (const a of activos) {
    pesosClase[a.clase] = (pesosClase[a.clase] ?? 0) + pesos[a.id];
    terMedioPb += pesos[a.id] * a.terPb;
    siLoHubieras += pesos[a.id] * (a.rent12m ?? 0);
    sumarExposicion(pesos[a.id], a.exposicion);
  }
  pesosClase[descubrimiento.clase] = (pesosClase[descubrimiento.clase] ?? 0) + pesoDescubrimiento;
  sumarExposicion(pesoDescubrimiento, descubrimiento.exposicion);

  const caidas = {};
  for (const c of crisis) {
    const pesosPb = {};
    for (const clase of Object.keys(pesosClase)) pesosPb[clase] = pesosClase[clase] * 10000;
    const r = pruebaCrisis({ pesos: pesosPb, series: c.series, desde: c.desde, hasta: c.hasta, valorInicial: total, parecida: c.parecida ?? {} });
    caidas[c.nombre] = r.estado === 'ok' ? r.caidaMaxima : NO_CONCLUYENTE;
  }

  return { estado: 'ok', pesos, pesoDescubrimiento, pesosClase, terMedioPb, exposicion, caidas, siLoHubieras, avisos };
}
