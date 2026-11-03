// Ajustes (§14.12, maqueta: ajustesModal): carpeta de datos (validar, cambiar con progreso), general, impuestos,
// proyección, Pendientes (qué aparece y cada cuánto), Rex (humor y accesorios), Claude (modelo por trabajo y
// contexto) y más. Cada sección se guarda de una vez en ajustes.md (`ajustes.textos`, con deshacer); vacío =
// valor por defecto. Lo que tiene gramática propia se valida al guardar.
import { html } from '../esc.js';
import { accion, cambio, formulario } from '../acciones.js';
import { abrir, cerrar, confirmar, repintarModal } from './modal.js';
import { pedir, op } from '../api.js';
import { toast } from './toast.js';
import { estadoCarpeta } from './cabecera.js';
import { ajustes as formatoAjustes, AJUSTES_DEFECTO, TRABAJOS } from '/core/formato/config.js';
import { parseHumor, parseAccesorios } from '/core/rex.js';

const SECCIONES = [['carpeta', 'Carpeta'], ['general', 'General'], ['impuestos', 'Impuestos'], ['proyeccion', 'Proyección'], ['pendientes', 'Pendientes'], ['rex', 'Rex'], ['claude', 'Claude'], ['mas', 'Más']];
const OPCIONES = { tema: [['auto', 'automático'], ['claro', 'claro'], ['oscuro', 'oscuro']], copias: [['carpeta', 'en la carpeta (.finhub/copias)'], ['local', 'solo en este equipo']], proyeccion: [['datos', 'con las series de Datos (histórico)'], ['manual', 'con supuestos manuales']], descubrir_sin_cambios: [['version', 'nueva versión «sin cambios relevantes»'], ['nada', 'solo aplazar la revisión']] };
const CAMPOS = {
  general: [['nombre', 'Tu nombre (para el saludo)'], ['tema', 'Tema'], ['copias', 'Copias diarias'], ['puerto', 'Puerto del servidor (al reiniciar)']],
  impuestos: [['impuestos_ahorro', 'Tramos de la base del ahorro', 'desde–hasta: % · el último sin «hasta». Cambian cada año: compruébalos.'], ['impuestos_verificado', 'Año en que los comprobaste', 'si no es este año, finhub avisa «verificar»']],
  proyeccion: [['proyeccion', 'Cómo proyectar'], ['proyeccion_manual', 'Supuestos manuales (reales, anuales)', 'clase media · volatilidad | … p. ej. rv 5,5 · 14 | rf 1,5 · 4 | efectivo 0,5 · 0,5'], ['libertad_multiplicador', 'Libertad financiera = consumo anual ×', '25 ≈ regla del 4 %'], ['crisis_periodos', 'Periodos de la prueba de crisis', 'AAAA-MM..AAAA-MM nombre | …']],
  rex: [['rex_humor', 'Humor según tu tasa de ahorro del mes', 'humor>=N | … (contento, tranquilo, preocupado; en orden)'], ['accesorios', 'Accesorios que se desbloquean', 'accesorio:regla | … · reglas: mes-tasa>=N, meta(id)=100, libertad']],
  claude: [['contexto_max', 'Límite de contexto por ejecución', 'N notas · N car.']],
  mas: [['umbral_desviacion', 'Aviso de desviación de clases (puntos)', 'en Cartera, clases frente a objetivo'], ['sectores_efectos', 'Sectores del mapa de efectos', 'ids separados por comas'], ['descubrir_sin_cambios', '«¿Qué ha cambiado?» sin novedades'], ['descubrir_filtros', 'Filtros de Descubrimientos', 'separados por comas'], ['conflictos', 'Patrones de copias en conflicto de tu sincronización (además de los de serie)', 'opcional · {nombre} = el nombre del fichero, * = cualquier texto · p. ej. {nombre} (conflicto *).md | …']],
};
const PENDIENTES = [['pulso', 'Pulso de noticias', 'diario'], ['movimientos', 'Gastos y entradas al día', '1d'], ['recurrentes', 'Recurrentes del mes', 'mensual'], ['valores', 'Valor de tu cartera', 'semanal(dom)'], ['datos', 'Datos de mercado', 'mensual'], ['cierre', 'Cerrar el mes', 'fin-de-mes'], ['pausas', 'Pausas de 48 h listas', ''], ['predicciones', 'Predicciones por resolver', ''], ['contexto', 'Textos en CONTEXTO', '']];
const MODELOS = ['haiku', 'sonnet', 'opus'];

const aj = { seccion: 'general', progreso: null, error: null };
let est = null;
const fmt = (clave, valor) => (valor === undefined || valor === null ? '' : formatoAjustes.spec.preambulo.fmtValor(clave, valor));
const textoDe = (clave) => fmt(clave, est.modelo.ajustes[clave]);

