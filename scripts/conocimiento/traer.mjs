#!/usr/bin/env node
// Descarga una página para la caché del proyecto de conocimiento (pasada 1), sin dependencias.
//
// Por qué: WebFetch devuelve lo que un modelo extrae de la página, no la página. El detector de copia y el
// comprobador de cifras necesitan el texto real, así que cada fuente se guarda también aquí.
//
// Reglas (maestro §4.4, prompt «Puesta en marcha» 3):
//   · solo URL que acepta la guardia (dominios de .claude/hooks/dominios.txt, https, sin IP, puerto, credenciales
//     ni trozos largos aleatorios): se usa la misma función `revisarUrl` de la guardia;
//   · las redirecciones solo se siguen si van a https y al MISMO dominio de la lista (máximo 5);
//   · como mucho 10 MB y 30 s por página;
//   · nunca ejecuta nada: guarda bytes. Los PDF se pasan por `pdftotext` (sin shell, argumentos fijos) solo para
//     sacar el texto;
//   · guarda la página comprimida en .cache/conocimiento/paginas/<sha256>.gz, el texto extraído también
//     comprimido (<sha256>.txt.gz, así un grep no lo muestra) y una ficha <sha256>.json;
//   · por pantalla solo sale la ficha (URL, tipo, tamaño, hash, señales de inyección contadas): nunca el texto.
//
// Uso: node scripts/conocimiento/traer.mjs <url> [<url> …]
//      Salida: una línea JSON por URL. Código de salida 1 si alguna falla.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { revisarUrl, dominiosPermitidos, senalesInyeccion } from '../../.claude/hooks/guardia.mjs';

const RAIZ = resolve(import.meta.dirname, '..', '..');
export const PAGINAS = join(RAIZ, '.cache', 'conocimiento', 'paginas');
const INCIDENCIAS = join(RAIZ, '.cache', 'conocimiento', 'incidencias-web.jsonl');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MS = 30_000;
const MAX_REDIRECCIONES = 5;
const AGENTE = 'finhub-conocimiento/1.0 (descarga para verificacion de fuentes)';

/** Entrada de la lista de dominios que cubre un host (la más larga). */
export function dominioDeLista(host, lista = dominiosPermitidos()) {
  const h = host.toLowerCase();
  return lista.filter((d) => h === d || h.endsWith(`.${d}`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** ¿Se puede seguir una redirección de `desde` a `hacia`? Solo https y al mismo dominio de la lista. */
export function redireccionPermitida(desde, hacia, lista = dominiosPermitidos()) {
  let a, b;
  try {
    a = new URL(desde);
    b = new URL(hacia, desde);
  } catch {
    return 'redirección a una URL no válida';
  }
  const motivo = revisarUrl(b.href, lista);
  if (motivo) return `redirección rechazada: ${motivo}`;
  if (dominioDeLista(a.hostname, lista) !== dominioDeLista(b.hostname, lista)) return `redirección a otro dominio (${b.hostname})`;
  return null;
}

/** Túnel CONNECT por el proxy de HTTPS_PROXY (si lo hay), y TLS encima. */
function abrirSocket(u) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return null;
  const p = new URL(proxy);
  return new Promise((ok, mal) => {
    const req = httpRequest({ host: p.hostname, port: p.port || 80, method: 'CONNECT', path: `${u.hostname}:443`, headers: { host: `${u.hostname}:443` }, timeout: MAX_MS });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        mal(new Error(`el proxy rechazó ${u.hostname} (HTTP ${res.statusCode})`));
        return;
      }
      ok(tlsConnect({ socket, servername: u.hostname }));
    });
    req.on('timeout', () => req.destroy(new Error('tiempo agotado al conectar con el proxy')));
    req.on('error', mal);
    req.end();
  });
}

async function pedir(url, limiteFin) {
  const u = new URL(url);
  const tls = await abrirSocket(u);
  const restante = Math.max(1, limiteFin - Date.now());
  return new Promise((ok, mal) => {
    const req = httpsRequest(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'user-agent': AGENTE, accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5', 'accept-encoding': 'identity' },
        timeout: restante,
        ...(tls ? { createConnection: () => tls, agent: false } : {}),
      },
      (res) => {
        const trozos = [];
        let total = 0;
        res.on('data', (t) => {
          total += t.length;
          if (total > MAX_BYTES) {
            req.destroy(new Error('la página supera 10 MB'));
            return;
          }
          trozos.push(t);
        });
        res.on('end', () => ok({ estado: res.statusCode, cabeceras: res.headers, cuerpo: Buffer.concat(trozos) }));
        res.on('error', mal);
      },
    );
    const reloj = setTimeout(() => req.destroy(new Error('tiempo agotado (30 s)')), restante);
    req.on('close', () => clearTimeout(reloj));
    req.on('timeout', () => req.destroy(new Error('tiempo agotado (30 s)')));
    req.on('error', mal);
    req.end();
  });
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', euro: '€', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·', ordm: 'º', ordf: 'ª', deg: '°', iexcl: '¡', iquest: '¿' };
const LETRAS = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', agrave: 'à', egrave: 'è', ograve: 'ò', ocirc: 'ô', acirc: 'â', ecirc: 'ê' };

