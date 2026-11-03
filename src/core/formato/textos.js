// roles/, tareas/, analisis/, analisis/encajes/, chat/, quiz/progreso.md y tu-ano/AAAA.md
import * as T from './tipos.js';
import { definirFormato, entidad, kv, p } from './motor.js';
import { TRABAJOS } from './config.js';
import { nodosItems } from './comun.js';

const conTrabajo = (tipo, titulo) =>
  definirFormato({
    tipo,
    titulo,
    cabeceras: kv({ claves: { trabajo: [T.enumerado(TRABAJOS), { requerida: true }], descripcion: T.texto() } }),
    secciones: { Rol: { texto: true }, Reglas: { texto: true }, 'Formato de salida': { texto: true }, Trabajo: { texto: true } },
    seccionesLibres: 'texto',
    validar(doc, aviso) {
      const t = doc.secciones[0].nodos.find((n) => n.k === 'cab' && n.clave === 'trabajo');
      if (!t || t.valor === undefined) {
        doc.trabajoInvalido = true;
        aviso(t ?? { linea: 1 }, `${tipo === 'rol' ? 'el rol' : 'la tarea'} necesita «trabajo: ${TRABAJOS.join(' | ')}»: no se ofrece hasta corregirlo`, 'error');
      }
    },
  });

/** Las banderas R1 viven en src/claude/trabajos/, nunca aquí: el Markdown solo elige el trabajo. */
export const rol = conTrabajo('rol', 'Rol');
export const tarea = conTrabajo('tarea', 'Tarea');

const cabAnalisis = {
  fecha: [T.fecha(), { requerida: true }],
  tarea: T.id(),
  rol: T.id(),
  mezcla: T.lista(T.id(), { vacia: true }),
  ejecucion: T.texto(),
  modelo: T.texto(),
};

export const analisis = definirFormato({ tipo: 'analisis', titulo: 'Análisis', cabeceras: kv({ claves: cabAnalisis }), seccionesLibres: 'texto' });
export const encaje = definirFormato({
  tipo: 'encaje',
  titulo: 'Encaje',
  cabeceras: kv({ claves: { ...cabAnalisis, descubrimiento: [T.codigo(/^D-\d{3,}$/), { requerida: true }], version: T.texto() } }),
  seccionesLibres: 'texto',
});

// ---------- chats ----------
export const chat = definirFormato({
  tipo: 'chat',
  titulo: 'Conversación',
  cabeceras: kv({
    claves: {
      modo: [T.enumerado(['privado', 'web']), { requerida: true }],
      trabajo: T.enumerado(['privado', 'rex-web']),
      sesion: T.texto(),
      mezcla: T.lista(T.id(), { vacia: true }),
      creada: T.fecha(),
    },
  }),
  bloques: { campos: null, cuerpo: true },
  validar(doc, aviso, ctx) {
    const cab = Object.fromEntries(doc.secciones[0].nodos.filter((n) => n.k === 'cab').map((n) => [n.clave, n.valor]));
    if (ctx.modo && cab.modo && cab.modo !== ctx.modo) {
      doc.conflictoModo = true;
      aviso({ linea: 1 }, `la conversación dice «modo: ${cab.modo}» pero está en chat/${ctx.modo}/: no se reanuda (R1)`, 'error');
    }
    if (cab.modo && cab.trabajo && (cab.modo === 'web') !== (cab.trabajo === 'rex-web')) {
      doc.conflictoModo = true;
      aviso({ linea: 1 }, `modo «${cab.modo}» y trabajo «${cab.trabajo}» no casan: no se reanuda (R1)`, 'error');
    }
    for (const s of doc.secciones.filter((x) => x.clase === 'bloque')) {
      if (!/^(Tú|Rex)$/.test(s.id) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s.titulo)) aviso({ linea: s.linea }, `turno «## ${s.id} · ${s.titulo}» no reconocido (se conserva)`);
    }
  },
});

/** Escapa las líneas de un mensaje que romperían los turnos ("## …" → "\## …"). */
export const escaparMensaje = (texto) => String(texto).split('\n').map((l) => (/^\\*## /.test(l) ? '\\' + l : l)).join('\n');
export const desescaparMensaje = (texto) => String(texto).split('\n').map((l) => (/^\\+## /.test(l) ? l.slice(1) : l)).join('\n');

// ---------- quiz y Tu año ----------
export const quiz = definirFormato({
  tipo: 'quiz',
  titulo: 'Quiz',
  preambulo: entidad({ pos: [p('fecha', T.fecha()), p('nota', T.codigo()), p('resultado', T.enumerado(['acierto', 'fallo']))] }),
  validar(doc, aviso) {
    for (const n of nodosItems(doc.secciones[0])) if (!/^B-/.test(n.valor.nota)) aviso(n, `el quiz sale de la Base: «${n.valor.nota}» no es una nota B-`);
  },
});

export const tuano = definirFormato({
  tipo: 'tuano',
  titulo: (ctx) => `Tu ${ctx.anio ?? 'año'} en finanzas`,
  cabeceras: kv({ libre: T.texto({ vacio: true }), claveLibre: T.id() }),
  secciones: { 'Rex dice': { texto: true } },
  seccionesLibres: 'texto',
});
