// QA-057: con patrimonio por debajo de mil euros (lo normal al empezar), el eje de la línea de tiempo decía «0k, 0k, 0k» y el resumen
// para lectores de pantalla, «de 0 a 0». Lo encontró una prueba real sobre la carpeta de pruebas del usuario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaMiles } from '../../../src/core/graficos/geometria.js';

test('el eje dice algo útil a cualquier escala', () => {
  assert.equal(etiquetaMiles(0), '0 €');
  assert.equal(etiquetaMiles(0.1), '100 €');
  assert.equal(etiquetaMiles(0.5), '500 €');
  assert.equal(etiquetaMiles(-0.25), '-250 €');
  assert.equal(etiquetaMiles(1), '1k');
  assert.equal(etiquetaMiles(2.5), '2,5k');
  assert.equal(etiquetaMiles(12), '12k');
  assert.equal(etiquetaMiles(57.3), '57k');
  assert.equal(etiquetaMiles(-3), '-3k');
});
