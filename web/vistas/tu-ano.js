// Tu año (§4.8, §5; maqueta: tuano()): tarjetas y tasa mes a mes por código; «Rex dice» lo escribe Claude
// con tu luz verde (F10). «Guardar como imagen»: PNG dibujado en <canvas> por código, sin librerías.
import { html } from '../esc.js';
import { accion } from '../acciones.js';
import { toast } from '../componentes/toast.js';
import { rex } from '../componentes/rex-sprite.js';
import { graficoLineas } from '../graficos/linea.js';
import { dibujarTuAnio } from '../componentes/png-tu-ano.js';
import { tuAnio, tarjetas, periodoTexto, etiquetaMes } from '/core/tu-ano.js';

let cache = { modelo: null, clave: null, valor: null };
function datos(estado) {
  const anio = +estado.ahora.fecha.slice(0, 4);
  const clave = estado.ahora.fecha;
  if (cache.modelo !== estado.modelo || cache.clave !== clave) cache = { modelo: estado.modelo, clave, valor: tuAnio(estado.modelo, anio, estado.ahora.fecha) };
  return cache.valor;
}

export function vistaTuAnio(estado) {
  const t = datos(estado);
  const cs = tarjetas(t);
  const tasas = t.tasas.filter((x) => x.pb !== null);
  return html`<div class="box" style="text-align:center;padding:22px;background:linear-gradient(135deg,#D85A3018,#7F77DD18)"><div style="display:flex;justify-content:center">${rex(90, 78, estado.rex)}</div><div style="font-size:22px;font-weight:500;margin-top:6px">Tu ${t.anio} en finanzas</div><div class="mut">${periodoTexto(t)}</div></div>
    <div class="kpis" style="margin-top:8px">${cs.map((c) => html`<div class="box" style="border-top:3px solid ${c.color}" data-tarjeta="${c.titulo}"><div class="lab">${c.titulo}</div><div style="font-size:${c.valor.length > 12 ? 14 : 20}px;font-weight:500;line-height:1.2">${c.valor}</div><div class="mut" style="font-size:10.5px;margin-top:4px">${c.sub}</div></div>`)}</div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
      <div class="box"><div class="lab">Tasa de ahorro mes a mes</div>${tasas.length > 1 ? graficoLineas({ series: [{ nombre: 'tasa', color: '#1D9E75', valores: tasas.map((x) => x.pb / 100), grosor: 2 }], ancho: 420, alto: 110, etiquetaY: (v) => `${v.toFixed(0)}%`, etiquetasX: tasas.map((x, i) => (i % 2 ? '' : etiquetaMes(x.mes))), titulo: `tasa de ahorro de ${t.anio} mes a mes` }) : html`<div class="mut" style="font-size:11px">Hacen falta al menos dos meses con entradas.</div>`}</div>
      <div class="box"><div class="lab">Rex dice</div><div class="mut" style="font-size:11.5px;line-height:1.7">Rex escribirá aquí un resumen de tu año a partir de estas cifras cuando le des luz verde (trabajo privado, sin internet). Llega en la fase F10.</div><div class="mut" style="font-size:10.5px;margin-top:6px">Las cifras salen del código; el texto lo escribe Claude con tu luz verde.</div>
        <button type="button" class="go" style="margin-top:8px" data-accion="tuano-png">Guardar como imagen</button></div></div>`;
}

export function registrarAccionesTuAnio(est) {
  accion('tuano-png', () => {
    const e = est();
    const t = datos(e);
    const canvas = dibujarTuAnio(t, { nombre: e.modelo.ajustes.nombre ?? null });
    canvas.toBlob((blob) => {
      if (!blob) return toast('No se pudo crear la imagen', { tipo: 'error' });
      const a = document.createElement('a');
      a.download = `finhub-tu-${t.anio}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast(`Imagen guardada: finhub-tu-${t.anio}.png (en tu carpeta de descargas)`);
    }, 'image/png');
  });
}
