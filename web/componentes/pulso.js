// Pulso de noticias (§5 Pendientes, maqueta: pulso()): cualquier día de los últimos 14, temas, «incluir mis
// activos» (solo nombres, casilla visible) y fusión con lo que ya hay. Trabajo «pulso»: internet sí, privado no.
import { html } from '../esc.js';
import { accion, cambio } from '../acciones.js';
import { op } from '../api.js';
import { abrir, cerrar, repintarModal } from './modal.js';
import { toast } from './toast.js';
import { ejecutarCon, nuevoProgreso, progresoHtml, errorHtml } from './claude.js';
import { sumarDias, textoCorto, DIAS_SEMANA, diaSemana, horaLocal } from '/core/fechas.js';

const TEMAS = [['mercados', 'Mercados'], ['bancos-centrales', 'Macro y bancos centrales'], ['europa-espana', 'Europa y España'], ['tecnologia', 'Tecnología'], ['energia-materias-primas', 'Energía y materias primas']];
const pu = { fecha: null, temas: new Set(['mercados', 'bancos-centrales', 'europa-espana']), misActivos: false, prog: nuevoProgreso() };
let est = null;

function cuerpo() {
  const m = est().modelo;
  const hoy = est().ahora.fecha;
  pu.fecha ??= hoy;
  const porDia = new Map(m.mundo.map((d) => [d.fecha, d.notas.length]));
  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i - 13));
  const n = porDia.get(pu.fecha) ?? 0;
  return html`<div class="lab" style="margin-top:10px">¿De qué día?</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${dias.map((f) => html`<button type="button" class="dia-pulso ${f === pu.fecha ? 'on' : ''}" data-accion="pulso-dia" data-fecha="${f}" aria-pressed="${f === pu.fecha ? 'true' : 'false'}" style="${porDia.get(f) ? '' : 'background:var(--bg-warning)'}"><div style="font-size:10px">${DIAS_SEMANA[diaSemana(f)].slice(0, 3)} ${+f.slice(8)}</div><div class="mut" style="font-size:10px">${porDia.get(f) ? `${porDia.get(f)} not.` : 'sin pulso'}</div></button>`)}</div>
    <div class="mut" style="font-size:10.5px;margin-top:6px">${n ? `Ya hay ${n} noticias de ese día: lo nuevo se fusiona y lo repetido se descarta.` : 'Ese día no tiene pulso: Claude buscará noticias publicadas ese día.'}</div>
    <div class="lab" style="margin-top:12px">Temas</div><div>${TEMAS.map(([k, t]) => html`<button type="button" class="chip ck ${pu.temas.has(k) ? 'on' : ''}" data-accion="pulso-tema" data-id="${k}" aria-pressed="${pu.temas.has(k) ? 'true' : 'false'}">${t}</button>`)}</div>
    <label class="tg" style="border:0"><input type="checkbox" data-cambio="pulso-activos" ${pu.misActivos ? 'checked' : ''}><span style="font-size:11px">Incluir noticias de mis activos <span class="mut">(solo se envían los nombres de los fondos, nunca importes ni pesos)</span></span></label>
    <div style="background:var(--surface-1);border-radius:8px;padding:8px 10px;font-size:10.5px;margin-top:8px" class="mut">🔒 Trabajo aislado <b style="font-weight:500;color:var(--text-primary)">pulso</b>: con internet · <b style="font-weight:500;color:var(--text-primary)">sin acceso</b> a tus gastos ni a tu cartera · solo escribe en conocimiento/mundo/</div>
    ${progresoHtml(pu.prog, { que: 'Rex está buscando noticias…' })}${pu.prog.fase === 'hecho' ? errorHtml(pu.prog.resultado) : ''}
    <div style="text-align:right;margin-top:12px"><button type="button" class="pri" data-accion="pulso-hacer" ${pu.prog.fase === 'trabajando' || !pu.temas.size ? 'disabled' : ''}>Hacer pulso del ${textoCorto(pu.fecha)}</button></div>`;
}

export function abrirPulso() {
  if (pu.prog.fase !== 'trabajando') pu.prog = nuevoProgreso();
  abrir({ titulo: 'Pulso de noticias', cuerpo, ancho: true });
}

export function registrarPulso(estado) {
  est = estado;
  accion('abrir-pulso', () => abrirPulso());
  accion('pulso-dia', (el) => {
    pu.fecha = el.dataset.fecha;
    repintarModal();
  });
  accion('pulso-tema', (el) => {
    pu.temas.has(el.dataset.id) ? pu.temas.delete(el.dataset.id) : pu.temas.add(el.dataset.id);
    repintarModal();
  });
  cambio('pulso-activos', (el) => (pu.misActivos = el.checked));
  accion('pulso-hacer', async () => {
    const fecha = pu.fecha;
    const r = await ejecutarCon(pu.prog, 'pulso', { fecha, temas: [...pu.temas], misActivos: pu.misActivos }, { desclasificar: pu.misActivos });
    if (r?.estado !== 'ok') return;
    const a = await op('pulso.aplicar', { fecha, hora: horaLocal(), notas: r.resultado.json.notas }, { mensaje: (x) => `Pulso del ${textoCorto(fecha)}: ${x.resultado.nuevas} noticias nuevas · ${x.resultado.repetidas} repetidas descartadas` });
    if (a) {
      pu.prog = nuevoProgreso();
      cerrar();
    } else toast('No se pudieron guardar las noticias', { tipo: 'error' });
  });
}
