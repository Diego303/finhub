// Tests sin red del descargador de la caché: qué redirecciones sigue y cómo saca el texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redireccionPermitida, dominioDeLista, textoDeHtml, traer } from '../../scripts/conocimiento/traer.mjs';

test('solo sigue redirecciones https al mismo dominio de la lista', () => {
  assert.equal(redireccionPermitida('https://www.boe.es/a', 'https://boe.es/b'), null);
  assert.equal(redireccionPermitida('https://www.boe.es/a', '/b'), null);
  assert.match(redireccionPermitida('https://www.boe.es/a', 'https://www.ine.es/b'), /otro dominio/);
  assert.match(redireccionPermitida('https://www.boe.es/a', 'http://www.boe.es/b'), /https/);
  assert.match(redireccionPermitida('https://www.boe.es/a', 'https://evil.example.com/'), /no está en/);
  assert.equal(dominioDeLista('cincodias.elpais.com'), 'elpais.com');
});

test('el texto sale sin scripts, estilos ni etiquetas, y con las entidades resueltas', () => {
  const t = textoDeHtml('<html><head><style>p{}</style><script>alert(1)</script></head><body><p>Tipo &amp; IPC: 2,5&nbsp;%</p><!-- oculto --><p>Espa&ntilde;a</p></body></html>');
  assert.equal(t, 'Tipo & IPC: 2,5 %\nEspaña');
});

test('rechaza sin abrir la red lo que la guardia no deja pasar', async () => {
  for (const u of ['http://www.boe.es/', 'https://example.com/', 'https://127.0.0.1/', 'https://user:pw@example.com/']) {
    const f = await traer(u);
    assert.equal(f.ok, false);
    assert.match(f.error, /guardia/);
  }
});
