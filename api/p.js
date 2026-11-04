// =====================================================================
// ModoParche · /p/<id>  (Vercel Function)
// Página para compartir un parche. WhatsApp, Instagram y Telegram leen
// las etiquetas og:* para mostrar la vista previa (foto, título, cuándo
// y dónde). El botón lleva al parche dentro del dashboard.
// Usa la llave pública (anon) y la función parche_publico(), que solo
// entrega datos del plan: nada de quién va ni del chat.
// =====================================================================
const SB_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eHFxeG5vd2x3aWFob3JpZnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzMzMTIsImV4cCI6MjEwODIwOTMxMn0.rO4W027LLI5CR-wz753KFzyYiLAn-I-avLre7nbVoII';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cuando(iso) {
  const d = new Date(iso), tz = 'America/Bogota';
  const dia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(d);
  const hora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(d);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora}`;
}

function pagina({ origin, p }) {
  const url = p ? `${origin}/p/${p.id}` : origin;
  const abrir = p ? `/dashboard?parche=${encodeURIComponent(p.id)}` : '/dashboard';
  let img = `${origin}/src/assets/web/banner.jpg`;
  if (p && p.imagen) {
    if (p.imagen.startsWith('https://')) img = p.imagen;
    else if (p.imagen.startsWith('/src/')) img = origin + p.imagen.replace(/\.webp$/, '-og.jpg');
  }
  const titulo = p ? p.titulo : 'Este parche ya pasó o no existe';
  const lugar = p ? (p.lugar === 'Por confirmar' ? 'Lugar por confirmar' : `${p.lugar}${p.barrio ? ', ' + p.barrio : ''}`) : '';
  const desc = p ? `${cuando(p.inicio)} · ${lugar}${p.van ? ` · ${p.van} ${p.van === 1 ? 'parcero va' : 'parceros van'}` : ''}` : 'Mira los planes que se están armando en Villavicencio.';
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · ModoParche</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ModoParche">
<meta property="og:title" content="${esc(p && p.oficial ? '👑 ' + titulo : titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#111111">
<link rel="icon" href="/src/assets/Branding/favicon/favicon.ico">
<style>
  :root { --ink:#111; --paper:#fff; --orange:#FF5A1F; }
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100svh; display: grid; place-items: center; padding: 24px 16px; background: var(--ink); color: var(--paper); font: 16px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  .card { width: min(440px, 100%); border-radius: 24px; overflow: hidden; background: #1c1c1c; }
  .card img { display: block; width: 100%; max-height: 360px; object-fit: cover; object-position: top; background: #222; }
  .body { padding: 22px; display: grid; gap: 10px; }
  .k { color: var(--orange); font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
  h1 { font-size: 26px; line-height: 1.15; }
  p { color: rgba(255,255,255,.78); }
  .btn { display: block; margin-top: 8px; padding: 15px 18px; border-radius: 999px; text-align: center; font-weight: 800; text-decoration: none; background: var(--orange); color: var(--ink); }
  .btn:focus-visible { outline: 3px solid var(--paper); outline-offset: 3px; }
  .sub { text-align: center; font-size: 14px; }
  .sub a { color: var(--paper); }
</style>
</head><body>
<main class="card">
  <img src="${esc(img)}" alt="">
  <div class="body">
    <p class="k">${p && p.oficial ? 'Parche oficial · ModoParche' : 'Te invitaron a un parche'}</p>
    <h1>${esc(titulo)}</h1>
    <p>${esc(desc)}</p>
    ${p && p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
    <a class="btn" href="${esc(abrir)}">${p ? 'Abrir el parche en ModoParche' : 'Ver los parches de hoy'}</a>
    <p class="sub">¿No tienes cuenta? <a href="/login#crear">Créala en 1 minuto</a></p>
  </div>
</main>
</body></html>`;
}

module.exports = async (req, res) => {
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const id = String((req.query && req.query.id) || '').trim();
  let p = null;
  if (UUID.test(id)) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/parche_publico`, {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: id }),
      });
      if (r.ok) p = await r.json();
    } catch (e) { p = null; }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(p ? 200 : 404).send(pagina({ origin, p }));
};
