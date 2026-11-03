// Trabajos de Claude en la web (§8): lanzar con tu luz verde, seguir el progreso por SSE (Rex piensa,
// habla, se alegra o se preocupa), ver la propuesta y aplicarla con una operación. El modal «Datos de
// mercado» (trabajo «datos», §7.3) es el primero que lo usa.
import { html } from '../esc.js';
import { accion, cambio } from '../acciones.js';
import { pedir, obtener, op } from '../api.js';
import { abrir, cerrar, repintarModal } from './modal.js';
import { toast } from './toast.js';
import { ponerRex, estado } from '../estado.js';
import { ponerAccesorioRex } from './rex-sprite.js';

const oyentes = new Set();
/** El SSE de estado.js llama aquí con cada evento «claude». */
export function eventoClaude(ev) {
  if (ev.trabajo === 'descubrir') ponerAccesorioRex(ev.tipo === 'fin' ? '' : 'lupa');
  if (ev.tipo === 'inicio') ponerRex('piensa');
  else if (ev.tipo === 'texto') ponerRex('habla');
  else if (ev.tipo === 'fin') {
    ponerRex(ev.estado === 'ok' ? 'feliz' : 'preocupado', 5000);
    refrescarInfo();
  }
  for (const f of oyentes) f(ev);
}

/** Info de /api/claude (trabajos, registro de hoy, en curso), guardada en estado.claude. */
let firma = '9|0|0'; // lo que enseña la barra R1 sin datos: solo se repinta si cambia
export async function refrescarInfo() {
  try {
    estado.claude = await obtener('/api/claude');
    const nueva = `${estado.claude.trabajos.length}|${estado.claude.hoy.length}|${estado.claude.enCurso.length}`;
    if (nueva === firma) return;
    firma = nueva;
    document.dispatchEvent(new CustomEvent('finhub:claude'));
  } catch {
    /* sin servidor: se reintenta en la próxima carga */
  }
}

/** Lanza un trabajo y sigue su progreso. → Promise<resultado de /api/claude/ejecucion> */
export async function lanzar(trabajo, params, { alProgreso = () => {}, desclasificar = false, resume = null } = {}) {
  const { id } = await pedir('POST', '/api/claude/ejecutar', { trabajo, params, desclasificar, resume });
  return new Promise((resolver) => {
    const f = async (ev) => {
      if (ev.id !== id) return;
      alProgreso(ev);
      if (ev.tipo === 'fin') {
        oyentes.delete(f);
        resolver(await obtener(`/api/claude/ejecucion?id=${encodeURIComponent(id)}`));
      }
    };
    oyentes.add(f);
    alProgreso({ tipo: 'lanzado', id });
  });
}

// ---------- progreso reutilizable ----------
/** Estado de una ejecución para pintar: {fase: listo|trabajando|hecho, texto, herramientas, id, resultado} */
export const nuevoProgreso = () => ({ fase: 'listo', texto: '', herramientas: [], id: null, resultado: null });

/** Ejecuta un trabajo actualizando `prog` y repintando. → resultado de la ejecución (o {estado:'error'}) */
export async function ejecutarCon(prog, trabajo, params, { repintar = repintarModal, desclasificar = false, resume = null } = {}) {
  Object.assign(prog, nuevoProgreso(), { fase: 'trabajando' });
  repintar();
  try {
    prog.resultado = await lanzar(trabajo, params, {
      desclasificar,
      resume,
      alProgreso: (ev) => {
        if (ev.tipo === 'lanzado') prog.id = ev.id;
        if (ev.tipo === 'texto') prog.texto += ev.delta;
        if (ev.tipo === 'herramienta') prog.herramientas.push(ev);
        if (ev.tipo === 'inicio' && ev.seleccion) prog.seleccion = ev.seleccion;
        repintar();
      },
    });
  } catch (e) {
    prog.resultado = { estado: 'error', resultado: { mensaje: e.message } };
  }
  prog.fase = 'hecho';
  repintar();
  return prog.resultado;
}

