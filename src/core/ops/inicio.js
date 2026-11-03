// Primera vez (§14.1): de una carpeta vacía a una carpeta de finhub con tus ajustes, cuentas, grupos por
// defecto, etiquetas, recurrentes y (si quieres) la Base. Una sola operación: un solo deshacer.
import { registrar, ErrorOp } from './motor.js';
import { items } from '../formato/motor.js';
import { slugUnico } from '../ids.js';
import { esFecha } from '../fechas.js';
import { TIPOS_CUENTA } from '../formato/catalogos.js';
import { GRUPOS_DEFECTO, ETIQUETAS_DEFECTO } from '../inicio.js';


registrar({
  /**
   * {fecha, nombre?, mes_inicio_dia?, tema?, cuentas: [{nombre, tipo, saldo (céntimos), colchon?}],
   *  grupos: [ids de GRUPOS_DEFECTO], recurrentes: [{concepto, importe (céntimos, − gasto), grupo, cuenta, dia}],
   *  base?: {ficheros}} → {cuentas, grupos, recurrentes, base}
   */
  'inicio.crear'(tx, { fecha, nombre = '', mes_inicio_dia = 1, tema = 'auto', cuentas = [], grupos = [], recurrentes = [], base = null }) {
    if (!esFecha(fecha)) throw new ErrorOp('invalida', `fecha no válida «${fecha}»`);
    for (const r of ['cuentas.md', 'grupos.md', 'recurrentes.md']) if (tx.existe(r) && items(tx.doc(r)).length) throw new ErrorOp('invalida', `esta carpeta ya tiene ${r}: la primera vez ya está hecha`);
    if (!cuentas.length) throw new ErrorOp('invalida', 'añade al menos una cuenta');
    tx.sub('ajustes.textos', { valores: { nombre: String(nombre).trim(), mes_inicio_dia: String(mes_inicio_dia), tema } });
    const ids = [];
    for (const c of cuentas) {
      const n = String(c.nombre ?? '').trim();
      if (!n) throw new ErrorOp('invalida', 'cada cuenta necesita un nombre');
      if (!TIPOS_CUENTA.includes(c.tipo)) throw new ErrorOp('invalida', `tipo de cuenta «${c.tipo}» no válido`);
      const id = slugUnico(n, ids);
      ids.push(id);
      tx.sub('lista.crear', { ruta: 'cuentas.md', valor: { id, nombre: n.slice(0, 80), tipo: c.tipo, ...(c.colchon ? { colchon: true } : {}), saldo_inicial: { importe: Math.round(Number(c.saldo) || 0), fecha } } });
    }
    const elegidos = GRUPOS_DEFECTO.filter(([id]) => grupos.includes(id));
    if (!elegidos.some((g) => g[2] === 'consumo')) throw new ErrorOp('invalida', 'elige al menos un grupo de gasto');
    const colchon = cuentas.findIndex((c) => c.colchon);
    for (const [id, n, naturaleza] of elegidos) tx.sub('lista.crear', { ruta: 'grupos.md', valor: { id, nombre: n, naturaleza, ...(id === 'colchon' && colchon >= 0 ? { cuenta: ids[colchon] } : {}) } });
    for (const [id, descripcion] of ETIQUETAS_DEFECTO) tx.sub('lista.crear', { ruta: 'etiquetas.md', valor: { id, descripcion } });
    const idsRec = [];
    for (const r of recurrentes) {
      const concepto = String(r.concepto ?? '').trim();
      if (!concepto) continue;
      if (!elegidos.some(([id]) => id === r.grupo)) throw new ErrorOp('invalida', `«${concepto}»: el grupo «${r.grupo}» no está entre los elegidos`);
      const cuenta = ids.includes(r.cuenta) ? r.cuenta : ids[0];
      const dia = Math.min(28, Math.max(1, Math.round(Number(r.dia) || 1)));
      const id = slugUnico(concepto, idsRec);
      idsRec.push(id);
      tx.sub('lista.crear', { ruta: 'recurrentes.md', valor: { id, concepto: concepto.slice(0, 80), importe: Math.round(Number(r.importe) || 0), grupo: r.grupo, cuenta, cada: 'mes', dia: { dia }, etiquetas: ['fijo'] } });
    }
    const b = base?.ficheros ? tx.sub('base.importar', { ficheros: base.ficheros }) : null;
    return { cuentas: ids.length, grupos: elegidos.length, recurrentes: idsRec.length, base: b?.importadas ?? 0 };
  },
});
