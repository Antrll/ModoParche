/* =====================================================================
   ModoParche · service worker
   - Guarda lo básico del panel para que abra aunque no haya señal.
   - Páginas, JS y CSS: primero la red (siempre lo último) y, sin
     conexión, lo guardado. Imágenes y fuentes: primero lo guardado.
   - Supabase, mapas y otros sitios nunca pasan por aquí.
   - Muestra las notificaciones push (función enviar-push).
===================================================================== */
const VERSION = 'mp-v6';
const BASICO = [
  '/dashboard', '/offline', '/dashboard.css', '/dashboard.js', '/mp-mapa.js', '/mp-mapa.css', '/supabase-client.js',
  '/src/assets/web/isotipo-96.png', '/src/assets/web/isotipo-light-96.png', '/src/assets/web/logo-isotipo.webp', '/src/assets/fonts/Gagalin-Regular.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASICO)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/p/') || url.pathname.startsWith('/seguro/')) return;

  const estatico = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);
  if (estatico) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  // Red primero; sin conexión, lo guardado (y el panel para cualquier página)
  // cache: 'no-cache' = siempre preguntar al servidor si hay versión nueva
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok && (req.mode === 'navigate' || /\.(js|css)$/i.test(url.pathname))) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    if (req.mode !== 'navigate') return Response.error();
    // Sin red: el panel guardado si iba al panel; si no, la pantalla de sin conexión
    return (url.pathname.startsWith('/dashboard') ? caches.match('/dashboard') : Promise.resolve(null))
      .then(p => p || caches.match('/offline'))
      .then(p => p || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  })));
});

/* ---------- Notificaciones push ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  // Punto de aviso en el ícono de la app instalada (si el sistema lo permite)
  try { if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge().catch(() => {}); } catch (err) { /* no soportado */ }
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
  const destino = new URL((e.notification.data && e.notification.data.url) || '/dashboard', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const abierta = ws.find(w => new URL(w.url).pathname.startsWith('/dashboard'));
    if (abierta) return abierta.navigate(destino).then(w => (w || abierta).focus());
    return self.clients.openWindow(destino);
  }));
});
