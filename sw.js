/* =====================================================================
   ModoParche · service worker
   - Guarda lo básico del panel para que abra aunque no haya señal.
   - Páginas, JS y CSS: primero la red y, sin conexión, lo guardado.
   - Imágenes, fuentes y librerías propias: primero lo guardado.
   - Nunca guarda el panel admin, la API ni nada de otros sitios.
   - Muestra las notificaciones push (función enviar-push) y pone en el
     ícono de la app el número de avisos sin leer.
   - Una versión nueva espera a que la persona toque "Actualizar" (la
     página le manda ACTUALIZAR); la primera instalación entra de una.
===================================================================== */
const VERSION = 'mp-v10';
const BASICO = [
  '/dashboard', '/offline', '/offline.js', '/manifest.webmanifest', '/mp-init.js', '/mp-errores.js', '/dashboard.css', '/dashboard.js', '/mp-utils.js', '/mp-seguro.js',
  '/mp-mapa.js', '/mp-mapa.css', '/mp-checkin.js', '/mp-verificacion.js', '/mp-verificacion.css', '/mp-tema.js', '/mp-tema.css', '/mp-cargando.js', '/mp-base.css', '/legal.js',
  '/supabase-client.js', '/src/vendor/supabase.js', '/src/vendor/leaflet/leaflet.js', '/src/vendor/leaflet/leaflet.css',
  '/src/assets/web/isotipo-96.png', '/src/assets/web/isotipo-light-96.png', '/src/assets/web/logo-isotipo.webp', '/src/assets/fonts/Gagalin-Regular.woff2',
  // Panel de negocios: abre sin señal en solo lectura (lista del Modo Puerta)
  '/empresa-dashboard', '/empresa-dashboard.js', '/empresa-dashboard.css', '/mp-seguridad-biz.js', '/legal.css', '/src/vendor/qrcode.js',
];
// Panel al que vuelve cada ruta cuando no hay conexión
const PANELES = ['/empresa-dashboard', '/dashboard'];
const privada = p => /^\/(admin|api|p|seguro)(\/|\.html$|$)/.test(p) || p.startsWith('/admin.');

self.addEventListener('install', e => {
  // Uno por uno: si falla un archivo, los demás quedan guardados
  // Si ya había una versión activa, la nueva espera a que la página pida ACTUALIZAR:
  // así nadie queda con una página vieja hablando con archivos nuevos a mitad de uso.
  const primeraVez = !self.registration.active;
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(BASICO.map(u => c.add(u)))).then(() => { if (primeraVez) return self.skipWaiting(); }));
});
self.addEventListener('message', e => {
  if (e.data && e.data.tipo === 'ACTUALIZAR') self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || privada(url.pathname)) return;

  const estatico = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.startsWith('/src/vendor/') || /\.[a-f0-9]{8}\.(js|css)$/.test(url.pathname);
  if (estatico) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok && (req.mode === 'navigate' || /\.(js|css)$/i.test(url.pathname))) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    if (req.mode !== 'navigate') return Response.error();
    const panel = PANELES.find(x => url.pathname.startsWith(x));
    return (panel ? caches.match(panel) : Promise.resolve(null))
      .then(p => p || caches.match('/offline'))
      .then(p => p || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  })));
});

/* ---------- Notificaciones push ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  // Número real de avisos sin leer (si no viene, solo el punto)
  try {
    if (self.navigator && self.navigator.setAppBadge) {
      const n = Number(d.badge);
      (Number.isFinite(n) && n > 0 ? self.navigator.setAppBadge(Math.min(Math.round(n), 999)) : self.navigator.setAppBadge()).catch(() => {});
    }
  } catch (err) { /* no soportado */ }
  e.waitUntil(self.registration.showNotification(d.title || 'ModoParche', {
    body: d.body || 'Hay novedades en tus parches.',
    icon: '/src/assets/Branding/favicon/android-chrome-192x192.png',
    badge: '/src/assets/Branding/favicon/favicon-32x32.png',
    tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || '/dashboard' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  // Solo se abren páginas del propio sitio
  let destino;
  try { destino = new URL((e.notification.data && e.notification.data.url) || '/dashboard', self.location.origin); }
  catch (err) { destino = new URL('/dashboard', self.location.origin); }
  if (destino.origin !== self.location.origin) destino = new URL('/dashboard', self.location.origin);
  const panel = ['/empresa-dashboard', '/admin', '/dashboard'].find(x => destino.pathname.startsWith(x)) || '/dashboard';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const abierta = ws.find(w => new URL(w.url).pathname.startsWith(panel));
    if (abierta) return abierta.navigate(destino.href).then(w => (w || abierta).focus());
    return self.clients.openWindow(destino.href);
  }));
});
