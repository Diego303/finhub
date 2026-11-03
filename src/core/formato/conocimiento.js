// conocimiento/: _familias, _fuentes, _mezclas, predicciones, notas, semana, series y descubrimientos.
import * as T from './tipos.js';
import * as D from '../dinero.js';
import { validarIsin, RE_ID_NOTA } from '../ids.js';
import { mesesEntre } from '../fechas.js';
import { definirFormato, entidad, kv, p, c, cita } from './motor.js';
import { sinDuplicados, nodosItems, bloquesDoc, bloquesSinDuplicados, campoBloque } from './comun.js';

export const TIPOS_NOTA = ['dato', 'hecho', 'consenso', 'opinión', 'especulación'];
export const POSTURAS = ['alcista', 'neutral', 'bajista'];
export const FUENTES_FIJAS = ['base', 'datos', 'mundo', 'mias'];

export const familias = definirFormato({
  tipo: 'familias',
  titulo: 'Familias',
  preambulo: entidad({ pos: [p('id', T.id()), p('nombre', T.texto())], campos: [c('caducidad', T.duracion()), c('plegada', T.bool())] }),
  validar: (doc, aviso) => sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso, 'familia'),
});

export const fuentes = definirFormato({
  tipo: 'fuentes',
  titulo: 'Fuentes',
  preambulo: entidad({
    pos: [p('id', T.id()), p('nombre', T.texto())],
    campos: [
      c('familia', T.id(), { requerida: true }),
      c('prefijo', { nombre: 'prefijo', parse: (s) => (/^[A-Z]{1,4}$/.test(String(s).trim()) ? { ok: true, valor: String(s).trim() } : { ok: false, error: `prefijo «${s}» no válido (1–4 mayúsculas)` }), fmt: (v) => v }),
      c('privada', T.bool()),
      c('caducidad', T.duracion()),
      c('activa_por_defecto', T.bool()),
    ],
  }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'id', aviso, 'fuente');
    sinDuplicados(nodos, 'prefijo', aviso, 'prefijo');
    for (const n of nodos) if (n.valor.familia === 'mias' && n.valor.privada === false) aviso(n, `«${n.valor.id}» es de la familia «Mis notas»: se trata como privada`);
  },
});

/** Miembro de una mezcla: id de fuente o selector dinámico "@postura<=-0,3", "@familia=yt", "@acierto>=65". */
const miembro = () => ({
  nombre: 'miembro',
  parse(s) {
    const t = String(s).trim();
    if (!t.startsWith('@')) return T.id().parse(t);
    const m = /^@(postura|familia|acierto)(<=|>=|!=|=|<|>)(.+)$/.exec(t);
    if (!m) return { ok: false, error: `selector «${t}» no válido (@postura, @familia o @acierto con = != < <= > >=)` };
    if (m[1] === 'familia') {
      const r = T.id().parse(m[3]);
      return r.ok ? { ok: true, valor: { campo: 'familia', op: m[2], valor: r.valor } } : r;
    }
    const r = D.parseDecimal(m[3], 2);
    return r.ok ? { ok: true, valor: { campo: m[1], op: m[2], valor: r.valor / 100 } } : r;
  },
  fmt: (v) => (typeof v === 'string' ? v : `@${v.campo}${v.op}${typeof v.valor === 'number' ? D.formatearDecimal(Math.round(v.valor * 100), 2) : v.valor}`),
});

export const mezclas = definirFormato({
  tipo: 'mezclas',
  titulo: 'Mezclas',
  preambulo: entidad({ pos: [p('id', T.id()), p('nombre', T.texto()), p('miembros', T.lista(miembro()))] }),
  validar: (doc, aviso) => sinDuplicados(nodosItems(doc.secciones[0]), 'id', aviso, 'mezcla'),
});

/** "sp500 caída-max 2026-10-28→2027-03-01 >= 10" o "cartera twr …" */
export const RE_MEDIR = /^(\S+)\s+(caída-max|subida-max|variacion|twr|nivel)\s+(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})\s*(?:(>=|<=|>|<|=|en)\s*(.+))?$/;

