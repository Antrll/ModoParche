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

// Igual que la regla de la base (private.push_valido): Apple usa varios subdominios de push.apple.com
const HOSTS_PUSH = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)$/i;
const endpointValido = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && HOSTS_PUSH.test(x.hostname); } catch { return false; } };
// El aviso que ve el celular: a dónde lleva y el número del ícono
export function armarAviso(n: { id?: unknown; texto?: string; parche_id?: string | null }, quien: { esAdmin: boolean; negocio: boolean; noLeidas: number }) {
  // El equipo abre el panel admin; un negocio, su panel; una persona, su radar (y el parche)
  const base = quien.esAdmin ? '/admin' : quien.negocio ? '/empresa-dashboard' : '/dashboard';
  return {
    title: 'ModoParche',
    body: limpiar(n.texto ?? ''),
    url: quien.esAdmin || quien.negocio ? base : (n.parche_id ? `${base}?parche=${n.parche_id}` : base),
    tag: n.parche_id ? `parche-${n.parche_id}` : `mp-${n.id}`,
    badge: Math.max(0, Math.min(Math.round(Number(quien.noLeidas) || 0), 999)),
  };
}

// Compara huellas de igual largo para no filtrar el secreto por tiempo
async function mismoSecreto(a: string, b: string): Promise<boolean> {
  const h = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);
  const secreto = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  if (!secreto || !(await mismoSecreto(req.headers.get('x-webhook-secret') ?? '', secreto))) return json({ error: 'NO_AUTORIZADO' }, 401);

  const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? '', prv = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!pub || !prv) return json({ error: 'PUSH_SIN_CONFIGURAR' }, 503);
  try { webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:equipo@modoparche.co', pub, prv); }
  catch (e) {
    // Llaves mal copiadas en los secretos: se dice claro en vez de caerse en cada aviso
    console.error('[push] llaves VAPID inválidas:', (e as Error).message);
    return json({ error: 'PUSH_MAL_CONFIGURADO' }, 503);
  }

  const body = await req.json().catch(() => ({}));
  const n = body?.record;
  if (body?.type !== 'INSERT' || !n?.usuario_id) return json({ ok: true, enviados: 0 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', n.usuario_id).order('id', { ascending: false }).limit(5);
  if (error) { console.error('[push]', error.message); return json({ error: 'ERROR_INTERNO' }, 500); }
  if (!subs?.length) return json({ ok: true, enviados: 0 });
  const [{ data: esAdmin }, { data: negocio }, { count: noLeidas }] = await Promise.all([
    admin.from('admins').select('id').eq('id', n.usuario_id).maybeSingle(),
    admin.from('negocios').select('id').eq('id', n.usuario_id).maybeSingle(),
    admin.from('notificaciones').select('id', { count: 'exact', head: true }).eq('usuario_id', n.usuario_id).eq('leida', false),
  ]);
  const payload = JSON.stringify(armarAviso(n, { esAdmin: !!esAdmin, negocio: !!negocio, noLeidas: noLeidas ?? 0 }));

  let enviados = 0;
  const vencidas: number[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    if (!endpointValido(s.endpoint)) { vencidas.push(s.id); return; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      enviados++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) vencidas.push(s.id); // el navegador ya no la acepta
      else console.error('[push] no se envió', code ?? '', (e as Error)?.message ?? e);
    }
  }));
  if (vencidas.length) await admin.from('push_suscripciones').delete().in('id', vencidas);
  return json({ ok: true, enviados, borradas: vencidas.length });
});
