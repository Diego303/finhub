// Papelera (30 días) y cuarentena: ver y restaurar. La pantalla completa llega en F12.
import { html } from '../esc.js';
import { abrir, cerrar } from './modal.js';
import { obtener, pedir } from '../api.js';
import { toast } from './toast.js';

export async function abrirPapelera(recargar) {
  let datos;
  try {
    datos = await obtener('/api/papelera');
  } catch (e) {
    return toast(e.message, { tipo: 'error' });
  }
  const dialogo = abrir({
    titulo: 'Papelera y cuarentena',
    cuerpo: html`<div class="mut" style="font-size:11px;margin-top:6px">Lo que borras se guarda 30 días en .finhub/papelera/ y se puede restaurar. Lo que pasa de 30 días se borra de verdad, avisando antes.</div>
      ${datos.pronto.length ? html`<div class="banda aviso" style="margin-top:8px">${datos.pronto.length} entrada(s) se borrarán de verdad en menos de 3 días.</div>` : ''}
      <table class="tb" style="margin-top:6px"><thead><tr><th>qué</th><th>de</th><th>borrado</th><th></th></tr></thead><tbody>
      ${datos.entradas.length ? datos.entradas.slice().reverse().map((e) => html`<tr><td>${e.que}</td><td class="mut">${e.ruta}</td><td class="mut">${e.borrado.slice(0, 10)}</td><td><button type="button" class="go" data-restaurar="${e.id}">restaurar</button></td></tr>`) : html`<tr><td colspan="4" class="mut">La papelera está vacía.</td></tr>`}
      </tbody></table>
      <div class="lab" style="margin-top:12px">Cuarentena</div><div class="mut" style="font-size:11px">Las salidas de Claude que no pasan la validación irán aquí (fase F9).</div>`,
  });
  dialogo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-restaurar]');
    if (!b) return;
    try {
      await pedir('POST', '/api/papelera/restaurar', { id: b.dataset.restaurar });
      await recargar();
      cerrar();
      toast('Restaurado');
    } catch (e) {
      toast(e.message, { tipo: 'error' });
    }
  });
}
