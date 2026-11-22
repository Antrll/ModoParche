// =====================================================================
// ModoParche · Edge Function contacto
//
// Recibe el formulario de equipo.html, verifica el captcha de Cloudflare
// Turnstile con la llave SECRETA y solo entonces guarda el mensaje con
// enviar_contacto_verificado (el navegador no puede llamarla directo).
// La llave service_role nunca sale de Supabase.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   TURNSTILE_SECRET  Secret Key del widget de Turnstile (la misma de Auth > Attack Protection)
//   ORIGENES_EXTRA    opcional: otros dominios permitidos, separados por coma
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen.
//
// Desplegar SIN verificación de JWT (es un formulario público):
//   supabase functions deploy contacto --no-verify-jwt
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ACCION = 'contactForm'; // mp-captcha.js usa el id del formulario como acción
const ORIGENES = new Set(['https://modoparche.vercel.app',
  ...(Deno.env.get('ORIGENES_EXTRA') ?? '').split(',').map((o) => o.trim()).filter(Boolean)]);

const corsDe = (origen: string) => ({
  ...(ORIGENES.has(origen) ? { 'Access-Control-Allow-Origin': origen } : {}),
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

// IP real de quien escribe (Supabase está detrás de Cloudflare)
export function ipDe(h: Headers): string {
  const ip = (h.get('cf-connecting-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') ?? '').split(',')[0] || '').trim();
  return /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : '';
}

// Solo los campos esperados, con su largo máximo
export function limpiarCuerpo(b: unknown) {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const t = (v: unknown, n: number) => String(v ?? '').slice(0, n);
  return {
    nombre: t(o.nombre, 80), correo: t(o.correo, 120), motivo: t(o.motivo, 20),
    mensaje: t(o.mensaje, 1500), sitio: t(o.sitio, 200), token: t(o.token, 2048),
  };
}

async function captchaValido(token: string, ip: string, secreto: string): Promise<boolean> {
  if (!token) return false;
  const form = new URLSearchParams({ secret: secreto, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const r = await fetch(VERIFICAR, { method: 'POST', body: form, signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    return d?.success === true && (!d.action || d.action === ACCION);
  } catch (_e) { return false; }
}

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? '';
  const CORS = corsDe(origen);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (origen && !ORIGENES.has(origen)) return json({ ok: false, codigo: 'ORIGEN' }, 403);
  if (req.method !== 'POST') return json({ ok: false, codigo: 'METODO' }, 405);

  const SECRETO = Deno.env.get('TURNSTILE_SECRET') ?? '';
  if (!SECRETO) return json({ ok: false, codigo: 'SIN_CONFIGURAR', hint: 'El formulario no está disponible en este momento. Escríbenos a modoparcheoficial@gmail.com.' }, 503);

  const datos = limpiarCuerpo(await req.json().catch(() => null));
  const ip = ipDe(req.headers);
  // Un bot que llena el campo oculto recibe "ok" sin gastar la verificación
  if (datos.sitio) return json({ ok: true });
  if (!(await captchaValido(datos.token, ip, SECRETO))) {
    return json({ ok: false, codigo: 'CAPTCHA', hint: 'No pudimos confirmar que eres una persona. Vuelve a intentar.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let { data, error } = await admin.rpc('enviar_contacto_verificado', {
    p_nombre: datos.nombre, p_correo: datos.correo, p_motivo: datos.motivo, p_mensaje: datos.mensaje, p_sitio: '', p_ip: ip,
  });
  // Si la migración de la Fase 3 todavía no se ha corrido, usa la función anterior
  // (así el formulario no se cae mientras se despliega en orden)
  if (error && (error.code === 'PGRST202' || /enviar_contacto_verificado/.test(error.message))) {
    ({ data, error } = await admin.rpc('enviar_contacto', {
      p_nombre: datos.nombre, p_correo: datos.correo, p_motivo: datos.motivo, p_mensaje: datos.mensaje, p_sitio: '',
    }));
  }
  if (error) { console.error('[contacto]', error.message); return json({ ok: false, codigo: 'SERVIDOR' }, 502); }
  return json(data && typeof data === 'object' ? data : { ok: false });
});
