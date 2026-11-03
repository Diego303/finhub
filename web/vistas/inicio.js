// Primera vez (§14.1): una carpeta sin cuentas ni meses muestra este asistente en vez de las pestañas.
// Tú (nombre, mes financiero, tema) → cuentas → grupos → recurrentes → cartera, Base y Datos → crear.
// Todo se guarda con una operación (`inicio.crear`, con deshacer); después, cada cosa se cambia en Gestión.
import { html } from '../esc.js';
import { accion, cambio, entrada } from '../acciones.js';
import { op, obtener } from '../api.js';
import { toast } from '../componentes/toast.js';
import { abrirDatos } from '../componentes/claude.js';
import { GRUPOS_DEFECTO } from '/core/inicio.js';
import { TIPOS_CUENTA } from '/core/formato/catalogos.js';
import { parseImporte, formatearEuros } from '/core/dinero.js';
import { rex } from '../componentes/rex-sprite.js';

const PASOS = ['Tú', 'Cuentas', 'Grupos', 'Recurrentes', 'Cartera y conocimiento'];
const io = {
  paso: 0,
  nombre: '',
  dia: 1,
  tema: 'auto',
  cuentas: [{ nombre: 'Cuenta corriente', tipo: 'corriente', saldo: '', colchon: false }],
  grupos: new Set(GRUPOS_DEFECTO.map((g) => g[0]).filter((g) => !['formacion', 'devoluciones'].includes(g))),
  recurrentes: [{ concepto: 'Nómina', importe: '', grupo: 'sueldo', dia: 1 }],
  cartera: 'vacia',
  base: true,
  datos: false,
  error: null,
  creando: false,
};
let contexto = null;
export const iniciarInicio = (c) => (contexto = c);
const repintar = () => contexto.render();
const importe = (t) => (String(t ?? '').trim() ? parseImporte(t) : { ok: true, valor: 0 });

function paso0() {
  return html`<label class="lab" for="io-nombre" style="display:block">¿Cómo te llamas? (para el saludo)</label><input class="inp" id="io-nombre" data-entrada-texto="io-campo" data-campo="nombre" value="${io.nombre}" maxlength="60" style="width:100%;box-sizing:border-box">
    <label class="lab" for="io-dia" style="display:block;margin-top:10px">Tu mes financiero</label><select class="inp" id="io-dia" data-cambio="io-dia">${Array.from({ length: 28 }, (_, i) => i + 1).map((d) => html`<option value="${d}" ${io.dia === d ? 'selected' : ''}>${d === 1 ? 'mes natural (del 1 al último día)' : `del ${d} al ${d - 1} (si cobras el día ${d})`}</option>`)}</select>
    <label class="lab" for="io-tema" style="display:block;margin-top:10px">Tema</label><select class="inp" id="io-tema" data-cambio="io-tema">${[['auto', 'automático'], ['claro', 'claro'], ['oscuro', 'oscuro']].map(([v, t]) => html`<option value="${v}" ${io.tema === v ? 'selected' : ''}>${t}</option>`)}</select>`;
}

