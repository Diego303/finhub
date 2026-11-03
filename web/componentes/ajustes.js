// Ajustes (maqueta: ajustesModal): carpeta de datos (validar y cambiar con la API) y tema.
// El resto de ajustes (mes financiero, impuestos, Pendientes…) llega completo en F12.
import { html } from '../esc.js';
import { abrir, cerrar, confirmar } from './modal.js';
import { pedir, op } from '../api.js';
import { toast } from './toast.js';
import { estadoCarpeta } from './cabecera.js';

export function abrirAjustes(estado) {
  const srv = estado.servidor;
  const aj = estado.modelo.ajustes;
  const ec = estadoCarpeta(srv);
  const dialogo = abrir({
    titulo: 'Ajustes',
    cuerpo: html`<div class="lab" style="margin-top:10px">Carpeta de datos · todo finhub vive aquí</div>
      <div class="fila"><label class="sr-only" for="ruta-carpeta">Ruta de la carpeta de datos</label><input class="inp" id="ruta-carpeta" value="${srv.carpeta.rutaWindows}" style="flex:1"><button type="button" class="go" data-cambiar-carpeta>cambiar…</button></div>
      <div class="mut" style="font-size:10.5px;margin-top:4px">WSL: ${srv.carpeta.ruta} · ${srv.carpeta.ficheros} ficheros · puedes usar D:\\GoogleDrive\\FINANZAS u otra</div>
      <div class="box" style="margin-top:8px;font-size:11.5px;line-height:1.8">☁ <b style="font-weight:500">${ec.texto}</b><br>
        <span class="mut">Si la carpeta está en un servicio de sincronización, déjala siempre disponible en este equipo para que finhub pueda leerla desde WSL.</span><br>
        Conflictos de sincronización: <b style="font-weight:500">${srv.conflictos.length}</b> · ${srv.soloLectura ? `solo lectura (${srv.candado.otro?.equipo ?? 'otro equipo'})` : 'abierto en este equipo'}</div>
      <div class="lab" style="margin-top:10px">Al cambiar la carpeta</div>
      ${[['mover', 'Mover mis datos a la nueva carpeta (copia, verifica y luego manda la antigua a la papelera)'], ['copiar', 'Copiar (dejo la antigua como está)'], ['usar', 'Usar una carpeta que ya tiene datos de finhub'], ['crear', 'Empezar en una carpeta nueva y vacía']].map(([v, t], i) => html`<label style="display:flex;gap:6px;font-size:11.5px;padding:2px 0"><input type="radio" name="modo-carpeta" value="${v}" ${i === 1 ? 'checked' : ''}>${t}</label>`)}
      <div id="validacion-carpeta" class="mut" style="font-size:10.5px;margin-top:4px" aria-live="polite"></div>
      <div class="lab" style="margin-top:10px">Otros ajustes</div>
      <div style="font-size:11px;line-height:1.9" class="fila">
        <label>Mes financiero: <select class="inp" disabled title="Cambiarlo reparte los movimientos: llega en F4"><option>${aj.mes_inicio_dia === 1 ? 'mes natural (día 1)' : `del ${aj.mes_inicio_dia} al ${aj.mes_inicio_dia - 1}`}</option></select></label>
        <label>Tema: <select class="inp" data-tema>${[['auto', 'automático'], ['claro', 'claro'], ['oscuro', 'oscuro']].map(([v, t]) => html`<option value="${v}" ${aj.tema === v ? 'selected' : ''}>${t}</option>`)}</select></label>
      </div>
      <div class="mut" style="font-size:11px">Impuestos del ahorro, supuestos de proyección, Pendientes y su frecuencia, humor y accesorios de Rex: en la fase F12.</div>`,
  });

  dialogo.querySelector('[data-tema]').addEventListener('change', async (ev) => {
    if (await op('ajustes.fijar', { clave: 'tema', valor: ev.target.value }, { mensaje: 'Tema guardado en ajustes.md' })) cerrar();
  });

  dialogo.querySelector('[data-cambiar-carpeta]').addEventListener('click', async () => {
    const ruta = dialogo.querySelector('#ruta-carpeta').value.trim();
    const modo = dialogo.querySelector('[name=modo-carpeta]:checked').value;
    const salida = dialogo.querySelector('#validacion-carpeta');
    if (!ruta || ruta === srv.carpeta.rutaWindows) return toast('Escribe la ruta de la nueva carpeta');
    try {
      const v = await pedir('POST', '/api/carpeta/validar', { ruta });
      salida.textContent = v.ok ? `Comprobando la carpeta… ${v.estado === 'finhub' ? 'tiene datos de finhub' : v.estado === 'no-existe' ? 'se creará' : v.estado === 'vacia' ? 'vacía' : 'tiene otros ficheros'} · permisos OK ${v.avisos.map((a) => '· ' + a).join(' ')}` : `✗ ${v.errores.join('; ')}`;
      if (!v.ok) return;
      const aceptarAjenos = v.estado === 'ajena' ? await confirmar('La carpeta tiene otros ficheros que no son de finhub. ¿Seguir igualmente?', { si: 'Seguir' }) : false;
      if (v.estado === 'ajena' && !aceptarAjenos) return;
      const confirmarBorrado = modo === 'mover' ? await confirmar(`Tras copiar y verificar cada fichero, ¿mando la carpeta antigua (${srv.carpeta.rutaWindows}) a la papelera? Si dices que no, se queda donde está.`, { si: 'Sí, a la papelera', no: 'No, déjala' }) : false;
      const r = await pedir('POST', '/api/carpeta/cambiar', { ruta, modo, confirmarBorrado, aceptarAjenos });
      cerrar();
      toast(`Carpeta de datos: ${r.rutaWindows}${r.ficheros ? ` · ${r.ficheros} ficheros verificados` : ''}`);
    } catch (e) {
      salida.textContent = `✗ ${e.message}`;
      toast(e.message, { tipo: 'error' });
    }
  });
}
