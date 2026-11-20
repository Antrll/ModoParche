// =====================================================================
// ModoParche · Edge Function enviar-push
//
// Recibe el "Database Webhook" de Supabase cuando se crea una fila en
// public.notificaciones y manda la notificación push a cada celular o
// navegador donde esa persona activó los avisos.
//
// Secretos (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY     la misma que está en dashboard.js
//   VAPID_PRIVATE_KEY    privada (está en .env.local, nunca en git)
//   VAPID_SUBJECT        mailto:equipo@modoparche.co
//   PUSH_WEBHOOK_SECRET  clave que el webhook manda en el encabezado x-webhook-secret
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen.
//
// Desplegar: supabase functions deploy enviar-push --no-verify-jwt
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// El texto de las notificaciones trae <b>…</b>: se quita para el aviso del sistema
const limpiar = (t: string) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').slice(0, 180);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);
  const secreto = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  if (!secreto || req.headers.get('x-webhook-secret') !== secreto) return json({ error: 'NO_AUTORIZADO' }, 401);

  const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? '', prv = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!pub || !prv) return json({ error: 'PUSH_SIN_CONFIGURAR' }, 503);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:equipo@modoparche.co', pub, prv);

  const body = await req.json().catch(() => ({}));
  const n = body?.record;
  if (body?.type !== 'INSERT' || !n?.usuario_id) return json({ ok: true, enviados: 0 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', n.usuario_id);
  if (error) return json({ error: error.message }, 500);

  const payload = JSON.stringify({
    title: 'ModoParche',
    body: limpiar(n.texto),
    url: n.parche_id ? `/dashboard?parche=${n.parche_id}` : '/dashboard',
    tag: n.parche_id ? `parche-${n.parche_id}` : `mp-${n.id}`,
  });

  let enviados = 0;
  const vencidas: number[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      enviados++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) vencidas.push(s.id); // el navegador ya no la acepta
    }
  }));
  if (vencidas.length) await admin.from('push_suscripciones').delete().in('id', vencidas);
  return json({ ok: true, enviados, borradas: vencidas.length });
});
