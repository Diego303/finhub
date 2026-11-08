// QA3.1–2 · Ficheros solo en la nube y conflictos: con la carpeta sincronizada simulada, en temporales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { Almacen, ERRORES_NUBE } from '../../src/server/almacen.js';
import { App } from '../../src/server/app.js';
import { leer } from '../../src/core/formato/index.js';
import { items } from '../../src/core/formato/motor.js';
import { crearEntorno, pedir } from '../qa/entorno.js';

const MES = 'mes/2026-11.md';
async function conApp(fn, { nombre = 'sinc', preparar = async () => {} } = {}) {
  const ent = await crearEntorno({ nombre });
  await preparar(ent);
  const app = await new App({ carpeta: ent.datos, puerto: 0, env: ent.env, guardarConfig: false }).iniciar();
  const srv = { url: app.url.replace(/\/$/, ''), puerto: app.puerto };
  try {
    await fn(app, srv, ent, (...a) => pedir(srv, ...a));
  } finally {
    await app.parar();
    await ent.limpiar();
  }
}
const OP = (op, args) => ['POST', '/api/ops', { op, args }];

test('cada error de la nube (EIO, ETIMEDOUT, EBUSY…): reintenta con espera, no da vacío y conserva lo último bueno', async () => {
  for (const code of ['EIO', 'ETIMEDOUT', 'EBUSY', 'EAGAIN']) {
    assert.ok(ERRORES_NUBE.has(code));
    const ent = await crearEntorno({ nombre: 'nube', ficheros: [['cuentas.md', 'bueno\n']] });
    try {
      let lecturas = 0;
      let falla = false;
      const fs = { ...fsp, stat: fsp.stat.bind(fsp), readdir: fsp.readdir.bind(fsp), readFile: async (p, ...r) => {
        if (falla && String(p).endsWith('cuentas.md')) {
          lecturas++;
          throw Object.assign(new Error('x'), { code });
        }
        return fsp.readFile(p, ...r);
      } };
      const a = await new Almacen({ raiz: ent.datos, fs, reintentos: [1, 1, 1] }).cargar();
      falla = true;
      await fsp.writeFile(join(ent.datos, 'cuentas.md'), 'cambiado\n');
      await a.barrer();
      assert.equal(lecturas, 4, `${code}: un intento y tres reintentos`);
      assert.deepEqual(a.noLegibles(), [{ ruta: 'cuentas.md', error: 'nube', codigo: code }]);
      assert.equal(a.obtener('cuentas.md').texto, 'bueno\n');
      assert.throws(() => a.texto('cuentas.md'), /en la nube/);
      await assert.rejects(a.escribir({ 'cuentas.md': 'x\n' }), (e) => e.codigo === 'nube');
      assert.equal(await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8'), 'cambiado\n', 'no se pisa');
      falla = false;
      await a.barrer();
      assert.equal(a.texto('cuentas.md'), 'cambiado\n', 'al volver, se lee');
      assert.deepEqual(a.noLegibles(), []);
    } finally {
      await ent.limpiar();
    }
  }
});

test('con un fichero solo en la nube: ninguna operación, cierre, saldo ni copia lo reescribe; la API lo avisa', async () => {
  await conApp(async (app, srv, ent, api) => {
    // marcador de 0 bytes en cuentas y en el mes: lo que deja un cliente con «Archivos a petición»
    const estado = await api('GET', '/api/estado');
    assert.deepEqual(estado.json.nube.map((n) => n.ruta).sort(), ['cuentas.md', MES].sort());
    const datos = await api('GET', '/api/datos');
    assert.equal(datos.json.ficheros[MES].error, 'nube');
    assert.equal(datos.json.ficheros[MES].texto, undefined, 'nunca llega como vacío');
    assert.equal((await api('GET', `/api/fichero?ruta=${MES}`)).estado, 503);
    for (const [op, args] of [['mov.crear', { mov: { fecha: '2026-11-03', concepto: 'x', importe: -1, grupo: 'ocio' } }], ['mes.cerrar', { mes: '2026-11' }], ['cuenta.ajustarSaldo', { cuenta: 'banco', fecha: '2026-11-03', saldo: 1 }], ['lista.crear', { ruta: 'cuentas.md', valor: { id: 'x', nombre: 'x', tipo: 'corriente' } }], ['mes.cambiarInicio', { dia: 25 }]]) {
      const r = await api(...OP(op, args));
      assert.equal(r.estado, 503, `${op}: ${r.texto}`);
      assert.match(r.json.error, /nube|no se puede leer/);
    }
    assert.equal((await fsp.stat(join(ent.datos, MES))).size, 0);
    assert.equal((await fsp.stat(join(ent.datos, 'cuentas.md'))).size, 0);
    // otra operación sí escribe, y la copia del día no incluye un vacío
    assert.equal((await api(...OP('hito.crear', { fecha: '2026-11-06', texto: 'x' }))).estado, 200);
    await app.copias.enCurso;
    const dia = (await fsp.readdir(join(ent.datos, '.finhub/copias')))[0];
    await assert.rejects(fsp.stat(join(ent.datos, '.finhub/copias', dia, MES)), { code: 'ENOENT' }, 'en la copia no se mete un vacío');
    // al descargarse vuelve todo
    const ej = await fsp.readFile(join(ent.base, 'mes-bueno.md'), 'utf8');
    await fsp.writeFile(join(ent.datos, MES), ej);
    await app.almacen.barrer();
    assert.ok(!(await api('GET', '/api/estado')).json.nube.some((n) => n.ruta === MES));
  }, {
    nombre: 'marcador',
    preparar: async (ent) => {
      await fsp.copyFile(join(ent.datos, MES), join(ent.base, 'mes-bueno.md'));
      await fsp.writeFile(join(ent.datos, MES), '');
      await fsp.writeFile(join(ent.datos, 'cuentas.md'), '');
    },
  });
});

const CONFLICTOS = ['mes/2026-11-PORTATIL.md', 'mes/2026-11-PORTATIL-2.md', 'mes/2026-11 (conflicted copy 2026-11-05).md', 'mes/2026-11.sync-conflict-20261105-101010-ABC.md'];

test('conflictos: se detectan todos los patrones; ninguno entra en los datos; patrones propios en ajustes', async () => {
  await conApp(async (app, srv, ent, api) => {
    const est = (await api('GET', '/api/estado')).json;
    assert.deepEqual(est.conflictos.map((c) => c.ruta).sort(), CONFLICTOS.slice().sort());
    assert.ok(est.conflictos.every((c) => c.base === MES));
    const datos = (await api('GET', '/api/datos')).json.ficheros;
    for (const c of CONFLICTOS) assert.equal(datos[c], undefined, `${c} no se trata como dato`);
    // uno con el nombre de otro servicio aún no se conoce…
    await fsp.writeFile(join(ent.datos, 'mes/2026-11 (conflicto de Pepe).md'), 'x');
    await app.almacen.barrer();
    assert.equal((await api('GET', '/api/estado')).json.conflictos.length, CONFLICTOS.length);
    // …hasta que añades su patrón
    assert.equal((await api(...OP('ajustes.fijar', { clave: 'conflictos', valor: '{nombre} (conflicto *).md' }))).estado, 200);
    await app.almacen.barrer();
    assert.equal((await api('GET', '/api/estado')).json.conflictos.length, CONFLICTOS.length + 1);
  }, {
    nombre: 'patrones',
    preparar: async (ent) => {
      for (const c of CONFLICTOS) await fsp.writeFile(join(ent.datos, c), await fsp.readFile(join(ent.datos, MES)));
    },
  });
});

test('conflicto en un mes con movimientos distintos: fusionar no pierde ninguno; lo descartado va a la papelera', async () => {
  const COPIA = 'mes/2026-11-PORTATIL.md';
  await conApp(async (app, srv, ent, api) => {
    const antes = items(leer(MES, app.almacen.texto(MES), { diaInicio: 1 }), 'Movimientos');
    const v = await api('GET', `/api/conflicto?ruta=${encodeURIComponent(COPIA)}`);
    assert.equal(v.estado, 200);
    assert.ok(v.json.diferencias.some((d) => d.soloOtra.some((l) => /Del portátil/.test(l))), 'diferencias por entidad');
    const r = await api('POST', '/api/conflicto/resolver', { ruta: COPIA, modo: 'fusionar' });
    assert.equal(r.estado, 200);
    assert.equal(r.json.papelera.length, 2);
    const texto = await fsp.readFile(join(ent.datos, MES), 'utf8');
    const despues = items(leer(MES, texto), 'Movimientos');
    for (const m of antes) assert.ok(despues.some((x) => x.id === m.id), `sigue ${m.concepto}`);
    assert.ok(despues.some((x) => x.concepto === 'Del portátil'));
    await assert.rejects(fsp.stat(join(ent.datos, COPIA)), { code: 'ENOENT' });
    assert.deepEqual((await api('GET', '/api/estado')).json.conflictos, []);
    // y lo descartado se puede recuperar
    const pap = (await api('GET', '/api/papelera')).json.entradas;
    assert.ok(pap.some((e) => e.tipo === 'conflicto' && e.ruta === COPIA));
    const res = await api('POST', '/api/papelera/restaurar', { id: pap.find((e) => e.ruta === COPIA).id });
    assert.equal(res.estado, 200);
    assert.equal((await api('GET', '/api/estado')).json.conflictos.length, 1, 'vuelve a aparecer como conflicto');
  }, {
    nombre: 'fusion',
    preparar: async (ent) => {
      const t = await fsp.readFile(join(ent.datos, MES), 'utf8');
      await fsp.writeFile(join(ent.datos, COPIA), t.replace('## Movimientos\n', '## Movimientos\n- 2026-11-02 | Del portátil | -9,99 | ocio | cuenta: banco | id: zzzz\n'));
    },
  });
});

test('quedarse con una: «tuya» y «otra»; la que se descarta se conserva', async () => {
  const COPIA = 'cuentas-PORTATIL.md';
  for (const modo of ['tuya', 'otra', 'hecho']) {
    await conApp(async (app, srv, ent, api) => {
      const tuya = await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8');
      const r = await api('POST', '/api/conflicto/resolver', { ruta: COPIA, modo });
      assert.equal(r.estado, 200, r.texto);
      const ahora = await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8');
      assert.equal(ahora, modo === 'otra' ? `${tuya}- caja2 | Caja dos | tipo: efectivo\n` : tuya);
      assert.equal((await api('GET', '/api/papelera')).json.entradas.filter((e) => e.tipo === 'conflicto').length, 1);
      assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: COPIA, modo })).estado, 404, 'ya no existe');
      assert.equal((await api('POST', '/api/conflicto/resolver', { ruta: '../../etc/passwd', modo })).estado, 404);
    }, {
      nombre: `elegir-${modo}`,
      preparar: async (ent) => fsp.writeFile(join(ent.datos, COPIA), `${await fsp.readFile(join(ent.datos, 'cuentas.md'), 'utf8')}- caja2 | Caja dos | tipo: efectivo\n`),
    });
  }
});
