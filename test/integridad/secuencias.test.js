// QA2.4 · ≥1.000 secuencias aleatorias de operaciones válidas e inválidas. Después de cada una: los ficheros siguen
// siendo canónicos, ninguno gana errores, los movimientos cuadran con lo que se ha anotado (ni uno de más ni de
// menos), los ids no se repiten, deshacer deja los ficheros byte a byte y lo inválido da un error claro sin tocar nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp, ErrorOp, operaciones } from '../../src/core/ops/index.js';
import { crearPrng } from '../../src/core/prng.js';
import { leer, detectar } from '../../src/core/formato/index.js';
import { serializar, items, cabeceras } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const SEMILLA = Number(process.env.FINHUB_SEMILLA ?? 20261106);
const BASE = new Map([...generar()].filter(([r]) => r.endsWith('.md')));
const SECUENCIAS = Number(process.env.FINHUB_SECUENCIAS ?? 150); // test:todo usa 1.000
const PASOS = 8;

// lecturas solo para mirar: la misma cadena se parsea una vez (los documentos de aquí no se modifican)
const cache = new Map();
function ver(r, t) {
  const k = `${r}\0${t}`;
  let d = cache.get(k);
  if (!d) {
    if (cache.size > 4000) cache.clear();
    d = leer(r, t);
    cache.set(k, d);
  }
  return d;
}
const errores = (r, t) => ver(r, t).avisos.filter((a) => a.nivel === 'error').length;

function mundo(prng) {
  const fs = new Map(BASE);
  const ctx = () => ({ ajustes: { mes_inicio_dia: 1 }, formato: { diaInicio: 1 }, prng, hoy: '2026-11-03', hora: '10:00', rutas: [...fs.keys()] });
  return { fs, ctx, aplicar: (n, a) => aplicarOp((x) => fs.get(x) ?? null, n, a, ctx()) };
}
const todos = (fs) => [...fs].filter(([r]) => /^mes\/\d{4}-\d{2}\.md$/.test(r)).flatMap(([r, t]) => items(ver(r, t), 'Movimientos').map((m) => ({ ...m, mes: r.slice(4, 11) })));

