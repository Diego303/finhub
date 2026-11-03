// cartera/activos.md, operaciones.md, objetivo.md, clases.md, valores/*.md, plantillas/*.md, borradores/*.md
import * as T from './tipos.js';
import * as D from '../dinero.js';
import { validarIsin } from '../ids.js';
import { definirFormato, entidad, kv, p, c } from './motor.js';
import { sinDuplicados, nodosItems, bloquesDoc, bloquesSinDuplicados, campoBloque } from './comun.js';

export const TIPOS_ACTIVO = ['fondo', 'etf', 'plan', 'accion', 'efectivo', 'otro'];
export const TIPOS_OPERACION = ['aportacion', 'venta', 'traspaso', 'dividendo', 'comision', 'ajuste'];
export const GRUPOS_CLASE = ['rv', 'rf', 'efectivo', 'mixto'];

const isin = () => ({
  nombre: 'isin',
  parse: (s) => {
    const v = String(s).trim().toUpperCase();
    if (v === '—' || v === '-') return { ok: true, valor: null };
    return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v) ? { ok: true, valor: v } : { ok: false, error: `«${s}» no tiene forma de ISIN` };
  },
  fmt: (v) => v ?? '—',
});

const divisa = () => ({
  nombre: 'divisa',
  parse: (s) => (/^[A-Z]{3}$/.test(String(s).trim().toUpperCase()) ? { ok: true, valor: String(s).trim().toUpperCase() } : { ok: false, error: `«${s}» no es una divisa ISO (EUR, USD…)` }),
  fmt: (v) => v,
});

/** "region EE.UU. 71 · Europa 15 | sector Tecnología 27 · … | divisa USD 71 · EUR 15 @2026-09" */
const exposicion = () => ({
  nombre: 'exposicion',
  parse(s) {
    let txt = String(s).trim();
    let fecha = null;
    const mf = /\s*@(\d{4}-\d{2})$/.exec(txt);
    if (mf) {
      fecha = mf[1];
      txt = txt.slice(0, mf.index);
    }
    const dimensiones = {};
    for (const parte of txt.split('|').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(region|sector|divisa)\s+(.+)$/.exec(parte);
      if (!m) return { ok: false, error: `«${parte}» debe empezar por region, sector o divisa` };
      const filas = [];
      for (const it of m[2].split('·').map((x) => x.trim()).filter(Boolean)) {
        const mi = /^(.+?)\s+(-?[\d.,]+)$/.exec(it);
        if (!mi) return { ok: false, error: `«${it}» debe ser «nombre porcentaje»` };
        const pb = D.parsePorcentaje(mi[2]);
        if (!pb.ok) return pb;
        filas.push({ nombre: mi[1], pb: pb.valor });
      }
      dimensiones[m[1]] = filas;
    }
    return { ok: true, valor: { fecha, dimensiones } };
  },
  fmt: (v) =>
    Object.entries(v.dimensiones).map(([dim, filas]) => `${dim} ${filas.map((f) => `${f.nombre} ${D.formatearPorcentaje(f.pb)}`).join(' · ')}`).join(' | ') + (v.fecha ? ` @${v.fecha}` : ''),
});

export const activos = definirFormato({
  tipo: 'activos',
  titulo: 'Activos',
  bloques: {
    campos: kv({
      claves: {
        isin: isin(),
        tipo: T.enumerado(TIPOS_ACTIVO),
        clase: T.id(),
        divisa: divisa(),
        ter: T.porcentaje(),
        indice: T.id(),
        exposicion: exposicion(),
        traspasable: T.bool(),
        archivado: T.bool(),
      },
    }),
  },
  validar(doc, aviso) {
    bloquesSinDuplicados(doc, aviso, 'activo');
    for (const s of bloquesDoc(doc)) {
      const i = campoBloque(s, 'isin');
      if (i && !validarIsin(i)) aviso({ linea: s.linea }, `ISIN «${i}» de «${s.id}»: el dígito de control no cuadra`);
      if (!campoBloque(s, 'clase')) aviso({ linea: s.linea }, `«${s.id}» no tiene clase: no entra en «clases frente a objetivo»`);
      const e = campoBloque(s, 'exposicion');
      for (const [dim, filas] of Object.entries(e?.dimensiones ?? {})) {
        const suma = filas.reduce((a, f) => a + f.pb, 0);
        if (Math.abs(suma - 10000) > 100) aviso({ linea: s.linea }, `exposición por ${dim} de «${s.id}» suma ${D.formatearPorcentaje(suma)} %, no 100`);
      }
    }
  },
});

