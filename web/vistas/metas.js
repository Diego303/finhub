// Pestaña Metas (§5, maqueta: metas()): metas con progreso, proyección con históricos y libertad financiera,
// diario de decisiones e hitos. Cálculos: /core/metas.js, /core/proyeccion.js, /core/metas-resumen.js.
import { html } from '../esc.js';
import { accion, cambio, formulario } from '../acciones.js';
import { op, obtener } from '../api.js';
import { abrir, cerrar, confirmar } from '../componentes/modal.js';
import { toast } from '../componentes/toast.js';
import { ponerRex } from '../estado.js';
import { graficoLineas } from '../graficos/linea.js';
import { resumenMetas } from '/core/metas-resumen.js';
import { formatearEuros, formatearImporte, parseImporte } from '/core/dinero.js';
import { textoCorto, MESES_CORTOS, esFecha } from '/core/fechas.js';
import { leer } from '/core/formato/index.js';
import { items, textoSeccion } from '/core/formato/motor.js';
import { SECCIONES_DECISION } from '/core/formato/metas.js';

const eur = (c) => formatearEuros(c, 0);
const mesAnio = (f) => `${MESES_CORTOS[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`;
const ESTADO_DECISION = { 'pausa-48h': 'pausa de 48 h', lista: 'lista para revisar', decidida: 'decidida', descartada: 'descartada' };
const COLOR_ESTADO = { activa: '#1D9E75', pausada: 'var(--text-muted)', cumplida: '#7F77DD', archivada: 'var(--text-muted)' };

const ui = { perfil: null, aportacion: null, anios: 20, real: true, verArchivadas: false };
let contexto = null;
let semilla = null; // plantillas del repo si la carpeta no tiene (se piden una vez)
let cache = { clave: null, valor: null };
export const iniciarMetas = (c) => (contexto = c);
const est = () => contexto.estado;
const repintar = () => contexto.render();

function plantillas(m) {
  const enCarpeta = [...m.docs.keys()].filter((r) => r.startsWith('cartera/plantillas/')).map((r) => m.doc(r));
  if (!enCarpeta.length && semilla === null) {
    semilla = [];
    obtener('/api/semilla?tipo=plantillas-cartera')
      .then((s) => {
        semilla = Object.entries(s.ficheros).map(([n, t]) => leer(`cartera/plantillas/${n}`, t));
        repintar();
      })
      .catch(() => {});
  }
  const docs = enCarpeta.length ? enCarpeta : semilla ?? [];
  return docs.map((d) => ({ perfil: d.secciones[0].nodos.find((n) => n.clave === 'perfil')?.valor ?? d.titulo, titulo: d.titulo.replace(/^Plantilla · /, ''), filas: items(d) }));
}

/** El resumen se recalcula solo si cambian los datos o las opciones (la proyección son 2.000 caminos). */
export function datosMetas(estado) {
  const m = estado.modelo;
  const pl = plantillas(m);
  const opciones = { perfil: ui.perfil, aportacion: ui.aportacion, anios: ui.anios, real: ui.real };
  const clave = JSON.stringify([estado.ahora.fecha, opciones, pl.length]);
  if (cache.modelo !== m || cache.clave !== clave) cache = { modelo: m, clave, valor: resumenMetas(m, estado.ahora.fecha, { ...opciones, plantillas: pl }) };
  return cache.valor;
}

// ---------- vista ----------
export function vistaMetas(estado) {
  const r = datosMetas(estado);
  return html`<div class="grid2" style="margin-top:0;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)">
    <div>${cajaMetas(r)}${cajaDecisiones(estado)}${cajaHitos(estado)}</div>
    <div>${cajaProyeccion(r)}</div></div>`;
}

function cajaMetas(r) {
  const visibles = r.metas.filter((x) => ui.verArchivadas || x.estado !== 'archivada');
  const archivadas = r.metas.length - r.metas.filter((x) => x.estado !== 'archivada').length;
  return html`<div class="box"><div class="entre"><span class="lab" style="margin:0">Metas de ahorro</span><button type="button" class="go" data-accion="meta-form" data-id="">+ meta</button></div>
    ${visibles.length ? visibles.map(filaMeta) : html`<div class="mut" style="font-size:11px;padding:8px 0">Aún no tienes metas. Una meta con fecha y aportación te dice cuándo llegas.</div>`}
    ${archivadas ? html`<button type="button" class="go" data-accion="metas-archivadas" style="margin-top:6px">${ui.verArchivadas ? 'ocultar' : 'ver'} ${archivadas} archivada(s)</button>` : ''}</div>`;
}

