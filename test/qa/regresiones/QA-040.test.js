// QA-040 (Windows): una fuente o una decisión llamada CON, NUL, AUX… daba una carpeta o un fichero con un nombre
// reservado de Windows en una carpeta que vive en D: o en OneDrive: no se puede crear, o queda sin poder borrarse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, slugUnico, esReservado } from '../../../src/core/ids.js';
import { rutaSegura } from '../../../src/server/rutas.js';
import { detectar } from '../../../src/core/formato/index.js';

test('los slugs nunca son un nombre reservado', () => {
  for (const n of ['CON', 'con', 'Prn', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9']) {
    assert.equal(esReservado(n), true, n);
    assert.equal(esReservado(slug(n)), false, slug(n));
    assert.equal(esReservado(slugUnico(n, [])), false);
  }
  for (const n of ['console', 'nulo', 'com10', 'auxiliar', 'com', 'lpt']) assert.equal(slug(n), n);
});

test('ni rutaSegura ni detectar aceptan un segmento reservado, con cualquier extensión', () => {
  for (const r of ['conocimiento/con/x.md', 'conocimiento/x/NUL.md', 'roles/aux.md', 'decisiones/com1.md', 'tareas/LPT2.md']) {
    assert.throws(() => rutaSegura('/d', r), /no permitida/, r);
    assert.equal(detectar(r), null, r);
  }
});
