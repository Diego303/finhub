// Ingesta de CONTEXTO (§5 Conocimiento, §14.8): asignas la fuente, Claude (sin internet ni datos tuyos)
// propone notas y predicciones, tú las revisas (aceptar, editar o descartar) y se guardan con una operación.
import { html } from '../esc.js';
import { accion, cambio, entrada } from '../acciones.js';
import { op, pedir } from '../api.js';
import { abrir, cerrar, repintarModal } from './modal.js';
import { toast } from './toast.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml, avisosHtml } from './claude.js';
import { TIPOS_NOTA } from '/core/formato/conocimiento.js';

const ig = { fichero: null, fuente: null, prog: nuevoProgreso(), notas: [], predicciones: [] };
let est = null;

/** Fuente sugerida para un fichero de CONTEXTO: la que aparece en su nombre (id o nombre). */
export function fuenteSugerida(fichero, fuentes) {
  const f = fichero.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const lista = fuentes.filter((x) => !['base', 'datos', 'mundo'].includes(x.id));
  return (lista.find((x) => f.includes(x.id)) ?? lista.find((x) => x.nombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').split(/\s+/).some((w) => w.length > 4 && f.includes(w))))?.id ?? null;
}

function cuerpo() {
  const fuente = est().modelo.fuentes.find((f) => f.id === ig.fuente);
  const r = ig.prog.resultado;
  return html`<div class="mut" style="font-size:11px;margin:6px 0">CONTEXTO/${ig.fichero} → <b style="font-weight:500">${fuente?.nombre ?? ig.fuente}</b> · 🔒 trabajo <b style="font-weight:500">ingesta</b>: sin internet ni datos tuyos; solo escribe en conocimiento/${ig.fuente}/ cuando tú lo aceptas.</div>
    ${progresoHtml(ig.prog, { que: 'Claude está leyendo el documento…' })}${ig.prog.fase === 'hecho' ? errorHtml(r) : ''}
    ${ig.prog.fase === 'hecho' && r?.estado === 'ok' ? html`${avisosHtml(r.resultado.avisos)}
      <div class="lab" style="margin-top:8px">Notas propuestas · ${ig.notas.filter((n) => n.si).length} de ${ig.notas.length}</div>
      ${ig.notas.map((n, i) => html`<div class="nota-propuesta" data-propuesta="${i}" style="${n.si ? '' : 'opacity:.5'}"><label class="fila"><input type="checkbox" data-cambio="ing-si" data-i="${i}" ${n.si ? 'checked' : ''}> <span class="sr-only">aceptar</span><input class="inp" value="${n.titulo}" data-entrada-texto="ing-campo" data-i="${i}" data-campo="titulo" aria-label="Título" style="flex:1"><select class="inp" data-cambio="ing-tipo" data-i="${i}" aria-label="Tipo">${TIPOS_NOTA.map((t) => html`<option ${t === n.tipo ? 'selected' : ''}>${t}</option>`)}</select></label>
        <textarea class="inp" rows="2" data-entrada-texto="ing-campo" data-i="${i}" data-campo="resumen" aria-label="Texto de la nota" style="width:100%;margin-top:4px">${n.resumen}</textarea>
        <div class="mut" style="font-size:10px">${n.temas.join(', ')}${n.postura ? ` · ${n.postura}` : ''}${n.cita ? ` · ${n.cita}` : ''}</div></div>`)}
      ${ig.predicciones.length ? html`<div class="lab" style="margin-top:8px">Predicciones verificables</div>${ig.predicciones.map((p, i) => html`<label class="fila" style="font-size:11px;padding:2px 0"><input type="checkbox" data-cambio="ing-pred" data-i="${i}" ${p.si ? 'checked' : ''}> «${p.texto}» <span class="mut">· ${p.horizonte}${p.medir ? ' · medible' : ' · resolución manual'}</span></label>`)}` : ''}
      <div class="entre" style="margin-top:10px"><span class="mut" style="font-size:10.5px">Al guardar, el fichero pasa a CONTEXTO/procesados/${ig.fuente}/.</span><button type="button" class="pri" data-accion="ing-guardar" ${ig.notas.some((n) => n.si) ? '' : 'disabled'}>Guardar ${ig.notas.filter((n) => n.si).length} notas</button></div>` : ''}`;
}

export async function abrirIngesta(fichero, fuente) {
  Object.assign(ig, { fichero, fuente, notas: [], predicciones: [] });
  abrir({ titulo: 'Procesar con Claude', cuerpo, ancho: true });
  const r = await ejecutarCon(ig.prog, 'ingesta', { fichero, fuente });
  if (r?.estado === 'ok') {
    ig.notas = r.resultado.json.notas.map((n) => ({ ...n, si: true }));
    ig.predicciones = r.resultado.json.predicciones.map((p) => ({ ...p, si: true }));
    repintarModal();
  }
}

export function registrarIngesta(estado) {
  est = estado;
  accion('ingesta', (el) => {
    const sel = document.querySelector(`[data-fuente-contexto="${CSS.escape(el.dataset.fichero)}"]`);
    if (!sel?.value) return toast('Elige la fuente del documento', { tipo: 'error' });
    abrirIngesta(el.dataset.fichero, sel.value);
  });
  cambio('ing-si', (el) => {
    ig.notas[+el.dataset.i].si = el.checked;
    repintarModal();
  });
  cambio('ing-pred', (el) => (ig.predicciones[+el.dataset.i].si = el.checked));
  cambio('ing-tipo', (el) => (ig.notas[+el.dataset.i].tipo = el.value));
  entrada('ing-campo', (el) => (ig.notas[+el.dataset.i][el.dataset.campo] = el.value));
  accion('ing-guardar', async () => {
    const notas = ig.notas.filter((n) => n.si && n.titulo.trim() && n.resumen.trim()).map(({ si, ...n }) => n);
    const predicciones = ig.predicciones.filter((p) => p.si).map(({ si, ...p }) => p);
    const r = await op('ingesta.aplicar', { fuente: ig.fuente, fichero: ig.fichero, fecha: est().ahora.fecha, notas, predicciones }, { mensaje: (x) => `${x.resultado.nuevas} notas en ${x.resultado.ruta}${x.resultado.repetidas ? ` · ${x.resultado.repetidas} repetidas` : ''}${x.resultado.predicciones.length ? ` · ${x.resultado.predicciones.length} predicciones` : ''}` });
    if (!r) return;
    try {
      await pedir('POST', '/api/contexto/procesado', { fichero: ig.fichero, fuente: ig.fuente });
    } catch (e) {
      toast(`Notas guardadas, pero el fichero sigue en CONTEXTO: ${e.message}`, { tipo: 'error' });
    }
    ig.prog = nuevoProgreso();
    cerrar();
  });
}