/** "pulso diario | movimientos 1d" → Map id → frecuencia. */
function parsePendientes(texto) {
  return new Map(String(texto ?? '').split('|').map((t) => t.trim()).filter(Boolean).map((t) => {
    const [id, ...resto] = t.split(/\s+/);
    return [id, resto.join(' ')];
  }));
}

function campo([clave, titulo, ayuda]) {
  const valor = textoDe(clave);
  const defecto = fmt(clave, AJUSTES_DEFECTO[clave]);
  const id = `aj-${clave}`;
  const control = OPCIONES[clave]
    ? html`<select class="inp" id="${id}" name="${clave}">${OPCIONES[clave].map(([v, t]) => html`<option value="${v}" ${valor === v ? 'selected' : ''}>${t}</option>`)}</select>`
    : html`<input class="inp" id="${id}" name="${clave}" value="${valor}" placeholder="${defecto || '(vacío)'}" style="width:100%;box-sizing:border-box">`;
  return html`<div style="margin-top:8px"><label class="lab" for="${id}" style="display:block;margin:0">${titulo}</label>${control}${ayuda ? html`<div class="mut" style="font-size:10px">${ayuda}</div>` : ''}</div>`;
}

function cuerpoCarpeta() {
  const srv = est.servidor;
  const ec = estadoCarpeta(srv);
  return html`<div class="lab" style="margin-top:10px">Carpeta de datos · todo finhub vive aquí</div>
    <div class="fila"><label class="sr-only" for="ruta-carpeta">Ruta de la carpeta de datos</label><input class="inp" id="ruta-carpeta" value="${srv.carpeta.rutaWindows}" style="flex:1" ${srv.carpeta.ejemplo ? 'disabled' : ''}><button type="button" class="go" data-accion="carpeta-cambiar" ${srv.carpeta.ejemplo ? 'disabled' : ''}>cambiar…</button></div>
    <div class="mut" style="font-size:10.5px;margin-top:4px">WSL: ${srv.carpeta.ruta} · ${srv.carpeta.ficheros} ficheros${srv.carpeta.ejemplo ? ' · ejemplo temporal: no se cambia' : ' · por ejemplo D:\\GoogleDrive\\FINANZAS'}</div>
    <div class="box" style="margin-top:8px;font-size:11.5px;line-height:1.8">☁ <b style="font-weight:500">${ec.texto}</b><br>
      <span class="mut">Si la carpeta está en un servicio de sincronización, márcala como «disponible siempre en este equipo» para que finhub pueda leerla desde WSL.</span><br>
      Conflictos de sincronización: <b style="font-weight:500">${srv.conflictos.length}</b>${srv.conflictos.length ? html` <button type="button" class="go" data-accion="conflictos">resolver</button>` : ''} · ${srv.soloLectura ? `solo lectura (${srv.candado.otro?.equipo ?? 'otro equipo'})` : 'abierto en este equipo'}</div>
    <div class="lab" style="margin-top:10px">Al cambiar la carpeta</div>
    <div role="radiogroup" aria-label="Al cambiar la carpeta">${[['mover', 'Mover mis datos a la nueva carpeta (copia, verifica y luego manda la antigua a la papelera)'], ['copiar', 'Copiar (dejo la antigua como está)'], ['usar', 'Usar una carpeta que ya tiene datos de finhub'], ['crear', 'Empezar en una carpeta nueva y vacía']].map(([v, t], i) => html`<label style="display:flex;gap:6px;font-size:11.5px;padding:2px 0"><input type="radio" name="modo-carpeta" value="${v}" ${i === 1 ? 'checked' : ''}>${t}</label>`)}</div>
    ${aj.progreso ? html`<div style="margin-top:6px" data-progreso-carpeta><progress max="${aj.progreso.total}" value="${aj.progreso.hechos}" style="width:100%" aria-label="Copiando ficheros"></progress><div class="mut" style="font-size:10.5px">${aj.progreso.hechos} de ${aj.progreso.total} · ${aj.progreso.ruta ?? ''}</div></div>` : ''}
    <div id="validacion-carpeta" class="mut" style="font-size:10.5px;margin-top:4px" aria-live="polite">${aj.error ?? ''}</div>`;
}

function cuerpoGeneral() {
  const m = est.modelo;
  return html`<div style="margin-top:8px"><label class="lab" for="aj-mes" style="display:block;margin:0">Mes financiero</label><select class="inp" id="aj-mes" data-cambio="aj-mes-inicio">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => html`<option value="${d}" ${m.ajustes.mes_inicio_dia === d ? 'selected' : ''}>${d === 1 ? 'mes natural (día 1)' : `del ${d} al ${d - 1}`}</option>`)}</select><div class="mut" style="font-size:10px">al cambiarlo, se reparten tus movimientos en sus nuevos meses (con confirmación y deshacer)</div></div>
    <form data-form="aj-guardar" data-seccion="general">${CAMPOS.general.map(campo)}<div class="mut" style="font-size:10px;margin-top:6px">Moneda: EUR (otras divisas: «no concluyente» en totales).</div>${botonGuardar()}</form>`;
}

