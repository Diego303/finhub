// Barra R1 fija abajo y su modal (§0, §5 Global): la matriz sale de la especificación real de los trabajos
// (src/claude/trabajos/), y el registro de hoy y la cuarentena, de .finhub/ (vía /api/claude).
import { html } from '../esc.js';
import { abrir } from './modal.js';
import { obtener } from '../api.js';

const si = (v) => (v ? 'sí' : 'no');
const ESTADO = { ok: '✓', cuarentena: '⚠ cuarentena', error: '✗', rechazado: '⛔ rechazado' };

export function barraR1(info = null) {
  const n = info?.trabajos?.length ?? 9;
  const hoy = info?.hoy?.length ?? 0;
  const enCurso = info?.enCurso?.length ?? 0;
  return html`<button type="button" class="r1bar ck" data-accion="abrir-r1" aria-label="Regla R1: ver cómo se garantiza">
    <span>🔒 <b style="font-weight:500">R1</b> · ningún trabajo de Claude junta tus datos privados + texto externo + internet</span>
    <span class="mut">${n} trabajos aislados · registro de hoy: ${hoy} ejecuciones${enCurso ? ` · ${enCurso} en marcha` : ''} · ver →</span>
  </button>`;
}

const color = (v, privado) => (v ? (privado ? 'var(--ep-h)' : 'var(--text-warning)') : 'var(--text-success)');
const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export async function abrirR1() {
  let info = { trabajos: [], hoy: [] };
  let cuarentena = [];
  try {
    [info, { ficheros: cuarentena }] = await Promise.all([obtener('/api/claude'), obtener('/api/claude/cuarentena')]);
  } catch {
    /* sin servidor: se muestra la regla igualmente */
  }
  abrir({
    titulo: '🔒 Regla R1 · crítica',
    ancho: true,
    cuerpo: html`<div style="margin:8px 0 12px;padding:9px 11px;border-radius:8px;background:var(--bg-warning);color:var(--text-warning);font-size:12px;line-height:1.6"><b style="font-weight:500">Ningún trabajo de Claude junta a la vez tus datos privados, texto externo y salida a internet.</b> Por eso un texto con instrucciones escondidas no puede sacar tus cifras.</div>
      <table class="tb" data-matriz-r1><thead><tr><th>trabajo</th><th>recibe</th><th>internet</th><th>datos privados</th><th>texto externo</th><th>escribe en</th></tr></thead>
      <tbody>${info.trabajos.map((t) => html`<tr><td>${t.nombre}<div class="mut" style="font-size:10px">${t.id} · ${t.herramientas.length ? t.herramientas.join(', ') : 'sin herramientas'}</div></td><td class="mut" style="font-size:10.5px">${t.recibe}</td><td style="color:${color(t.internet)}">${si(t.internet)}</td><td style="color:${color(t.privado, true)}">${si(t.privado)}</td><td style="color:${color(t.externo)}">${t.externo && !t.internet ? 'normalizado*' : si(t.externo)}</td><td class="mut" style="font-size:10.5px">${t.escribe.join(' · ')}</td></tr>`)}</tbody></table>
      <div class="mut" style="font-size:10.5px;margin-top:4px">* Lee texto que vino de fuera, pero sin internet: aunque contuviera instrucciones, no tiene por dónde enviar nada.</div>
      <div class="lab" style="margin-top:12px">Cómo se garantiza</div>
      <div style="font-size:11px;line-height:1.8">· El servidor arma cada trabajo: su entrada (con niveles privado, metadato, público y externo), sus herramientas y su destino. Ninguno tiene terminal ni acceso al disco.<br>· Claude Code aislado: sin tus MCP, plugins, hooks ni CLAUDE.md, en un directorio vacío y con un entorno mínimo. Una guardia aborta si arranca con algo de más o pide una herramienta no permitida (docs/CLAUDE-CLI.md).<br>· Un test falla si algún trabajo reúne los tres ingredientes; otros prueban textos trampa.<br>· Las salidas que no cumplen el formato van a la cuarentena; Claude propone y tú confirmas.</div>
      <div class="lab" style="margin-top:12px">Registro de Claude · hoy</div>
      ${info.hoy.length ? html`<table class="tb" data-registro-hoy><thead><tr><th>hora</th><th>trabajo</th><th>estado</th><th>herramientas</th><th class="n">tiempo</th></tr></thead><tbody>${info.hoy.map((l) => html`<tr><td class="mut">${hora(l.inicio)}</td><td>${l.trabajo}</td><td title="${l.motivo ?? ''}">${ESTADO[l.estado] ?? l.estado}${l.avisos?.length ? html` <span class="mut" title="${l.avisos.join(' · ')}">(${l.avisos.length} avisos)</span>` : ''}</td><td class="mut" style="font-size:10.5px">${(l.herramientas ?? []).length ? (l.herramientas ?? []).map((h) => h.nombre).join(', ') : '—'}</td><td class="n mut">${l.duracionMs ? `${Math.round(l.duracionMs / 1000)} s` : ''}</td></tr>`)}</tbody></table>` : html`<div class="mut" style="font-size:11px">Sin ejecuciones hoy.</div>`}
      ${cuarentena.length ? html`<div class="lab" style="margin-top:12px">Cuarentena · ${cuarentena.length}</div>${cuarentena.slice(0, 8).map((q) => html`<div style="font-size:10.5px;padding:2px 0"><span class="mut">${q.fecha?.slice(0, 16).replace('T', ' ')}</span> · ${q.trabajo}: ${q.motivo}</div>`)}<div class="mut" style="font-size:10.5px">En .finhub/cuarentena/. Nunca han tocado tus datos.</div>` : ''}
      ${info.version ? html`<div class="mut" style="font-size:10.5px;margin-top:8px">Claude Code ${info.version} en la última ejecución.</div>` : ''}`,
  });
}
