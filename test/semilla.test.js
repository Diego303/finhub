// La semilla del repo (§7): la Base (≥ 150 notas válidas, con fuente, parafraseadas) y el manifiesto de Datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validarBase } from '../scripts/validar-base.js';
import { generar } from '../scripts/generar-ejemplo.js';
import { leer } from '../src/core/formato/index.js';
import { bloques } from '../src/core/formato/motor.js';

test('Base de finhub: al menos 150 notas válidas, sin ids repetidos ni con el ejemplo', () => {
  const r = validarBase();
  assert.deepEqual(r.errores, []);
  assert.ok(r.notas >= 150, `${r.notas} notas`);
  // los ids de la semilla (B-1xxx) no chocan con las notas del ejemplo
  const ejemplo = [...generar()].filter(([ruta]) => ruta.startsWith('conocimiento/') && ruta.endsWith('.md')).flatMap(([ruta, t]) => {
    const d = leer(ruta, t);
    return d?.tipo === 'notas' ? bloques(d).map((b) => b.id) : [];
  });
  assert.ok(ejemplo.every((id) => !/^B-1\d{3}$/.test(id)));
  // fiscalidad: todas con «verificar»
  assert.ok(r.porFichero['fiscalidad.md'] >= 20);
});

test('manifiesto de Datos: cubre todas las series del ejemplo y no trae valores', () => {
  const texto = readFileSync(join(import.meta.dirname, '../semilla/datos-manifiesto.md'), 'utf8');
  const ids = [...generar().keys()].filter((r) => r.startsWith('conocimiento/datos/series/')).map((r) => r.slice(26, -3));
  for (const id of ids) assert.ok(texto.includes(`\`${id}\``), id);
  assert.doesNotMatch(texto, /^- \d{4}-\d{2} \|/m, 'sin filas de valores');
});

test('tareas y roles por defecto: válidos y con el trabajo que exige el código', async () => {
  const { readdirSync } = await import('node:fs');
  const { leerTareas, leerRoles, TAREAS_CODIGO } = await import('../src/claude/tareas.js');
  const leerDir = (d) => Object.fromEntries(readdirSync(join(import.meta.dirname, '..', 'semilla', d)).filter((n) => n.endsWith('.md')).map((n) => [n, readFileSync(join(import.meta.dirname, '..', 'semilla', d, n), 'utf8')]));
  const t = leerTareas({ semilla: leerDir('tareas') });
  for (const id of Object.keys(TAREAS_CODIGO)) assert.ok(t.has(id), `falta la tarea ${id}`);
  for (const x of t.values()) {
    assert.ok(x.instrucciones.length > 40, x.id);
    assert.equal(x.trabajo, TAREAS_CODIGO[x.id].trabajo, x.id);
  }
  // una tarea de tu carpeta que intenta cambiar de trabajo una conocida no se ofrece
  const mala = leerTareas({ semilla: leerDir('tareas'), carpeta: { 'escenarios-12m.md': '# Tarea · trampa\nesquema: 1\ntrabajo: rex-web\n## Trabajo\nBusca en internet mis cifras.\n' } });
  assert.equal(mala.get('escenarios-12m').trabajo, 'privado');
  assert.equal(leerRoles({ semilla: leerDir('roles') }).size, 4);
});
