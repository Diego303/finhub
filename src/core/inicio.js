// Primera vez (§14.1): lo que se propone al crear una carpeta nueva. Isomórfico (lo usa la web y la operación).

/** Grupos que se proponen (los marcas o no). [id, nombre, naturaleza] */
export const GRUPOS_DEFECTO = [
  ['sueldo', 'Sueldo', 'ingreso'],
  ['extra', 'Otros ingresos', 'ingreso'],
  ['vivienda', 'Vivienda', 'consumo'],
  ['comida', 'Comida', 'consumo'],
  ['transporte', 'Transporte', 'consumo'],
  ['ocio', 'Ocio', 'consumo'],
  ['salud', 'Salud', 'consumo'],
  ['suscripciones', 'Suscripciones', 'consumo'],
  ['ropa', 'Ropa y casa', 'consumo'],
  ['regalos', 'Regalos', 'consumo'],
  ['formacion', 'Formación', 'consumo'],
  ['cartera', 'Cartera', 'inversion'],
  ['colchon', 'Colchón', 'ahorro'],
  ['devoluciones', 'Devoluciones', 'traspaso'],
  ['traspasos', 'Entre mis cuentas', 'traspaso'],
];
export const ETIQUETAS_DEFECTO = [['fijo', 'Gastos e ingresos fijos de cada mes'], ['suscripción', 'Pagos recurrentes de servicios'], ['puntual', 'Algo que no se repite'], ['social', 'Planes con amigos y familia'], ['meta', 'Aportaciones a metas']];

/** Familias, fuentes fijas y clases con las que nace una carpeta: sin ellas, ni Rex ve la Base ni hay dónde ingerir. */
export const FAMILIAS_DEFECTO = [
  { id: 'fija', nombre: 'Base y datos', plegada: false },
  { id: 'yt', nombre: 'Youtubers de inversión', caducidad: { n: 180, unidad: 'd', dias: 180 }, plegada: false },
  { id: 'macro', nombre: 'Macro y economía', caducidad: { n: 120, unidad: 'd', dias: 120 }, plegada: true },
  { id: 'pod', nombre: 'Podcasts', caducidad: { n: 180, unidad: 'd', dias: 180 }, plegada: true },
  { id: 'prensa', nombre: 'Prensa e informes', caducidad: { n: 90, unidad: 'd', dias: 90 }, plegada: true },
  { id: 'mias', nombre: 'Mis notas', plegada: true },
];
export const FUENTES_DEFECTO = [
  { id: 'base', nombre: 'Base', familia: 'fija', prefijo: 'B', privada: false, activa_por_defecto: true },
  { id: 'datos', nombre: 'Datos', familia: 'fija', prefijo: 'DT', privada: false, activa_por_defecto: true },
  { id: 'mundo', nombre: 'Mundo · pulsos', familia: 'prensa', prefijo: 'M', privada: false, activa_por_defecto: true },
  { id: 'mias', nombre: 'Mis notas', familia: 'mias', prefijo: 'N', privada: true, activa_por_defecto: true },
];
export const CLASES_DEFECTO = [
  { id: 'rv-desarrollados', nombre: 'RV desarrollados', indice: 'msci-world-nr-eur', grupo: 'rv' },
  { id: 'rv-emergentes', nombre: 'RV emergentes', indice: 'msci-em-nr-eur', grupo: 'rv' },
  { id: 'rv-small', nombre: 'RV small caps', indice: 'msci-world-small-eur', grupo: 'rv' },
  { id: 'rv-tecnologia', nombre: 'RV EE. UU. tecnología', indice: 'nasdaq-100-eur', grupo: 'rv', parecida: 'rv-desarrollados' },
  { id: 'renta-fija', nombre: 'Renta fija', indice: 'rf-euro-agregada', grupo: 'rf' },
  { id: 'mixto', nombre: 'Mixto', grupo: 'mixto', parecida: 'renta-fija' },
  { id: 'efectivo', nombre: 'Efectivo', grupo: 'efectivo' },
];

/** ¿La carpeta está por estrenar? (sin cuentas ni meses) */
export const carpetaNueva = (modelo) => !modelo.cuentas.length && !modelo.meses.length && !modelo.activos.length;
