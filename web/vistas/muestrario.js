// #muestrario: para comparar componentes y gráficos con la maqueta (no está en las pestañas).
// Los datos de los gráficos son de MUESTRA (los de la maqueta), no cálculos de tus datos.
import { html } from '../esc.js';
import { rex, ESTADOS } from '../componentes/rex-sprite.js';
import { graficoLineas } from '../graficos/linea.js';
import { graficoSankey } from '../graficos/sankey.js';
import { graficoTreemap } from '../graficos/treemap.js';
import { barraRango } from '../graficos/rango.js';
import { graficoBarras } from '../graficos/barras.js';
import { formatearEuros } from '/core/dinero.js';

const MESES = ['dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov'];

export function muestrario() {
  return html`<div class="banda aviso">Muestrario de componentes · datos de muestra de la maqueta, no tus cifras.</div>
    <div class="box"><div class="lab">Rex · 5 estados</div><div class="fila" style="gap:18px">${ESTADOS.map((s) => html`<div style="text-align:center">${rex(60, 52, s)}<div class="mut" style="font-size:10.5px">${s}</div></div>`)}</div></div>
    <div class="grid2"><div class="box"><div class="lab">Líneas con banda</div>${graficoLineas({ series: [{ valores: [100, 101.2, 99.4, 103.1, 104.6, 102.8, 106.9, 108.2, 107.5, 110.9, 111.6, 112.4], color: '#D85A30', grosor: 2.4 }, { valores: [100, 101.1, 99.7, 103.3, 104.8, 103, 106.8, 108.2, 107.5, 110.6, 111.3, 112.1], color: '#888780', grosor: 1.4, discontinua: true }, { valores: [100, 101.6, 99.6, 104, 105.8, 103.4, 108.3, 110.1, 109.1, 112.7, 113.5, 114.1], color: '#1D9E75', grosor: 1.4 }], ancho: 420, alto: 140, etiquetasX: MESES.map((m, i) => (i % 2 ? '' : m)), banda: { inf: [98, 99, 97, 100, 101, 99, 102, 103, 102, 105, 105, 106], sup: [102, 104, 103, 107, 109, 107, 112, 114, 113, 117, 118, 119], color: '#D85A30' } })}</div>
      <div class="box"><div class="lab">Treemap</div>${graficoTreemap({ datos: [{ nombre: 'EE. UU.', valor: 61, color: '#378ADD' }, { nombre: 'Europa', valor: 14, color: '#7F77DD' }, { nombre: 'Emergentes', valor: 11, color: '#D85A30' }, { nombre: 'Japón', valor: 5, color: '#1D9E75' }, { nombre: 'RF euro', valor: 6, color: '#888780' }, { nombre: 'Otros', valor: 3, color: '#B4B2A9' }] })}</div></div>
    <div class="box" style="margin-top:8px"><div class="lab">Sankey</div>${graficoSankey({ entradas: [{ nombre: 'Nómina', valor: 285000 }, { nombre: 'Extras', valor: 10000 }, { nombre: 'Devoluciones', valor: 2400 }], salidas: [{ nombre: 'Vivienda', valor: 84230, color: '#888780' }, { nombre: 'Comida', valor: 16060, color: '#888780' }, { nombre: 'Ocio', valor: 13998, color: '#888780' }, { nombre: 'Cartera', valor: 60000, color: '#7F77DD' }, { nombre: 'Colchón', valor: 20000, color: '#378ADD' }, { nombre: 'Meta Japón', valor: 20000, color: '#378ADD' }], formato: (c) => formatearEuros(c) })}</div>
    <div class="grid2"><div class="box"><div class="lab">Rangos</div>${[[-1, 9], [10, 19], [-17, -2]].map(([a, b]) => html`<div>${barraRango({ desde: a, hasta: b })}</div>`)}</div>
      <div class="box"><div class="lab">Barras</div>${graficoBarras({ valores: [28, 31, 25, 34, 30, 29, 46, 33, 27, 35, 38, 34], etiquetas: MESES.map((m, i) => (i % 2 ? '' : m)), formato: (v) => `${v} %` })}</div></div>
    <div class="box" style="margin-top:8px"><div class="lab">Etiquetas, chips y botones</div>
      <div class="fila"><span class="ep h">hecho</span><span class="ep c">consenso</span><span class="ep o">opinión del modelo</span><span class="ep e">especulación</span><span class="cit">[M-261103-01]</span><span class="chip">chip</span><span class="chip on">chip activo</span><button type="button">botón</button><button type="button" class="pri">principal</button><button type="button" class="go">go</button><button type="button" class="ex" aria-label="Explícame esto">?</button></div>
      <div class="fila" style="margin-top:8px"><button type="button" data-accion="demo-toast">toast</button><button type="button" data-accion="demo-toast-deshacer">toast con deshacer</button><button type="button" data-accion="demo-error">error</button><button type="button" data-accion="demo-modal">modal</button><button type="button" data-accion="demo-confirmar">confirmar</button></div></div>`;
}
