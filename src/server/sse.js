// Server-Sent Events: estado y texto en streaming (§2). Un canal por petición GET.
export class CanalSSE {
  constructor(res, { latidoMs = 15000 } = {}) {
    this.res = res;
    this.abierto = true;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write(': finhub\n\n');
    this.latido = setInterval(() => this.comentario('latido'), latidoMs);
    this.latido.unref?.();
    res.on('close', () => this.cerrar());
  }

  /** Envía un evento con datos JSON. Las líneas nuevas de los datos nunca rompen el formato. */
  enviar(evento, datos) {
    if (!this.abierto) return false;
    const json = JSON.stringify(datos ?? null);
    this.res.write(`event: ${String(evento).replace(/[\r\n]/g, '')}\ndata: ${json}\n\n`);
    return true;
  }

  comentario(texto) {
    if (this.abierto) this.res.write(`: ${String(texto).replace(/[\r\n]/g, ' ')}\n\n`);
  }

  cerrar() {
    if (!this.abierto) return;
    this.abierto = false;
    clearInterval(this.latido);
    this.res.end();
  }
}

/** Difusión a varios canales (p. ej. «la versión cambió»). */
export class Difusor {
  constructor() {
    this.canales = new Set();
  }
  anadir(canal) {
    this.canales.add(canal);
    canal.res.on('close', () => this.canales.delete(canal));
  }
  enviar(evento, datos) {
    for (const c of this.canales) c.enviar(evento, datos);
  }
  cerrarTodo() {
    for (const c of this.canales) c.cerrar();
    this.canales.clear();
  }
}
