#!/usr/bin/env node
// Proceso del servidor. Lo lanza la CLI (en segundo plano) o se ejecuta en primer plano.
// Uso: node src/server/principal.js --carpeta <ruta WSL> [--puerto N] [--ejemplo <dir temporal>]
import { parseArgs } from 'node:util';
import { App } from './app.js';
import { escribirServidor, borrarServidor } from './config.js';
import { limpiarEjemplo } from '../cli/ejemplo.js';

export async function arrancarServidor({ carpeta, puerto = 4747, ejemplo = null, log = (m) => console.log(m), env = process.env }) {
  const app = new App({ carpeta, puerto, ejemplo: !!ejemplo, env, log: (m) => log(`[${new Date().toISOString()}] ${m}`) });
  await app.iniciar();
  await escribirServidor({ pid: process.pid, puerto: app.puerto, url: app.url, carpeta: app.carpeta, ejemplo: !!ejemplo, inicio: new Date().toISOString() }, env);
  log(`finhub en ${app.url} · carpeta ${app.carpeta}${ejemplo ? ' (ejemplo temporal)' : ''}`);
  let parando = false;
  const parar = async (senal) => {
    if (parando) return;
    parando = true;
    log(`parando (${senal})…`);
    await app.parar().catch((e) => log(`error al parar: ${e.message}`));
    await borrarServidor(process.pid, env);
    if (ejemplo) await limpiarEjemplo(ejemplo).catch((e) => log(`no se pudo borrar el ejemplo temporal: ${e.message}`));
    log('parado');
    process.exit(0);
  };
  process.on('SIGTERM', () => parar('SIGTERM'));
  process.on('SIGINT', () => parar('SIGINT'));
  process.on('SIGHUP', () => parar('SIGHUP'));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { carpeta: { type: 'string' }, puerto: { type: 'string' }, ejemplo: { type: 'string' } } });
  if (!values.carpeta) {
    console.error('falta --carpeta');
    process.exit(2);
  }
  arrancarServidor({ carpeta: values.carpeta, puerto: values.puerto ? Number(values.puerto) : 4747, ejemplo: values.ejemplo ?? null }).catch((e) => {
    console.error(`no se pudo arrancar finhub: ${e.message}`);
    process.exit(1);
  });
}
