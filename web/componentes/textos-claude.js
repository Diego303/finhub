// Gestión → Roles y Tareas (§14.4): los de finhub (semilla) y los tuyos (roles/, tareas/ de tu carpeta, que
// mandan). Editar crea tu versión; «restaurar el de finhub» manda la tuya a la papelera; «nuevo» crea uno.
// El trabajo y el esquema de salida los fija el código: el texto nunca cambia la regla R1.
import { html } from '../esc.js';
import { accion, formulario } from '../acciones.js';
import { abrir, confirmar, repintarModal } from './modal.js';
import { obtener, op } from '../api.js';
import { TRABAJOS } from '/core/formato/config.js';

const tx = { tipo: 'roles', semilla: {}, editando: null, nuevo: false, texto: '', error: null };
let est = null;
const singular = () => (tx.tipo === 'roles' ? 'rol' : 'tarea');

function lista() {
  const m = est.modelo;
  const tuyos = new Set([...m.docs.keys()].filter((r) => r.startsWith(`${tx.tipo}/`)).map((r) => r.slice(tx.tipo.length + 1)));
  const nombres = [...new Set([...Object.keys(tx.semilla), ...tuyos])].sort();
  return nombres.map((n) => {
    const ruta = `${tx.tipo}/${n}`;
    const d = tuyos.has(n) ? m.doc(ruta) : null;
    const titulo = (d?.titulo ?? /^# (.*)$/m.exec(tx.semilla[n] ?? '')?.[1] ?? n).replace(/^(Rol|Tarea) · /, '');
    const trabajo = /^trabajo: (.*)$/m.exec(tuyos.has(n) ? '' : tx.semilla[n] ?? '')?.[1] ?? d?.secciones[0].nodos.find((x) => x.k === 'cab' && x.clave === 'trabajo')?.valor ?? '—';
    return { n, ruta, titulo, trabajo, origen: tuyos.has(n) ? (tx.semilla[n] ? 'tu versión' : 'tuyo') : 'de finhub' };
  });
}

function cuerpo() {
  if (tx.editando) {
    return html`<form data-form="txt-guardar">${tx.nuevo ? html`<label class="lab" for="txt-nombre" style="display:block;margin-top:6px">Nombre del fichero (minúsculas y guiones)</label><input class="inp" id="txt-nombre" name="nombre" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="mi-${singular()}">` : ''}<div class="mut" style="font-size:10.5px;margin-top:6px">${tx.nuevo ? `${tx.tipo}/<nombre>.md` : tx.editando} · Markdown. Necesita «trabajo: ${TRABAJOS.join(' | ')}». El trabajo decide qué datos ve Claude y si sale a internet (regla R1): el texto no puede cambiarlo.</div>
      <label class="sr-only" for="txt-area">Texto de ${tx.editando}</label><textarea id="txt-area" class="inp" name="texto" rows="18" style="width:100%;box-sizing:border-box;font-family:var(--font-mono);font-size:11px">${tx.texto}</textarea>
      ${tx.error ? html`<div class="banda aviso" role="alert">${tx.error}</div>` : ''}
      <div class="entre" style="margin-top:8px"><button type="button" data-accion="txt-volver">← volver</button><button type="submit" class="pri">Guardar en tu carpeta</button></div></form>`;
  }
  const filas = lista();
  return html`<div class="mut" style="font-size:11px;margin-top:6px">${tx.tipo === 'roles' ? 'Cómo piensa Claude en cada tarea.' : 'Qué se le pide a Claude.'} Los tuyos están en ${tx.tipo}/ de tu carpeta y mandan sobre los de finhub.</div>
    <table class="tb" style="margin-top:6px"><thead><tr><th scope="col">${singular()}</th><th scope="col">trabajo</th><th scope="col">origen</th><th scope="col"><span class="sr-only">acciones</span></th></tr></thead><tbody>
    ${filas.map((f) => html`<tr data-texto="${f.n}"><td>${f.titulo}</td><td class="mut">${f.trabajo}</td><td class="mut">${f.origen}</td><td style="white-space:nowrap"><button type="button" class="go" data-accion="txt-editar" data-n="${f.n}" aria-label="Editar ${f.titulo}">editar</button>${f.origen === 'tu versión' ? html` <button type="button" class="go" data-accion="txt-restaurar" data-n="${f.n}" aria-label="Volver al de finhub: ${f.titulo}">restaurar el de finhub</button>` : f.origen === 'tuyo' ? html` <button type="button" class="go" data-accion="txt-borrar" data-n="${f.n}" aria-label="Borrar ${f.titulo}">borrar</button>` : ''}</td></tr>`)}
    </tbody></table><button type="button" class="go" style="margin-top:6px" data-accion="txt-nuevo">+ ${singular()} nuevo</button>`;
}

export async function abrirTextos(tipo, estado) {
  est = estado;
  Object.assign(tx, { tipo, editando: null, error: null, semilla: {} });
  abrir({ titulo: tipo === 'roles' ? 'Roles expertos' : 'Tareas', cuerpo, ancho: true });
  try {
    tx.semilla = (await obtener(`/api/semilla?tipo=${tipo}`)).ficheros;
  } catch {
    /* sin semilla: solo los tuyos */
  }
  repintarModal();
}

export function registrarTextos(estado) {
  est = estado;
  accion('txt-editar', async (el) => {
    const n = el.dataset.n;
    const ruta = `${tx.tipo}/${n}`;
    let texto = tx.semilla[n] ?? '';
    if (est.modelo.docs.has(ruta)) texto = (await obtener(`/api/fichero?ruta=${encodeURIComponent(ruta)}`)).texto;
    Object.assign(tx, { editando: ruta, texto, error: null });
    repintarModal();
    document.getElementById('txt-area')?.focus();
  });
  accion('txt-nuevo', () => {
    const plantilla = tx.tipo === 'roles' ? '# Rol · Mi rol\nesquema: 1\ntrabajo: privado\ndescripcion: \n## Rol\n…\n## Reglas\n- Usa solo cifras de la app.\n' : '# Tarea · Mi tarea\nesquema: 1\ntrabajo: privado\ndescripcion: \n## Trabajo\n…\n';
    Object.assign(tx, { editando: 'nuevo', nuevo: true, texto: plantilla, error: null });
    repintarModal();
    document.getElementById('txt-nombre')?.focus();
  });
  accion('txt-volver', () => {
    tx.editando = null;
    tx.nuevo = false;
    repintarModal();
  });
  formulario('txt-guardar', async (f, datos) => {
    tx.texto = datos.texto;
    const ruta = tx.nuevo ? `${tx.tipo}/${String(datos.nombre ?? '').trim()}.md` : tx.editando;
    if (tx.nuevo && est.modelo.docs.has(ruta)) {
      tx.error = `ya existe ${ruta}`;
      return repintarModal();
    }
    const r = await op('texto.guardar', { ruta, texto: datos.texto }, { mensaje: `Guardado en ${ruta}` });
    if (r) Object.assign(tx, { editando: null, nuevo: false, error: null });
    repintarModal();
  });
  const quitar = async (el, que) => {
    const ruta = `${tx.tipo}/${el.dataset.n}`;
    if (!(await confirmar(`¿${que}? Tu versión de ${ruta} irá a la papelera 30 días.`, { si: 'Sí' }))) return;
    await op('fichero.borrar', { ruta, que: `${singular()} ${el.dataset.n}` }, { mensaje: `${ruta} a la papelera` });
    repintarModal();
  };
  accion('txt-restaurar', (el) => quitar(el, 'Volver al de finhub'));
  accion('txt-borrar', (el) => quitar(el, 'Borrar'));
}
