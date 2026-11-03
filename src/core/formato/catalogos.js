// cuentas.md, grupos.md, etiquetas.md, recurrentes.md, hitos.md (docs/FORMATOS.md §2)
import * as T from './tipos.js';
import { definirFormato, entidad, p, c, b, ETIQUETAS } from './motor.js';
import { sinDuplicados, nodosItems } from './comun.js';

export const TIPOS_CUENTA = ['corriente', 'ahorro', 'inversion', 'efectivo', 'deuda'];
export const NATURALEZAS = ['ingreso', 'consumo', 'inversion', 'ahorro', 'traspaso'];
export const FRECUENCIAS = ['mes', 'bimestre', 'trimestre', 'semestre', 'año'];

export const cuentas = definirFormato({
  tipo: 'cuentas',
  titulo: 'Cuentas',
  preambulo: entidad({
    pos: [p('id', T.id()), p('nombre', T.texto())],
    campos: [c('tipo', T.enumerado(TIPOS_CUENTA)), b('colchon'), c('saldo_inicial', T.importeConFecha()), c('meta', T.id()), b('archivada')],
  }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'id', aviso);
    for (const n of nodos) if (!n.valor.tipo) aviso(n, `cuenta «${n.valor.id}» sin tipo válido: se trata como «corriente»`);
  },
});

export const grupos = definirFormato({
  tipo: 'grupos',
  titulo: 'Grupos',
  preambulo: entidad({
    pos: [p('id', T.id()), p('nombre', T.texto())],
    campos: [c('naturaleza', T.enumerado(NATURALEZAS), { requerida: true }), c('presupuesto', T.importe()), c('ipc', T.id()), c('cuenta', T.id()), b('archivado')],
  }),
  validar(doc, aviso) {
    sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso);
  },
});

export const etiquetas = definirFormato({
  tipo: 'etiquetas',
  titulo: 'Etiquetas',
  preambulo: entidad({ pos: [p('id', T.texto()), p('descripcion', T.texto({ vacio: true }), { opcional: true })] }),
  validar(doc, aviso) {
    for (const n of nodosItems(doc.secciones[0])) {
      const limpio = n.valor.id.replace(/^#/, '').normalize('NFC').toLowerCase();
      if (limpio !== n.valor.id) aviso(n, `etiqueta «${n.valor.id}»: se guarda como «${limpio}»`);
      n.valor.id = limpio;
    }
    sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso, 'etiqueta');
  },
});

const uso = T.estadoConFecha(['sí', 'no'], { conFecha: ['no'], fechaOpcional: ['no'], particula: 'desde' });

export const recurrentes = definirFormato({
  tipo: 'recurrentes',
  titulo: 'Recurrentes',
  preambulo: entidad({
    pos: [p('id', T.id()), p('concepto', T.texto()), p('importe', T.importe()), p('grupo', T.id())],
    campos: [
      c('cuenta', T.id()),
      c('cada', T.enumerado(FRECUENCIAS), { requerida: true }),
      c('dia', T.diaCobro(), { requerida: true }),
      c('desde', T.mes()),
      c('hasta', T.mes()),
      ETIQUETAS,
      c('uso', uso),
      c('pausado', T.bool()),
    ],
  }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'id', aviso);
    for (const n of nodos) {
      const v = n.valor;
      if (v.cada === 'año' && !v.dia.mes) aviso(n, `«${v.id}» es anual: el día debe ser DD-MM`, 'error');
      if (v.cada !== 'año' && v.dia.mes) aviso(n, `«${v.id}»: el día DD-MM solo vale para recurrentes anuales`, 'error');
      if (['bimestre', 'trimestre', 'semestre'].includes(v.cada) && !v.desde) aviso(n, `«${v.id}» no tiene «desde: AAAA-MM»: se toma como ancla el mes en que se creó`);
      if (v.desde && v.hasta && v.hasta < v.desde) aviso(n, `«${v.id}»: «hasta» es anterior a «desde»`, 'error');
    }
  },
});

export const hitos = definirFormato({
  tipo: 'hitos',
  titulo: 'Hitos',
  preambulo: entidad({
    pos: [p('id', T.codigo(/^H-\d{4,}$/)), p('fecha', T.fecha()), p('texto', T.texto())],
    campos: [c('tipo', T.enumerado(['mío', 'mundo']), { requerida: true }), c('nota', T.codigo())],
  }),
  validar(doc, aviso) {
    sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso);
  },
});
