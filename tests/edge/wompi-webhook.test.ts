import { assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, llamadas, responder, rpc, sha256 } from './simular.ts';

const SECRETO = 'test_events_abc123';
const h = await cargar('wompi-webhook', { WOMPI_EVENTS_SECRET: SECRETO });

async function evento(over: Record<string, unknown> = {}, firmaMala = false) {
  const tx = { id: '1234-1700000000-12345', status: 'APPROVED', amount_in_cents: 5000000, reference: 'MP-LIQ-7-ABC', currency: 'COP', payment_method_type: 'CARD', ...(over.tx as object ?? {}) };
  const timestamp = (over.timestamp as number) ?? Math.floor(Date.now() / 1000);
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = firmaMala ? 'x'.repeat(64) : await sha256(`${tx.id}${tx.status}${tx.amount_in_cents}${timestamp}${SECRETO}`);
  return { event: 'transaction.updated', data: { transaction: tx }, environment: over.environment ?? 'test', signature: { properties: props, checksum }, timestamp, sent_at: new Date().toISOString() };
}
const post = (b: unknown) => h(new Request('https://f/wompi-webhook', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }));

Deno.test('GET responde 405', async () => {
  const r = await h(new Request('https://f/wompi-webhook'));
  assertEquals(r.status, 405);
  assertEquals(r.headers.get('allow'), 'POST');
});

Deno.test('evento bien firmado aplica el pago con los datos de Wompi', async () => {
  let recibido: Record<string, unknown> = {};
  responder(rpc('aplicar_pago_wompi', (c) => { recibido = c; return json({ ok: true }); }));
  const r = await post(await evento());
  assertEquals(r.status, 200);
  assertEquals(recibido.p_referencia, 'MP-LIQ-7-ABC');
  assertEquals(recibido.p_estado, 'APPROVED');
  assertEquals(recibido.p_monto, 5000000);
});

Deno.test('firma falsa: 401 y no toca la base', async () => {
  responder();
  const r = await post(await evento({}, true));
  assertEquals(r.status, 401);
  assertEquals(llamadas.length, 0);
});

Deno.test('evento viejo (más de 72 h): 401', async () => {
  responder();
  const r = await post(await evento({ timestamp: Math.floor(Date.now() / 1000) - 80 * 3600 }));
  assertEquals(r.status, 401);
});

Deno.test('entorno deducido del secreto: un evento de producción con secreto de pruebas se ignora', async () => {
  responder();
  const r = await post(await evento({ environment: 'prod' }));
  assertEquals(r.status, 200);
  assertEquals(await r.text(), 'otro entorno');
  assertEquals(llamadas.length, 0);
});

Deno.test('referencia que no es de ModoParche se ignora', async () => {
  responder();
  const r = await post(await evento({ tx: { reference: 'OTRA-COSA' } }));
  assertEquals(r.status, 200);
  assertEquals(llamadas.length, 0);
});

Deno.test('si la base falla devuelve 500 para que Wompi reintente', async () => {
  responder(rpc('aplicar_pago_wompi', () => json({ message: 'caída' }, 500)));
  const r = await post(await evento());
  assertEquals(r.status, 500);
});