/** Bloque de progreso: spinner, herramientas usadas, texto que llega y «cancelar». */
export function progresoHtml(prog, { que = 'Claude está trabajando…' } = {}) {
  if (prog.fase !== 'trabajando') return '';
  return html`<div class="progreso-claude" data-progreso><div class="fila"><span class="spinner" aria-hidden="true"></span><b style="font-weight:500">${que}</b>${prog.seleccion ? html`<span class="mut" style="font-size:10.5px">se usaron ${prog.seleccion.usadas} de ${prog.seleccion.total} notas de tu mezcla</span>` : ''}<button type="button" class="go" data-accion="claude-cancelar" data-id="${prog.id ?? ''}" style="margin-left:auto">cancelar</button></div>
    ${prog.herramientas.length ? html`<div class="mut" style="font-size:10.5px">${prog.herramientas.slice(-5).map((h) => html`<div>· ${h.nombre}: ${h.entrada}</div>`)}</div>` : ''}
    ${prog.texto ? html`<div style="font-size:11.5px;white-space:pre-wrap;max-height:200px;overflow:auto;margin-top:4px" aria-live="polite">${prog.texto.replace(/```json[\s\S]*$/, '').slice(-2500)}</div>` : ''}</div>`;
}

/** Mensaje de error o cuarentena de una ejecución terminada (o '' si fue bien). */
export function errorHtml(r) {
  if (!r || r.estado === 'ok') return '';
  return html`<div class="banda aviso" style="display:block;margin-top:8px">${r.resultado?.mensaje ?? r.resultado?.motivo ?? 'No se pudo completar.'}</div>`;
}

/** Avisos del verificador (cifras no verificadas, citas quitadas, lenguaje de recomendación). */
export const avisosHtml = (avisos = []) => (avisos.length ? html`<div class="mut" style="font-size:10.5px;margin-top:6px">⚠ ${avisos.join(' · ')}</div>` : '');

// ---------- modal «Datos de mercado» ----------
const dm = { fase: 'elegir', series: [], elegidas: new Set(), progreso: { texto: '', herramientas: [], id: null }, resultado: null, guardar: new Set() };

function cuerpoDatos() {
  const lista = dm.series;
  const r1 = html`<div class="mut" style="font-size:10.5px;margin:6px 0">🔒 Trabajo <b style="font-weight:500">datos</b>: internet sí · tus datos privados no · solo recibe el manifiesto de series y el último mes que tienes. Claude no escribe nada: te propone las filas y tú decides si se guardan.</div>`;
  if (dm.fase === 'elegir') {
    return html`<div class="mut" style="font-size:11px;margin:6px 0">Series para calcular (comparativas, proyección, crisis, IPC). Sus valores no están en el repo por licencias: se crean en tu máquina, desde fuentes gratuitas, siguiendo semilla/datos-manifiesto.md.</div>${r1}
      <table class="tb"><thead><tr><th><span class="sr-only">elegir</span></th><th>serie</th><th>en tu carpeta</th><th class="n">meses</th></tr></thead><tbody>${lista.map((s) => html`<tr style="${s.sintetica ? 'opacity:.55' : ''}"><td><input type="checkbox" data-cambio="datos-serie" data-id="${s.id}" ${dm.elegidas.has(s.id) ? 'checked' : ''} ${s.sintetica ? 'disabled' : ''} aria-label="${s.id}"></td><td>${s.id}<div class="mut" style="font-size:10px">${s.que}</div></td><td class="mut">${s.sintetica ? 'sintética (ejemplo): no se mezcla' : s.existe ? `hasta ${s.ultimo ?? '—'}` : 'no la tienes'}</td><td class="n">${s.filas || ''}</td></tr>`)}</tbody></table>
      <div class="entre" style="margin-top:10px"><span class="mut" style="font-size:10.5px">${dm.elegidas.size} serie(s) · modelo ${estado.modelo?.ajustes.claude_modelo?.datos ?? 'haiku'}</span><button type="button" class="pri" data-accion="datos-lanzar" ${dm.elegidas.size ? '' : 'disabled'}>Buscar con Claude (luz verde)</button></div>`;
  }
  if (dm.fase === 'trabajando') {
    return html`${r1}<div class="fila" style="margin:8px 0"><span class="spinner" aria-hidden="true"></span><b style="font-weight:500">Claude está buscando…</b><button type="button" class="go" data-accion="datos-cancelar" style="margin-left:auto">cancelar</button></div>
      ${dm.progreso.herramientas.length ? html`<div class="mut" style="font-size:10.5px">${dm.progreso.herramientas.slice(-6).map((h) => html`<div>· ${h.nombre}: ${h.entrada}</div>`)}</div>` : ''}
      <div style="font-size:11px;white-space:pre-wrap;max-height:160px;overflow:auto;margin-top:6px" aria-live="polite">${dm.progreso.texto.slice(-1500)}</div>`;
  }
  const r = dm.resultado;
  if (!r || r.estado !== 'ok') {
    return html`${r1}<div class="banda aviso" style="display:block;margin-top:8px">${r?.resultado?.mensaje ?? 'No se pudo completar.'}</div><div style="text-align:right;margin-top:8px"><button type="button" data-accion="datos-volver">volver</button></div>`;
  }
  const series = r.resultado.series;
  return html`${r1}<div style="font-size:11.5px;margin:6px 0">Esto es lo que ha encontrado (ya revisado por código: meses nuevos, sin saltos raros ni el mes en curso). Marca lo que quieras guardar:</div>
    <table class="tb"><thead><tr><th><span class="sr-only">guardar</span></th><th>serie</th><th class="n">meses nuevos</th><th>de … a</th><th>fuente</th></tr></thead><tbody>${series.map((s) => html`<tr><td><input type="checkbox" data-cambio="datos-guardar" data-id="${s.id}" ${dm.guardar.has(s.id) ? 'checked' : ''} ${s.filas.length ? '' : 'disabled'} aria-label="Guardar ${s.id}"></td><td>${s.id}${s.avisos.length ? html`<div style="color:var(--text-warning);font-size:10px">⚠ ${s.avisos.slice(0, 3).join(' · ')}</div>` : ''}</td><td class="n">${s.filas.length}</td><td class="mut">${s.desde ?? '—'} … ${s.hasta ?? '—'}</td><td class="mut" style="font-size:10px;word-break:break-all">${s.fuente}</td></tr>`)}</tbody></table>
    ${r.resultado.avisos.length ? html`<div class="mut" style="font-size:10.5px;margin-top:4px">⚠ ${r.resultado.avisos.join(' · ')}</div>` : ''}
    <div class="entre" style="margin-top:10px"><button type="button" class="go" data-accion="datos-volver">descartar</button><button type="button" class="pri" data-accion="datos-guardar" ${dm.guardar.size ? '' : 'disabled'}>Guardar en conocimiento/datos/series/</button></div>`;
}

export async function abrirDatos() {
  try {
    dm.series = (await obtener('/api/claude/datos')).series;
  } catch (e) {
    return toast(e.message, { tipo: 'error' });
  }
  if (dm.fase !== 'trabajando') {
    dm.fase = 'elegir';
    const mes = new Date().toISOString().slice(0, 7);
    dm.elegidas = new Set(dm.series.filter((s) => !s.sintetica && (!s.existe || !s.ultimo || s.ultimo < mes)).map((s) => s.id).slice(0, 4));
  }
  abrir({ titulo: 'Datos de mercado', cuerpo: cuerpoDatos, ancho: true });
}

export function registrarAccionesClaude() {
  accion('abrir-datos', () => abrirDatos());
  const marcar = (conj) => (el) => {
    el.checked ? conj().add(el.dataset.id) : conj().delete(el.dataset.id);
    repintarModal();
  };
  cambio('datos-serie', marcar(() => dm.elegidas));
  cambio('datos-guardar', marcar(() => dm.guardar));
  // los eventos «claude» del SSE llegan como evento del documento (ver estado.js)
  document.addEventListener('finhub:claude-evento', (ev) => eventoClaude(ev.detail));
  accion('datos-lanzar', async () => {
    dm.fase = 'trabajando';
    dm.progreso = { texto: '', herramientas: [], id: null };
    repintarModal();
    try {
      dm.resultado = await lanzar('datos', { ids: [...dm.elegidas] }, {
        alProgreso: (ev) => {
          if (ev.tipo === 'lanzado') dm.progreso.id = ev.id;
          if (ev.tipo === 'texto') dm.progreso.texto += ev.delta;
          if (ev.tipo === 'herramienta') dm.progreso.herramientas.push(ev);
          repintarModal();
        },
      });
    } catch (e) {
      dm.resultado = { estado: 'error', resultado: { mensaje: e.message } };
    }
    dm.fase = 'resultado';
    dm.guardar = new Set((dm.resultado?.resultado?.series ?? []).filter((s) => s.filas.length).map((s) => s.id));
    repintarModal();
  });
  accion('datos-cancelar', () => dm.progreso.id && pedir('POST', '/api/claude/cancelar', { id: dm.progreso.id }));
  accion('claude-cancelar', (el) => el.dataset.id && pedir('POST', '/api/claude/cancelar', { id: el.dataset.id }));
  accion('datos-volver', () => {
    dm.fase = 'elegir';
    repintarModal();
  });
  accion('datos-guardar', async () => {
    const series = dm.resultado.resultado.series.filter((s) => dm.guardar.has(s.id) && s.filas.length);
    const r = await op('datos.aplicar', { series }, { mensaje: (x) => `Guardadas: ${x.resultado.series.map((s) => `${s.id} (+${s.filas})`).join(', ')}` });
    if (r) {
      dm.fase = 'elegir';
      cerrar();
    }
  });
}
