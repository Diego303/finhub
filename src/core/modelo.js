// Modelo de la carpeta para la interfaz: parsea los textos que da /api/datos (isomórfico: Node y navegador).
// Solo lectura y accesos cómodos; los cálculos de cada pestaña viven en sus módulos de core.
import { leer } from './formato/index.js';
import { items, bloques, valores, cabeceras } from './formato/motor.js';
import { ajustesEfectivos } from './formato/config.js';

const ordenar = (lista, campo) => [...lista].sort((a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0));

/**
 * ficheros: {ruta: {texto, version, tipo} | {error, tipo}} → modelo.
 * Los ficheros ilegibles se listan en `noLegibles` y nunca se tratan como vacíos.
 */
export function construirModelo(ficheros) {
  const docs = new Map();
  const versiones = {};
  const noLegibles = [];
  const ajTexto = ficheros['ajustes.md']?.texto;
  const ajDoc = ajTexto !== undefined ? leer('ajustes.md', ajTexto) : null;
  const ajustes = ajustesEfectivos(ajDoc ? valores(ajDoc) : {});
  const ctx = { diaInicio: ajustes.mes_inicio_dia };
  for (const [ruta, f] of Object.entries(ficheros)) {
    if (f.error) {
      noLegibles.push({ ruta, error: f.error });
      continue;
    }
    const d = ruta === 'ajustes.md' ? ajDoc : leer(ruta, f.texto, ctx);
    if (!d) continue;
    docs.set(ruta, d);
    versiones[ruta] = f.version;
  }
  const doc = (r) => docs.get(r) ?? null;
  const lista = (r) => (doc(r) ? items(doc(r)) : []);
  const porPrefijo = (p) => [...docs.keys()].filter((r) => r.startsWith(p)).sort();

  const meses = porPrefijo('mes/').map((r) => r.slice(4, 11));
  const mes = (m) => {
    const d = doc(`mes/${m}.md`);
    if (!d) return null;
    const cab = cabeceras(d);
    return { mes: m, doc: d, periodo: cab.periodo ?? null, estado: cab.estado ?? { estado: 'abierto', fecha: null }, movimientos: items(d, 'Movimientos'), presupuestos: valores(d, 'Presupuestos'), marcas: valores(d, 'Recurrentes'), cierre: valores(d, 'Cierre') };
  };
  const fotos = porPrefijo('cartera/valores/').map((r) => ({ fecha: r.slice(16, 26), filas: items(doc(r)) }));
  const mundo = porPrefijo('conocimiento/mundo/').filter((r) => /\d{4}-\d{2}-\d{2}\.md$/.test(r)).map((r) => {
    const d = doc(r);
    return { fecha: r.slice(-13, -3), pulsos: cabeceras(d).pulsos ?? [], notas: bloques(d) };
  });
  const descubrimientos = porPrefijo('conocimiento/descubrimientos/').map((r) => {
    const d = doc(r);
    const [id, ...t] = d.titulo.split(' · ');
    return { ruta: r, id, titulo: t.join(' · ') || d.titulo, ...valores(d), versiones: bloques(d) };
  });
  const series = porPrefijo('conocimiento/datos/series/').map((r) => ({ ruta: r, ...cabeceras(doc(r)), filas: items(doc(r), 'Filas').length }));
  const decisiones = porPrefijo('decisiones/').map((r) => ({ ruta: r, titulo: doc(r).titulo, ...cabeceras(doc(r)) }));
  let notas = 0;
  for (const r of porPrefijo('conocimiento/')) if (doc(r).tipo === 'notas') notas += bloques(doc(r)).length;

  return {
    docs,
    versiones,
    noLegibles,
    ajustes,
    doc,
    avisos: [...docs].reduce((a, [, d]) => a + d.avisos.length, 0),
    cuentas: lista('cuentas.md'),
    grupos: lista('grupos.md'),
    etiquetas: lista('etiquetas.md'),
    recurrentes: lista('recurrentes.md'),
    hitos: lista('hitos.md'),
    metas: doc('metas.md') ? bloques(doc('metas.md')) : [],
    activos: doc('cartera/activos.md') ? bloques(doc('cartera/activos.md')) : [],
    operaciones: lista('cartera/operaciones.md'),
    objetivo: lista('cartera/objetivo.md'),
    clases: lista('cartera/clases.md'),
    fotos: ordenar(fotos, 'fecha'),
    meses,
    mes,
    decisiones,
    familias: lista('conocimiento/_familias.md'),
    fuentes: lista('conocimiento/_fuentes.md'),
    mezclas: lista('conocimiento/_mezclas.md'),
    predicciones: lista('conocimiento/predicciones.md'),
    notas,
    mundo: ordenar(mundo, 'fecha'),
    descubrimientos,
    series,
    roles: porPrefijo('roles/').map((r) => ({ ruta: r, titulo: doc(r).titulo, ...cabeceras(doc(r)) })),
    tareas: porPrefijo('tareas/').map((r) => ({ ruta: r, titulo: doc(r).titulo, ...cabeceras(doc(r)) })),
    chats: porPrefijo('chat/').map((r) => ({ ruta: r, titulo: doc(r).titulo, ...cabeceras(doc(r)) })),
  };
}
