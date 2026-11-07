// QA-059 (funcionalidad rota, alto): una carpeta nueva no creaba familias, fuentes ni clases. La Base se copiaba, pero ninguna fuente la
// registraba: Rex y los análisis no recibían ninguna nota, la ingesta decía «elige la fuente» y un activo no tenía clase que elegir.
// El ejemplo sí trae esos ficheros: por eso ninguna prueba lo vio. Lo destapó el Claude real en la carpeta de pruebas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOp } from '../../../src/core/ops/index.js';
import { crearPrng } from '../../../src/core/prng.js';
import { construirModelo } from '../../../src/core/modelo.js';
import { leer } from '../../../src/core/formato/index.js';
import { serializar } from '../../../src/core/formato/motor.js';
import { notasParaTrabajo } from '../../../src/claude/contexto.js';
import { trabajo } from '../../../src/claude/trabajos/index.js';
import { esFuentePrivada } from '../../../src/core/conocimiento.js';

const NOTA = '# Base\nesquema: 1\nfuente: base\n## B-0001 · Qué es el TER\n- tipo: dato\n- fecha: 2026-01-01\n- fuente: base\n\nEl TER es el coste anual de un fondo.\n';
function carpetaNueva() {
  const fs = new Map([['ajustes.md', '# Ajustes\nesquema: 1\n']]);
  const r = aplicarOp((x) => fs.get(x) ?? null, 'inicio.crear', { fecha: '2026-11-07', cuentas: [{ nombre: 'Banco', tipo: 'corriente', saldo: 100000 }], grupos: ['vivienda', 'sueldo', 'cartera'], recurrentes: [], base: { ficheros: { 'conceptos.md': NOTA } } }, { rutas: [...fs.keys()], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} });
  for (const [k, v] of Object.entries(r.escribir)) fs.set(k, v);
  return { fs, M: construirModelo(Object.fromEntries([...fs].map(([k, texto]) => [k, { texto, version: 'v' }]))) };
}

test('el asistente deja familias, fuentes fijas y clases, válidas y canónicas', () => {
  const { fs, M } = carpetaNueva();
  for (const r of ['conocimiento/_familias.md', 'conocimiento/_fuentes.md', 'cartera/clases.md']) {
    assert.ok(fs.has(r), r);
    const d = leer(r, fs.get(r));
    assert.deepEqual(d.avisos.filter((a) => a.nivel === 'error'), [], r);
    assert.equal(serializar(d), fs.get(r), r);
  }
  assert.deepEqual(M.fuentes.map((f) => f.id).sort(), ['base', 'datos', 'mias', 'mundo']);
  assert.ok(M.familias.some((f) => f.id === 'yt'), 'para añadir canales');
  assert.ok(M.clases.some((c) => c.id === 'rv-desarrollados' && c.indice));
  assert.equal(esFuentePrivada(M.fuentes.find((f) => f.id === 'mias')), true, 'Mis notas, privadas');
  for (const id of ['base', 'datos', 'mundo']) assert.equal(esFuentePrivada(M.fuentes.find((f) => f.id === id)), false, id);
});

test('la Base llega a Rex; una fuente nueva se puede crear para la ingesta', () => {
  const { fs, M } = carpetaNueva();
  const sel = notasParaTrabajo(M, trabajo('privado'), { hoy: '2026-11-07' });
  assert.deepEqual(sel.notas.map((n) => n.id), ['B-0001']);
  const r = aplicarOp((x) => fs.get(x) ?? null, 'fuente.crear', { nombre: 'Mi canal', familia: 'yt' }, { rutas: [...fs.keys()], prng: crearPrng(1), hoy: '2026-11-07', ajustes: {}, formato: {} });
  assert.equal(r.resultado.id, 'mi-canal');
});
