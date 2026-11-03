// ajustes.md (docs/FORMATOS.md §2)
import * as T from './tipos.js';
import { definirFormato, kv } from './motor.js';

export const TRABAJOS = ['pulso', 'precios', 'datos', 'ingesta', 'conocimiento', 'privado', 'rex-web', 'descubrir', 'encaje'];

export const AJUSTES_DEFECTO = {
  moneda: 'EUR',
  mes_inicio_dia: 1,
  tema: 'auto',
  puerto: 4747,
  impuestos_ahorro: [
    { desde: 0, hasta: 600000, pb: 1900 },
    { desde: 600000, hasta: 5000000, pb: 2100 },
    { desde: 5000000, hasta: 20000000, pb: 2300 },
    { desde: 20000000, hasta: 30000000, pb: 2700 },
    { desde: 30000000, hasta: null, pb: 3000 },
  ],
  proyeccion: 'datos',
  proyeccion_manual: 'rv 5,5 · 14 | rf 1,5 · 4 | efectivo 0,5 · 0,5',
  libertad_multiplicador: 25,
  pendientes: 'pulso diario | movimientos 1d | recurrentes mensual | valores semanal(dom) | datos mensual | cierre fin-de-mes | pausas | predicciones | contexto',
  rex_humor: 'contento>=30 | tranquilo>=15 | preocupado<15',
  accesorios: 'gafas:mes-tasa>=30 | corbata:meta(colchon)=100 | japon:meta(japon)=100 | corona:libertad',
  copias: 'carpeta',
  claude_modelo: { pulso: 'sonnet', precios: 'haiku', datos: 'haiku', ingesta: 'sonnet', conocimiento: 'sonnet', 'rex-web': 'sonnet', privado: 'opus', encaje: 'opus', descubrir: 'opus' },
  contexto_max: '60 notas · 60000 car.',
  crisis_periodos: '2000-03..2003-03 Puntocom | 2007-10..2009-02 Crisis financiera | 2020-01..2020-03 Covid | 2021-12..2022-09 Inflación y tipos',
};

export const ajustes = definirFormato({
  tipo: 'ajustes',
  titulo: 'Ajustes',
  preambulo: kv({
    claves: {
      nombre: T.texto(),
      moneda: T.enumerado(['EUR']),
      mes_inicio_dia: T.entero({ min: 1, max: 28 }),
      tema: T.enumerado(['claro', 'oscuro', 'auto']),
      puerto: T.entero({ min: 1024, max: 65535 }),
      impuestos_ahorro: T.tramos(),
      impuestos_verificado: T.entero({ min: 2000, max: 2100 }),
      proyeccion: T.enumerado(['datos', 'manual']),
      proyeccion_manual: T.texto(),
      libertad_multiplicador: T.entero({ min: 1, max: 100 }),
      pendientes: T.texto(),
      rex_humor: T.texto(),
      accesorios: T.texto(),
      copias: T.enumerado(['carpeta', 'local']),
      conflictos: T.texto(),
      claude_modelo: T.mapa(T.enumerado(TRABAJOS), T.texto(), '='),
      contexto_max: T.texto(),
      umbral_desviacion: T.porcentaje(),
      sectores_efectos: T.lista(T.texto()),
      crisis_periodos: T.texto(),
    },
  }),
});

/** Ajustes efectivos: los del fichero (válidos) sobre los valores por defecto. */
export function ajustesEfectivos(valoresFichero) {
  return { ...AJUSTES_DEFECTO, ...valoresFichero, claude_modelo: { ...AJUSTES_DEFECTO.claude_modelo, ...(valoresFichero.claude_modelo ?? {}) } };
}
