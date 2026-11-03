#!/usr/bin/env node
// Iconos PNG de la app instalable (192 y 512 px), dibujados por código con los píxeles de Rex. Sin
// dependencias: PNG con node:zlib. Uso: node scripts/generar-iconos.js (escribe web/icono-*.png).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CUERPO = ['....####.....', '....#o####...', '....######...', '....####.....', '#..######....', '########.....', '.######......', '..#..#.......', '..#..#.......'];
const COLOR = { '#': [0xd8, 0x5a, 0x30], o: [0x4a, 0x1b, 0x0c] };
const FONDO = [0xfa, 0xf9, 0xf5];
const MONEDA = [0xef, 0x9f, 0x27];

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function trozo(tipo, datos) {
  const t = Buffer.from(tipo, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([len, t, datos, crc]);
}

/** Icono de `lado` px: fondo claro redondeado (maskable: Rex dentro de la zona segura del 80 %). */
export function icono(lado) {
  const px = Buffer.alloc(lado * lado * 4);
  const celda = (lado * 0.62) / 13; // 13 columnas en el 62 % del lado
  const x0 = (lado - celda * 13) / 2;
  const y0 = (lado - celda * 9) / 2;
  const r = lado * 0.18;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const i = (y * lado + x) * 4;
      // esquinas redondeadas
      const dx = Math.max(r - x, x - (lado - 1 - r), 0);
      const dy = Math.max(r - y, y - (lado - 1 - r), 0);
      if (dx * dx + dy * dy > r * r) continue; // transparente
      let c = FONDO;
      const cx = Math.floor((x - x0) / celda);
      const cy = Math.floor((y - y0) / celda);
      const k = CUERPO[cy]?.[cx];
      if (k && COLOR[k]) c = COLOR[k];
      const mx = x0 + 10.1 * celda;
      const my = y0 + 5.7 * celda;
      if ((x - mx) ** 2 + (y - my) ** 2 <= (1.1 * celda) ** 2) c = MONEDA;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  const filas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) px.copy(filas, y * (lado * 4 + 1) + 1, y * lado * 4, (y + 1) * lado * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(filas, { level: 9 })), trozo('IEND', Buffer.alloc(0))]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const lado of [192, 512]) writeFileSync(join(import.meta.dirname, '..', 'web', `icono-${lado}.png`), icono(lado));
  console.log('✓ web/icono-192.png y web/icono-512.png');
}
