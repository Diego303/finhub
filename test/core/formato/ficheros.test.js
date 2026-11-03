// Ejemplos válidos e inválidos de docs/FORMATOS.md, fichero a fichero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leer, detectar, FORMATOS } from '../../../src/core/formato/index.js';
import { items, bloques, valores, cabeceras, serializar, textoSeccion } from '../../../src/core/formato/motor.js';
import { ajustesEfectivos } from '../../../src/core/formato/config.js';
import { escaparMensaje, desescaparMensaje } from '../../../src/core/formato/textos.js';

/** Lee, comprueba idempotencia y devuelve el documento. */
function abrir(ruta, texto, ctx) {
  const d = leer(ruta, texto, ctx);
  assert.ok(d, `sin formato para ${ruta}`);
  const a = serializar(d);
  assert.equal(serializar(leer(ruta, a, ctx)), a, `${ruta}: idempotente`);
  return d;
}
const errores = (d) => d.avisos.filter((a) => a.nivel === 'error').map((a) => a.mensaje);
const avisos = (d) => d.avisos.filter((a) => a.nivel === 'aviso').map((a) => a.mensaje);
const todos = (d) => d.avisos.map((a) => a.mensaje);
const hay = (lista, re) => assert.ok(lista.some((m) => re.test(m)), `ninguno encaja con ${re}: ${JSON.stringify(lista)}`);

test('detectar: cada ruta de §3 tiene su formato', () => {
  const casos = {
    'ajustes.md': 'ajustes', 'cuentas.md': 'cuentas', 'mes/2026-11.md': 'mes', 'cartera/valores/2026-11-03.md': 'valores',
    'cartera/plantillas/crecimiento.md': 'plantilla', 'cartera/borradores/x.md': 'borrador', 'decisiones/2026-10-12-x.md': 'decision',
    'conocimiento/_fuentes.md': 'fuentes', 'conocimiento/mundo/2026-11-03.md': 'notas', 'conocimiento/mundo/semana-2026-W45.md': 'semana',
    'conocimiento/datos/series/msci.md': 'serie', 'conocimiento/descubrimientos/D-007.md': 'descubrimiento', 'conocimiento/pizarra/2026-10-28-x.md': 'notas',
    'conocimiento/mias/reglas.md': 'notas', 'roles/gestor.md': 'rol', 'tareas/pulso.md': 'tarea', 'analisis/2026-11-03-x.md': 'analisis',
    'analisis/encajes/D-007-2026-11-03.md': 'encaje', 'chat/privado/a.md': 'chat', 'chat/web/a.md': 'chat', 'quiz/progreso.md': 'quiz', 'tu-ano/2026.md': 'tuano',
  };
  for (const [ruta, tipo] of Object.entries(casos)) assert.equal(detectar(ruta)?.formato.tipo, tipo, ruta);
  for (const r of ['.finhub/registro/2026-11.jsonl', 'CONTEXTO/x.md', 'mes/2026-13.md', 'notas.txt', 'otra/cosa.md']) assert.equal(detectar(r), null, r);
  assert.equal(detectar('mes\\2026-11.md')?.ctx.mes, '2026-11', 'acepta separador de Windows');
  assert.equal(detectar('chat/web/a.md').ctx.modo, 'web');
  assert.equal(Object.keys(FORMATOS).length, 31);
});

test('ajustes: válidos, inválidos con aviso y valores por defecto', () => {
  const d = abrir('ajustes.md', `# Ajustes
esquema: 1
- mes_inicio_dia: 25
- impuestos_ahorro: 0-6000:19 | 6000-50000:21 | 50000-200000:23 | 200000-300000:27 | 300000-:30   # VERIFICAR cada año
- claude_modelo: pulso=haiku, rex-web=sonnet
- tema: azul
- puerto 4747
`);
  const v = ajustesEfectivos(valores(d));
  assert.equal(v.mes_inicio_dia, 25);
  assert.equal(v.tema, 'auto', 'valor desconocido → defecto');
  assert.equal(v.claude_modelo.pulso, 'haiku');
  assert.equal(v.claude_modelo.privado, 'opus', 'los no indicados, por defecto');
  assert.deepEqual(v.impuestos_ahorro[1], { desde: 600000, hasta: 5000000, pb: 2100 });
  hay(avisos(d), /tema/);
  hay(avisos(d), /línea no reconocida/);
  for (const malo of ['0-6000:19 | 5000-50000:21', '0-6000:19 | 6000-:21 | 9000-:30', '6000-0:19', 'diecinueve']) {
    const x = leer('ajustes.md', `# Ajustes\nesquema: 1\n- impuestos_ahorro: ${malo}\n`);
    hay(avisos(x), /impuestos_ahorro/);
  }
  hay(avisos(leer('ajustes.md', '# Ajustes\nesquema: 1\n- mes_inicio_dia: 31\n')), /fuera de 1–28/);
  hay(avisos(leer('ajustes.md', '# Ajustes\nesquema: 1\n- claude_modelo: pulsar=haiku\n')), /claude_modelo/);
});