function generarOp(prng, m) {
  const azar = (l) => l[prng.entero(0, l.length - 1)];
  const f = m.fs;
  const movs = todos(f);
  const grupos = items(ver('grupos.md', f.get('grupos.md'))).map((g) => g.id);
  const cuentas = items(ver('cuentas.md', f.get('cuentas.md'))).map((c) => c.id);
  const recs = items(ver('recurrentes.md', f.get('recurrentes.md')));
  const opsCartera = items(ver('cartera/operaciones.md', f.get('cartera/operaciones.md')));
  const activos = [...new Set(opsCartera.map((o) => o.activo?.activo).filter(Boolean))];
  const fecha = () => `${azar(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])}-${String(prng.entero(1, 28)).padStart(2, '0')}`;
  const mes = () => azar(['2026-09', '2026-10', '2026-11', '2026-12']);
  const mov = () => azar(movs);
  const c = azar(['crear', 'crear', 'crear', 'editar', 'editar', 'borrar', 'cerrar', 'reabrir', 'recConf', 'recSaltar', 'recDes', 'pres', 'hito', 'operacion', 'opEditar', 'opBorrar', 'valores', 'lista', 'listaEdit', 'ajuste', 'rename', 'malo', 'malo', 'malo']);
  switch (c) {
    case 'crear': return ['mov.crear', { mov: { fecha: fecha(), concepto: `Mov ${prng.entero(1, 9999)} | con # raro`, importe: prng.entero(-500000, 500000) || 1, grupo: azar(grupos), cuenta: azar(cuentas), etiquetas: [] }, confirmarCerrado: true }];
    case 'editar': { const x = mov(); return x && ['mov.editar', { mes: x.mes, id: x.id, cambios: prng.siguiente() < 0.3 ? { fecha: fecha() } : prng.siguiente() < 0.5 ? { importe: prng.entero(1, 100000) } : { concepto: 'Editado «x»' }, confirmarCerrado: true }]; }
    case 'borrar': { const x = mov(); return x && ['mov.borrar', { mes: x.mes, id: x.id, confirmarCerrado: true }]; }
    case 'cerrar': return ['mes.cerrar', { mes: mes(), leccion: 'una lección' }];
    case 'reabrir': return ['mes.reabrir', { mes: mes() }];
    case 'recConf': return recs.length ? ['rec.confirmar', { mes: mes(), rec: azar(recs).id, importe: prng.entero(-90000, -100), confirmarCerrado: true }] : null;
    case 'recSaltar': return recs.length ? ['rec.saltar', { mes: mes(), rec: azar(recs).id, confirmarCerrado: true }] : null;
    case 'recDes': return recs.length ? ['rec.desmarcar', { mes: mes(), rec: azar(recs).id, confirmarCerrado: true }] : null;
    case 'pres': return ['pres.fijar', { mes: mes(), grupo: azar(grupos), importe: prng.siguiente() < 0.3 ? null : prng.entero(1, 100000), confirmarCerrado: true }];
    case 'hito': return ['hito.crear', { fecha: fecha(), texto: 'Un hito | raro' }];
    case 'operacion': return activos.length ? ['operacion.crear', { op: { fecha: fecha(), tipo: 'aportacion', activo: { activo: azar(activos) }, importe: prng.entero(1, 500000) } }] : null;
    case 'opEditar': return opsCartera.length ? ['operacion.editar', { id: azar(opsCartera).id, cambios: { importe: prng.entero(1, 500000) } }] : null;
    case 'opBorrar': return opsCartera.length ? ['operacion.borrar', { id: azar(opsCartera).id }] : null;
    case 'valores': return activos.length ? ['valores.guardar', { fecha: fecha(), filas: [{ activo: azar(activos), valor: prng.entero(1, 9000000), origen: 'manual' }] }] : null;
    case 'lista': return ['lista.crear', { ruta: 'hitos.md', valor: { id: `H-${prng.entero(1000, 9999)}`, fecha: fecha(), tipo: 'mío', texto: 'x' } }];
    case 'listaEdit': return ['lista.editar', { ruta: 'cuentas.md', clave: azar(cuentas), cambios: { nombre: `Cuenta ${prng.entero(1, 99)}` } }];
    case 'ajuste': return ['cuenta.ajustarSaldo', { cuenta: azar(cuentas), fecha: fecha(), saldo: prng.entero(0, 9000000), confirmarCerrado: true }];
    case 'rename': return ['rec.pausar', { id: recs.length ? azar(recs).id : 'x', pausado: prng.siguiente() < 0.5 }];
    default: return azar([
      ['mov.crear', { mov: { fecha: '2026-02-30', concepto: 'x', importe: 1, grupo: azar(grupos) } }],
      ['mov.crear', { mov: { fecha: '2026-11-03', concepto: 'a\nb', importe: 1, grupo: azar(grupos) } }],
      ['mov.crear', { mov: { fecha: '2026-11-03', concepto: 'x', importe: 1.5, grupo: azar(grupos) } }],
      ['mov.crear', { mov: { fecha: '2026-11-03', concepto: '', importe: 1, grupo: azar(grupos) } }],
      ['mov.editar', { mes: '2026-11', id: 'noex', cambios: {} }],
      ['mov.borrar', { mes: '2099-01', id: 'noex' }],
      ['mes.reabrir', { mes: '2099-01' }],
      ['operacion.editar', { id: 'OP-9999', cambios: {} }],
      ['rec.confirmar', { mes: '2026-11', rec: 'no-existe' }],
    ]);
  }
}

