import { assert, assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, llamadas, responder, rpc, sha256, SB, tabla, type Llamada } from './simular.ts';

const INTEGRIDAD = 'test_integrity_xyz';
const h = await cargar('wompi-checkout', { WOMPI_PUBLIC_KEY: 'pub_test_123', WOMPI_INTEGRITY_SECRET: INTEGRIDAD });
const NEG = '11111111-1111-4111-8111-111111111111';
const ORIGEN = 'https://modoparche.vercel.app';

const usuario = (id: string | null) => (l: Llamada) =>
  l.url === `${SB}/auth/v1/user` ? (id ? json({ id, email: 'local@x.co', aud: 'authenticated', role: 'authenticated' }) : json({ message: 'invalid' }, 401)) : null;
const post = (b: unknown, origen = ORIGEN) => h(new Request('https://f/wompi-checkout', {
  method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', origin: origen, authorization: 'Bearer token-del-negocio' },
}));
// HEAD con count=exact: PostgREST responde el total en content-range
const conteo = (n: number) => new Response(null, { status: 200, headers: { 'content-range': `0-0/${n}` } });

Deno.test('preflight CORS solo para el origen del sitio', async () => {
  const r = await h(new Request('https://f/wompi-checkout', { method: 'OPTIONS', headers: { origin: ORIGEN } }));
  assertEquals(r.headers.get('access-control-allow-origin'), ORIGEN);
  const r2 = await post({}, 'https://evil.co');
  assertEquals(r2.status, 403);
});

Deno.test('sin sesión: 401', async () => {
  responder(usuario(null));
  assertEquals((await post({ accion: 'confirmar', transaccion: 'abc' })).status, 401);
});

Deno.test('confirmar: una persona (no negocio, sin pagos) no llega a Wompi', async () => {
  responder(usuario(NEG), tabla('negocios', () => json(null)), tabla('pagos', () => conteo(0)));
  const r = await post({ accion: 'confirmar', transaccion: 'tx-1' });
  assertEquals(r.status, 403);
  assert(!llamadas.some((l) => l.url.includes('wompi.co')));
});

Deno.test('confirmar: frenado antes de llamar a Wompi', async () => {
  responder(usuario(NEG), tabla('negocios', () => json({ id: NEG })), tabla('pagos', () => conteo(1)), rpc('sistema_permitir_intento', () => json(false)));
  const r = await post({ accion: 'confirmar', transaccion: 'tx-1' });
  assertEquals(r.status, 429);
  assert(!llamadas.some((l) => l.url.includes('wompi.co')));
});

Deno.test('confirmar: pago propio se aplica con lo que dice Wompi', async () => {
  let aplicado: Record<string, unknown> = {};
  responder(usuario(NEG),
    (l) => l.url === 'https://sandbox.wompi.co/v1/transactions/tx-1' ? json({ data: { id: 'tx-1', reference: 'MP-LIQ-1-A', status: 'APPROVED', amount_in_cents: 2000000, currency: 'COP' } }) : null,
    tabla('negocios', () => json({ id: NEG })),
    tabla('pagos', (l) => l.metodo === 'HEAD' ? conteo(1) : json({ negocio_id: NEG })),
    rpc('sistema_permitir_intento', () => json(true)),
    rpc('aplicar_pago_wompi', (c) => { aplicado = c; return json({ ok: true }); }));
  const r = await post({ accion: 'confirmar', transaccion: 'tx-1' });
  assertEquals(r.status, 200);
  assertEquals((await r.json()).estado, 'APPROVED');
  assertEquals(aplicado.p_referencia, 'MP-LIQ-1-A');
});

Deno.test('confirmar: el pago de otro negocio no se aplica', async () => {
  responder(usuario(NEG),
    (l) => l.url.includes('/transactions/tx-2') ? json({ data: { id: 'tx-2', reference: 'MP-OTRO', status: 'APPROVED', amount_in_cents: 1, currency: 'COP' } }) : null,
    tabla('negocios', () => json({ id: NEG })),
    tabla('pagos', (l) => l.metodo === 'HEAD' ? conteo(1) : json({ negocio_id: 'otro' })),
    rpc('sistema_permitir_intento', () => json(true)));
  assertEquals((await post({ accion: 'confirmar', transaccion: 'tx-2' })).status, 403);
  assert(!llamadas.some((l) => l.url.includes('aplicar_pago_wompi')));
});

Deno.test('pagar estado de cuenta: el valor sale de la base y la firma es la de Wompi', async () => {
  let insertado: Record<string, unknown> = {};
  responder(usuario(NEG),
    tabla('liquidaciones', () => json({ id: 7, negocio_id: NEG, referencia: 'MP-LIQ-7', total_cop: 50000, pagado_cop: 10000, estado: 'pendiente' })),
    tabla('pagos', (l) => {
      if (l.metodo === 'HEAD') return conteo(0);
      if (l.metodo === 'POST') { insertado = JSON.parse(l.cuerpo); return new Response(null, { status: 201 }); }
      return null;
    }),
    tabla('negocios', () => json({ id: NEG, nombre: 'Los Capachos', nit: '900123456-1', telefono: '3001234567', responsable: 'Laura' })));
  const r = await post({ liquidacion: 7 });
  assertEquals(r.status, 200);
  const d = await r.json();
  assertEquals(d.amountInCents, 4000000); // saldo 40.000 pesos
  assertEquals(d.signature, await sha256(`${d.reference}${d.amountInCents}COP${INTEGRIDAD}`));
  assert(String(d.reference).startsWith('MP-LIQ-7-'));
  assertEquals(insertado.monto_centavos, 4000000);
});

Deno.test('pagar: abono por debajo del mínimo se rechaza', async () => {
  responder(usuario(NEG), tabla('liquidaciones', () => json({ id: 7, negocio_id: NEG, referencia: 'MP-LIQ-7', total_cop: 50000, pagado_cop: 0, estado: 'pendiente' })));
  assertEquals((await post({ liquidacion: 7, monto: 5000 })).status, 400);
});

Deno.test('pagar: estado de cuenta de otro negocio', async () => {
  responder(usuario(NEG), tabla('liquidaciones', () => json({ id: 7, negocio_id: 'otro', estado: 'pendiente', total_cop: 1 })));
  assertEquals((await post({ liquidacion: 7 })).status, 403);
});
