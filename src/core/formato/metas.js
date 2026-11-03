// metas.md y decisiones/*.md (docs/FORMATOS.md §2 y §4)
import * as T from './tipos.js';
import * as D from '../dinero.js';
import { definirFormato, kv } from './motor.js';
import { bloquesDoc, bloquesSinDuplicados, campoBloque } from './comun.js';

/** "cuenta hucha-japon" · "grupo meta-japon" · "manual 1.800,00" */
const origenMeta = () => ({
  nombre: 'origenMeta',
  parse(s) {
    const m = /^(cuenta|grupo|manual)\s+(.+)$/.exec(String(s).trim());
    if (!m) return { ok: false, error: `«${s}» debe ser «cuenta <id>», «grupo <id>» o «manual <importe>»` };
    const r = m[1] === 'manual' ? D.parseImporte(m[2]) : T.id().parse(m[2]);
    return r.ok ? { ok: true, valor: { tipo: m[1], valor: r.valor } } : r;
  },
  fmt: (v) => `${v.tipo} ${v.tipo === 'manual' ? D.formatearImporte(v.valor) : v.valor}`,
});

/** "200,00/mes" · "media3m" */
const aportacion = () => ({
  nombre: 'aportacion',
  parse(s) {
    const t = String(s).trim();
    if (t === 'media3m') return { ok: true, valor: { media3m: true } };
    const m = /^(.+?)\s*\/\s*mes$/.exec(t);
    if (!m) return { ok: false, error: `«${s}» debe ser «importe/mes» o «media3m»` };
    const r = D.parseImporte(m[1]);
    return r.ok ? { ok: true, valor: { mensual: r.valor } } : r;
  },
  fmt: (v) => (v.media3m ? 'media3m' : `${D.formatearImporte(v.mensual)}/mes`),
});

export const ESTADOS_META = ['activa', 'pausada', 'cumplida', 'archivada'];

export const metas = definirFormato({
  tipo: 'metas',
  titulo: 'Metas',
  bloques: {
    campos: kv({
      claves: {
        objetivo: [T.importe(), { requerida: true }],
        fecha_deseada: T.fecha(),
        se_alimenta_de: origenMeta(),
        aportacion: aportacion(),
        estado: T.estadoConFecha(ESTADOS_META, { conFecha: ['cumplida'], fechaOpcional: ['cumplida'] }),
      },
    }),
  },
  validar(doc, aviso) {
    bloquesSinDuplicados(doc, aviso, 'meta');
    for (const s of bloquesDoc(doc)) {
      const o = campoBloque(s, 'objetivo');
      if (o === undefined) aviso({ linea: s.linea }, `la meta «${s.id}» no tiene objetivo`, 'error');
      else if (o <= 0) aviso({ linea: s.linea }, `el objetivo de «${s.id}» debe ser positivo`, 'error');
      if (!campoBloque(s, 'se_alimenta_de')) aviso({ linea: s.linea }, `«${s.id}» no dice de dónde se alimenta: progreso 0`);
    }
  },
});

/** "2026-11-05 01:46" */
const fechaHora = () => ({
  nombre: 'fechaHora',
  parse: (s) => {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/.exec(String(s).trim());
    if (!m || !T.fecha().parse(m[1]).ok || !T.hora().parse(m[2]).ok) return { ok: false, error: `«${s}» debe ser «AAAA-MM-DD HH:MM»` };
    return { ok: true, valor: { fecha: m[1], hora: m[2] } };
  },
  fmt: (v) => `${v.fecha} ${v.hora}`,
});

export const ESTADOS_DECISION = ['pausa-48h', 'lista', 'decidida', 'descartada'];
export const SECCIONES_DECISION = ['Qué', 'Por qué', 'Alternativas', 'Preguntas de Rex', 'Resultado de la revisión'];

export const decision = definirFormato({
  tipo: 'decision',
  titulo: 'Decisión',
  cabeceras: kv({
    claves: {
      fecha: [T.fecha(), { requerida: true }],
      estado: T.enumerado(ESTADOS_DECISION),
      vuelve: fechaHora(),
      revisar: T.fecha(),
      origen: T.texto(),
    },
  }),
  secciones: Object.fromEntries(SECCIONES_DECISION.map((s) => [s, { texto: true }])),
  seccionesLibres: 'texto',
  validar(doc, aviso) {
    const pre = doc.secciones[0].nodos;
    const estado = pre.find((n) => n.k === 'cab' && n.clave === 'estado');
    if (estado && estado.valor === undefined) aviso(estado, `estado «${estado.texto}» desconocido: se trata como «lista»`);
    const est = estado?.valor;
    if (est === 'pausa-48h' && !pre.some((n) => n.k === 'cab' && n.clave === 'vuelve' && n.valor)) aviso({ linea: 1 }, 'una pausa de 48 h necesita «vuelve: AAAA-MM-DD HH:MM»');
  },
});
