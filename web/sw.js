// Service worker de la app instalable. No guarda nada en caché: finhub es local y siempre pide al servidor
// de tu equipo (tus datos no se copian a ningún almacén del navegador). Solo existe para poder instalarla.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* red directa: sin caché */
});