function cuerpoPendientes() {
  const act = parsePendientes(est.modelo.ajustes.pendientes);
  return html`<form data-form="aj-pendientes"><div class="mut" style="font-size:10.5px;margin-top:8px">Qué aparece en «Pendientes hoy». Nada se ejecuta solo: cada elemento es tu luz verde. «Descubrimientos para revisar» y «Precios de lo que sigues» salen siempre que toca.</div>
    <table class="tb" style="margin-top:6px"><thead><tr><th scope="col">mostrar</th><th scope="col">elemento</th><th scope="col">frecuencia (texto)</th></tr></thead><tbody>${PENDIENTES.map(([id, t, f]) => html`<tr><td><input type="checkbox" name="pe-${id}" id="pe-${id}" ${act.has(id) ? 'checked' : ''}></td><td><label for="pe-${id}">${t}</label></td><td><label class="sr-only" for="pf-${id}">Frecuencia de ${t}</label><input class="inp" id="pf-${id}" name="pf-${id}" value="${act.get(id) ?? f}" style="width:120px"></td></tr>`)}</tbody></table>${botonGuardar()}</form>`;
}

function cuerpoRex() {
  const h = parseHumor(est.modelo.ajustes.rex_humor);
  const a = parseAccesorios(est.modelo.ajustes.accesorios);
  return html`<form data-form="aj-guardar" data-seccion="rex">${CAMPOS.rex.map(campo)}
    <div class="mut" style="font-size:10.5px;margin-top:6px">${h.error ? `⚠ humor: ${h.error}` : `Ahora: ${h.map((r) => `${r.humor} ${r.op} ${r.pb / 100} %`).join(' · ')}`}<br>${a.error ? `⚠ accesorios: ${a.error}` : `${a.length} accesorios configurados`} · Rex está preocupado en reposo cuando tu tasa de ahorro cae en «preocupado».</div>${botonGuardar()}</form>`;
}

function cuerpoClaude() {
  const cm = est.modelo.ajustes.claude_modelo ?? {};
  return html`<form data-form="aj-claude"><div class="mut" style="font-size:10.5px;margin-top:8px">Modelo de Claude Code para cada trabajo. Los trabajos y su aislamiento (regla R1) no cambian.</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${TRABAJOS.map((t) => html`<label style="font-size:11px">${t}<select class="inp" name="cm-${t}" style="width:100%">${[...new Set([...MODELOS, cm[t]].filter(Boolean))].map((x) => html`<option value="${x}" ${cm[t] === x ? 'selected' : ''}>${x}</option>`)}</select></label>`)}</div>
    ${CAMPOS.claude.map(campo)}${botonGuardar()}</form>`;
}

const botonGuardar = () => html`<div class="entre" style="margin-top:12px"><span class="mut" style="font-size:10px">Vacío = valor por defecto. Se guarda en ajustes.md (con deshacer).</span><button type="submit" class="pri">Guardar</button></div>`;

function cuerpo() {
  const s = aj.seccion;
  const contenido = s === 'carpeta' ? cuerpoCarpeta() : s === 'general' ? cuerpoGeneral() : s === 'pendientes' ? cuerpoPendientes() : s === 'rex' ? cuerpoRex() : s === 'claude' ? cuerpoClaude() : html`<form data-form="aj-guardar" data-seccion="${s}">${CAMPOS[s].map(campo)}${botonGuardar()}</form>`;
  return html`<div class="tabs" role="tablist" aria-label="Secciones de Ajustes" style="margin-top:6px;flex-wrap:wrap">${SECCIONES.map(([k, t]) => html`<button type="button" role="tab" id="ajs-${k}" aria-selected="${s === k ? 'true' : 'false'}" aria-controls="aj-panel" data-accion="aj-seccion" data-id="${k}">${t}</button>`)}</div><div id="aj-panel" role="tabpanel" aria-labelledby="ajs-${s}">${contenido}</div>`;
}

export function abrirAjustes(estado, seccion = null) {
  est = estado;
  if (seccion) aj.seccion = seccion;
  aj.error = null;
  abrir({ titulo: 'Ajustes', cuerpo, ancho: true });
}

async function guardar(valores, mensaje = 'Ajustes guardados en ajustes.md') {
  const r = await op('ajustes.textos', { valores }, { mensaje });
  if (r) repintarModal();
}

