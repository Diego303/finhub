// Piezas compartidas por los trabajos: esquemas comunes y datos del usuario resumidos para los privados.
import { TIPOS_NOTA, POSTURAS } from '../../core/formato/conocimiento.js';

export const T = (t, extra = {}) => ({ t, ...extra });
export const O = (props, req = Object.keys(props)) => ({ t: 'objeto', props, req });
export const L = (de, extra = {}) => ({ t: 'lista', de, ...extra });
export const opc = (esq) => ({ ...esq, opcional: true });

export const ID = T('texto', { patron: /^[a-z0-9]+(-[a-z0-9]+)*$/, max: 40, ayuda: 'id en minúsculas sin tildes y con guiones, p. ej. tipos-de-interes' });
export const ID_NOTA = T('texto', { patron: /^[A-Z]{1,4}-\d{2,6}(-\d{2})?$/, ayuda: 'id de una nota de <datos>, p. ej. B-1001' });
export const TEMAS = L(ID, { max: 8 });
export const POSTURA = T('enum', { v: POSTURAS });
export const TIPO_NOTA = T('enum', { v: TIPOS_NOTA });
export const CHAT = O({ respuesta_md: T('texto', { min: 1, max: 12000 }), citas: L(ID_NOTA, { max: 40 }), cifras_usadas: L(T('texto', { max: 120 }), { max: 40 }) });

/** Importes en euros para el prompt (los privados): 1.234,56 €. */
export const eur = (c) => `${(c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const pct = (pb) => (pb === null || pb === undefined ? 'no concluyente' : `${(pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