function paso1() {
  return html`<div class="mut" style="font-size:11px">Las cuentas donde tienes el dinero, con su saldo de hoy. La cartera de inversión va aparte, en el paso 5.</div>
    <table class="tb" style="margin-top:6px"><thead><tr><th scope="col">nombre</th><th scope="col">tipo</th><th scope="col" class="n">saldo hoy (€)</th><th scope="col">colchón</th><th scope="col"><span class="sr-only">quitar</span></th></tr></thead><tbody>
    ${io.cuentas.map((c, i) => html`<tr><td><label class="sr-only" for="io-cn-${i}">Nombre de la cuenta ${i + 1}</label><input class="inp" id="io-cn-${i}" data-entrada-texto="io-cuenta" data-i="${i}" data-campo="nombre" value="${c.nombre}" style="width:100%;box-sizing:border-box"></td><td><label class="sr-only" for="io-ct-${i}">Tipo de la cuenta ${i + 1}</label><select class="inp" id="io-ct-${i}" data-cambio="io-cuenta-tipo" data-i="${i}">${TIPOS_CUENTA.filter((t) => t !== 'inversion').map((t) => html`<option value="${t}" ${c.tipo === t ? 'selected' : ''}>${t}</option>`)}</select></td><td class="n"><label class="sr-only" for="io-cs-${i}">Saldo de la cuenta ${i + 1}</label><input class="inp" id="io-cs-${i}" data-entrada-texto="io-cuenta" data-i="${i}" data-campo="saldo" value="${c.saldo}" placeholder="0,00" inputmode="decimal" style="width:100px;text-align:right"></td><td><input type="radio" name="io-colchon" aria-label="La cuenta ${i + 1} es tu colchón" data-cambio="io-colchon" data-i="${i}" ${c.colchon ? 'checked' : ''}></td><td>${io.cuentas.length > 1 ? html`<button type="button" class="go" data-accion="io-quitar" data-lista="cuentas" data-i="${i}" aria-label="Quitar la cuenta ${i + 1}">×</button>` : ''}</td></tr>`)}
    </tbody></table><button type="button" class="go" style="margin-top:6px" data-accion="io-anadir" data-lista="cuentas">+ cuenta</button>
    <div class="mut" style="font-size:10.5px;margin-top:6px">El colchón es tu fondo de emergencia: finhub lo mide frente a tus gastos.</div>`;
}

function paso2() {
  return html`<div class="mut" style="font-size:11px">Grupos para clasificar lo que entra y sale. La naturaleza decide cómo cuenta cada uno (la tasa de ahorro, por ejemplo). Podrás crear, renombrar y quitar grupos después.</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">${GRUPOS_DEFECTO.map(([id, n, nat]) => html`<label style="font-size:11.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-cambio="io-grupo" data-id="${id}" ${io.grupos.has(id) ? 'checked' : ''}>${n} <span class="mut" style="font-size:10px">${nat}</span></label>`)}</div>`;
}

function paso3() {
  const grupos = GRUPOS_DEFECTO.filter(([id]) => io.grupos.has(id));
  return html`<div class="mut" style="font-size:11px">Lo que se repite cada mes (nómina, alquiler, suscripciones…). Cada mes finhub te los propone y tú los confirmas. Importe en positivo si entra y en negativo si sale. Opcional.</div>
    <table class="tb" style="margin-top:6px"><thead><tr><th scope="col">concepto</th><th scope="col" class="n">importe (€)</th><th scope="col">grupo</th><th scope="col">día</th><th scope="col"><span class="sr-only">quitar</span></th></tr></thead><tbody>
    ${io.recurrentes.map((r, i) => html`<tr><td><label class="sr-only" for="io-rc-${i}">Concepto ${i + 1}</label><input class="inp" id="io-rc-${i}" data-entrada-texto="io-rec" data-i="${i}" data-campo="concepto" value="${r.concepto}" style="width:100%;box-sizing:border-box"></td><td class="n"><label class="sr-only" for="io-ri-${i}">Importe ${i + 1}</label><input class="inp" id="io-ri-${i}" data-entrada-texto="io-rec" data-i="${i}" data-campo="importe" value="${r.importe}" placeholder="-750,00" style="width:100px;text-align:right"></td><td><label class="sr-only" for="io-rg-${i}">Grupo ${i + 1}</label><select class="inp" id="io-rg-${i}" data-cambio="io-rec-grupo" data-i="${i}">${grupos.map(([id, n]) => html`<option value="${id}" ${r.grupo === id ? 'selected' : ''}>${n}</option>`)}</select></td><td><label class="sr-only" for="io-rd-${i}">Día ${i + 1}</label><input class="inp" id="io-rd-${i}" type="number" min="1" max="28" data-entrada-texto="io-rec" data-i="${i}" data-campo="dia" value="${r.dia}" style="width:52px"></td><td><button type="button" class="go" data-accion="io-quitar" data-lista="recurrentes" data-i="${i}" aria-label="Quitar el recurrente ${i + 1}">×</button></td></tr>`)}
    </tbody></table><button type="button" class="go" style="margin-top:6px" data-accion="io-anadir" data-lista="recurrentes">+ recurrente</button>`;
}