function filaMeta(x) {
  const pct = Math.min(100, x.pb / 100);
  const apagada = x.estado === 'pausada' || x.estado === 'archivada';
  let detalle;
  if (x.estado === 'cumplida') detalle = `cumplida${x.fechaCumplida ? ` el ${textoCorto(x.fechaCumplida)} ${x.fechaCumplida.slice(0, 4)}` : ''} 🎉`;
  else if (x.lista) detalle = '¡ya la tienes! márcala como cumplida';
  else {
    const encuadre = x.encuadre === 'llevas' ? `llevas ${Math.floor(x.pb / 100)} %` : `te faltan ${eur(x.falta)}`;
    const ritmo = x.aportacion > 0 ? `${eur(x.aportacion)}/mes${x.aportacionOrigen === 'media3m' ? ' (media de 3 meses)' : ''}${x.origen?.tipo === 'grupo' ? ` (grupo «${x.origen.valor}»)` : ''} → ${mesAnio(x.fechaEstimada)}` : x.aportacionOrigen ? 'aportación 0 · así no llega' : 'sin aportación mensual · ponle una para ver la fecha';
    const plazo = x.fechaDeseada ? (x.aTiempo ? ` · llegas antes de ${mesAnio(x.fechaDeseada)}` : ` · para ${mesAnio(x.fechaDeseada)} harían falta ${eur(x.necesaria)}/mes`) : '';
    detalle = `${encuadre} · ${ritmo}${plazo}`;
  }
  return html`<div style="padding:8px 0;border-top:.5px solid var(--border);${apagada ? 'opacity:.6' : ''}" data-meta="${x.id}">
    <div class="entre"><button type="button" class="enlace" data-accion="meta-form" data-id="${x.id}" style="font-weight:500">${x.titulo}</button><span>${eur(x.llevas)} <span class="mut">/ ${eur(x.objetivo)}</span></span></div>
    <div class="bar" style="margin:5px 0" role="img" aria-label="${x.titulo}: ${Math.floor(x.pb / 100)} %"><i style="width:${pct}%;background:${COLOR_ESTADO[x.estado]}"></i></div>
    <div class="entre" style="align-items:flex-start;gap:8px"><span class="mut" style="font-size:10.5px;${x.fechaDeseada && x.aTiempo === false && x.estado === 'activa' ? 'color:var(--text-warning)' : ''}">${x.estado === 'pausada' ? 'en pausa · ' : x.estado === 'archivada' ? 'archivada · ' : ''}${detalle}${x.avisos.length ? html` <span style="color:var(--text-warning)">⚠ ${x.avisos.join(' · ')}</span>` : ''}</span>
      <span class="fila" style="flex-shrink:0">${botonesMeta(x)}</span></div></div>`;
}

function botonesMeta(x) {
  const b = (estado, texto, extra = '') => html`<button type="button" class="go ${extra}" data-accion="meta-estado" data-id="${x.id}" data-estado="${estado}">${texto}</button>`;
  if (x.estado === 'activa') return html`${x.lista ? b('cumplida', '¡cumplida!', 'pri') : ''}${b('pausada', 'pausar')}`;
  if (x.estado === 'pausada') return b('activa', 'reanudar');
  if (x.estado === 'archivada') return b('activa', 'recuperar');
  return b('archivada', 'archivar');
}

