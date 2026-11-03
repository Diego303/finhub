// Carpeta GRANDE para el rendimiento (§9.18): el ejemplo más 4 años de meses anteriores (≈ 3.500 movimientos
// en total), operaciones hasta ≈ 600 y ≈ 2.000 notas más de Mundo. Datos inventados, deterministas.
import { generar } from '../../scripts/generar-ejemplo.js';
import { crearPrng } from '../../src/core/prng.js';
import { MESES, sumarMesesMes, diasDelMes, sumarDias } from '../../src/core/fechas.js';
import { formatearImporte } from '../../src/core/dinero.js';

const GASTOS = [['Mercadona', 'comida', 4000, 12000], ['Cena fuera', 'ocio', 2000, 9000], ['Gasolina', 'transporte', 3000, 7000], ['Farmacia', 'salud', 500, 4000], ['Cine', 'ocio', 800, 2500], ['Fruta', 'comida', 500, 2000], ['Taxi', 'transporte', 800, 3000], ['Libro', 'formacion', 1000, 3000], ['Regalo', 'regalos', 1500, 8000], ['Panadería', 'comida', 200, 900]];

export function datosGrandes({ meses = 48, movimientosMes = 58, notasDia = 5, dias = 420, operaciones = 600 } = {}) {
  const fs = new Map(generar());
  const prng = crearPrng(20261103);
  const ids = new Set();
  const id = () => {
    for (;;) {
      const x = Math.floor(prng.siguiente() * 36 ** 4).toString(36).padStart(4, '0');
      if (!ids.has(x)) return ids.add(x), x;
    }
  };
  const primero = [...fs.keys()].filter((r) => /^mes\/\d{4}-\d{2}\.md$/.test(r)).sort()[0].slice(4, 11);
  let total = 0;
  for (let k = 1; k <= meses; k++) {
    const mes = sumarMesesMes(primero, -k);
    const [a, m] = mes.split('-').map(Number);
    const fin = diasDelMes(a, m);
    const lineas = [`- ${mes}-01 | Nómina | 2.800,00 | sueldo | cuenta: corriente | id: ${id()} | #fijo`, `- ${mes}-01 | Alquiler | -720,00 | vivienda | cuenta: corriente | id: ${id()} | #fijo`, `- ${mes}-02 | Aportación | -500,00 | cartera | cuenta: corriente | id: ${id()} | #fijo`];
    for (let i = 3; i < movimientosMes; i++) {
      const [c, g, min, max] = GASTOS[Math.floor(prng.siguiente() * GASTOS.length)];
      const dia = String(1 + Math.floor(prng.siguiente() * fin)).padStart(2, '0');
      lineas.push(`- ${mes}-${dia} | ${c} | -${formatearImporte(min + Math.floor(prng.siguiente() * (max - min)))} | ${g} | cuenta: corriente | id: ${id()}`);
    }
    lineas.sort();
    total += lineas.length;
    fs.set(`mes/${mes}.md`, `# ${MESES[m - 1]} ${a}\nesquema: 1\nperiodo: ${mes}-01 → ${mes}-${String(fin).padStart(2, '0')}\n## Movimientos\n${lineas.join('\n')}\n`);
  }
  // operaciones: se añaden aportaciones mensuales a los activos del ejemplo hasta llegar a `operaciones`
  const ops = fs.get('cartera/operaciones.md').trimEnd().split('\n');
  const n0 = ops.filter((l) => l.startsWith('- OP-')).length;
  const activos = ['fondo-sp500', 'emergentes', 'small-caps', 'rf-euro-corto'];
  const nuevas = [];
  for (let i = 0; i < operaciones - n0; i++) {
    const f = sumarDias('2019-01-02', i * 3);
    nuevas.push(`- OP-${String(9000 + i).padStart(4, '0')} | ${f} | aportacion | ${activos[i % 4]} | ${formatearImporte(5000 + (i % 7) * 1000)}`);
  }
  fs.set('cartera/operaciones.md', `${ops.slice(0, 2).join('\n')}\n${[...nuevas, ...ops.slice(2)].join('\n')}\n`);
  // notas de Mundo: `dias` días con `notasDia` notas cada uno
  let notas = 0;
  for (let d = 30; d < 30 + dias; d++) {
    const f = sumarDias('2026-11-03', -d);
    const ruta = `conocimiento/mundo/${f}.md`;
    if (fs.has(ruta)) continue;
    const aa = f.slice(2, 4) + f.slice(5, 7) + f.slice(8, 10);
    const b = Array.from({ length: notasDia }, (_, i) => `## M-${aa}-${String(i + 1).padStart(2, '0')} · Noticia inventada ${i + 1} del ${f}\n- editada: no\n- tipo: hecho\n- fecha: ${f}\n- fuente: mundo\n- origen: Medio de prueba · https://prueba.example/${aa}/${i}\n- temas: bolsa, tipos\n- postura: neutral\n- efectos: bancos:${['▲', '▼', '•'][i % 3]}\nResumen inventado de la noticia ${i + 1}, para medir el rendimiento.`);
    notas += notasDia;
    fs.set(ruta, `# Mundo ${f}\nesquema: 1\nfuente: mundo\nfecha: ${f}\npulsos: 08:00\n${b.join('\n')}\n`);
  }
  return { fs, movimientosNuevos: total, operaciones: n0 + nuevas.length, notasNuevas: notas };
}