function paso4() {
  return html`<div class="lab">Cartera de inversión</div>
    <label style="display:flex;gap:6px;font-size:11.5px"><input type="radio" name="io-cartera" value="vacia" data-cambio="io-cartera" ${io.cartera === 'vacia' ? 'checked' : ''}>Empezar vacía (añadirás tus fondos en Cartera)</label>
    <label style="display:flex;gap:6px;font-size:11.5px"><input type="radio" name="io-cartera" value="generar" data-cambio="io-cartera" ${io.cartera === 'generar' ? 'checked' : ''}>Generar una cartera base con un perfil (borrador que revisas tú)</label>
    <div class="lab" style="margin-top:10px">Conocimiento</div>
    <label style="display:flex;gap:6px;font-size:11.5px"><input type="checkbox" data-cambio="io-base" ${io.base ? 'checked' : ''}>Copiar la Base de finhub (~200 notas de conceptos, índices, crisis, comportamiento y fiscalidad, con su fuente)</label>
    <label style="display:flex;gap:6px;font-size:11.5px"><input type="checkbox" data-cambio="io-datos" ${io.datos ? 'checked' : ''}>Después, crear los datos de mercado (series de índices e IPC) con Claude, con tu luz verde</label>
    <div class="mut" style="font-size:10.5px;margin-top:6px">Los datos de índices no vienen con finhub (licencias): se crean en tu equipo con fuentes gratuitas, y solo si tú lo lanzas.</div>`;
}

export function vistaInicio(e) {
  const cuerpo = [paso0, paso1, paso2, paso3, paso4][io.paso]();
  const ultimo = io.paso === PASOS.length - 1;
  return html`<div class="box" style="max-width:760px;margin:10px auto" data-inicio><div class="fila" style="gap:14px;align-items:center">${rex(64, 56, 'feliz')}<div><b style="font-weight:500;font-size:15px">¡Hola! Vamos a preparar tu carpeta</b><div class="mut" style="font-size:11px">${e.servidor.carpeta.rutaWindows} · todo se guarda aquí, en Markdown legible. Puedes cambiarlo todo después.</div></div></div>
    <ol class="pasos" aria-label="Pasos" style="display:flex;gap:6px;list-style:none;padding:0;margin:12px 0;flex-wrap:wrap">${PASOS.map((t, i) => html`<li><button type="button" class="chip ${i === io.paso ? 'on' : ''}" data-accion="io-paso" data-i="${i}" aria-current="${i === io.paso ? 'step' : 'false'}">${i + 1} · ${t}</button></li>`)}</ol>
    <h2 style="font-size:13px;font-weight:500;margin:6px 0">${io.paso + 1} · ${PASOS[io.paso]}</h2>${cuerpo}
    ${io.error ? html`<div class="banda aviso" role="alert" style="margin-top:8px">${io.error}</div>` : ''}
    <div class="entre" style="margin-top:14px"><button type="button" data-accion="io-paso" data-i="${io.paso - 1}" ${io.paso ? '' : 'disabled'}>← atrás</button>${ultimo ? html`<button type="button" class="pri" data-accion="io-crear" ${io.creando ? 'disabled' : ''}>${io.creando ? 'Creando…' : 'Crear mi carpeta'}</button>` : html`<button type="button" class="pri" data-accion="io-paso" data-i="${io.paso + 1}">siguiente →</button>`}</div></div>`;
}

function validar() {
  if (!io.cuentas.some((c) => c.nombre.trim())) return 'añade al menos una cuenta con nombre';
  for (const c of io.cuentas) if (!importe(c.saldo).ok) return `saldo no válido en «${c.nombre}»: ${importe(c.saldo).error}`;
  if (!GRUPOS_DEFECTO.some(([id, , n]) => io.grupos.has(id) && n === 'consumo')) return 'elige al menos un grupo de gasto';
  for (const r of io.recurrentes.filter((x) => x.concepto.trim())) {
    if (!importe(r.importe).ok || !importe(r.importe).valor) return `importe no válido en «${r.concepto}»`;
    if (!io.grupos.has(r.grupo)) return `«${r.concepto}»: elige un grupo de los marcados`;
  }
  return null;
}