function cajaProyeccion(r) {
  const p = r.proyeccion;
  const perfiles = r.perfiles;
  const controles = html`<form class="fila" data-form="proyeccion" style="flex-wrap:wrap;gap:10px;font-size:11px;margin-bottom:6px">
    <label>aportación <input class="inp" id="proy-aportacion" name="aportacion" value="${formatearImporte(r.aportacion).replace(/,00$/, '')}" style="width:62px;text-align:right" data-cambio="proy-aportacion"> €/mes</label>
    <label>años <input class="inp" id="proy-anios" name="anios" value="${r.anios}" style="width:38px;text-align:right" data-cambio="proy-anios" inputmode="numeric"></label>
    <span>${perfiles.map((x) => html`<button type="button" class="chip ck ${r.perfil?.id === x.id ? 'on' : ''}" data-accion="proy-perfil" data-perfil="${x.id}" aria-pressed="${r.perfil?.id === x.id ? 'true' : 'false'}">${x.id === 'objetivo' ? 'tu objetivo' : x.titulo.split(' · ')[1] ?? x.titulo}</button>`)}</span>
    <button type="button" class="chip ck ${r.real ? 'on' : ''}" data-accion="proy-real" aria-pressed="${r.real ? 'true' : 'false'}">en € de hoy</button></form>`;
  if (p.error) return html`<div class="box"><div class="lab">Proyección de tu cartera · simulación con históricos (código)</div>${controles}<div class="banda aviso">No se puede proyectar: ${p.error}.</div></div>`;
  const k = (v) => v / 100000; // miles de euros
  const n = p.anios.length - 1;
  const anio0 = +est().ahora.fecha.slice(0, 4);
  const lib = r.libertad;
  return html`<div class="box"><div class="lab">Proyección de tu cartera · simulación con históricos (código)</div>${controles}
    ${graficoLineas({ series: [{ nombre: 'mediana', color: '#D85A30', valores: p.p50.map(k), grosor: 2.2 }, { nombre: 'lo que habrás puesto', color: 'var(--text-muted)', valores: p.puesto.map(k), grosor: 1.2, discontinua: true }], banda: { inf: p.p10.map(k), sup: p.p90.map(k), color: '#D85A30' }, ancho: 440, alto: 170, etiquetaY: (v) => `${v.toFixed(0)}k`, etiquetasX: p.anios.map((t) => (t % 5 === 0 ? String(anio0 + t) : '')), titulo: `proyección a ${n} años: mediana ${eur(p.p50[n])}, entre ${eur(p.p10[n])} y ${eur(p.p90[n])}` })}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">${[['Pesimista (p10)', p.p10[n]], ['Mediana', p.p50[n]], ['Optimista (p90)', p.p90[n]]].map(([t, v]) => html`<div style="background:var(--surface-1);border-radius:8px;padding:6px 8px"><div class="mut" style="font-size:10.5px">${t}</div><div style="font-size:15px;font-weight:500" data-proy="${t}">${eur(v)}</div></div>`)}</div>
    <div class="mut" style="font-size:10.5px;margin-top:6px">Partes de ${eur(r.inicial)} (tu cartera hoy) y habrás puesto ${eur(p.puesto[n])}. Banda = 80 % de ${p.modo === 'manual' ? 'los resultados con tus supuestos de Ajustes' : `2.000 caminos remuestreando años del histórico ${p.desde}…${p.hasta}`} para ${r.perfil.id === 'objetivo' ? 'tu objetivo' : `una cartera ${r.perfil.titulo.toLowerCase()}`}. ${r.real && (p.real ?? true) ? 'Descontada la inflación (€ de hoy).' : 'Sin descontar inflación.'} Semilla fija: mismos datos, mismo resultado.${est().modelo.series.some((s) => s.sintetica) ? ' Las series del ejemplo son SINTÉTICAS.' : ''}</div>
    ${r.avisos.length ? html`<div class="banda aviso" style="margin-top:6px;display:block">${r.avisos.map((a) => html`<div>⚠ ${a}</div>`)}</div>` : ''}
    <div style="font-size:11px;margin-top:8px;padding-top:8px;border-top:.5px solid var(--border)" id="libertad">${lib?.objetivo ? html`Con tu gasto anual (≈ ${eur(r.consumo.consumo)}${r.consumo.estimado ? `, estimado con ${r.consumo.meses} meses` : ''}), la regla del ${Math.round(100 / (est().modelo.ajustes.libertad_multiplicador ?? 25) * 10) / 10} % pide <b style="font-weight:500">${eur(lib.objetivo)}</b> para vivir de la cartera. Mediana: <b style="font-weight:500">${lib.anio !== null ? `en ${anio0 + lib.anio}` : `más de ${lib.masDe} años`}</b>.` : html`<span class="mut">Libertad financiera: hace falta al menos un mes con gastos para estimar tu consumo anual.</span>`}</div></div>`;
}

function decisiones(m) {
  return [...m.decisiones].sort((a, b) => ((b.fecha ?? '') < (a.fecha ?? '') ? -1 : 1));
}

