// =====================================================================
// ModoParche · /api/contacto (Vercel Serverless Function)
//
// Recibe el formulario de contacto de equipo.html, valida los campos,
// frena spam por IP/honeypot y guarda el mensaje en Supabase:
//   - Con SUPABASE_SERVICE_ROLE_KEY (si está en Vercel): enviar_contacto_verificado
//   - Sin llave de servicio: enviar_contacto (usando la llave pública anon)
// =====================================================================
const SB_URL = 'https://quxqqxnowlwiahorifpy.supabase.co';
const { SB_ANON } = require('./_config.js');

const VERIFICAR_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MOTIVOS_OK = new Set(['contacto', 'empleo', 'negocio', 'prensa', 'otro']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ORIGENES = new Set([
  'https://modoparche.vercel.app',
  'https://modoparche-hazel.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

const VENTANA_MS = 60 * 60 * 1000;
const LIMITE_IP = 5;
const cubetas = new Map();

function permitirIp(ip) {
  const ahora = Date.now();
  const clave = ip || 'sin-ip';
  const arr = (cubetas.get(clave) || []).filter(t => ahora - t < VENTANA_MS);
  if (arr.length >= LIMITE_IP) {
    cubetas.set(clave, arr);
    return false;
  }
  arr.push(ahora);
  cubetas.set(clave, arr);
  if (cubetas.size > 1000) {
    for (const [k, v] of cubetas) {
      if (!v.length || ahora - v[v.length - 1] > VENTANA_MS) cubetas.delete(k);
    }
  }
  return true;
}

function ipDe(req) {
  const h = req.headers || {};
  const raw = String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim();
  return /^[0-9a-f.:]{3,45}$/i.test(raw) ? raw : '';
}

function origenOk(req) {
  const origen = String((req.headers && req.headers.origin) || '');
  if (!origen) return true;
  if (ORIGENES.has(origen)) return true;
  if (/^https:\/\/modoparche-[a-z0-9-]+-mode-parche\.vercel\.app$/i.test(origen)) return true;
  return false;
}

async function verificarTurnstile(token, ip, secreto) {
  if (!secreto) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret: secreto, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await fetch(VERIFICAR_TURNSTILE, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(6000),
    });
    const d = await r.json().catch(() => null);
    return !!(d && d.success === true);
  } catch {
    return false;
  }
}

async function guardarEnSupabase(datos, ip) {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const rpc = serviceKey ? 'enviar_contacto_verificado' : 'enviar_contacto';
  const key = serviceKey || SB_ANON;
  const payload = serviceKey
    ? { p_nombre: datos.nombre, p_correo: datos.correo, p_motivo: datos.motivo, p_mensaje: datos.mensaje, p_sitio: '', p_ip: ip }
    : { p_nombre: datos.nombre, p_correo: datos.correo, p_motivo: datos.motivo, p_mensaje: datos.mensaje, p_sitio: '' };

  const r = await fetch(`${SB_URL}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!origenOk(req)) return res.status(403).json({ ok: false, codigo: 'ORIGEN', hint: 'Origen no permitido.' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, codigo: 'METODO', hint: 'Usa POST.' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const limpiar = (v, n) => String(v ?? '').trim().slice(0, n);
  const nombre = limpiar(b.nombre, 80);
  const correo = limpiar(b.correo, 120);
  const motivo = MOTIVOS_OK.has(String(b.motivo || '')) ? String(b.motivo) : 'contacto';
  const mensaje = limpiar(b.mensaje, 1500);
  const sitio = limpiar(b.sitio, 200);
  const token = limpiar(b.token, 2048);

  // Honeypot anti-bots: responde ok sin guardar
  if (sitio) return res.status(200).json({ ok: true });

  if (nombre.length < 2) return res.status(400).json({ ok: false, codigo: 'NOMBRE', hint: 'Escribe tu nombre (mínimo 2 letras).' });
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ ok: false, codigo: 'CORREO', hint: 'Escribe un correo válido para poder responderte.' });
  if (mensaje.length < 10) return res.status(400).json({ ok: false, codigo: 'MENSAJE', hint: 'Escribe un mensaje un poco más largo (mínimo 10 letras).' });

  const ip = ipDe(req);
  if (!permitirIp(ip)) {
    return res.status(429).json({ ok: false, codigo: 'LIMITE', hint: 'Ya recibimos varios mensajes tuyos hace poco. Intenta en una hora.' });
  }

  const secretoTurnstile = (process.env.TURNSTILE_SECRET || '').trim();
  if (secretoTurnstile && !(await verificarTurnstile(token, ip, secretoTurnstile))) {
    return res.status(400).json({ ok: false, codigo: 'CAPTCHA', hint: 'No pudimos confirmar que eres una persona. Intenta de nuevo.' });
  }

  try {
    const resDb = await guardarEnSupabase({ nombre, correo, motivo, mensaje }, ip);
    if (resDb.ok && resDb.body && resDb.body.ok === true) {
      return res.status(200).json({ ok: true });
    }
    if (resDb.body && resDb.body.hint) {
      return res.status(resDb.ok ? 200 : 400).json({ ok: false, codigo: 'VALIDACION', hint: resDb.body.hint });
    }
    return res.status(503).json({
      ok: false,
      codigo: 'BuzonNoDisponible',
      hint: 'El buzón automático se está activando. Puedes enviarlo directo por correo o WhatsApp con un toque aquí abajo.',
    });
  } catch {
    return res.status(502).json({
      ok: false,
      codigo: 'SERVIDOR',
      hint: 'No pudimos conectar con el servidor. Puedes enviarlo directo por correo o WhatsApp aquí abajo.',
    });
  }
};
