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

/** ¿La carpeta está por estrenar? (sin cuentas ni meses) */
export const carpetaNueva = (modelo) => !modelo.cuentas.length && !modelo.meses.length && !modelo.activos.length;
