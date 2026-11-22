import { assert, assertEquals } from 'jsr:@std/assert@1';
import { cargar, json, llamadas, responder, rpc, type Llamada } from './simular.ts';

const h = await cargar('conciliar-pagos', { CRON_SECRET: 'cron-123', WOMPI_PUBLIC_KEY: 'pub_test_1' });
const mod = await import('../../supabase/functions/conciliar-pagos/index.ts');
const post = (secreto = 'cron-123') => h(new Request('https://f/conciliar-pagos', { method: 'POST', headers: { 'x-cron-secret': secreto } }));
const SANDBOX = 'https://sandbox.wompi.co/v1';
const tx = (ref: string, status: string, id = 'tx-' + ref) => ({ id, reference: ref, status, amount_in_cents: 100000, currency: 'COP', payment_method_type: 'PSE', created_at: '2026-11-20T10:00:00Z' });

Deno.test('sin la clave del cron: 401; GET: 405', async () => {
  responder();
  assertEquals((await post('mala')).status, 401);
  assertEquals((await h(new Request('https://f/conciliar-pagos'))).status, 405);
});

Deno.test('con wompi_id: consulta el endpoint público y aplica lo que dice Wompi', async () => {
  const aplicados: Record<string, unknown>[] = [];
  let tarea: Record<string, unknown> = {};
  responder(
    rpc('sistema_pagos_por_conciliar', () => json([
      { referencia: 'MP-A', wompi_id: 'tx-A', creado_en: '2026-11-20' },
      { referencia: 'MP-B', wompi_id: 'tx-B', creado_en: '2026-11-20' },
    ])),
    (l: Llamada) => l.url === `${SANDBOX}/transactions/tx-A` ? json({ data: tx('MP-A', 'APPROVED', 'tx-A') }) : null,
    (l: Llamada) => l.url === `${SANDBOX}/transactions/tx-B` ? json({ data: tx('MP-B', 'PENDING', 'tx-B') }) : null,
    rpc('aplicar_pago_wompi', (c) => { aplicados.push(c); return json({ ok: true }); }),
    rpc('sistema_anotar_tarea', (c) => { tarea = c; return json(null); }));
  const d = await (await post()).json();
  assertEquals(d.aplicados, 1);
  assertEquals(d.siguen_pendientes, 1);
  assertEquals(aplicados.find((a) => a.p_referencia === 'MP-A')?.p_estado, 'APPROVED');
  // Ninguna consulta usó llave privada
  assert(llamadas.filter((l) => l.url.includes('wompi.co')).every((l) => !l.headers.get('authorization')));
  assertEquals(tarea.p_nombre, 'conciliar-pagos');
  assertEquals(tarea.p_ok, true);
});

Deno.test('sin wompi_id y sin llave privada: se salta sin tocar nada', async () => {
  responder(rpc('sistema_pagos_por_conciliar', () => json([{ referencia: 'MP-C', wompi_id: null, creado_en: '2026-11-20' }])), rpc('sistema_anotar_tarea', () => json(null)));
  const d = await (await post()).json();
  assertEquals(d.sin_llave, 1);
  assert(!llamadas.some((l) => l.url.includes('wompi.co') || l.url.includes('aplicar_pago_wompi')));
});

Deno.test('con llave privada: busca por referencia; sin transacción marca abandonado', async () => {
  Deno.env.set('WOMPI_PRIVATE_KEY', 'prv_test_xyz');
  try {
    let abandonado = '';
    const aplicados: string[] = [];
    responder(
      rpc('sistema_pagos_por_conciliar', () => json([
        { referencia: 'MP-D', wompi_id: null, creado_en: '2026-11-18' },
        { referencia: 'MP-E', wompi_id: null, creado_en: '2026-11-18' },
      ])),
      (l: Llamada) => l.url === `${SANDBOX}/transactions?reference=MP-D` && l.headers.get('authorization') === 'Bearer prv_test_xyz' ? json({ data: [] }) : null,
      (l: Llamada) => l.url === `${SANDBOX}/transactions?reference=MP-E` ? json({ data: [tx('MP-E', 'DECLINED', 'tx-1'), tx('MP-E', 'APPROVED', 'tx-2')] }) : null,
      rpc('sistema_pago_abandonado', (c) => { abandonado = String(c.p_referencia); return json(true); }),
      rpc('aplicar_pago_wompi', (c) => { aplicados.push(`${c.p_referencia}:${c.p_estado}:${c.p_wompi_id}`); return json({ ok: true }); }),
      rpc('sistema_anotar_tarea', () => json(null)));
    const d = await (await post()).json();
    assertEquals(abandonado, 'MP-D');
    assertEquals(d.abandonados, 1);
    assertEquals(aplicados, ['MP-E:APPROVED:tx-2']); // de varias, la aprobada
  } finally { Deno.env.delete('WOMPI_PRIVATE_KEY'); }
});

Deno.test('una transacción de otra referencia no se aplica', async () => {
  let tarea: Record<string, unknown> = {};
  responder(
    rpc('sistema_pagos_por_conciliar', () => json([{ referencia: 'MP-F', wompi_id: 'tx-F', creado_en: '2026-11-20' }])),
    (l: Llamada) => l.url.endsWith('/transactions/tx-F') ? json({ data: tx('MP-OTRA', 'APPROVED', 'tx-F') }) : null,
    rpc('sistema_anotar_tarea', (c) => { tarea = c; return json(null); }));
  const d = await (await post()).json();
  assertEquals(d.errores, 1);
  assertEquals(tarea.p_ok, false);
  assert(!llamadas.some((l) => l.url.includes('aplicar_pago_wompi')));
});

Deno.test('Wompi caído: cuenta el error y sigue con los demás', async () => {
  responder(
    rpc('sistema_pagos_por_conciliar', () => json([{ referencia: 'MP-G', wompi_id: 'tx-G', creado_en: '2026-11-20' }, { referencia: 'MP-H', wompi_id: 'tx-H', creado_en: '2026-11-20' }])),
    (l: Llamada) => l.url.endsWith('/transactions/tx-G') ? json({ error: 'caído' }, 503) : null,
    (l: Llamada) => l.url.endsWith('/transactions/tx-H') ? json({ data: tx('MP-H', 'APPROVED', 'tx-H') }) : null,
    rpc('aplicar_pago_wompi', () => json({ ok: true })), rpc('sistema_anotar_tarea', () => json(null)));
  const d = await (await post()).json();
  assertEquals(d.errores, 1);
  assertEquals(d.aplicados, 1);
});

Deno.test('elegirTransaccion: la aprobada o la más reciente', () => {
  assertEquals(mod.elegirTransaccion([]), null);
  assertEquals(mod.elegirTransaccion([{ status: 'DECLINED', created_at: '2026-01-01' }, { status: 'ERROR', created_at: '2026-02-01' }])?.status, 'ERROR');
});
