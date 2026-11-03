// Registro de los trabajos de Claude (§0.2, §2.1). Cada uno se declara en su fichero.
import pulso from './pulso.js';
import precios from './precios.js';
import datos from './datos.js';
import ingesta from './ingesta.js';
import conocimiento from './conocimiento.js';
import privado from './privado.js';
import rexWeb from './rex-web.js';
import descubrir from './descubrir.js';
import encaje from './encaje.js';

export const TRABAJOS = [pulso, precios, datos, ingesta, conocimiento, privado, rexWeb, descubrir, encaje];
export const trabajo = (id) => TRABAJOS.find((t) => t.id === id) ?? null;

/** Resumen público de cada trabajo (para el modal R1 de la web). */
export const resumenTrabajos = () => TRABAJOS.map((t) => ({ id: t.id, nombre: t.nombre, internet: t.internet, privado: t.privado, externo: t.externo, herramientas: t.herramientas, recibe: t.recibe, escribe: t.escribe, modelo: t.modelo }));