export const predicciones = definirFormato({
  tipo: 'predicciones',
  titulo: 'Predicciones',
  preambulo: entidad({
    pos: [p('id', T.codigo(/^PR-\d{4,}$/))],
    campos: [
      c('fuente', T.id(), { requerida: true }),
      c('nota', T.codigo()),
      c('análisis', T.texto()),
      c('descubrimiento', T.codigo(/^D-\d{3,}$/)),
      cita('texto'),
      c('medir', T.texto()),
      c('estado', T.enumerado(['pendiente', 'acertada', 'fallida', 'no-medible']), { requerida: true }),
      c('resuelta', T.fecha()),
      c('valor', T.decimal(6)),
    ],
  }),
  validar(doc, aviso) {
    const nodos = nodosItems(doc.secciones[0]);
    sinDuplicados(nodos, 'id', aviso, 'predicción');
    for (const n of nodos) {
      if (n.valor.texto === undefined) aviso(n, `${n.valor.id} no tiene el texto «…» de la predicción`);
      if (n.valor.medir && !RE_MEDIR.test(n.valor.medir)) aviso(n, `${n.valor.id}: «medir» no se puede medir automáticamente (resolución manual)`);
      if (n.valor.estado !== 'pendiente' && !n.valor.resuelta) aviso(n, `${n.valor.id} está resuelta pero sin fecha «resuelta:»`);
    }
  },
});

// ---------- notas ----------
const flecha = () => T.enumerado(['▲', '▼', '•']);

export const camposNota = kv({
  claves: {
    tipo: [T.enumerado(TIPOS_NOTA), { requerida: true }],
    fecha: T.fecha(),
    fuente: T.id(),
    origen: T.texto(),
    temas: T.lista(T.id()),
    activos: T.lista(T.id()),
    postura: T.enumerado(POSTURAS),
    efectos: T.mapa(T.id(), flecha()),
    caduca: T.fecha(),
    pulso: T.hora(),
    hash: T.texto(),
    editada: T.bool(),
    verificar: T.entero({ min: 2000, max: 2100 }),
  },
});

export const notas = definirFormato({
  tipo: 'notas',
  titulo: 'Notas',
  cabeceras: kv({ claves: { fuente: T.id(), fecha: T.fecha(), origen: T.texto(), pulsos: T.lista(T.hora()), documento: T.texto() } }),
  bloques: { campos: camposNota, cuerpo: true },
  validar(doc, aviso, ctx) {
    bloquesSinDuplicados(doc, aviso, 'id de nota');
    for (const s of bloquesDoc(doc)) {
      if (!RE_ID_NOTA.test(s.id)) aviso({ linea: s.linea }, `id de nota «${s.id}» con forma inesperada`);
      const tipo = campoBloque(s, 'tipo');
      if (!tipo) {
        aviso({ linea: s.linea }, `la nota «${s.id}» no tiene tipo (dato, hecho, consenso, opinión o especulación)`, 'error');
        s.excluido = true;
      }
      const fuente = campoBloque(s, 'fuente') ?? ctx.fuente;
      if (['base', 'datos'].includes(fuente) && ['opinión', 'especulación'].includes(tipo)) aviso({ linea: s.linea }, `«${s.id}»: la Base y los Datos solo admiten hechos, datos y consenso`);
      if (!s.nodos.some((n) => n.k === 'cuerpo' && n.texto.trim())) aviso({ linea: s.linea }, `la nota «${s.id}» no tiene texto`);
      const temas = campoBloque(s, 'temas') ?? [];
      if (temas.some((t) => /fiscal|impuesto|irpf/.test(t)) && !campoBloque(s, 'verificar')) aviso({ linea: s.linea }, `«${s.id}» es de fiscalidad y le falta «verificar: AAAA»`);
    }
  },
});

export const semana = definirFormato({
  tipo: 'semana',
  titulo: (ctx) => `Semana ${ctx.semana ?? ''}`.trim(),
  cabeceras: kv({ claves: { periodo: T.periodo(), pulsos: T.entero({ min: 0 }), noticias: T.entero({ min: 0 }), mezcla: T.lista(T.id(), { vacia: true }) } }),
  seccionesLibres: 'texto',
});

