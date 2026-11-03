import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarComentario, partirCeldas, escaparCelda, desescapar, dividirLineas } from '../../../src/core/formato/lineas.js';
import { cuentas, grupos } from '../../../src/core/formato/catalogos.js';
import { mes } from '../../../src/core/formato/mes.js';
import { notas } from '../../../src/core/formato/conocimiento.js';
import { items, bloques, serializar, anadirItem, fijarCabecera } from '../../../src/core/formato/motor.js';

const idempotente = (formato, texto, ctx) => {
  const a = serializar(formato.parsear(texto, ctx));
  const b = serializar(formato.parsear(a, ctx));
  assert.equal(b, a, 'serializar dos veces da los mismos bytes');
  return a;
};

test('líneas: BOM y CRLF se aceptan; se escribe en canónico', () => {
  assert.deepEqual(dividirLineas('﻿# T\r\nesquema: 1\r\n- a\r\n'), ['# T', 'esquema: 1', '- a']);
  const crlf = '﻿# Cuentas\r\nesquema: 1\r\n- corriente | Cuenta corriente | tipo: corriente\r\n';
  assert.equal(idempotente(cuentas, crlf), '# Cuentas\nesquema: 1\n- corriente | Cuenta corriente | tipo: corriente\n');
  assert.equal(dividirLineas('é')[0], 'é', 'NFC');
});

test('comentarios: 2+ espacios y «# »; «#x» es etiqueta; «\\#» es literal', () => {
  assert.deepEqual(separarComentario('- a: 1   # nota'), { contenido: '- a: 1', comentario: { relleno: 3, texto: 'nota' } });
  assert.equal(separarComentario('- x | y  #fijo').comentario, null);
  assert.equal(separarComentario('- x # y').comentario, null, 'un solo espacio no abre comentario');
  assert.equal(separarComentario('- x  \\# y').comentario, null);
  assert.deepEqual(separarComentario('- x  #').comentario, { relleno: 2, texto: '' });
});

test('celdas: separador « | », «\\|» literal y escapado de ida y vuelta', () => {
  assert.deepEqual(partirCeldas('a | b \\| c |d'), ['a', 'b \\| c', 'd']);
  for (const t of ['a | b', 'Pedido #5', '#fijo', 'barra \\ sola', 'fin \\', 'x \\| y', 'a  # b']) {
    const cel = escaparCelda(t);
    assert.equal(partirCeldas(cel).length, 1, `«${t}» no debe partirse`);
    assert.equal(desescapar(partirCeldas(cel)[0]), t);
  }
});

test('líneas desconocidas y celdas desconocidas se conservan en su sitio', () => {
  const t = `# Grupos
esquema: 1
texto suelto que no encaja
- ocio | Ocio | naturaleza: consumo | color: azul | raro
- comida | Comida | naturaleza: gasto

- ocio | Repetido | naturaleza: consumo
`;
  const d = grupos.parsear(t);
  assert.equal(serializar(d), t, 'nada se pierde');
  const msgs = d.avisos.map((a) => `${a.linea} ${a.nivel} ${a.mensaje}`);
  assert.ok(msgs.some((m) => m.startsWith('3 aviso línea no reconocida')));
  assert.ok(msgs.some((m) => m.startsWith('4 aviso clave desconocida «color»')));
  assert.ok(msgs.some((m) => m.startsWith('4 aviso celda no reconocida «raro»')));
  assert.ok(msgs.some((m) => m.startsWith('5 error naturaleza')));
  assert.ok(msgs.some((m) => m.startsWith('7 error id repetido')));
  assert.deepEqual(items(d).map((g) => g.id), ['ocio'], 'la línea imposible y el duplicado no entran');
  assert.equal(items(d, null, { incluirExcluidos: true }).length, 2);
});

test('esquema: si falta se asume 1 y se escribe; si es más nuevo, solo lectura', () => {
  const sin = cuentas.parsear('# Cuentas\n- corriente | C | tipo: corriente\n');
  assert.equal(sin.esquema, 1);
  assert.ok(sin.esquemaAusente);
  assert.match(serializar(sin), /^# Cuentas\nesquema: 1\n/);
  const nuevo = cuentas.parsear('# Cuentas\nesquema: 9\n- corriente | C | tipo: corriente\n');
  assert.ok(nuevo.soloLectura);
  assert.ok(nuevo.avisos.some((a) => a.nivel === 'error' && /más nueva/.test(a.mensaje)));
  assert.equal(serializar(nuevo), '# Cuentas\nesquema: 9\n- corriente | C | tipo: corriente\n', 'no se toca la versión');
});

test('sin título: aviso y se añade el título por defecto', () => {
  const d = cuentas.parsear('esquema: 1\n- corriente | C | tipo: corriente\n');
  assert.ok(d.avisos.some((a) => /título/.test(a.mensaje)));
  assert.match(serializar(d), /^# Cuentas\n/);
});

test('secciones desconocidas se conservan con aviso', () => {
  const t = '# Noviembre 2026\nesquema: 1\nperiodo: 2026-11-01 → 2026-11-30\nestado: abierto\n## Movimientos\n## Mis cosas\n- algo raro\n';
  const d = mes.parsear(t, { mes: '2026-11' });
  assert.equal(serializar(d), t);
  assert.ok(d.avisos.some((a) => /sección desconocida «Mis cosas»/.test(a.mensaje)));
});

test('bloques: campos, comentario y cuerpo libre (aunque empiece por guion)', () => {
  const t = `# Mundo 2026-11-03
esquema: 1
## M-261103-01 · Título con · punto medio
- tipo: hecho   # comentario
- temas: tipos, bancos-centrales
Primera línea del cuerpo.
- no es un campo: es cuerpo
`;
  const d = notas.parsear(t, { fuente: 'mundo' });
  assert.equal(serializar(d), t);
  const [b] = bloques(d);
  assert.equal(b.titulo, 'Título con · punto medio');
  assert.deepEqual(b.campos, { tipo: 'hecho', temas: ['tipos', 'bancos-centrales'] });
  assert.equal(b.cuerpo, 'Primera línea del cuerpo.\n- no es un campo: es cuerpo');
});

test('construcción: un documento nuevo se escribe en canónico y se vuelve a leer igual', () => {
  const d = cuentas.nuevo();
  anadirItem(d, null, { id: 'corriente', nombre: 'Cuenta | corriente #1', tipo: 'corriente', saldo_inicial: { importe: 125000, fecha: '2026-01-01' } });
  anadirItem(d, null, { id: 'remunerada', nombre: 'Remunerada', tipo: 'ahorro', colchon: true });
  const t = serializar(d);
  assert.equal(t, '# Cuentas\nesquema: 1\n- corriente | Cuenta \\| corriente \\#1 | tipo: corriente | saldo_inicial: 1.250,00 @2026-01-01\n- remunerada | Remunerada | tipo: ahorro | colchon\n');
  assert.equal(items(cuentas.parsear(t))[0].nombre, 'Cuenta | corriente #1');
  const m = mes.nuevo({ mes: '2026-11' });
  fijarCabecera(m, 'estado', { estado: 'abierto', fecha: null });
  assert.equal(serializar(m), '# Noviembre 2026\nesquema: 1\nestado: abierto\n');
});
