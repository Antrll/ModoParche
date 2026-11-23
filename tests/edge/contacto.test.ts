import { assert, assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, llamadas, responder, rpc } from './simular.ts';

const h = await cargar('contacto', { TURNSTILE_SECRET: 'secreto-turnstile' });
const mod = await import('../../supabase/functions/contacto/index.ts');
const ORIGEN = 'https://modoparche.vercel.app';
const post = (b: unknown, extra: Record<string, string> = {}) => h(new Request('https://f/contacto', {
  method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', origin: ORIGEN, 'cf-connecting-ip': '181.50.1.2', ...extra },
}));
const turnstile = (ok: boolean, action = 'contactForm') => (l: { url: string }) => l.url.includes('turnstile/v0/siteverify') ? json({ success: ok, action }) : null;
const msg = { nombre: 'Ana', correo: 'ana@correo.co', motivo: 'empleo', mensaje: 'Quiero sumarme al equipo de ModoParche', token: 'tok' };

Deno.test('preflight CORS y origen ajeno', async () => {
  const r = await h(new Request('https://f/contacto', { method: 'OPTIONS', headers: { origin: ORIGEN } }));
  assertEquals(r.status, 204);
  assertEquals(r.headers.get('access-control-allow-origin'), ORIGEN);
  responder();
  assertEquals((await post(msg, { origin: 'https://evil.co' })).status, 403);
});

Deno.test('captcha válido: guarda con la IP real', async () => {
  let args: Record<string, unknown> = {};
  responder(turnstile(true), rpc('enviar_contacto_verificado', (c) => { args = c; return json({ ok: true }); }));
  const r = await post(msg);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).ok, true);
  assertEquals(args.p_ip, '181.50.1.2');
  assertEquals(args.p_motivo, 'empleo');
  const v = llamadas.find((l) => l.url.includes('siteverify'))!;
  assert(v.cuerpo.includes('secret=secreto-turnstile') && v.cuerpo.includes('remoteip=181.50.1.2'));
});

Deno.test('captcha falso o de otra acción: 400 y no guarda', async () => {
  responder(turnstile(false));
  assertEquals((await post(msg)).status, 400);
  responder(turnstile(true, 'otro-form'));
  assertEquals((await post(msg)).status, 400);
  assert(!llamadas.some((l) => l.url.includes('/rpc/')));
});

Deno.test('campo oculto lleno (bot): ok sin verificar ni guardar', async () => {
  responder();
  const r = await post({ ...msg, sitio: 'spam' });
  assertEquals((await r.json()).ok, true);
  assertEquals(llamadas.length, 0);
});

Deno.test('respuesta de la base (freno por IP) llega tal cual', async () => {
  responder(turnstile(true), rpc('enviar_contacto_verificado', () => json({ ok: false, codigo: 'DEMASIADOS', hint: 'Espera' })));
  const d = await (await post(msg)).json();
  assertEquals(d.codigo, 'DEMASIADOS');
});

Deno.test('ayudas: IP y campos recortados', () => {
  assertEquals(mod.ipDe(new Headers({ 'x-forwarded-for': '181.50.1.3, 10.0.0.1' })), '181.50.1.3');
  assertEquals(mod.ipDe(new Headers({ 'x-real-ip': '<script>' })), '');
  const d = mod.limpiarCuerpo({ nombre: 'a'.repeat(200), rol: 'admin' });
  assertEquals(d.nombre.length, 80);
  assert(!('rol' in d));
});

Deno.test('sin la migración nueva todavía: usa la función anterior y no se cae', async () => {
  let usada = '';
  responder(turnstile(true),
    rpc('enviar_contacto_verificado', () => json({ code: 'PGRST202', message: 'Could not find the function public.enviar_contacto_verificado' }, 404)),
    rpc('enviar_contacto', () => { usada = 'anterior'; return json({ ok: true }); }));
  const r = await post(msg);
  assertEquals((await r.json()).ok, true);
  assertEquals(usada, 'anterior');
});
