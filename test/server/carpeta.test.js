// Cambiar de carpeta (§2.6, §9.24), siempre con directorios temporales que simulan la carpeta sincronizada.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { validarDestino, cambiarCarpeta, copiarVerificando } from '../../src/server/carpeta.js';
import { carpetaDeEjemplo, borrarTemporal, temporal, EJEMPLO } from './ayudas.js';

const limpiar = [];
after(async () => {
  for (const d of limpiar) await borrarTemporal(d);
});
const tmp = async (n) => {
  const d = await temporal(n);
  limpiar.push(d);
  return d;
};
const origen = async () => {
  const d = await carpetaDeEjemplo();
  limpiar.push(d);
  await fsp.mkdir(join(d, '.finhub/papelera'), { recursive: true });
  await fsp.writeFile(join(d, '.finhub/papelera/_indice.jsonl'), '');
  await fsp.writeFile(join(d, '.finhub/abierto.lock'), '{}');
  return d;
};

test('validar destino: vacía, nueva con espacios y tildes, de finhub, ajena, fichero, sin padre, misma, dentro, sin permisos', async () => {
  const base = await tmp('destinos');
  const actual = await origen();
  const nueva = join(base, 'Mi unidad', 'Finanzas ñandú');
  await fsp.mkdir(join(base, 'Mi unidad'));
  let v = await validarDestino(nueva, { actual });
  assert.deepEqual([v.ok, v.estado], [true, 'no-existe']);
  await fsp.mkdir(join(base, 'vacia'));
  assert.equal((await validarDestino(join(base, 'vacia'))).estado, 'vacia');
  assert.equal((await validarDestino(actual)).estado, 'finhub');
  await fsp.mkdir(join(base, 'ajena'));
  await fsp.writeFile(join(base, 'ajena', 'foto.jpg'), 'x');
  v = await validarDestino(join(base, 'ajena'));
  assert.equal(v.estado, 'ajena');
  assert.match(v.avisos[0], /no son de finhub/);
  await fsp.writeFile(join(base, 'fichero'), 'x');
  assert.match((await validarDestino(join(base, 'fichero'))).errores[0], /es un fichero/);
  assert.match((await validarDestino(join(base, 'no', 'existe', 'x'))).errores[0], /no existe la carpeta que la contendría/);
  assert.match((await validarDestino(actual, { actual })).errores[0], /misma carpeta/);
  assert.match((await validarDestino(join(actual, 'sub'), { actual })).errores[0], /dentro de la carpeta actual/);
  assert.match((await validarDestino(base, { actual: join(base, 'x', 'y') })).errores[0], /actual está dentro/);
  await fsp.mkdir(join(base, 'bloqueada'));
  await fsp.chmod(join(base, 'bloqueada'), 0o555);
  if (process.getuid?.() !== 0) assert.match((await validarDestino(join(base, 'bloqueada'))).errores[0], /permisos de escritura/);
  await fsp.chmod(join(base, 'bloqueada'), 0o755);
  assert.match((await validarDestino('')).errores[0], /vacía/);
});

test('copiar: copia y verifica todo (incl. .finhub, sin el candado); la antigua queda intacta', async () => {
  const actual = await origen();
  const destino = join(await tmp('copiar'), 'FINANZAS nueva');
  const progreso = [];
  const r = await cambiarCarpeta({ entrada: destino, modo: 'copiar', actual, progreso: (p) => progreso.push(p) });
  assert.equal(r.ruta, destino);
  assert.equal(r.ficheros, EJEMPLO.size + 1);
  assert.equal(progreso.at(-1).hechos, r.ficheros);
  for (const [ruta, texto] of EJEMPLO) {
    assert.equal(await fsp.readFile(join(destino, ruta), 'utf8'), texto, ruta);
    assert.equal(await fsp.readFile(join(actual, ruta), 'utf8'), texto, `${ruta} intacto en el origen`);
  }
  await assert.rejects(fsp.stat(join(destino, '.finhub/abierto.lock')), 'el candado no se copia');
  await assert.rejects(cambiarCarpeta({ entrada: destino, modo: 'copiar', actual }), /ya tiene datos de finhub/);
});

test('mover: sin confirmación la antigua sigue; con confirmación va a la papelera (nunca se borra directamente)', async () => {
  const actual = await origen();
  const enviadas = [];
  const fakePapelera = async (r) => {
    enviadas.push(r);
    return { donde: 'papelera de prueba' };
  };
  const d1 = join(await tmp('mover1'), 'dest');
  const r1 = await cambiarCarpeta({ entrada: d1, modo: 'mover', actual, enviarAPapelera: fakePapelera });
  assert.equal(r1.antiguaEnPapelera, null);
  assert.match(r1.avisos.at(-1), /sigue en su sitio/);
  assert.deepEqual(enviadas, []);
  const d2 = join(await tmp('mover2'), 'dest');
  const r2 = await cambiarCarpeta({ entrada: d2, modo: 'mover', actual, confirmarBorrado: true, enviarAPapelera: fakePapelera });
  assert.deepEqual(enviadas, [actual]);
  assert.equal(r2.antiguaEnPapelera.donde, 'papelera de prueba');
});

