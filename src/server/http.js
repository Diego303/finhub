// HTTP seguro (§2.2): solo 127.0.0.1, Host y Origin comprobados, sin CORS, cuerpo ≤ 1 MB,
// nunca trazas de error al cliente, estáticos sin salir de su carpeta.
import fsp from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';

export const LIMITE_CUERPO = 1024 * 1024;

export const CABECERAS_SEGURIDAD = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export class ErrorHttp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

/** Hosts y orígenes válidos para un puerto. */
export const hostsValidos = (puerto) => new Set([`127.0.0.1:${puerto}`, `localhost:${puerto}`]);
export const origenesValidos = (puerto) => new Set([`http://127.0.0.1:${puerto}`, `http://localhost:${puerto}`]);

/**
 * Comprueba Host (contra DNS rebinding) y Origin (contra CSRF). Lanza ErrorHttp(403/415).
 * Las peticiones que cambian algo exigen JSON (un formulario de otra web no puede mandarlo sin CORS).
 */
export function comprobarPeticion(req, puerto) {
  if (!hostsValidos(puerto).has(String(req.headers.host ?? '').toLowerCase())) throw new ErrorHttp(403, 'Host no permitido');
  const origen = req.headers.origin;
  if (origen !== undefined && !origenesValidos(puerto).has(String(origen).toLowerCase())) throw new ErrorHttp(403, 'Origen no permitido');
  const sitio = req.headers['sec-fetch-site'];
  if (sitio !== undefined && !['same-origin', 'none'].includes(sitio)) throw new ErrorHttp(403, 'Petición de otro sitio no permitida');
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) throw new ErrorHttp(415, 'Se espera JSON');
  }
}

/** Lee el cuerpo JSON con límite (413) y errores claros (400). */
export function leerJson(req, limite = LIMITE_CUERPO) {
  return new Promise((ok, mal) => {
    const declarado = Number(req.headers['content-length']);
    if (declarado > limite) {
      req.resume();
      return mal(new ErrorHttp(413, 'La petición es demasiado grande'));
    }
    const trozos = [];
    let total = 0;
    let excedido = false;
    req.on('data', (t) => {
      total += t.length;
      if (excedido) return;
      if (total > limite) {
        // se responde 413 y el resto del cuerpo se descarta (el socket se cierra tras la respuesta)
        excedido = true;
        trozos.length = 0;
        mal(new ErrorHttp(413, 'La petición es demasiado grande', { cerrar: true }));
      } else trozos.push(t);
    });
    req.on('end', () => {
      if (total > limite) return;
      const texto = Buffer.concat(trozos).toString('utf8');
      if (!texto) return ok({});
      try {
        const v = JSON.parse(texto);
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('no es un objeto');
        ok(v);
      } catch {
        mal(new ErrorHttp(400, 'JSON no válido'));
      }
    });
    req.on('error', () => mal(new ErrorHttp(400, 'Petición interrumpida')));
  });
}

export function enviarJson(res, estado, datos, { cerrar = false } = {}) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(cuerpo), ...(cerrar ? { Connection: 'close' } : {}) });
  res.end(cuerpo);
}

/** Sirve un fichero estático de `raiz` sin salir de ella. */
export async function servirEstatico(res, raiz, relativa, { metodo = 'GET' } = {}) {
  let rel;
  try {
    rel = decodeURIComponent(relativa);
  } catch {
    throw new ErrorHttp(400, 'Ruta no válida');
  }
  if (rel.includes('\0') || rel.includes('\\') || rel.split('/').some((p) => p === '..')) throw new ErrorHttp(404, 'No encontrado');
  const base = resolve(raiz);
  const abs = resolve(base, `.${rel.startsWith('/') ? rel : '/' + rel}`);
  if (abs !== base && !abs.startsWith(base + sep)) throw new ErrorHttp(404, 'No encontrado');
  const tipo = TIPOS[extname(abs)];
  if (!tipo) throw new ErrorHttp(404, 'No encontrado');
  let cuerpo;
  try {
    cuerpo = await fsp.readFile(abs);
  } catch {
    throw new ErrorHttp(404, 'No encontrado');
  }
  res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': tipo, 'Content-Length': cuerpo.length, 'Cache-Control': 'no-cache' });
  res.end(metodo === 'HEAD' ? undefined : cuerpo);
}

export const rutasEstaticas = (raizRepo) => ({ web: join(raizRepo, 'web'), core: join(raizRepo, 'src', 'core') });
