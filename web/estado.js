// Página provisional de F2: muestra /api/estado. Solo textContent (nunca innerHTML con datos).
const pre = document.getElementById('estado');
async function pintar() {
  try {
    const r = await fetch('/api/estado');
    const e = await r.json();
    pre.textContent = JSON.stringify({ carpeta: e.carpeta, version: e.version, soloLectura: e.soloLectura, candado: e.candado, conflictos: e.conflictos, nube: e.nube }, null, 2);
  } catch (err) {
    pre.textContent = `No se pudo leer el estado: ${err.message}`;
  }
}
pintar();
new EventSource('/api/eventos').addEventListener('version', pintar);