export function registrarInicio() {
  accion('io-paso', (el) => {
    io.paso = Math.max(0, Math.min(PASOS.length - 1, +el.dataset.i));
    io.error = null;
    repintar();
    document.querySelector('[data-inicio] h2')?.setAttribute('tabindex', '-1');
    document.querySelector('[data-inicio] h2')?.focus();
  });
  entrada('io-campo', (el) => (io[el.dataset.campo] = el.value));
  cambio('io-dia', (el) => (io.dia = +el.value));
  cambio('io-tema', (el) => {
    io.tema = el.value;
    if (el.value === 'auto') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = el.value;
  });
  entrada('io-cuenta', (el) => (io.cuentas[+el.dataset.i][el.dataset.campo] = el.value));
  cambio('io-cuenta-tipo', (el) => (io.cuentas[+el.dataset.i].tipo = el.value));
  cambio('io-colchon', (el) => io.cuentas.forEach((c, i) => (c.colchon = i === +el.dataset.i)));
  entrada('io-rec', (el) => (io.recurrentes[+el.dataset.i][el.dataset.campo] = el.value));
  cambio('io-rec-grupo', (el) => (io.recurrentes[+el.dataset.i].grupo = el.value));
  cambio('io-grupo', (el) => (el.checked ? io.grupos.add(el.dataset.id) : io.grupos.delete(el.dataset.id)));
  cambio('io-cartera', (el) => (io.cartera = el.value));
  cambio('io-base', (el) => (io.base = el.checked));
  cambio('io-datos', (el) => (io.datos = el.checked));
  accion('io-anadir', (el) => {
    if (el.dataset.lista === 'cuentas') io.cuentas.push({ nombre: '', tipo: 'ahorro', saldo: '', colchon: false });
    else io.recurrentes.push({ concepto: '', importe: '', grupo: [...io.grupos][0] ?? 'vivienda', dia: 1 });
    repintar();
  });
  accion('io-quitar', (el) => {
    io[el.dataset.lista].splice(+el.dataset.i, 1);
    repintar();
  });
  accion('io-crear', async () => {
    io.error = validar();
    if (io.error) return repintar();
    io.creando = true;
    repintar();
    let base = null;
    if (io.base) {
      try {
        base = { ficheros: (await obtener('/api/semilla?tipo=base')).ficheros };
      } catch (e) {
        toast(`No se pudo leer la Base: ${e.message}`, { tipo: 'error' });
      }
    }
    const args = {
      fecha: contexto.estado.ahora.fecha,
      nombre: io.nombre.trim(),
      mes_inicio_dia: io.dia,
      tema: io.tema,
      cuentas: io.cuentas.filter((c) => c.nombre.trim()).map((c) => ({ nombre: c.nombre, tipo: c.tipo, saldo: importe(c.saldo).valor, colchon: c.colchon })),
      grupos: [...io.grupos],
      recurrentes: io.recurrentes.filter((r) => r.concepto.trim()).map((r) => ({ concepto: r.concepto, importe: importe(r.importe).valor, grupo: r.grupo, cuenta: null, dia: +r.dia || 1 })),
      base,
    };
    const r = await op('inicio.crear', args, { mensaje: (x) => `Carpeta lista: ${x.resultado.cuentas} cuentas, ${x.resultado.grupos} grupos, ${x.resultado.recurrentes} recurrentes${x.resultado.base ? `, ${x.resultado.base} notas de la Base` : ''}` });
    io.creando = false;
    if (!r) return repintar();
    const total = args.cuentas.reduce((a, c) => a + c.saldo, 0);
    if (total) toast(`Saldo de partida: ${formatearEuros(total, 2)}`);
    if (io.cartera === 'generar') {
      location.hash = 'cartera';
      setTimeout(() => document.querySelector('[data-accion="cartera-generar"]')?.click(), 400);
    } else location.hash = 'panel';
    if (io.datos) setTimeout(() => abrirDatos(), io.cartera === 'generar' ? 1500 : 400);
  });
}
