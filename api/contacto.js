// =====================================================================
// ModoParche · /api/contacto  (Vercel Function)
// Recibe el formulario de equipo.html, verifica el captcha de Cloudflare
// Turnstile con la llave SECRETA y solo entonces guarda el mensaje con
// enviar_contacto_verificado (que el navegador no puede llamar directo).
//
// Variables de entorno en Vercel (Settings > Environment Variables):
//   TURNSTILE_SECRET           Secret Key del widget de Turnstile
//   SUPABASE_SERVICE_ROLE_KEY  Supabase > Project Settings > API > service_role
// Sin alguna de las dos, el formulario responde que no está disponible.
// =====================================================================
const SB_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ACCION = 'contactForm'; // mp-captcha.js usa el id del formulario como acción

// IP de quien escribe: Vercel pone la real en x-real-ip / x-forwarded-for
function ipDe(req) {
  const h = (req && req.headers) || {};
  const ip = String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim();
  return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : '';
}

// Solo deja pasar los campos esperados, con su largo máximo
function limpiarCuerpo(b) {
  const t = (v, n) => String(v == null ? '' : v).slice(0, n);
  b = b && typeof b === 'object' ? b : {};
  return {
    p_nombre: t(b.nombre, 80), p_correo: t(b.correo, 120), p_motivo: t(b.motivo, 20),
    p_mensaje: t(b.mensaje, 1500), p_sitio: t(b.sitio, 200), token: t(b.token, 2048),
  };
}

async function captchaValido(token, ip, secreto) {
  if (!token) return false;
  const form = new URLSearchParams({ secret: secreto, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await fetch(VERIFICAR, { method: 'POST', body: form, signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    return !!(d && d.success === true && (!d.action || d.action === ACCION));
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const responder = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return responder(405, { ok: false, codigo: 'METODO' }); }

  const SECRETO = process.env.TURNSTILE_SECRET || '';
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SECRETO || !SERVICE) return responder(503, { ok: false, codigo: 'SIN_CONFIGURAR', hint: 'El formulario no está disponible en este momento. Escríbenos a modoparcheoficial@gmail.com.' });

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch (e) { cuerpo = null; } }
  const datos = limpiarCuerpo(cuerpo);
  const ip = ipDe(req);

  // Un bot que llena el campo oculto recibe "ok" sin gastar la verificación
  if (datos.p_sitio) return responder(200, { ok: true });
  if (!(await captchaValido(datos.token, ip, SECRETO))) {
    return responder(400, { ok: false, codigo: 'CAPTCHA', hint: 'No pudimos confirmar que eres una persona. Vuelve a intentar.' });
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/enviar_contacto_verificado`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_nombre: datos.p_nombre, p_correo: datos.p_correo, p_motivo: datos.p_motivo,
        p_mensaje: datos.p_mensaje, p_sitio: '', p_ip: ip,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { console.error('[contacto]', r.status); return responder(502, { ok: false, codigo: 'SERVIDOR' }); }
    const d = await r.json();
    return responder(200, d && typeof d === 'object' ? d : { ok: false });
  } catch (e) {
    console.error('[contacto]', e && e.message);
    return responder(502, { ok: false, codigo: 'SERVIDOR' });
  }
};
module.exports.ipDe = ipDe;
module.exports.limpiarCuerpo = limpiarCuerpo;