test('cuentas, grupos, etiquetas y hitos', () => {
  const c = abrir('cuentas.md', '# Cuentas\nesquema: 1\n- remunerada | Cuenta remunerada | tipo: ahorro | colchon | saldo_inicial: 3.000,00 @2026-01-01\n- x | X | tipo: corriente | saldo_inicial: 100 @2026-13-01\n- tarjeta | Tarjeta | tipo: credito\n');
  assert.deepEqual(items(c)[0], { id: 'remunerada', nombre: 'Cuenta remunerada', tipo: 'ahorro', colchon: true, saldo_inicial: { importe: 300000, fecha: '2026-01-01' } });
  hay(avisos(c), /saldo_inicial/);
  hay(avisos(c), /se trata como «corriente»/);
  const g = abrir('grupos.md', '# Grupos\nesquema: 1\n- ocio | Ocio | naturaleza: consumo | presupuesto: 150 | ipc: ocio-cultura\n- comida | Comida\n');
  assert.equal(items(g)[0].presupuesto, 15000);
  hay(errores(g), /falta «naturaleza»/);
  const e = abrir('etiquetas.md', '# Etiquetas\nesquema: 1\n- #Social | Planes\n- suscripción\n');
  assert.deepEqual(items(e).map((x) => x.id), ['social', 'suscripción']);
  assert.match(serializar(e), /- social \| Planes\n- suscripción\n$/);
  const h = abrir('hitos.md', '# Hitos\nesquema: 1\n- H-0004 | 2026-09-12 | Corrección −8 % | tipo: mundo | nota: M-260912-02\n- H-0005 | sept 2026 | x | tipo: mío\n');
  assert.equal(items(h)[0].tipo, 'mundo');
  hay(errores(h), /fecha/);
});

test('recurrentes: frecuencias, día de cobro, ancla y uso', () => {
  const r = abrir('recurrentes.md', `# Recurrentes
esquema: 1
- seguro-coche | Seguro coche | -320,00 | transporte | cuenta: corriente | cada: año | dia: 14-11
- agua | Agua | -45,00 | vivienda | cuenta: corriente | cada: bimestre | dia: 10 | desde: 2026-01
- idiomas | App de idiomas | -59,99 | formacion | cada: año | dia: 3-08 | #suscripción | uso: no desde 2026-08 | pausado: no
- x1 | X | -1,00 | ocio | cada: semana | dia: 1
- x2 | X | -1,00 | ocio | cada: año | dia: 31-02
- x3 | X | -1,00 | ocio | cada: mes | dia: 14-11
- x4 | X | -1,00 | ocio | cada: trimestre | dia: 1
`);
  const [seguro, agua, idiomas] = items(r);
  assert.deepEqual(seguro.dia, { dia: 14, mes: 11 });
  assert.equal(agua.desde, '2026-01');
  assert.deepEqual(idiomas.uso, { estado: 'no', fecha: '2026-08' });
  assert.equal(idiomas.pausado, false);
  assert.deepEqual(idiomas.etiquetas, ['suscripción']);
  hay(errores(r), /cada/);
  hay(errores(r), /día de cobro/);
  hay(errores(r), /solo vale para recurrentes anuales/);
  hay(avisos(r), /x4.*ancla/);
  assert.deepEqual(items(r).map((x) => x.id), ['seguro-coche', 'agua', 'idiomas', 'x4']);
});

