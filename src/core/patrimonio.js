// Saldos, patrimonio, colchón y foto de cierre (§4.2). Céntimos enteros.
import { sumar } from './dinero.js';
import { valorCarteraEn } from './cartera.js';

/** Cuenta por defecto para movimientos sin «cuenta:»: la primera corriente activa (o la primera activa). */
export function cuentaPorDefecto(cuentas) {
  const activas = cuentas.filter((c) => !c.archivada);
  return (activas.find((c) => (c.tipo ?? 'corriente') === 'corriente') ?? activas[0])?.id ?? null;
}

/**
 * Saldo de cada cuenta al final de `hasta` (incluido): saldo inicial + Σ movimientos con esa cuenta
 * − Σ los que la tienen como destino «a:» (un traspaso es una sola línea con dos patas).
 * Los movimientos anteriores a la fecha del saldo inicial de una cuenta no cuentan para ella.
 * Las cuentas de deuda guardan lo que debes en positivo: se convierten a negativo (restan).
 * → {porCuenta: {id: céntimos}, desconocidas: [ids de cuenta que no existen]}
 */
export function saldos(cuentas, movimientos, hasta) {
  const porCuenta = {};
  const desde = {};
  for (const c of cuentas) {
    const ini = c.saldo_inicial?.importe ?? 0;
    porCuenta[c.id] = c.tipo === 'deuda' ? -ini : ini;
    desde[c.id] = c.saldo_inicial?.fecha ?? '0000-00-00';
  }
  const defecto = cuentaPorDefecto(cuentas);
  const desconocidas = new Set();
  const mover = (id, importe, fecha) => {
    if (!(id in porCuenta)) {
      desconocidas.add(id);
      return;
    }
    if (fecha < desde[id]) return;
    porCuenta[id] = sumar(porCuenta[id], importe);
  };
  for (const m of movimientos) {
    if (hasta && m.fecha > hasta) continue;
    const cuenta = m.cuenta ?? defecto;
    if (cuenta) mover(cuenta, m.importe, m.fecha);
    if (m.a) mover(m.a, -m.importe, m.fecha);
  }
  return { porCuenta, desconocidas: [...desconocidas] };
}

/**
 * Valor de la cartera en una fecha: la última foto de cada activo hasta esa fecha, sin los activos
 * archivados (vendidos o traspasados del todo). F5 lo afina con las operaciones posteriores a la foto.
 */
export function valorCartera(fotos, hasta, { archivados = [] } = {}) {
  const fuera = new Set(archivados);
  const ultimo = new Map();
  for (const f of [...fotos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    if (f.fecha > hasta) break;
    for (const fila of f.filas) if (!fuera.has(fila.activo)) ultimo.set(fila.activo, fila.valor);
  }
  return { valor: sumar(...ultimo.values()), activos: ultimo.size, valorado: ultimo.size > 0 };
}

/** Patrimonio neto = Σ cuentas activas (las de deuda ya restan) + cartera. */
export function patrimonio(porCuenta, cuentas, cartera = 0) {
  const ids = new Set(cuentas.map((c) => c.id));
  return sumar(...Object.entries(porCuenta).filter(([id]) => ids.has(id)).map(([, v]) => v), cartera);
}

/** Colchón en meses: Σ cuentas «colchon» ÷ consumo medio mensual. null si no hay consumo medio. */
export function colchon(porCuenta, cuentas, consumoMedio) {
  const total = sumar(...cuentas.filter((c) => c.colchon).map((c) => porCuenta[c.id] ?? 0));
  return { total, meses: consumoMedio > 0 ? total / consumoMedio : null };
}

/** Foto de cierre de un mes: saldos de las cuentas activas, cartera y patrimonio a la fecha final. */
export function fotoCierre({ cuentas, movimientos, fotos, hasta, archivados = [], activos = null, operaciones = null }) {
  const { porCuenta } = saldos(cuentas, movimientos, hasta);
  const activas = cuentas.filter((c) => !c.archivada || porCuenta[c.id] !== 0); // archivada con saldo: sigue contando
  const s = Object.fromEntries(activas.map((c) => [c.id, porCuenta[c.id]]));
  // con activos y operaciones, el valor completo de F5 (fotos + operaciones posteriores); si no, solo las fotos
  const cartera = activos && operaciones ? valorCarteraEn({ activos, operaciones, fotos, hasta }) : valorCartera(fotos, hasta, { archivados }).valor;
  return { fecha: hasta, saldos: s, cartera, patrimonio: patrimonio(s, activas, cartera) };
}
