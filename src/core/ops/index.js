// Punto de entrada de las operaciones: registra todas y reexporta el motor.
import './genericas.js';
import './mes.js';
import './catalogos.js';
import './cartera.js';
import './metas.js';

export { aplicarOp, operaciones, ErrorOp } from './motor.js';
