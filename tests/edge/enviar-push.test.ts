import { assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, llamadas, responder, SB, tabla } from './simular.ts';

const h = await cargar('enviar-push', { PUSH_WEBHOOK_SECRET: 'clave-webhook', VAPID_PUBLIC_KEY: 'BMeov5GPxN3yOgoZN3gCHsro4GK6HKccJJ2mjXdleNd5hJfhnuu92GAEMkm-1Uq_GA3SivyuOzzamKGarG6a2RU', VAPID_PRIVATE_KEY: 'PWiO0qWt6SgFLxvlIjdeG2rn6mAaQBKjq1L6jcBis8s' });
// Llaves VAPID generadas solo para estas pruebas (no son las del sitio). Se prueban los caminos sin envío real.
const mod = await import('../../supabase/functions/enviar-push/index.ts');
const post = (b: unknown, secreto = 'clave-webhook') => h(new Request('https://f/enviar-push', { method: 'POST', body: JSON.stringify(b), headers: { 'x-webhook-secret': secreto } }));

Deno.test('sin la clave del webhook: 401', async () => {
  responder();
  assertEquals((await post({}, 'otra')).status, 401);
});

Deno.test('el aviso del admin abre /admin y lleva el número del ícono', () => {
  const a = mod.armarAviso({ id: 9, texto: '<b>Nuevo mensaje</b> de empleo', parche_id: null }, { esAdmin: true, negocio: false, noLeidas: 4 });
  assertEquals(a.url, '/admin');
  assertEquals(a.badge, 4);
  assertEquals(a.body, 'Nuevo mensaje de empleo');
});
Deno.test('una persona va al parche; un negocio a su panel', () => {
  assertEquals(mod.armarAviso({ id: 1, texto: 'x', parche_id: 'p1' }, { esAdmin: false, negocio: false, noLeidas: 1 }).url, '/dashboard?parche=p1');
  assertEquals(mod.armarAviso({ id: 1, texto: 'x', parche_id: 'p1' }, { esAdmin: false, negocio: true, noLeidas: 1 }).url, '/empresa-dashboard');
  assertEquals(mod.armarAviso({ id: 1, texto: 'x' }, { esAdmin: false, negocio: false, noLeidas: 5000 }).badge, 999);
});

Deno.test('sin celulares registrados no consulta nada más', async () => {
  responder(tabla('push_suscripciones', () => json([])));
  const r = await post({ type: 'INSERT', record: { id: 1, usuario_id: 'u1', texto: 'hola' } });
  assertEquals((await r.json()).enviados, 0);
  assertEquals(llamadas.length, 1);
});

Deno.test('un endpoint que no es de un servicio push se borra', async () => {
  let borradas = '';
  responder(
    tabla('push_suscripciones', (l) => {
      if (l.metodo === 'DELETE') { borradas = new URL(l.url).searchParams.get('id') ?? ''; return new Response(null, { status: 204 }); }
      return json([{ id: 5, endpoint: 'https://evil.co/push', p256dh: 'a', auth: 'b' }]);
    }),
    tabla('admins', () => json(null)), tabla('negocios', () => json(null)),
    tabla('notificaciones', () => new Response(null, { headers: { 'content-range': '0-0/2' } })));
  const r = await post({ type: 'INSERT', record: { id: 1, usuario_id: 'u1', texto: 'hola' } });
  const d = await r.json();
  assertEquals(d.borradas, 1);
  assertEquals(borradas, 'in.(5)');
});

Deno.test('acepta los subdominios de Apple igual que la base', () => {
  const src = Deno.readTextFileSync(new URL('../../supabase/functions/enviar-push/index.ts', import.meta.url));
  const re = new RegExp(/HOSTS_PUSH = \/(.+)\/i;/.exec(src)![1], 'i');
  for (const host of ['web.push.apple.com', 'api.push.apple.com', 'fcm.googleapis.com', 'wns2-bl2p.notify.windows.com']) assertEquals(re.test(host), true, host);
  for (const host of ['push.apple.com.evil.co', 'evil.co']) assertEquals(re.test(host), false, host);
  void SB;
});

Deno.test('llaves VAPID mal copiadas: 503 claro, no un error sin manejar', async () => {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')!;
  Deno.env.set('VAPID_PUBLIC_KEY', 'mal-copiada');
  try {
    responder();
    const r = await post({ type: 'INSERT', record: { id: 1, usuario_id: 'u1', texto: 'hola' } });
    assertEquals(r.status, 503);
    assertEquals((await r.json()).error, 'PUSH_MAL_CONFIGURADO');
  } finally { Deno.env.set('VAPID_PUBLIC_KEY', pub); }
});
