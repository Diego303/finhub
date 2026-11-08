// QA2.1 · Ida y vuelta de TODOS los ficheros de §3: para cada tipo de fichero, ≥500 modelos aleatorios construidos a
// partir de los ejemplos del plan, con textos hostiles en cada campo libre (|, ·, #, :, comillas, emojis, tildes, ñ,
// RTL, HTML, > 5.000 caracteres): parsear(serializar(m)) = m, y serializar es idempotente byte a byte.
// Los campos libres se descubren probando: un campo que admite «Texto de prueba» es texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPrng } from '../../src/core/prng.js';
import { leer, detectar } from '../../src/core/formato/index.js';
import { serializar } from '../../src/core/formato/motor.js';
import { generar } from '../../scripts/generar-ejemplo.js';

const SEMILLA = Number(process.env.FINHUB_SEMILLA ?? 20261106);
const N = 500;
const prng = crearPrng(SEMILLA);
const azar = (l) => l[prng.entero(0, l.length - 1)];

export const HOSTILES = [
  'a | b', 'x | y: z | #etiqueta', 'con · punto medio', '## parece una sección', '# título', '- parece una lista', 'clave: valor', 'a: b: c',
  '«comillas» "dobles" \'simples\'', '`código`', '🦖 Rex 💶 €', 'ñandú áéíóú ÁÉÍÓÚ ü', 'שלום עולם مرحبا', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', 'javascript:alert(1)',
  '[x](javascript:alert(1))', '![x](x" onerror="y)', 'barra \\ invertida', 'acaba en barra \\', '\\| ya escapada', '\\# también', 'a  # no es comentario', 'a # tampoco', '#etiqueta-suelta', '%s %d ${x} {{y}}',
  'x'.repeat(5100), '1.234,56 €', '37,13 %', '—', '0', 'sí', 'no', 'null', 'undefined', '__proto__', 'tab\tdentro', '  #', '   ', 'x  ', 'a   b',
];
const limpio = (s) => s.normalize('NFC').trim();

/** Rutas de los ejemplos: una o dos por cada tipo de fichero. */
function ejemplos() {
  const porTipo = new Map();
  for (const [ruta, texto] of generar()) {
    const d = detectar(ruta);
    if (!d) continue;
    const l = porTipo.get(d.formato.tipo) ?? [];
    l.push([ruta, texto]);
    porTipo.set(d.formato.tipo, l);
  }
  return porTipo;
}

/** Quita lo que no es dato (número de línea, especificación) para comparar dos documentos. */
function plano(doc) {
  const nodo = (n) => {
    const { linea, especKv, excluido, motivo, ...r } = n;
    return r;
  };
  return { titulo: doc.titulo, esquema: doc.esquema, secciones: doc.secciones.map((s) => ({ clase: s.clase, nombre: s.nombre, id: s.id, titulo: s.titulo, nodos: s.nodos.map(nodo) })) };
}

const prueba = 'Texto de prueba';

/** Puntos de un documento donde se puede escribir texto: [get, set]. */
function huecos(doc) {
  const out = [];
  const de = (obj, k) => out.push({ get: () => obj[k], set: (v) => (obj[k] = v) });
  doc.secciones.forEach((s) => {
    if (s.clase === 'bloque') de(s, 'titulo');
    for (const n of s.nodos) {
      if (n.k === 'item') for (const k of Object.keys(n.valor)) if (typeof n.valor[k] === 'string') de(n.valor, k);
      if (n.k === 'kv' || n.k === 'cab') {
        if (typeof n.valor === 'string') de(n, 'valor');
      }
    }
  });
  return out;
}

/** Marca qué huecos son texto libre: los que admiten una frase normal. */
function camposLibres(ruta, texto) {
  const base = leer(ruta, texto);
  const hs = huecos(base);
  const libres = [];
  hs.forEach((h, i) => {
    const d = leer(ruta, texto);
    huecos(d)[i].set(prueba);
    const d2 = leer(ruta, serializar(d));
    const h2 = huecos(d2)[i];
    if (h2?.get() === prueba && d2.avisos.filter((a) => a.nivel === 'error').length === d.avisos.filter((a) => a.nivel === 'error').length) libres.push(i);
  });
  return libres;
}

const porTipo = ejemplos();

test('el ejemplo cubre todos los tipos de fichero de §3', () => {
  const faltan = ['ajustes', 'cuentas', 'grupos', 'etiquetas', 'recurrentes', 'hitos', 'mes', 'metas', 'decision', 'activos', 'operaciones', 'objetivo', 'clases', 'valores', 'plantilla', 'borrador', 'familias', 'fuentes', 'mezclas', 'predicciones', 'notas', 'semana', 'serie', 'descubrimiento', 'rol', 'tarea', 'analisis', 'encaje', 'chat', 'quiz', 'tuano'].filter((t) => !porTipo.has(t));
  assert.deepEqual(faltan, [], `semilla ${SEMILLA}`);
});

for (const [tipo, lista] of ejemplos()) {
  test(`${tipo}: ejemplos y ${N} modelos aleatorios vuelven idénticos (semilla ${SEMILLA})`, () => {
    for (const [ruta, texto] of lista) {
      // el ejemplo tal cual: ya es canónico
      const d0 = leer(ruta, texto);
      assert.equal(serializar(d0), texto, `${ruta}: ejemplo canónico`);
      assert.deepEqual(plano(leer(ruta, serializar(d0))), plano(d0), ruta);
    }
    const libres = lista.map(([r, t]) => camposLibres(r, t));
    let comprobados = 0;
    for (let i = 0; i < N; i++) {
      const k = prng.entero(0, lista.length - 1);
      const [ruta, texto] = lista[k];
      const d = leer(ruta, texto);
      const hs = huecos(d);
      const cambios = [];
      for (const j of libres[k]) {
        if (prng.siguiente() < 0.5) continue;
        const v = limpio(azar(HOSTILES));
        if (!v) continue;
        hs[j].set(v);
        cambios.push([j, v]);
      }
      // algunas entidades fuera, para variar los tamaños
      for (const s of d.secciones) if (prng.siguiente() < 0.1) s.nodos = s.nodos.filter((n) => n.k !== 'item' || prng.siguiente() < 0.7);
      const t1 = serializar(d);
      const d2 = leer(ruta, t1);
      const t2 = serializar(d2);
      assert.equal(t2, t1, `${ruta}: serializar no es idempotente (semilla ${SEMILLA}, vuelta ${i})`);
      assert.equal(serializar(leer(ruta, t2)), t2, `${ruta}: tercera vuelta`);
      // cada texto hostil vuelve tal cual
      if (d.secciones.every((s) => s.nodos.every((n) => n.k !== 'item' || true))) {
        const h2 = huecos(d2).map((h) => h.get());
        const h1 = huecos(d).map((h) => h.get());
        assert.deepEqual(h2, h1, `${ruta}: el texto cambió al volver (semilla ${SEMILLA}, vuelta ${i})\n${t1.slice(0, 600)}`);
      }
      comprobados += cambios.length;
    }
    if (libres.some((l) => l.length)) assert.ok(comprobados > 0, 'se ha probado algún texto hostil');
  });
}
