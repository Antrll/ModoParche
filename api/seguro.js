// =====================================================================
// ModoParche · /seguro/<token>  (Vercel Function)
// Lo que ve el contacto de confianza: la última ubicación de la persona,
// cuándo se actualizó y a qué parche va. Se refresca sola cada 20 s.
// No necesita cuenta; solo funciona con el enlace (token de 64 letras)
// y deja de mostrar la ubicación cuando la persona deja de compartir.
// =====================================================================
const SB_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const { SB_ANON } = require('./_config.js');

module.exports = (req, res) => {
  const token = String((req.query && req.query.t) || '').replace(/[^0-9a-f]/gi, '').slice(0, 64);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.status(200).send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Ubicación en vivo · ModoParche</title>
<link rel="icon" href="/src/assets/Branding/favicon/favicon.ico">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100svh; display: grid; grid-template-rows: auto 1fr auto; background: #111; color: #fff; font: 16px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  header { padding: 16px 18px; display: grid; gap: 4px; }
  header small { color: #FF5A1F; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; font-size: 12px; }
  header h1 { font-size: 22px; line-height: 1.2; }
  header p { color: rgba(255,255,255,.75); font-size: 14px; }
  #map { min-height: 60svh; }
  footer { padding: 14px 18px calc(14px + env(safe-area-inset-bottom)); display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 18px; border-radius: 999px; font-weight: 800; text-decoration: none; }
  .sos { background: #ff6a4a; color: #111; }
  .maps { background: #fff; color: #111; }
  .estado { font-size: 13px; color: rgba(255,255,255,.7); }
  .apagada { padding: 40px 20px; text-align: center; }
</style>
</head><body>
<header>
  <small>ModoParche · Ubicación en vivo</small>
  <h1 id="t">Cargando…</h1>
  <p id="s"></p>
</header>
<div id="map" role="img" aria-label="Mapa con la ubicación"></div>
<footer>
  <span class="estado" id="e"></span>
  <span><a class="btn maps" id="g" href="#" target="_blank" rel="noopener">Abrir en Google Maps</a> <a class="btn sos" href="tel:123">Llamar al 123</a></span>
</footer>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var TOKEN = ${JSON.stringify(token)}, URL_ = ${JSON.stringify(SB_URL)}, KEY = ${JSON.stringify(SB_ANON)};
  var map = L.map('map').setView([4.142, -73.6266], 13), pin = null, circulo = null, primera = true;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  function hace(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h';
  }
  function cargar() {
    fetch(URL_ + '/rest/v1/rpc/ubicacion_por_token', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: TOKEN }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { document.getElementById('t').textContent = 'Este enlace no existe o ya venció'; document.getElementById('s').textContent = 'Pídele a la persona que lo vuelva a compartir.'; return; }
        document.getElementById('t').textContent = d.nombre + (d.activa ? ' está compartiendo su ubicación' : ' dejó de compartir su ubicación');
        document.getElementById('s').textContent = d.parche ? 'Va al parche "' + d.parche.titulo + '" en ' + d.parche.lugar : '';
        if (d.lat == null) { document.getElementById('e').textContent = 'Esperando la primera ubicación…'; return; }
        var ll = [d.lat, d.lng];
        if (!pin) { pin = L.marker(ll).addTo(map); circulo = L.circle(ll, { radius: d.precision || 30, color: '#FF5A1F', weight: 1.5, fillOpacity: .12 }).addTo(map); }
        else { pin.setLatLng(ll); circulo.setLatLng(ll).setRadius(d.precision || 30); }
        if (primera) { map.setView(ll, 16); primera = false; }
        document.getElementById('e').textContent = 'Actualizado ' + hace(d.actualizado) + (d.activa ? ' · se refresca solo' : ' · última ubicación conocida');
        document.getElementById('g').href = 'https://maps.google.com/?q=' + d.lat + ',' + d.lng;
      })
      .catch(function () { document.getElementById('e').textContent = 'Sin conexión. Reintentando…'; });
  }
  cargar(); setInterval(cargar, 20000);
</script>
</body></html>`);
};
