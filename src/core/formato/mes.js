// mes/AAAA-MM.md (docs/FORMATOS.md §2)
import * as T from './tipos.js';
import * as D from '../dinero.js';
import { periodoMes, tituloMes, enPeriodo } from '../fechas.js';
import { definirFormato, entidad, kv, p, c, b, ETIQUETAS, cabeceras } from './motor.js';
import { nodosItems } from './comun.js';
import { NATURALEZAS } from './catalogos.js';

/** "corriente 2.310,00 · remunerada 3.830,00" → {corriente: 231000, remunerada: 383000} */
const saldos = () => ({
  nombre: 'saldos',
  parse(s) {
    const res = {};
    for (const t of String(s).split('·').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\S+)\s+(.+)$/.exec(t);
      if (!m) return { ok: false, error: `«${t}» debe ser «cuenta importe»` };
      const k = T.id().parse(m[1]);
      const v = D.parseImporte(m[2]);
      if (!k.ok) return k;
      if (!v.ok) return v;
      res[k.valor] = v.valor;
    }
    return { ok: true, valor: res };
  },
  fmt: (v) => Object.entries(v).map(([k, x]) => `${k} ${D.formatearImporte(x)}`).join(' · '),
});

export const movimiento = entidad({
  pos: [p('fecha', T.fecha()), p('concepto', T.texto()), p('importe', T.importe()), p('grupo', T.id(), { nulo: '—' })],
  campos: [
    c('cuenta', T.id()),
    c('a', T.id()),
    c('naturaleza', T.enumerado(NATURALEZAS)),
    c('compensa', T.id()),
    c('rec', T.id()),
    c('op', T.codigo(/^OP-\d{4,}$/)),
    b('ajuste'),
    c('id', T.texto()),
    ETIQUETAS,
  ],
});

export const mes = definirFormato({
  tipo: 'mes',
  titulo: (ctx) => (ctx.mes ? tituloMes(ctx.mes) : 'Mes'),
  cabeceras: kv({
    claves: {
      periodo: T.periodo(),
      estado: T.estadoConFecha(['abierto', 'cerrado', 'reabierto'], { conFecha: ['cerrado'] }),
    },
  }),
  secciones: {
    Movimientos: { items: movimiento },
    Presupuestos: { items: kv({ libre: T.importe(), claveLibre: T.id() }) },
    Recurrentes: { items: kv({ libre: T.enumerado(['confirmado', 'saltado']), claveLibre: T.id() }) },
    Cierre: {
      items: kv({
        claves: {
          fecha: T.fecha(),
          saldos: saldos(),
          cartera: T.importe(),
          patrimonio: T.importe(),
          leccion: T.texto({ vacio: true }),
          editado_tras_cierre: T.bool(),
        },
      }),
    },
  },
  validar(doc, aviso, ctx) {
    const sec = doc.secciones.find((s) => s.nombre === 'Movimientos');
    const movs = nodosItems(sec);
    for (const n of movs) {
      if (n.valor.id && !/^[a-z0-9]{4}$/.test(n.valor.id)) aviso(n, `id de movimiento «${n.valor.id}» no válido (4 letras o números)`);
      if (n.valor.grupo === null && !n.valor.naturaleza) aviso(n, 'movimiento sin grupo: va a «sin grupo»');
      if (n.valor.importe === 0) aviso(n, 'importe 0');
    }
    const vistos = new Set();
    for (const n of movs) {
      if (!n.valor.id) continue;
      if (vistos.has(n.valor.id)) {
        aviso(n, `id de movimiento «${n.valor.id}» repetido: se le asignará otro al guardar`);
        n.idRepetido = true;
      } else vistos.add(n.valor.id);
    }
    const cab = cabeceras(doc);
    const periodo = cab.periodo ?? (ctx.mes ? periodoMes(ctx.mes, ctx.diaInicio ?? 1) : null);
    if (ctx.mes && cab.periodo) {
      const esperado = periodoMes(ctx.mes, ctx.diaInicio ?? 1);
      if (esperado.desde !== cab.periodo.desde || esperado.hasta !== cab.periodo.hasta) {
        aviso({ linea: 3 }, `el periodo no coincide con el mes financiero (${esperado.desde} → ${esperado.hasta})`);
      }
    }
    if (periodo) for (const n of movs) if (!enPeriodo(n.valor.fecha, periodo)) aviso(n, `fecha fuera del periodo del mes (${periodo.desde} → ${periodo.hasta})`);
    if (cab.estado?.estado === 'cerrado' && !doc.secciones.some((s) => s.nombre === 'Cierre')) aviso({ linea: 4 }, 'el mes está cerrado pero no tiene sección «## Cierre»');
  },
});