function cajaDecisiones(estado) {
  const m = estado.modelo;
  const hoy = estado.ahora.fecha;
  const lista = decisiones(m);
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Diario de decisiones</span><button type="button" class="go" data-accion="decision-form" data-ruta="">+ decisión</button></div>
    ${lista.map((d) => {
      const porQue = textoSeccion(m.doc(d.ruta), 'Por qué');
      const tocaRevisar = d.revisar && d.revisar <= hoy && d.estado === 'decidida' && !textoSeccion(m.doc(d.ruta), 'Resultado de la revisión');
      return html`<div style="padding:6px 0;border-top:.5px solid var(--border);font-size:11.5px"><span class="mut">${d.fecha ? `${textoCorto(d.fecha)}${d.fecha.slice(0, 4) !== hoy.slice(0, 4) ? ` ${d.fecha.slice(0, 4)}` : ''}` : ''}</span> · <button type="button" class="enlace" data-accion="decision-form" data-ruta="${d.ruta}" style="font-weight:500">${d.titulo}</button>
        <div class="mut" style="font-size:10.5px">${porQue ? `por qué: ${porQue.split('\n')[0]} · ` : ''}${d.estado && d.estado !== 'decidida' ? `${ESTADO_DECISION[d.estado]}${d.estado === 'pausa-48h' && d.vuelve ? ` hasta ${textoCorto(d.vuelve.fecha)} ${d.vuelve.hora}` : ''}` : ''}${d.revisar ? html`${d.estado && d.estado !== 'decidida' ? ' · ' : ''}<span style="${tocaRevisar ? 'color:var(--text-warning)' : ''}">${tocaRevisar ? 'toca revisarla' : `revisar en ${mesAnio(d.revisar)}`}</span>` : ''}</div></div>`;
    })}
    <div class="mut" style="font-size:10.5px;margin-top:6px">Escribir el porqué antes de decidir y revisarlo después te protege de tus propios sesgos.</div></div>`;
}

function cajaHitos(estado) {
  const hitos = [...estado.modelo.hitos].reverse();
  return html`<div class="box" style="margin-top:8px"><div class="entre"><span class="lab" style="margin:0">Hitos · aparecen en la línea de tiempo del Panel</span><button type="button" class="go" data-accion="hito-form" data-id="">+ hito</button></div>
    ${hitos.length ? hitos.map((h) => html`<div class="entre" style="padding:4px 0;border-top:.5px solid var(--border);font-size:11px"><span><span class="mut">${h.fecha}</span> · ${h.texto} <span class="mut">· ${h.tipo}${h.nota ? ` · ${h.nota}` : ''}</span></span><span class="fila"><button type="button" class="go" data-accion="hito-form" data-id="${h.id}" aria-label="Editar ${h.texto}">✎</button><button type="button" class="go" data-accion="hito-borrar" data-id="${h.id}" aria-label="Borrar ${h.texto}">🗑</button></span></div>`) : html`<div class="mut" style="font-size:11px">Sin hitos. Marca momentos tuyos (un cambio de trabajo, una herencia) para entender tu patrimonio.</div>`}</div>`;
}

// ---------- modales ----------
function abrirMeta(estado, id) {
  const m = estado.modelo;
  const meta = id ? m.metas.find((x) => x.id === id) : null;
  const c = meta?.campos ?? {};
  const origen = c.se_alimenta_de;
  const valorOrigen = origen ? (origen.tipo === 'manual' ? 'manual' : `${origen.tipo}:${origen.valor}`) : '';
  const grupos = m.grupos.filter((g) => ['ahorro', 'inversion'].includes(g.naturaleza) && !g.archivado);
  abrir({
    titulo: meta ? meta.titulo : 'Nueva meta',
    cuerpo: html`<form data-form="meta" style="font-size:11.5px;line-height:2.3;margin-top:6px"><input type="hidden" name="id" value="${meta?.id ?? ''}">
      <label>nombre <input class="inp" name="nombre" value="${meta?.titulo ?? ''}" style="width:220px" autofocus></label>
      <label>objetivo <input class="inp" name="objetivo" value="${c.objetivo ? formatearImporte(c.objetivo) : ''}" style="width:90px;text-align:right"> €</label><br>
      <label>fecha deseada <input class="inp" name="fecha" value="${c.fecha_deseada ?? ''}" placeholder="AAAA-MM-DD (opcional)" style="width:150px"></label><br>
      <label>se alimenta de <select class="inp" name="origen"><option value="">—</option>
        <optgroup label="saldo de una cuenta">${m.cuentas.filter((x) => !x.archivada).map((x) => html`<option value="cuenta:${x.id}" ${valorOrigen === `cuenta:${x.id}` ? 'selected' : ''}>${x.nombre}</option>`)}</optgroup>
        <optgroup label="lo apartado en un grupo">${grupos.map((g) => html`<option value="grupo:${g.id}" ${valorOrigen === `grupo:${g.id}` ? 'selected' : ''}>${g.nombre}</option>`)}</optgroup>
        <option value="manual" ${valorOrigen === 'manual' ? 'selected' : ''}>importe que escribo yo</option></select></label>
      <label>importe manual <input class="inp" name="manual" value="${origen?.tipo === 'manual' ? formatearImporte(origen.valor) : ''}" style="width:90px;text-align:right"> €</label><br>
      <label>aportación <input class="inp" name="aportacion" value="${c.aportacion?.mensual !== undefined ? formatearImporte(c.aportacion.mensual) : ''}" style="width:80px;text-align:right"> €/mes</label>
      <label><input type="checkbox" name="media3m" ${c.aportacion?.media3m ? 'checked' : ''}> o la media de mis últimos 3 meses</label>
      <div class="mut" style="font-size:10.5px;line-height:1.5">Progreso = saldo de la cuenta, lo apartado en el grupo o el importe que escribas. Fecha estimada = lo que falta ÷ aportación.</div>
      <div class="entre" style="margin-top:6px">${meta ? html`<span class="fila"><button type="button" class="go" data-accion="meta-borrar" data-id="${meta.id}">borrar</button>${c.estado?.estado !== 'archivada' ? html`<button type="button" class="go" data-accion="meta-estado" data-id="${meta.id}" data-estado="archivada">archivar</button>` : ''}${c.estado?.estado === 'activa' || !c.estado ? html`<button type="button" class="go" data-accion="meta-estado" data-id="${meta.id}" data-estado="cumplida">marcar cumplida</button>` : ''}</span>` : html`<span></span>`}<button type="submit" class="pri">${meta ? 'Guardar' : 'Crear'}</button></div></form>`,
  });
}

function abrirDecision(estado, ruta) {
  const m = estado.modelo;
  const d = ruta ? m.decisiones.find((x) => x.ruta === ruta) : null;
  const doc = d ? m.doc(ruta) : null;
  const sec = (n) => (doc ? textoSeccion(doc, n) ?? '' : '');
  const campo = (n, filas = 2) => html`<label style="display:block;margin-top:6px">${n.toLowerCase()}<br><textarea class="inp" name="s:${n}" rows="${filas}" style="width:100%">${sec(n)}</textarea></label>`;
  abrir({
    titulo: d ? 'Decisión' : 'Nueva decisión',
    ancho: true,
    cuerpo: html`<form data-form="decision" style="font-size:11.5px;margin-top:6px"><input type="hidden" name="ruta" value="${ruta ?? ''}">
      <label>qué decides <input class="inp" name="titulo" value="${d?.titulo ?? ''}" style="width:100%" autofocus></label>
      <div class="fila" style="margin-top:6px;flex-wrap:wrap"><label>fecha <input class="inp" name="fecha" value="${d?.fecha ?? estado.ahora.fecha}" style="width:96px"></label>
        <label>estado <select class="inp" name="estado">${Object.entries(ESTADO_DECISION).map(([k, t]) => html`<option value="${k}" ${(d?.estado ?? 'decidida') === k ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label>revisar el <input class="inp" name="revisar" value="${d?.revisar ?? ''}" placeholder="AAAA-MM-DD" style="width:110px"></label>
        ${d?.vuelve ? html`<span class="mut">vuelve ${d.vuelve.fecha} ${d.vuelve.hora}</span>` : ''}</div>
      ${campo('Qué')}${campo('Por qué', 3)}${campo('Alternativas')}${d ? campo('Resultado de la revisión') : ''}
      ${sec('Preguntas de Rex') ? html`<div class="mut" style="font-size:10.5px;margin-top:6px;white-space:pre-line"><b style="font-weight:500">Preguntas de Rex</b>\n${sec('Preguntas de Rex')}</div>` : ''}
      <div class="mut" style="font-size:10.5px;margin-top:6px">«Pausa de 48 h»: la decisión vuelve a ti dentro de dos días (en Pendientes). Las preguntas de Rex llegan en la fase F10.</div>
      <div class="entre" style="margin-top:8px">${d ? html`<button type="button" class="go" data-accion="decision-borrar" data-ruta="${ruta}">borrar</button>` : html`<span></span>`}<button type="submit" class="pri">${d ? 'Guardar' : 'Añadir al diario'}</button></div></form>`,
  });
}