test(`${SECUENCIAS} secuencias de operaciones (semilla ${SEMILLA}): invariantes, deshacer byte a byte, inválidas sin efecto`, () => {
  const prng = crearPrng(SEMILLA);
  let ok = 0;
  let rechazadas = 0;
  for (let s = 0; s < SECUENCIAS; s++) {
    const m = mundo(prng);
    let esperados = new Map(todos(m.fs).map((x) => [x.id, x.importe]));
    for (let p = 0; p < PASOS; p++) {
      const g = generarOp(prng, m);
      if (!g) continue;
      const [nombre, args] = g;
      const antes = new Map(m.fs);
      const sello = `semilla ${SEMILLA}, secuencia ${s}, paso ${p}: ${nombre} ${JSON.stringify(args).slice(0, 180)}`;
      let r;
      try {
        r = m.aplicar(nombre, args);
      } catch (e) {
        assert.ok(e instanceof ErrorOp, `${sello}: error sin explicación: ${e.stack}`);
        assert.ok(e.message.length > 3, sello);
        assert.deepEqual([...m.fs], [...antes], sello);
        rechazadas++;
        continue;
      }
      ok++;
      for (const [k, v] of Object.entries(r.escribir)) (v === null ? m.fs.delete(k) : m.fs.set(k, v));
      // cada fichero escrito es canónico y no gana errores
      for (const [k, v] of Object.entries(r.escribir)) {
        if (v === null) continue;
        assert.ok(detectar(k), `${sello}: ${k} no es un fichero de datos`);
        assert.equal(serializar(ver(k, v)), v, `${sello}: ${k} no es canónico`);
        const previo = antes.has(k) ? errores(k, antes.get(k)) : 0;
        assert.ok(errores(k, v) <= previo, `${sello}: ${k} gana errores: ${JSON.stringify(leer(k, v).avisos.filter((a) => a.nivel === 'error'))}`);
      }
      // ids únicos
      const movs = todos(m.fs);
      assert.equal(new Set(movs.map((x) => x.id)).size, movs.length, `${sello}: id repetido entre meses`);
      // ningún movimiento aparece ni desaparece sin que lo pida la operación
      if (nombre === 'mov.crear' || nombre === 'rec.confirmar' || nombre === 'cuenta.ajustarSaldo') esperados.set(r.resultado?.id, null);
      else if (nombre === 'mov.borrar') esperados.delete(args.id);
      const ahora = new Set(movs.map((x) => x.id));
      for (const id of esperados.keys()) if (id) assert.ok(ahora.has(id), `${sello}: se ha perdido el movimiento ${id}`);
      for (const id of ahora) assert.ok(esperados.has(id), `${sello}: movimiento ${id} que nadie ha pedido`);
      // los meses cerrados tienen su foto y solo una
      for (const [k, t] of m.fs) {
        if (!k.startsWith('mes/')) continue;
        const d = ver(k, t);
        const ni = d.secciones.filter((x) => x.nombre === 'Cierre').length;
        assert.ok(ni <= 1, `${sello}: ${k} con ${ni} secciones de cierre`);
        if (cabeceras(d).estado?.estado === 'cerrado') assert.equal(ni, 1, `${sello}: ${k} cerrado sin foto`);
      }
      // la inversa deja los ficheros idénticos byte a byte
      if (r.inversa) {
        const inv = aplicarOp((x) => m.fs.get(x) ?? null, r.inversa.op, r.inversa.args, m.ctx());
        const des = new Map(m.fs);
        for (const [k, v] of Object.entries(inv.escribir)) (v === null ? des.delete(k) : des.set(k, v));
        assert.deepEqual([...des].sort(), [...antes].sort(), `${sello}: deshacer no deja los mismos bytes`);
        if (prng.siguiente() < 0.1) {
          m.fs.clear();
          for (const [k, v] of antes) m.fs.set(k, v);
          esperados = new Map(todos(m.fs).map((x) => [x.id, null]));
        }
      }
    }
  }
  assert.ok(ok > SECUENCIAS * 3, `${ok} aplicadas`);
  assert.ok(rechazadas > SECUENCIAS / 2, `${rechazadas} rechazadas`);
});

const BASURA = [null, undefined, 0, -1, 1.5, '', 'x', '../../etc/passwd', '/etc/passwd', 'mes/2026-11.md', [], [1], {}, { a: 1 }, true, false, NaN, 1e308, '__proto__', 'constructor', 'a\nb', '<img src=x onerror=alert(1)>'];

test('toda operación, con argumentos basura: error claro o nada; nunca una excepción sin explicar', () => {
  const prng = crearPrng(SEMILLA + 1);
  const claves = ['id', 'ruta', 'mes', 'fecha', 'mov', 'op', 'valor', 'clave', 'cambios', 'titulo', 'campos', 'texto', 'fuente', 'nombre', 'rec', 'grupo', 'importe', 'seccion', 'cuenta', 'saldo', 'dia', 'entrada', 'filas', 'pesos', 'notas', 'plantilla', 'd', 'tarea', 'modo', 'anio', 'miembros', 'ids', 'de', 'a', 'estado', 'naturaleza', 'series', 'precios', 'ficheros', 'nota', 'resultado', 'tu', 'rex', 'semana', 'secciones', 'cabeceras', 'sectores', 'filtros', 'valores'];
  const problemas = new Map();
  const nombres = operaciones().filter((o) => o !== 'ficheros.restaurar' && o !== 'papelera.restaurar');
  const cero = mundo(prng); // aplicar no escribe: el mundo no cambia entre vueltas
  for (let i = 0; i < 3000; i++) {
    const nombre = nombres[i % nombres.length];
    const m = cero;
    const args = {};
    for (let k = 0; k < prng.entero(0, 5); k++) args[claves[prng.entero(0, claves.length - 1)]] = BASURA[prng.entero(0, BASURA.length - 1)];
    if (prng.siguiente() < 0.2) args.ruta = ['mes/2026-11.md', 'cuentas.md', 'hitos.md'][prng.entero(0, 2)];
    try {
      const r = m.aplicar(nombre, args);
      for (const [k, v] of Object.entries(r.escribir)) {
        if (!detectar(k)) problemas.set(`${nombre}: escribe fuera de los datos`, `${k} ${JSON.stringify(args)}`);
        if (v !== null && serializar(ver(k, v)) !== v) problemas.set(`${nombre}: fichero no canónico`, JSON.stringify(args));
      }
    } catch (e) {
      if (!(e instanceof ErrorOp)) problemas.set(`${nombre}: ${e.constructor.name}: ${e.message.slice(0, 80)}`, JSON.stringify(args).slice(0, 160));
    }
  }
  assert.deepEqual([...problemas], [], `semilla ${SEMILLA + 1}: ${problemas.size} problemas`);
});
