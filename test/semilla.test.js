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