function abrirHito(estado, id) {
  const h = id ? estado.modelo.hitos.find((x) => x.id === id) : null;
  abrir({
    titulo: h ? `Hito ${h.id}` : 'Nuevo hito',
    cuerpo: html`<form data-form="hito" style="font-size:11.5px;line-height:2.3;margin-top:6px"><input type="hidden" name="id" value="${h?.id ?? ''}">
      <label>fecha <input class="inp" name="fecha" value="${h?.fecha ?? estado.ahora.fecha}" style="width:96px" autofocus></label>
      <label>tipo <select class="inp" name="tipo">${['mío', 'mundo'].map((t) => html`<option ${(h?.tipo ?? 'mío') === t ? 'selected' : ''}>${t}</option>`)}</select></label><br>
      <label>texto <input class="inp" name="texto" value="${h?.texto ?? ''}" style="width:300px"></label>
      <div style="text-align:right"><button type="submit" class="pri">${h ? 'Guardar' : 'Añadir'}</button></div></form>`,
  });
}

// ---------- acciones ----------
export function registrarAccionesMetas() {
  cambio('proy-aportacion', (el) => {
    const r = parseImporte(el.value || '0');
    if (!r.ok || r.valor < 0) return toast('Aportación no válida', { tipo: 'error' });
    ui.aportacion = r.valor;
    repintar();
  });
  cambio('proy-anios', (el) => {
    const n = Number(el.value);
    if (!Number.isInteger(n) || n < 1 || n > 40) return toast('Años: de 1 a 40', { tipo: 'error' });
    ui.anios = n;
    repintar();
  });
  formulario('proyeccion', () => {}); // Enter en los campos ya dispara «change»
  accion('proy-perfil', (el) => {
    ui.perfil = el.dataset.perfil;
    repintar();
  });
  accion('proy-real', () => {
    ui.real = !ui.real;
    repintar();
  });
  accion('metas-archivadas', () => {
    ui.verArchivadas = !ui.verArchivadas;
    repintar();
  });
  accion('meta-form', (el) => abrirMeta(est(), el.dataset.id || null));
  accion('meta-estado', async (el) => {
    const { id, estado } = el.dataset;
    const nombre = est().modelo.metas.find((x) => x.id === id)?.titulo ?? id;
    const textos = { cumplida: `🎉 ¡«${nombre}» cumplida!`, pausada: `«${nombre}» en pausa`, activa: `«${nombre}» activa de nuevo`, archivada: `«${nombre}» archivada` };
    const r = await op('meta.estado', { id, estado }, { mensaje: textos[estado] });
    if (!r) return;
    cerrar();
    if (r.resultado?.celebrar) ponerRex('feliz', 6000);
  });
  accion('meta-borrar', async (el) => {
    const nombre = est().modelo.metas.find((x) => x.id === el.dataset.id)?.titulo;
    if (!(await confirmar(`¿Borrar la meta «${nombre}»? Irá a la papelera 30 días. Si solo ya no te interesa, mejor archívala.`, { si: 'Borrar' }))) return;
    op('bloque.borrar', { ruta: 'metas.md', id: el.dataset.id, que: `meta «${nombre}»` }, { mensaje: `Meta «${nombre}» borrada` });
  });
  formulario('meta', async (f, d) => {
    if (!d.nombre.trim()) return toast('Escribe el nombre', { tipo: 'error' });
    const obj = parseImporte(d.objetivo);
    if (!obj.ok || obj.valor <= 0) return toast('El objetivo debe ser un importe positivo', { tipo: 'error' });
    if (d.fecha.trim() && !esFecha(d.fecha.trim())) return toast('Fecha deseada: AAAA-MM-DD', { tipo: 'error' });
    let origen = null;
    if (d.origen === 'manual') {
      const v = parseImporte(d.manual || '0');
      if (!v.ok) return toast('Importe manual no válido', { tipo: 'error' });
      origen = { tipo: 'manual', valor: v.valor };
    } else if (d.origen) {
      const [tipo, valor] = d.origen.split(':');
      origen = { tipo, valor };
    }
    let aportacion = null;
    if (d.media3m === 'on') {
      if (origen?.tipo === 'manual' || !origen) return toast('La media de 3 meses necesita una cuenta o un grupo', { tipo: 'error' });
      aportacion = { media3m: true };
    } else if (d.aportacion.trim()) {
      const a = parseImporte(d.aportacion);
      if (!a.ok || a.valor < 0) return toast('Aportación no válida', { tipo: 'error' });
      aportacion = { mensual: a.valor };
    }
    const campos = { objetivo: obj.valor, fecha_deseada: d.fecha.trim() || null, se_alimenta_de: origen, aportacion };
    const r = d.id
      ? await op('bloque.editar', { ruta: 'metas.md', id: d.id, titulo: d.nombre.trim(), campos }, { mensaje: 'Meta guardada' })
      : await op('meta.crear', { titulo: d.nombre.trim(), campos: Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null)) }, { mensaje: `Meta «${d.nombre.trim()}» creada` });
    if (r) cerrar();
  });
  accion('decision-form', (el) => abrirDecision(est(), el.dataset.ruta || null));
  accion('decision-borrar', async (el) => {
    if (!(await confirmar('¿Borrar esta decisión del diario? Irá a la papelera 30 días.', { si: 'Borrar' }))) return;
    const r = await op('fichero.borrar', { ruta: el.dataset.ruta, que: 'decisión del diario' }, { mensaje: 'Decisión borrada' });
    if (r) cerrar();
  });
  formulario('decision', async (f, d) => {
    if (!d.titulo.trim()) return toast('Escribe qué decides', { tipo: 'error' });
    if (!esFecha(d.fecha.trim())) return toast('Fecha: AAAA-MM-DD', { tipo: 'error' });
    if (d.revisar.trim() && !esFecha(d.revisar.trim())) return toast('Revisar el: AAAA-MM-DD', { tipo: 'error' });
    const secciones = Object.fromEntries(SECCIONES_DECISION.filter((n) => `s:${n}` in d).map((n) => [n, d[`s:${n}`]]));
    if (Object.values(secciones).some((t) => /^\s*#/m.test(t))) return toast('Una línea no puede empezar por «#»', { tipo: 'error' });
    const r = d.ruta
      ? await op('decision.editar', { ruta: d.ruta, titulo: d.titulo.trim(), cabeceras: { fecha: d.fecha.trim(), estado: d.estado, revisar: d.revisar.trim() || null }, secciones }, { mensaje: 'Decisión guardada' })
      : await op('decision.crear', { titulo: d.titulo.trim(), fecha: d.fecha.trim(), estado: d.estado, revisar: d.revisar.trim() || null, secciones }, { mensaje: (x) => `Al diario: ${x.resultado.ruta}` });
    if (r) cerrar();
  });
  accion('hito-form', (el) => abrirHito(est(), el.dataset.id || null));
  accion('hito-borrar', (el) => op('lista.borrar', { ruta: 'hitos.md', clave: el.dataset.id, que: `hito ${el.dataset.id}` }, { mensaje: 'Hito borrado' }));
  formulario('hito', async (f, d) => {
    if (!esFecha(d.fecha.trim())) return toast('Fecha: AAAA-MM-DD', { tipo: 'error' });
    if (!d.texto.trim()) return toast('Escribe el texto del hito', { tipo: 'error' });
    const r = d.id
      ? await op('lista.editar', { ruta: 'hitos.md', clave: d.id, cambios: { fecha: d.fecha.trim(), texto: d.texto.trim(), tipo: d.tipo } }, { mensaje: 'Hito guardado' })
      : await op('hito.crear', { fecha: d.fecha.trim(), texto: d.texto.trim(), tipo: d.tipo }, { mensaje: 'Hito añadido' });
    if (r) cerrar();
  });
}
