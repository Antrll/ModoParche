// =====================================================================
// ModoParche · /seguro/<token>  (Vercel Function)
// Lo que ve el contacto de confianza: la última ubicación de la persona,
// cuándo se actualizó y a qué parche va. Se refresca sola cada 20 s.
// No necesita cuenta; solo funciona con el enlace (token de 64 letras)
// y deja de mostrar la ubicación cuando la persona deja de compartir.
// =====================================================================
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SB_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const { SB_ANON } = require('./_config.js');

module.exports = (req, res) => {
  const token = String((req.query && req.query.t) || '').replace(/[^0-9a-f]/gi, '').slice(0, 64);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  // OpenStreetMap bloquea (403) los mosaicos que llegan sin Referer. Con
  // strict-origin solo se envía el dominio, nunca la ruta con el token.
  res.setHeader('Referrer-Policy', 'strict-origin');
  res.status(200).send(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Ubicación en vivo · ModoParche</title>
<link rel="icon" href="/src/assets/Branding/favicon/favicon.ico">
<link rel="stylesheet" href="/src/vendor/leaflet/leaflet.css">
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
  #a { margin-top: 6px; padding: 10px 12px; border-radius: 12px; font-size: 14px; font-weight: 700; line-height: 1.4; }
  #a.alerta { background: #ff6a4a; color: #111; }
  #a.ok { background: #1f7a4a; color: #fff; }
</style>
</head><body data-token="${esc(token)}" data-url="${esc(SB_URL)}" data-key="${esc(SB_ANON)}">
<header>
  <small>ModoParche · Ubicación en vivo</small>
  <h1 id="t">Cargando…</h1>
  <p id="s"></p>
  <p id="a" role="alert" hidden></p>
</header>
<div id="map" role="img" aria-label="Mapa con la ubicación"></div>
<footer>
  <span class="estado" id="e"></span>
  <span><a class="btn maps" id="g" href="#" target="_blank" rel="noopener">Abrir en Google Maps</a> <a class="btn sos" href="tel:123">Llamar al 123</a></span>
</footer>
<script src="/src/vendor/leaflet/leaflet.js"></script>
<script src="/mp-seguro-vivo.js"></script>
</body></html>`);
};