// ---------- series de Datos ----------
export const serie = definirFormato({
  tipo: 'serie',
  titulo: 'Serie',
  cabeceras: kv({
    claves: {
      id: [T.id(), { requerida: true }],
      unidad: T.enumerado(['indice', 'porcentaje', 'tipo-cambio']),
      frecuencia: T.enumerado(['mensual']),
      divisa: T.texto(),
      fuente: T.texto(),
      metodo: T.texto(),
      actualizado: T.fecha(),
      sintetica: T.bool(),
    },
  }),
  secciones: {
    Filas: { items: entidad({ pos: [p('mes', T.mes()), p('valor', T.decimal(6))], campos: [{ k: 'bandera', nombre: 'aproximación' }, c('nota', T.texto())] }) },
  },
  validar(doc, aviso) {
    const sec = doc.secciones.find((s) => s.nombre === 'Filas');
    const nodos = nodosItems(sec);
    sinDuplicados(nodos, 'mes', aviso, 'mes');
    const unidad = doc.secciones[0].nodos.find((n) => n.k === 'cab' && n.clave === 'unidad')?.valor ?? 'indice';
    let ant = null;
    for (const n of nodos.filter((x) => !x.excluido)) {
      if (ant) {
        if (n.valor.mes <= ant.valor.mes) aviso(n, `mes ${n.valor.mes} fuera de orden`);
        else if (mesesEntre(ant.valor.mes, n.valor.mes) > 1) aviso(n, `hueco en la serie entre ${ant.valor.mes} y ${n.valor.mes}`);
        if (unidad === 'indice' && ant.valor.valor > 0) {
          const salto = Math.abs(n.valor.valor / ant.valor.valor - 1);
          if (salto > 0.4 && !n.valor.nota) aviso(n, `salto del ${Math.round(salto * 100)} % en ${n.valor.mes} sin «nota:»`);
        }
      }
      if (unidad === 'indice' && n.valor.valor <= 0) aviso(n, `nivel no positivo en ${n.valor.mes}`, 'error');
      ant = n;
    }
  },
});

// ---------- descubrimientos ----------
export const TIPOS_DESCUBRIMIENTO = ['tema', 'sector', 'región', 'clase de activo', 'vehículo', 'materia prima'];
export const ESTADOS_DESCUBRIMIENTO = ['nuevo', 'siguiendo', 'descartado', 'archivado'];

export const descubrimiento = definirFormato({
  tipo: 'descubrimiento',
  titulo: 'Descubrimiento',
  preambulo: kv({
    claves: {
      tipo: T.enumerado(TIPOS_DESCUBRIMIENTO),
      estado: T.enumerado(ESTADOS_DESCUBRIMIENTO),
      postura: T.enumerado(POSTURAS),
      confianza: T.enumerado(['baja', 'media', 'alta']),
      origen: T.texto(),
      descubierto: T.fecha(),
      revisar: T.fecha(),
      referencia: T.texto(),
      vs: T.id(),
    },
  }),
  bloques: {
    campos: kv({
      claves: {
        cambios: T.texto(),
        tesis: T.texto(),
        saldria_bien_si: T.texto(),
        la_invalidaria: T.texto(),
        riesgos: T.texto(),
        vehiculos: T.texto(),
        citas: T.lista(T.texto()),
        predicciones: T.lista(T.codigo(/^PR-\d{4,}$/)),
        afirmaciones: T.texto(),
      },
    }),
    cuerpo: true,
  },
  validar(doc, aviso) {
    bloquesSinDuplicados(doc, aviso, 'versión');
    let anterior = null;
    for (const s of bloquesDoc(doc)) {
      if (!/^v\d+$/.test(s.id) || !T.fecha().parse(s.titulo).ok) {
        aviso({ linea: s.linea }, `la versión «## ${s.id} · ${s.titulo}» debe ser «## vN · AAAA-MM-DD»`, 'error');
        s.excluido = true;
        continue;
      }
      const n = +s.id.slice(1);
      if (anterior !== null && n >= anterior) aviso({ linea: s.linea }, 'las versiones van de la más nueva a la más antigua');
      anterior = n;
      const veh = campoBloque(s, 'vehiculos') ?? '';
      for (const m of veh.matchAll(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/g)) if (!validarIsin(m[0])) aviso({ linea: s.linea }, `ISIN «${m[0]}» no válido: ese vehículo se descarta`);
      for (const k of ['tesis', 'saldria_bien_si', 'la_invalidaria', 'riesgos']) {
        const t = campoBloque(s, k) ?? '';
        if (/\d[\d.,]*\s*(€|eur\b|euros)/i.test(t)) aviso({ linea: s.linea }, `«${k}» contiene un importe en euros: un descubrimiento es público y no debe llevar cifras tuyas`, 'error');
      }
    }
    if (!bloquesDoc(doc).some((s) => !s.excluido)) aviso({ linea: 1 }, 'el descubrimiento no tiene ninguna versión válida');
  },
});