export const operaciones = definirFormato({
  tipo: 'operaciones',
  titulo: 'Operaciones',
  preambulo: entidad({
    pos: [p('id', T.codigo(/^OP-\d{4,}$/)), p('fecha', T.fecha()), p('tipo', T.enumerado(TIPOS_OPERACION)), p('activo', T.activoOTraspaso()), p('importe', T.importe())],
    campos: [c('participaciones', T.decimal(6)), c('mov', T.refMovimiento()), c('nota', T.texto())],
  }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'id', aviso, 'operación');
    for (const n of nodos) {
      const v = n.valor;
      if (v.tipo === 'traspaso' && !v.activo.destino) aviso(n, `${v.id}: un traspaso necesita «origen → destino»`, 'error');
      else if (v.tipo !== 'traspaso' && v.activo.destino) aviso(n, `${v.id}: solo los traspasos llevan «→»`, 'error');
      if (!['comision', 'ajuste'].includes(v.tipo) && v.importe < 0) aviso(n, `${v.id}: el importe de una ${v.tipo} va en positivo; se toma ${D.formatearImporte(-v.importe)}`);
      if (v.participaciones !== undefined && v.participaciones <= 0) aviso(n, `${v.id}: participaciones no positivas`);
    }
  },
});

export const objetivo = definirFormato({
  tipo: 'objetivo',
  titulo: 'Objetivo',
  cabeceras: kv({ claves: { redondeo: T.importe(), umbral_desviacion: T.porcentaje() } }),
  preambulo: entidad({ pos: [p('activo', T.id()), p('peso', T.porcentaje())], campos: [c('minimo', T.importe())] }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'activo', aviso, 'activo');
    const suma = nodos.filter((n) => !n.excluido).reduce((a, n) => a + n.valor.peso, 0);
    if (nodos.length && suma !== 10000) aviso({ linea: 1 }, `los pesos objetivo suman ${D.formatearPorcentaje(suma)} %, no 100: el reparto no se calcula hasta corregirlo`);
  },
});

export const clases = definirFormato({
  tipo: 'clases',
  titulo: 'Clases',
  preambulo: entidad({
    pos: [p('id', T.id()), p('nombre', T.texto())],
    campos: [c('indice', T.id()), c('grupo', T.enumerado(GRUPOS_CLASE), { requerida: true }), c('parecida', T.id())],
  }),
  validar(doc, aviso) {
    sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso, 'clase');
  },
});

export const valores = definirFormato({
  tipo: 'valores',
  titulo: (ctx) => `Valores ${ctx.fecha ?? ''}`.trim(),
  preambulo: entidad({ pos: [p('activo', T.id()), p('valor', T.importe())], campos: [c('origen', T.texto())] }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'activo', aviso, 'activo');
    for (const n of nodos) if (n.valor.valor < 0) aviso(n, `valor negativo de «${n.valor.activo}»`, 'error');
  },
});

const filaPlantilla = entidad({
  pos: [p('id', T.id()), p('nombre', T.texto()), p('peso', T.porcentaje())],
  campos: [c('clase', T.id()), c('tipo', T.enumerado(TIPOS_ACTIVO)), c('isin', isin()), c('ter', T.porcentaje()), c('indice', T.id())],
});

function validarPlantilla(doc, aviso) {
  const nodos = nodosItems(doc.secciones[0]);
  sinDuplicados(nodos, 'id', aviso, 'activo');
  const suma = nodos.filter((n) => !n.excluido).reduce((a, n) => a + n.valor.peso, 0);
  if (suma !== 10000) aviso({ linea: 1 }, `los pesos suman ${D.formatearPorcentaje(suma)} %, no 100`, 'error');
  for (const n of nodos) if (n.valor.isin && !validarIsin(n.valor.isin)) aviso(n, `ISIN «${n.valor.isin}»: el dígito de control no cuadra`);
}

export const plantilla = definirFormato({
  tipo: 'plantilla',
  titulo: 'Plantilla',
  cabeceras: kv({ claves: { perfil: T.id(), descripcion: T.texto() } }),
  preambulo: filaPlantilla,
  validar: validarPlantilla,
});

export const borrador = definirFormato({
  tipo: 'borrador',
  titulo: 'Borrador de cartera',
  cabeceras: kv({
    claves: {
      fecha: T.fecha(),
      perfil: T.id(),
      origen: T.texto(),
      estado: T.enumerado(['borrador', 'aceptado', 'descartado']),
      revisado_claude: T.texto(),
    },
  }),
  preambulo: filaPlantilla,
  validar: validarPlantilla,
});