/** Texto legible de un HTML: sin scripts, estilos ni etiquetas. No interpreta nada. */
export function textoDeHtml(html) {
  return String(html)
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|object)\b[^]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6]|section|article|td|th|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? LETRAS[n] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .normalize('NFC');
}

function textoDePdf(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'traer-pdf-'));
  try {
    const f = join(dir, 'p.pdf');
    writeFileSync(f, bytes);
    const out = execFileSync('pdftotext', ['-q', '-enc', 'UTF-8', '-nopgbrk', f, '-'], { timeout: 30_000, maxBuffer: 50 * 1024 * 1024 });
    return out.toString('utf8').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().normalize('NFC');
  } catch {
    return '';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tipoDe(cabeceras, bytes) {
  const ct = String(cabeceras['content-type'] ?? '').toLowerCase();
  if (ct.includes('pdf') || bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (ct.includes('html') || ct.includes('xml')) return 'html';
  if (ct.startsWith('text/')) return 'texto';
  return 'otro';
}

/** Descarga una URL y la guarda en la caché. → ficha */
export async function traer(url, { hoy = new Date().toISOString().slice(0, 10) } = {}) {
  const motivo = revisarUrl(url);
  if (motivo) return { ok: false, url, error: `rechazada por la guardia: ${motivo}` };
  const limiteFin = Date.now() + MAX_MS;
  let actual = url;
  let r;
  for (let i = 0; ; i++) {
    r = await pedir(actual, limiteFin);
    if (r.estado >= 300 && r.estado < 400 && r.cabeceras.location) {
      if (i >= MAX_REDIRECCIONES) return { ok: false, url, error: 'demasiadas redirecciones' };
      const siguiente = new URL(r.cabeceras.location, actual).href;
      const m = redireccionPermitida(actual, siguiente);
      if (m) return { ok: false, url, error: m };
      actual = siguiente;
      continue;
    }
    break;
  }
  if (r.estado !== 200) return { ok: false, url, url_final: actual, error: `HTTP ${r.estado}` };
  const sha = createHash('sha256').update(r.cuerpo).digest('hex');
  const tipo = tipoDe(r.cabeceras, r.cuerpo);
  const texto = tipo === 'pdf' ? textoDePdf(r.cuerpo) : tipo === 'html' ? textoDeHtml(r.cuerpo.toString('utf8')) : tipo === 'texto' ? r.cuerpo.toString('utf8').normalize('NFC') : '';
  mkdirSync(PAGINAS, { recursive: true });
  writeFileSync(join(PAGINAS, `${sha}.gz`), gzipSync(r.cuerpo));
  writeFileSync(join(PAGINAS, `${sha}.txt.gz`), gzipSync(Buffer.from(texto, 'utf8')));
  const senales = senalesInyeccion(texto).length;
  const ficha = { ok: true, url, url_final: actual, consultada: hoy, tipo, bytes: r.cuerpo.length, caracteres_texto: texto.length, sha256: sha, senales_inyeccion: senales };
  if (tipo === 'pdf' && !texto) ficha.aviso = 'PDF sin texto extraíble: hace falta una fuente HTML equivalente';
  writeFileSync(join(PAGINAS, `${sha}.json`), JSON.stringify(ficha, null, 1));
  // índice URL → sha (la última descarga manda)
  appendFileSync(join(PAGINAS, '_indice.jsonl'), `${JSON.stringify({ url, url_final: actual, sha256: sha, consultada: hoy })}\n`);
  if (senales) {
    mkdirSync(resolve(INCIDENCIAS, '..'), { recursive: true });
    appendFileSync(INCIDENCIAS, `${JSON.stringify({ fecha: new Date().toISOString(), herramienta: 'traer', url, sha256: sha, senales })}\n`);
  }
  return ficha;
}

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    process.stderr.write('uso: node scripts/conocimiento/traer.mjs <url> [<url> …]\n');
    process.exit(2);
  }
  let fallos = 0;
  for (const u of urls) {
    let f;
    try {
      f = await traer(u);
    } catch (e) {
      f = { ok: false, url: u, error: String(e.message ?? e).slice(0, 200) };
    }
    if (!f.ok) fallos++;
    process.stdout.write(`${JSON.stringify(f)}\n`);
  }
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
