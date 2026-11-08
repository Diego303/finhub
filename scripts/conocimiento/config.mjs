// Configuración del validador y del auditor provisionales (maestro §3, §5 y §8). Sin dependencias.

/** Taxonomía cerrada (maestro §5). Un tema nuevo se propone al usuario y no se usa hasta que lo apruebe. */
export const GRUPOS_TEMAS = {
  Conceptos: ['conceptos', 'interes-compuesto', 'inflacion', 'riesgo', 'volatilidad', 'rentabilidad', 'diversificacion', 'correlacion', 'costes', 'liquidez'],
  Indexación: ['indices', 'indexacion', 'fondos', 'etf', 'replica', 'rebalanceo', 'concentracion', 'factores', 'divisas', 'dividendos'],
  'Renta fija y ahorro': ['renta-fija', 'deuda-publica', 'tesoro', 'credito', 'depositos', 'monetarios', 'cuentas'],
  Fiscalidad: ['fiscalidad', 'irpf', 'base-ahorro', 'traspasos', 'planes-pensiones', 'patrimonio', 'sucesiones-donaciones', 'itp-ajd', 'modelos-informativos'],
  'Pensiones y retirada': ['pensiones-publicas', 'jubilacion', 'retirada'],
  'Vivienda y deuda': ['vivienda', 'hipotecas', 'euribor', 'alquiler', 'deuda'],
  Protección: ['seguros', 'colchon', 'fgd', 'desempleo', 'proteccion-inversor', 'cripto', 'productos-complejos', 'reclamaciones'],
  'Mercados y macro': ['mercados', 'bolsa', 'bonos', 'bancos-centrales', 'tipos', 'bce', 'fed', 'empleo', 'pib', 'curva-tipos', 'materias-primas', 'petroleo', 'oro', 'emergentes', 'china', 'geopolitica', 'empresas', 'europa-espana', 'tecnologia', 'energia-materias-primas'],
  'Historia y comportamiento': ['crisis', 'historia', 'valoracion', 'comportamiento', 'sesgos', 'market-timing', 'glosario'],
  Nuevos: ['historia-anual', 'resumen-mensual', 'resumen-anual', 'retrospectivo'],
};
export const TEMAS = new Set(Object.values(GRUPOS_TEMAS).flat());

/** Temas que hacen de una nota «normativa»: exigen verificar, caduca 31-12 y la norma BOE-A-…. */
export const TEMAS_NORMATIVA = new Set([...GRUPOS_TEMAS.Fiscalidad, 'pensiones-publicas', 'fgd']);
/** Texto que suena a normativa sin número de norma: no bloquea, se avisa para decidir si lleva «verificar». */
export const RE_TEXTO_REGULACION = /\b(l[ií]mite legal|por ley|la ley|normativa|reglamento|directiva|UCITS|MiFID|MiCA|obligatori[ao]s?)\b/i;
/** Texto que delata normativa aunque los temas no lo digan. */
export const RE_TEXTO_NORMATIVA = /\b(Ley\s+(Orgánica\s+)?\d+\/\d{4}|Real\s+Decreto(-ley|\s+Legislativo)?\s+\d+\/\d{4}|Orden\s+[A-Z]{3}\/\d+\/\d{4}|Reglamento\s+\(UE\)\s+\d{4}\/\d+|Directiva\s+\d{4}\/\d+)/;
/** La norma: BOE-A-… (España) o, en derecho de la UE, su identificador DOUE-L-… o CELEX (p. ej. 32009L0065). */
export const RE_BOE = /BOE-A-\d{4}-\d{1,6}|DOUE-L-\d{4}-\d{1,6}|CELEX\s?3\d{4}[LRD]\d{4}/;

/** Sectores del mapa de efectos (maestro §3.2). */
export const SECTORES = new Set(['bancos', 'utilities-e-infraestructura', 'tecnologia', 'inmobiliario', 'consumo-basico', 'energia', 'renta-fija-euro']);

/** Días de caducidad en Mundo, desde la fecha del hecho (maestro §3.2). */
export const CADUCA_DIAS = { dato: 365, hecho: 180, consenso: 180, 'opinión': 90, 'especulación': 60 };
export const CADUCA_RESUMEN = 365;

/** Orden canónico de campos (maestro §3.1 y §3.2; el de `pulso.aplicar` sin `activos` ni `pulso`). */
export const ORDEN_BASE = ['editada', 'tipo', 'fecha', 'fuente', 'origen', 'temas', 'verificar', 'caduca'];
export const ORDEN_MUNDO = ['editada', 'tipo', 'fecha', 'fuente', 'origen', 'temas', 'postura', 'efectos', 'caduca', 'hash'];
export const OBLIGATORIOS = ['editada', 'tipo', 'fecha', 'fuente', 'origen', 'temas'];

/**
 * Ficheros de la Base y su bloque de ids. Los 6 actuales conservan sus ids (B-1001…B-1534). Las 14 áreas de P3
 * tienen un bloque de 1.000 (área n → B-(20+n)001…). La historia anual, B-4AANN.
 * Los nombres de fichero de las áreas son una propuesta de esta puesta en marcha (ver INCIDENCIAS).
 */