test('mes: movimientos, compensa, traspasos, sin grupo, cierre y periodo', () => {
  const t = `# Noviembre 2026
esquema: 1
periodo: 2026-11-01 → 2026-11-30
estado: cerrado 2026-11-30
## Movimientos
- 2026-11-01 | Nómina | 2.850,00 | sueldo | cuenta: corriente | rec: nomina | id: k2p0 | #fijo
- 2026-11-14 | Bizum de Pablo (cena) | 24,00 | devoluciones | compensa: ocio | id: 9xa1 | #social
- 2026-11-20 | A la remunerada | -300,00 | — | cuenta: corriente | a: remunerada | id: 0b7c
- 2026-11-31 | Cena | -40,00 | ocio
- 2026-12-02 | Cena | -40,00 | ocio | id: k2p0
## Presupuestos
- ocio: 200
- grupo-raro: mucho
## Recurrentes
- seguro-coche: saltado
## Cierre
- fecha: 2026-11-30
- saldos: corriente 2.310,00 · remunerada 3.830,00
- patrimonio: 48.320,00
- editado_tras_cierre: sí
`;
  const d = abrir('mes/2026-11.md', t);
  const movs = items(d, 'Movimientos');
  assert.equal(movs.length, 4);
  assert.equal(movs[1].compensa, 'ocio');
  assert.equal(movs[2].grupo, null);
  assert.equal(movs[2].a, 'remunerada');
  assert.deepEqual(cabeceras(d).estado, { estado: 'cerrado', fecha: '2026-11-30' });
  assert.deepEqual(valores(d, 'Presupuestos'), { ocio: 20000 });
  assert.equal(valores(d, 'Recurrentes')['seguro-coche'], 'saltado');
  assert.deepEqual(valores(d, 'Cierre').saldos, { corriente: 231000, remunerada: 383000 });
  assert.equal(valores(d, 'Cierre').editado_tras_cierre, true);
  hay(errores(d), /2026-11-31/);
  hay(avisos(d), /sin grupo/);
  hay(avisos(d), /fuera del periodo/);
  hay(avisos(d), /repetido: se le asignará otro/);
  hay(avisos(d), /mucho/);
  assert.equal(serializar(d).split('\n')[8], '- 2026-11-31 | Cena | -40,00 | ocio', 'la línea imposible se conserva tal cual');
  const fin = leer('mes/2026-11.md', '# Noviembre 2026\nesquema: 1\nperiodo: 2026-11-01 → 2026-11-30\nestado: abierto\n', { diaInicio: 25 });
  hay(avisos(fin), /no coincide con el mes financiero \(2026-10-25 → 2026-11-24\)/);
  hay(avisos(leer('mes/2026-11.md', '# Noviembre 2026\nesquema: 1\nestado: cerrado 2026-11-30\n## Movimientos\n')), /no tiene sección «## Cierre»/);
  hay(todos(leer('mes/2026-11.md', '# Noviembre 2026\nesquema: 1\nestado: cerrado\n')), /necesita fecha/);
});

test('metas y decisiones', () => {
  const m = abrir('metas.md', `# Metas
esquema: 1
## japon · Viaje a Japón
- objetivo: 4.000,00
- se_alimenta_de: cuenta hucha-japon
- aportacion: 200,00/mes
- estado: cumplida 2027-08-30
## piso · Entrada piso
- objetivo: -4.000,00
- se_alimenta_de: hucha
## media · Media
- objetivo: 100
- aportacion: media3m
`);
  const [japon] = bloques(m);
  assert.deepEqual(japon.campos.se_alimenta_de, { tipo: 'cuenta', valor: 'hucha-japon' });
  assert.deepEqual(japon.campos.aportacion, { mensual: 20000 });
  assert.deepEqual(japon.campos.estado, { estado: 'cumplida', fecha: '2027-08-30' });
  assert.deepEqual(bloques(m)[2].campos.aportacion, { media3m: true });
  hay(errores(m), /debe ser positivo/);
  hay(avisos(m), /se_alimenta_de/);
  const dc = abrir('decisiones/2026-11-01-x.md', `# Comprar acciones de IA
esquema: 1
fecha: 2026-11-01
estado: pausa-48h
vuelve: 2026-11-03 01:46
## Qué
Comprar acciones sueltas.
## Por qué
- sale en todos los vídeos
## Mi sección
libre
`);
  assert.deepEqual(cabeceras(dc).vuelve, { fecha: '2026-11-03', hora: '01:46' });
  assert.equal(textoSeccion(dc, 'Por qué'), '- sale en todos los vídeos');
  assert.equal(dc.avisos.length, 0);
  hay(avisos(leer('decisiones/x.md', '# D\nesquema: 1\nfecha: 2026-11-01\nestado: pendiente\n')), /se trata como «lista»/);
  hay(avisos(leer('decisiones/x.md', '# D\nesquema: 1\nfecha: 2026-11-01\nestado: pausa-48h\n')), /vuelve/);
});

test('cartera: activos (ISIN y exposición), operaciones, objetivo, clases, valores, plantillas', () => {
  const a = abrir('cartera/activos.md', `# Activos
esquema: 1
## msci-world · Fondo MSCI World
- isin: IE00BYX5NX33
- tipo: fondo
- clase: rv-desarrollados
- ter: 0,12
- exposicion: region EE. UU. 71 · Europa 15 · Japón 6 · otros 8 | divisa USD 71 · EUR 29 @2026-09
## malo · Malo
- isin: IE00BYX5NX34
- exposicion: region EE. UU. 50
`);
  const [mw] = bloques(a);
  assert.equal(mw.campos.ter, 12);
  assert.deepEqual(mw.campos.exposicion.dimensiones.region[0], { nombre: 'EE. UU.', pb: 7100 });
  assert.equal(mw.campos.exposicion.fecha, '2026-09');
  hay(avisos(a), /dígito de control/);
  hay(avisos(a), /no tiene clase/);
  hay(avisos(a), /suma 50 %/);
  const o = abrir('cartera/operaciones.md', `# Operaciones
esquema: 1
- OP-0042 | 2026-11-02 | aportacion | msci-world | 300,00 | participaciones: 15,2310 | mov: 2026-11/k2p0
- OP-0050 | 2026-10-15 | traspaso | sp500 → msci-world | 1.000,00
- OP-0051 | 2026-09-01 | venta | etf-ndx | -500,00
- OP-0052 | 2026-06-30 | traspaso | sp500 | 100,00
- OP-0053 | 2026-06-30 | comision | etf-ndx | -2,00
- OP-0042 | 2026-06-30 | dividendo | etf-ndx | 12,40
`);
  const ops = items(o);
  assert.equal(ops[0].participaciones, 15231000);
  assert.deepEqual(ops[1].activo, { origen: 'sp500', destino: 'msci-world' });
  hay(avisos(o), /va en positivo/);
  hay(errores(o), /necesita «origen → destino»/);
  hay(errores(o), /operación repetido/);
  assert.equal(ops.length, 4);
  const ob = abrir('cartera/objetivo.md', '# Objetivo\nesquema: 1\nredondeo: 10,00\n- msci-world | 50 | minimo: 50,00\n- emergentes | 10\n');
  hay(avisos(ob), /suman 60 %/);
  assert.equal(cabeceras(ob).redondeo, 1000);
  const cl = abrir('cartera/clases.md', '# Clases\nesquema: 1\n- rv-tecnologia | RV tecnología | indice: nasdaq-100-eur | grupo: rv | parecida: rv-desarrollados\n- x | X\n');
  assert.equal(items(cl)[0].parecida, 'rv-desarrollados');
  hay(errores(cl), /falta «grupo»/);
  const v = abrir('cartera/valores/2026-11-03.md', '# Valores 2026-11-03\nesquema: 1\n- msci-world | 16.540,00 | origen: manual\n- emergentes | -1,00\n');
  hay(errores(v), /negativo/);
  const p = abrir('cartera/plantillas/crecimiento.md', '# Plantilla · Crecimiento 90/10\nesquema: 1\nperfil: crecimiento\n- msci-world | Fondo MSCI World | 65 | clase: rv-desarrollados | isin: IE00BYX5NX33 | ter: 0,12\n- rf | RF | 30\n');
  hay(errores(p), /suman 95 %/);
});

test('conocimiento: familias, fuentes, mezclas con selectores y predicciones', () => {
  const f = abrir('conocimiento/_fuentes.md', '# Fuentes\nesquema: 1\n- pizarra | La pizarra de Andrés | familia: yt | prefijo: P | privada: no | caducidad: 180d | activa_por_defecto: no\n- yo | Yo | familia: mias | privada: no\n- otra | Otra | familia: yt | prefijo: P\n');
  assert.deepEqual(items(f)[0].caducidad, { n: 180, unidad: 'd', dias: 180 });
  hay(avisos(f), /se trata como privada/);
  hay(errores(f), /prefijo repetido/);
  const mz = abrir('conocimiento/_mezclas.md', '# Mezclas\nesquema: 1\n- bajistas | Los bajistas | base, datos, @postura<=-0,3, @familia=yt, @acierto>=65\n- mala | Mala | base, @humor>3\n');
  assert.deepEqual(items(mz)[0].miembros.slice(2), [{ campo: 'postura', op: '<=', valor: -0.3 }, { campo: 'familia', op: '=', valor: 'yt' }, { campo: 'acierto', op: '>=', valor: 65 }]);
  hay(errores(mz), /selector «@humor>3»/);
  const pr = abrir('conocimiento/predicciones.md', `# Predicciones
esquema: 1
- PR-0019 | fuente: pizarra | nota: P-0019 | «S&P 500 cae >10 % antes de 2027-03-01» | medir: sp500 caída-max 2026-10-28→2027-03-01 >= 10 | estado: pendiente
- PR-0101 | fuente: finhub | análisis: 2026-11-03-escenarios | «cartera 12 m en [-1, +9] % \\| base» | medir: cartera twr 2026-11-03→2027-11-03 | estado: pendiente
- PR-0102 | fuente: x | «y» | medir: sp500 baja mucho | estado: acertada
`);
  const [p19, p101] = items(pr);
  assert.equal(p19.texto, 'S&P 500 cae >10 % antes de 2027-03-01');
  assert.equal(p101['análisis'], '2026-11-03-escenarios');
  assert.equal(p101.texto, 'cartera 12 m en [-1, +9] % | base');
  hay(avisos(pr), /no se puede medir automáticamente/);
  hay(avisos(pr), /resuelta pero sin fecha/);
});

test('notas: tipos, Base sin opiniones, fiscalidad con «verificar», sin tipo y duplicados', () => {
  const d = abrir('conocimiento/base/b.md', `# Base
esquema: 1
## B-0001 · Una opinión en la Base
- tipo: opinión
- temas: bolsa
Texto.
## B-0002 · Traspasos
- tipo: hecho
- temas: fiscalidad
Texto.
## B-0003 · Sin tipo
Texto.
## B-0001 · Repetida
- tipo: hecho
Texto.
## B-0004 · Sin texto
- tipo: dato
`, {});
  hay(avisos(d), /solo admiten hechos/);
  hay(avisos(d), /verificar: AAAA/);
  hay(errores(d), /no tiene tipo/);
  hay(errores(d), /id de nota repetido/);
  hay(avisos(d), /no tiene texto/);
  assert.deepEqual(bloques(d).map((b) => b.id), ['B-0001', 'B-0002', 'B-0004']);
  const mundo = abrir('conocimiento/mundo/2026-11-03.md', '# Mundo 2026-11-03\nesquema: 1\nfuente: mundo\npulsos: 01:31, 08:02\n## M-261103-01 · x\n- tipo: hecho\n- efectos: bancos:▲, energia:•\n- postura: muy alcista\nTexto.\n');
  assert.deepEqual(cabeceras(mundo).pulsos, ['01:31', '08:02']);
  assert.deepEqual(bloques(mundo)[0].campos.efectos, { bancos: '▲', energia: '•' });
  hay(avisos(mundo), /postura/);
});

test('series de Datos: duplicados, huecos, saltos y orden', () => {
  const s = abrir('conocimiento/datos/series/x.md', `# Serie · X
esquema: 1
id: x
unidad: indice
## Filas
- 2026-01 | 100
- 2026-02 | 101,5
- 2026-02 | 99
- 2026-04 | 160
- 2026-03 | 150 | aproximación
- 2026-05 | 150 | nota: dato revisado
- 2026-13 | 1
`);
  const filas = items(s, 'Filas');
  assert.equal(filas[1].valor, 101500000);
  assert.equal(filas[3].aproximación, true);
  hay(errores(s), /mes repetido/);
  hay(avisos(s), /hueco/);
  hay(avisos(s), /salto del 58 %/);
  hay(avisos(s), /fuera de orden/);
  hay(errores(s), /2026-13/);
});

test('descubrimientos: versiones, ISIN de vehículos e importes prohibidos (§9.25)', () => {
  const d = abrir('conocimiento/descubrimientos/D-007.md', `# D-007 · Infraestructura
esquema: 1
- tipo: clase de activo
- estado: siguiendo
- descubierto: 2026-10-04
## v2 · 2026-11-03
- tesis: La demanda crece; con 3.000 € bastaría.
- vehiculos: ETF infra (IE00BYX5NX34)
- citas: M-261008-02, web:https://example.com
## v3 · 2026-11-04
- tesis: x
## vX · ayer
- tesis: y
`);
  assert.equal(valores(d).tipo, 'clase de activo');
  hay(errores(d), /importe en euros/);
  hay(avisos(d), /ISIN «IE00BYX5NX34» no válido/);
  hay(avisos(d), /de la más nueva a la más antigua/);
  hay(errores(d), /debe ser «## vN · AAAA-MM-DD»/);
  assert.deepEqual(bloques(d).map((b) => b.id), ['v2', 'v3']);
  hay(todos(leer('conocimiento/descubrimientos/D-008.md', '# D-008 · X\nesquema: 1\n- tipo: tema\n')), /ninguna versión válida/);
});

test('roles, tareas, análisis, encajes, chats (modo y R1), quiz y Tu año', () => {
  const r = abrir('roles/gestor.md', '# Rol · Gestor\nesquema: 1\ntrabajo: privado\n## Reglas\n- Nunca «compra».\n');
  assert.equal(textoSeccion(r, 'Reglas'), '- Nunca «compra».');
  const mala = leer('tareas/x.md', '# Tarea · X\nesquema: 1\ntrabajo: hackear\n');
  assert.ok(mala.trabajoInvalido);
  assert.ok(leer('tareas/x.md', '# Tarea · X\nesquema: 1\n').trabajoInvalido);
  const en = abrir('analisis/encajes/D-007-2026-11-03.md', '# Encaje\nesquema: 1\nfecha: 2026-11-03\ndescubrimiento: D-007\n## Resultado\nEncaja.\n');
  assert.equal(cabeceras(en).descubrimiento, 'D-007');
  hay(errores(leer('analisis/encajes/x.md', '# Encaje\nesquema: 1\nfecha: 2026-11-03\n')), /falta la cabecera «descubrimiento:»/);
  hay(errores(leer('chat/web/y.md', '# C\nesquema: 1\n')), /falta la cabecera «modo:»/);
  const chatTxt = '# Conversación · x\nesquema: 1\nmodo: web\ntrabajo: rex-web\n## Tú · 2026-11-03 01:29\nHola\n## Rex · 2026-11-03 01:29\nRespuesta\n\\## no es un turno\n';
  const ch = abrir('chat/web/x.md', chatTxt);
  assert.equal(bloques(ch)[1].cuerpo, 'Respuesta\n\\## no es un turno');
  assert.equal(desescaparMensaje(escaparMensaje('a\n## b\n\\## c')), 'a\n## b\n\\## c');
  const cruzado = leer('chat/privado/x.md', chatTxt);
  assert.ok(cruzado.conflictoModo, 'un chat web dentro de chat/privado/ no se reanuda');
  assert.ok(leer('chat/web/x.md', '# C\nesquema: 1\nmodo: web\ntrabajo: privado\n').conflictoModo);
  const q = abrir('quiz/progreso.md', '# Quiz\nesquema: 1\n- 2026-11-03 | B-0021 | acierto\n- 2026-11-03 | M-261103-01 | fallo\n');
  hay(avisos(q), /sale de la Base/);
  const ta = abrir('tu-ano/2026.md', '# Tu 2026 en finanzas\nesquema: 1\nperiodo: enero – noviembre\n## Rex dice\nBien.\n');
  assert.equal(textoSeccion(ta, 'Rex dice'), 'Bien.');
});