test('«mover» interrumpido (un fichero ilegible): se deshace lo copiado y la antigua queda intacta (§9.24)', async () => {
  if (process.getuid?.() === 0) return;
  const actual = await origen();
  await fsp.chmod(join(actual, 'metas.md'), 0o000);
  const base = await tmp('interrumpido');
  const destino = join(base, 'dest');
  const enviadas = [];
  await assert.rejects(cambiarCarpeta({ entrada: destino, modo: 'mover', actual, confirmarBorrado: true, enviarAPapelera: async (r) => enviadas.push(r) }), /La carpeta antigua no se ha tocado/);
  await fsp.chmod(join(actual, 'metas.md'), 0o644);
  assert.deepEqual(enviadas, [], 'no se manda nada a la papelera');
  assert.deepEqual(await fsp.readdir(base), [], 'el destino a medias se ha limpiado');
  for (const [ruta, texto] of EJEMPLO) assert.equal(await fsp.readFile(join(actual, ruta), 'utf8'), texto);
});

test('destino con ficheros ajenos: hace falta aceptarlo; nunca se sobrescribe un fichero existente', async () => {
  const actual = await origen();
  const destino = await tmp('ajena');
  await fsp.writeFile(join(destino, 'notas.txt'), 'mío');
  await assert.rejects(cambiarCarpeta({ entrada: destino, modo: 'copiar', actual }), /confirma/);
  const r = await cambiarCarpeta({ entrada: destino, modo: 'copiar', actual, aceptarAjenos: true });
  assert.equal(await fsp.readFile(join(destino, 'notas.txt'), 'utf8'), 'mío');
  assert.ok(r.ficheros > 100);
  const otro = await tmp('choque');
  await fsp.writeFile(join(otro, 'cuentas.md'), 'NO TOCAR');
  await assert.rejects(copiarVerificando(actual, otro), /no se sobrescribe nada/);
  assert.equal(await fsp.readFile(join(otro, 'cuentas.md'), 'utf8'), 'NO TOCAR');
});

test('usar existente y crear nueva', async () => {
  const existente = await origen();
  assert.equal((await cambiarCarpeta({ entrada: existente, modo: 'usar' })).ruta, existente);
  const vacia = await tmp('no-finhub');
  await assert.rejects(cambiarCarpeta({ entrada: vacia, modo: 'usar' }), /no es de finhub/);
  const nueva = join(vacia, 'FINANZAS');
  await cambiarCarpeta({ entrada: nueva, modo: 'crear' });
  assert.equal(await fsp.readFile(join(nueva, 'ajustes.md'), 'utf8'), '# Ajustes\nesquema: 1\n');
  await assert.rejects(cambiarCarpeta({ entrada: nueva, modo: 'crear' }), /ya es de finhub/);
  await assert.rejects(cambiarCarpeta({ entrada: join(vacia, 'x'), modo: 'copiar' }), /no hay carpeta actual/);
  await assert.rejects(cambiarCarpeta({ entrada: join(vacia, 'x'), modo: 'teletransportar', actual: existente }), /modo desconocido/);
});

test('papelera del sistema (WSL): la carpeta se MUEVE a la papelera de freedesktop, no se borra', async () => {
  const { enviarAPapeleraSistema } = await import('../../src/server/carpeta.js');
  const base = await tmp('papelera-sistema');
  const vieja = join(base, 'FINANZAS vieja');
  await fsp.mkdir(vieja);
  await fsp.writeFile(join(vieja, 'ajustes.md'), '# Ajustes\nesquema: 1\n');
  const antes = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = join(base, 'data');
  try {
    const r = await enviarAPapeleraSistema(vieja);
    assert.equal(r.donde, join(base, 'data', 'Trash'));
    await assert.rejects(fsp.stat(vieja));
    assert.equal(await fsp.readFile(join(base, 'data', 'Trash', 'files', 'FINANZAS vieja', 'ajustes.md'), 'utf8'), '# Ajustes\nesquema: 1\n');
    assert.match(await fsp.readFile(join(base, 'data', 'Trash', 'info', 'FINANZAS vieja.trashinfo'), 'utf8'), /^\[Trash Info\]\nPath=.*FINANZAS%20vieja\nDeletionDate=/);
  } finally {
    if (antes === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = antes;
  }
});