export function registrarAjustes(estado) {
  est = estado;
  document.addEventListener('finhub:progreso', (ev) => {
    aj.progreso = ev.detail;
    repintarModal();
  });
  accion('aj-seccion', (el) => {
    aj.seccion = el.dataset.id;
    repintarModal();
    document.getElementById(`ajs-${aj.seccion}`)?.focus();
  });
  formulario('aj-guardar', (f, datos) => {
    const claves = CAMPOS[f.dataset.seccion].map((c) => c[0]);
    const valores = Object.fromEntries(claves.filter((k) => k in datos && datos[k] !== textoDe(k)).map((k) => [k, datos[k]]));
    if (!Object.keys(valores).length) return toast('No has cambiado nada');
    guardar(valores);
  });
  formulario('aj-pendientes', (f, datos) => {
    const texto = PENDIENTES.filter(([id]) => datos[`pe-${id}`]).map(([id]) => `${id}${datos[`pf-${id}`]?.trim() ? ` ${datos[`pf-${id}`].trim()}` : ''}`).join(' | ');
    guardar({ pendientes: texto || 'ninguno' }, 'Pendientes guardados');
  });
  formulario('aj-claude', (f, datos) => {
    const mapa = Object.fromEntries(TRABAJOS.map((t) => [t, datos[`cm-${t}`]]).filter(([, v]) => v));
    const valores = { claude_modelo: fmt('claude_modelo', mapa) };
    if (datos.contexto_max !== textoDe('contexto_max')) valores.contexto_max = datos.contexto_max;
    guardar(valores, 'Modelos de Claude guardados');
  });
  cambio('aj-mes-inicio', async (el) => {
    const dia = Number(el.value);
    const m = est.modelo;
    const cerrados = m.meses.filter((x) => m.mes(x).estado.estado === 'cerrado').length;
    const si = await confirmar(`Cambiar el mes financiero ${dia === 1 ? 'al mes natural' : `a «del ${dia} al ${dia - 1}»`} reparte TODOS tus movimientos en sus nuevos meses (el fichero se llama por el mes que termina).${cerrados ? ` Los meses cerrados afectados se marcarán «editados tras cierre» y se recalculará su foto (tienes ${cerrados}).` : ''} Se puede deshacer.`, { si: 'Cambiar y repartir' });
    if (si) await op('mes.cambiarInicio', { dia }, { mensaje: 'Mes financiero cambiado y movimientos repartidos' });
    abrirAjustes(est, 'general');
  });
  accion('carpeta-cambiar', async () => {
    const srv = est.servidor;
    const ruta = document.getElementById('ruta-carpeta').value.trim();
    const modo = document.querySelector('[name=modo-carpeta]:checked')?.value ?? 'copiar';
    const salida = (t) => {
      aj.error = t;
      const el = document.getElementById('validacion-carpeta');
      if (el) el.textContent = t;
    };
    if (!ruta || ruta === srv.carpeta.rutaWindows) return toast('Escribe la ruta de la nueva carpeta');
    try {
      const v = await pedir('POST', '/api/carpeta/validar', { ruta });
      salida(v.ok ? `Comprobando la carpeta… ${v.estado === 'finhub' ? 'tiene datos de finhub' : v.estado === 'no-existe' ? 'se creará' : v.estado === 'vacia' ? 'vacía' : 'tiene otros ficheros'} · permisos OK ${v.avisos.map((a) => '· ' + a).join(' ')}` : `✗ ${v.errores.join('; ')}`);
      if (!v.ok) return;
      const aceptarAjenos = v.estado === 'ajena' ? await confirmar('La carpeta tiene otros ficheros que no son de finhub. ¿Seguir igualmente?', { si: 'Seguir' }) : false;
      if (v.estado === 'ajena' && !aceptarAjenos) return;
      const confirmarBorrado = modo === 'mover' ? await confirmar(`Tras copiar y verificar cada fichero, ¿mando la carpeta antigua (${srv.carpeta.rutaWindows}) a la papelera? Si dices que no, se queda donde está.`, { si: 'Sí, a la papelera', no: 'No, déjala' }) : false;
      if (modo === 'mover' || modo === 'copiar') abrirAjustes(est, 'carpeta');
      const r = await pedir('POST', '/api/carpeta/cambiar', { ruta, modo, confirmarBorrado, aceptarAjenos });
      aj.progreso = null;
      cerrar();
      toast(`Carpeta de datos: ${r.rutaWindows}${r.ficheros ? ` · ${r.ficheros} ficheros verificados` : ''}`);
    } catch (e) {
      aj.progreso = null;
      salida(`✗ ${e.message}`);
      toast(e.message, { tipo: 'error' });
    }
  });
}
