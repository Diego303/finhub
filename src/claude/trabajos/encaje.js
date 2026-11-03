// Encaje (§0.2): variante de privado; informe del descubrimiento ya validado + tu cartera y cifras del
// simulador. SIN internet. Escribe en analisis/encajes/ (privado), nunca junto al descubrimiento.
import { O, L, T, ID_NOTA, eur } from './comun.js';
import { bloque } from '../contexto.js';
import { estadoCartera, exposicion } from '../../core/cartera.js';

export default {
  id: 'encaje',
  nombre: 'Encaje con tu cartera',
  internet: false,
  privado: true,
  externo: true,
  herramientas: [],
  modelo: 'opus',
  timeoutMs: 120000,
  maxTurns: 2,
  recibe: 'informe validado + tu cartera',
  escribe: ['analisis/encajes/'],
  rol: 'Explicas cómo encaja un descubrimiento (informe público ya validado) con la cartera del usuario: qué tiene ya expuesto, el solapamiento y qué supondría, solo con las cifras calculadas por el código.',
  esquema: O({ ya_tienes: T('texto', { max: 1200 }), solapamiento: T('texto', { max: 1200 }), comentario_md: T('texto', { min: 10, max: 6000 }), citas: L(T('texto', { max: 300 }), { max: 20 }), cifras_usadas: L(T('texto', { max: 120 }), { max: 30 }) }),
  entrada(modelo, { descubrimiento, hoy }) {
    const e = estadoCartera({ activos: modelo.activos, operaciones: modelo.operaciones, fotos: modelo.fotos, hasta: hoy });
    const ex = exposicion(e.porActivo, modelo.activos, 'region');
    const d = modelo.descubrimientos.find((x) => x.id === descubrimiento);
    const cifras = [{ nombre: 'valor de la cartera', valor: eur(e.valor) }, ...ex.filas.map((f) => ({ nombre: `exposición ${f.nombre}`, valor: `${(f.pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` }))];
    const posiciones = [...e.porActivo.values()].map((p) => `${p.nombre} (${p.clase ?? 'sin clase'}): ${eur(p.valor)}`).join('\n');
    const informe = d ? `${d.id} · ${d.titulo}\n${d.versiones.map((v) => v.cuerpo).join('\n')}` : '(sin informe)';
    return { tarea: 'Explica cómo encaja el descubrimiento con la cartera, usando solo las cifras dadas.', cifras, bloques: [bloque(`informe ${descubrimiento}`, 'externo', informe, { ids: d ? [d.id] : [] }), bloque('tu cartera', 'privado', posiciones)] };
  },
};