export const FICHEROS_BASE = {
  'conceptos.md': { re: /^B-10\d\d$/, titulo: 'actual' },
  'indices.md': { re: /^B-11\d\d$/, titulo: 'actual' },
  'crisis.md': { re: /^B-12\d\d$/, titulo: 'actual' },
  'comportamiento.md': { re: /^B-13\d\d$/, titulo: 'actual' },
  'fiscalidad.md': { re: /^B-14\d\d$/, titulo: 'actual' },
  'renta-fija-y-ahorro.md': { re: /^B-15\d\d$/, titulo: 'actual' },
  'conceptos-basicos.md': { re: /^B-21\d{3}$/, area: 1, titulo: 'Base · Conceptos básicos' },
  'inversion-indexada.md': { re: /^B-22\d{3}$/, area: 2, titulo: 'Base · Inversión indexada' },
  'renta-fija-y-liquidez.md': { re: /^B-23\d{3}$/, area: 3, titulo: 'Base · Renta fija y liquidez' },
  'fondos-y-vehiculos.md': { re: /^B-24\d{3}$/, area: 4, titulo: 'Base · Fondos y vehículos en España' },
  'fiscalidad-2026.md': { re: /^B-25\d{3}$/, area: 5, titulo: 'Base · Fiscalidad 2026' },
  'pensiones-publicas.md': { re: /^B-26\d{3}$/, area: 6, titulo: 'Base · Pensiones públicas' },
  'deudas-y-vivienda.md': { re: /^B-27\d{3}$/, area: 7, titulo: 'Base · Deudas y vivienda' },
  'proteccion.md': { re: /^B-28\d{3}$/, area: 8, titulo: 'Base · Protección' },
  'jubilacion-y-retirada.md': { re: /^B-29\d{3}$/, area: 9, titulo: 'Base · Jubilación y retirada' },
  'mercados-e-historia.md': { re: /^B-30\d{3}$/, area: 10, titulo: 'Base · Mercados e historia' },
  'macro-para-inversores.md': { re: /^B-31\d{3}$/, area: 11, titulo: 'Base · Macro para inversores' },
  'comportamiento-con-datos.md': { re: /^B-32\d{3}$/, area: 12, titulo: 'Base · Comportamiento con datos' },
  'riesgos-y-proteccion-del-inversor.md': { re: /^B-33\d{3}$/, area: 13, titulo: 'Base · Riesgos y protección del inversor' },
  'glosario.md': { re: /^B-34\d{3}$/, area: 14, titulo: 'Base · Glosario' },
  'historia.md': { re: /^B-4(0\d|1\d|2[0-5])\d\d$/, titulo: 'Base · Historia año a año' },
};

/**
 * Vocabulario prohibido (maestro §8): formas de recomendación. Se busca sobre el texto sin tildes y en minúsculas.
 * Criterio estricto de esta puesta en marcha: las palabras exactas de la lista no se publican nunca, tampoco al
 * describir la mecánica; la mecánica se cuenta con otro verbo («se adquieren», «se suscriben»). Así la regla es
 * automática y no depende de una revisión a ojo.
 */
export const VOCABULARIO = [
  [/\bcompra\b/, '«compra»'],
  [/\bvende\b/, '«vende»'],
  [/\bcompre\b/, '«compre»'],
  [/\bvenda\b/, '«venda»'],
  [/\bdeberias\s+(comprar|vender)\b/, '«deberías comprar/vender»'],
  [/\bte\s+recomendamos\b/, '«te recomendamos»'],
  [/\bes\s+(un\s+)?buen\s+momento\s+para\b/, '«es buen momento para»'],
  [/\bprecios?\s+objetivos?\b/, '«precio objetivo»'],
  [/\bsobrepondera\w*/, '«sobreponderar»'],
  [/\binfrapondera\w*/, '«infraponderar»'],
  [/\bgarantizad[ao]s?\b(\W+\w+){0,6}?\W+(rentabilidad|rendimiento|interes|ganancia|beneficio|retorno)/, '«garantizado» con una rentabilidad'],
  [/\b(rentabilidad|rendimiento|interes|ganancia|beneficio|retorno)\w*(\W+\w+){0,6}?\W+garantizad[ao]s?\b/, '«garantizado» con una rentabilidad'],
];
/** Negación cerca de «garantizado»: «no está garantizada», «sin … garantizada», «ni garantizado». */
export const RE_NEGACION = /\b(no|ni|sin|nunca|tampoco)\b/;
/** No bloquea, pero se enseña para revisar. */
export const VOCABULARIO_AVISO = [[/\brecomend\w*/, '«recomend…»']];

/** Límites de longitud del texto de una nota, en líneas no vacías. */
export const LINEAS_MIN = 2;
export const LINEAS_MAX = 6;
export const TEMAS_MAX = 6;
/** Copia: palabras seguidas iguales a la fuente (sin nombres ni cifras). */
export const COPIA_PALABRAS = 8;
