// Papelera (30 días) y cuarentena (§2.5, §14.4): lo borrado con su vista previa, buscar y restaurar; lo que
// caduca pronto, avisado; y las salidas de Claude que no pasaron la validación, para verlas.
import { html } from '../esc.js';
import { accion, entrada } from '../acciones.js';
import { abrir, repintarModal } from './modal.js';
import { obtener, pedir } from '../api.js';
import { toast } from './toast.js';

const pp = { datos: null, cuarentena: [], busca: '', ver: null, verCuarentena: null, error: null, recargar: null };

function cuerpo() {
  if (pp.error) return html`<div class="banda aviso">${pp.error}</div>`;
  if (!pp.datos) return html`<div class="mut">Cargando…</div>`;
  const q = pp.busca.trim().toLowerCase();
  const entradas = pp.datos.entradas.slice().reverse().filter((e) => !q || `${e.que} ${e.ruta}`.toLowerCase().includes(q));
  const dias = (e) => Math.max(0, Math.ceil((Date.parse(e.expira) - Date.now()) / 86400000));
  return html`<div class="mut" style="font-size:11px;margin-top:6px">Lo que borras se guarda 30 días en .finhub/papelera/ y se puede restaurar. Lo que pasa de 30 días se borra de verdad, avisando antes.</div>
    ${pp.datos.pronto.length ? html`<div class="banda aviso" style="margin-top:8px">${pp.datos.pronto.length} entrada(s) se borrarán de verdad en menos de 3 días.</div>` : ''}
    <div class="fila" style="margin-top:8px"><label class="sr-only" for="pap-busca">Buscar en la papelera</label><input class="inp" id="pap-busca" placeholder="buscar…" value="${pp.busca}" data-entrada-texto="pap-busca" style="flex:1"><span class="mut" style="font-size:10.5px">${pp.datos.entradas.length} entradas</span></div>
    <table class="tb" style="margin-top:6px" data-papelera><thead><tr><th scope="col">qué</th><th scope="col">de</th><th scope="col">borrado</th><th scope="col">quedan</th><th scope="col"><span class="sr-only">acciones</span></th></tr></thead><tbody>
    ${entradas.length ? entradas.map((e) => html`<tr data-entrada="${e.id}"><td>${e.que}${e.tipo === 'conflicto' ? html` <span class="chip">conflicto</span>` : ''}</td><td class="mut">${e.ruta}</td><td class="mut">${e.borrado.slice(0, 10)}</td><td class="mut">${dias(e)} d</td><td style="white-space:nowrap">${e.vista ? html`<button type="button" class="go" data-accion="pap-ver" data-id="${e.id}" aria-expanded="${pp.ver === e.id ? 'true' : 'false'}">ver</button> ` : ''}<button type="button" class="go" data-accion="pap-restaurar" data-id="${e.id}">restaurar</button></td></tr>${pp.ver === e.id ? html`<tr><td colspan="5"><pre style="white-space:pre-wrap;font-size:10.5px;margin:0;max-height:160px;overflow:auto">${e.vista}${e.vista.length >= 200 ? '…' : ''}</pre></td></tr>` : ''}`) : html`<tr><td colspan="5" class="mut">${q ? 'Nada con ese texto.' : 'La papelera está vacía.'}</td></tr>`}
    </tbody></table>
    <div class="lab" style="margin-top:14px">Cuarentena · salidas de Claude que no pasaron la validación</div>
    <div class="mut" style="font-size:10.5px">No han tocado tus datos. Se guardan en .finhub/cuarentena/ para que veas qué devolvió Claude y por qué se rechazó.</div>
    <table class="tb" style="margin-top:6px" data-cuarentena><thead><tr><th scope="col">fecha</th><th scope="col">trabajo</th><th scope="col">motivo</th><th scope="col"><span class="sr-only">acciones</span></th></tr></thead><tbody>
    ${pp.cuarentena.length ? pp.cuarentena.map((c) => html`<tr><td class="mut">${String(c.fecha ?? '').slice(0, 16).replace('T', ' ')}</td><td>${c.trabajo}</td><td style="font-size:10.5px">${c.motivo}</td><td><button type="button" class="go" data-accion="cua-ver" data-fichero="${c.fichero}" aria-expanded="${pp.verCuarentena?.fichero === c.fichero ? 'true' : 'false'}">ver</button></td></tr>${pp.verCuarentena?.fichero === c.fichero ? html`<tr><td colspan="4"><pre style="white-space:pre-wrap;font-size:10.5px;margin:0;max-height:220px;overflow:auto">${pp.verCuarentena.texto || '(sin texto)'}</pre></td></tr>` : ''}`) : html`<tr><td colspan="4" class="mut">Nada en cuarentena.</td></tr>`}
    </tbody></table>`;
}

async function cargarDatos() {
  try {
    const [d, c] = await Promise.all([obtener('/api/papelera'), obtener('/api/claude/cuarentena').catch(() => ({ ficheros: [] }))]);
    pp.datos = d;
    pp.cuarentena = c.ficheros;
    pp.error = null;
  } catch (e) {
    pp.error = e.message;
  }
  repintarModal();
}

export function abrirPapelera(recargar) {
  Object.assign(pp, { datos: null, ver: null, verCuarentena: null, recargar });
  abrir({ titulo: 'Papelera y cuarentena', cuerpo, ancho: true });
  cargarDatos();
}

export function registrarPapelera() {
  entrada('pap-busca', (el) => {
    pp.busca = el.value;
    repintarModal();
  });
  accion('pap-ver', (el) => {
    pp.ver = pp.ver === el.dataset.id ? null : el.dataset.id;
    repintarModal();
  });
  accion('pap-restaurar', async (el) => {
    try {
      const r = await pedir('POST', '/api/papelera/restaurar', { id: el.dataset.id });
      await pp.recargar?.();
      toast(r.conflicto ? `Restaurado como copia en conflicto: ${r.conflicto}` : r.restauradaFuente ? `Restaurado (y también la fuente «${r.restauradaFuente}», que estaba en la papelera)` : 'Restaurado');
      cargarDatos();
    } catch (e) {
      toast(e.message, { tipo: 'error' });
    }
  });
  accion('cua-ver', async (el) => {
    if (pp.verCuarentena?.fichero === el.dataset.fichero) {
      pp.verCuarentena = null;
      return repintarModal();
    }
    try {
      pp.verCuarentena = await obtener(`/api/claude/cuarentena/ver?fichero=${encodeURIComponent(el.dataset.fichero)}`);
    } catch (e) {
      toast(e.message, { tipo: 'error' });
    }
    repintarModal();
  });
}
