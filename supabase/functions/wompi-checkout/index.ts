// =====================================================================
// ModoParche · Edge Function wompi-checkout
//
// 1. { plan: 'villavo' }  -> crea la fila en "pagos" y devuelve lo que el
//    widget de Wompi necesita: llave pública, referencia, monto y la firma
//    de integridad. El secreto de integridad nunca sale del servidor.
// 2. { accion: 'confirmar', transaccion: '<id de Wompi>' } -> le pregunta a
//    Wompi el estado real de la transacción y lo aplica (por si el webhook
//    tarda). Nunca confía en lo que diga el navegador.
//
// Secretos (Supabase > Edge Functions > Secrets, o `supabase secrets set`):
//   WOMPI_PUBLIC_KEY        pub_test_... o pub_prod_...
//   WOMPI_INTEGRITY_SECRET  test_integrity_... o prod_integrity_...
//   PRECIO_VILLAVO_CENTAVOS opcional (plan mensual del modelo anterior)
//   PERMITIR_COBROS_REALES  si (obligatorio con llaves pub_prod_: cobra dinero real)
//
// 3. { liquidacion: <id>, monto?: <pesos> } -> pago del estado de cuenta del cobro
//    por resultados. Sin monto se paga el saldo exacto de la base; con monto es un
//    abono (mínimo $20.000). Al cubrir el saldo queda pagado solo.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya vienen.
//
// Desplegar: supabase functions deploy wompi-checkout
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405);

  const PUBLIC_KEY = Deno.env.get('WOMPI_PUBLIC_KEY') ?? '';
  const INTEGRITY = Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? '';
  if (!PUBLIC_KEY || !INTEGRITY) return json({ error: 'PAGOS_SIN_CONFIGURAR' }, 503);
  // Proyecto académico: solo modo de pruebas. Las llaves de producción (cobro
  // real) se rechazan salvo que se active a propósito PERMITIR_COBROS_REALES=si.
  if (PUBLIC_KEY.startsWith('pub_prod_') && Deno.env.get('PERMITIR_COBROS_REALES') !== 'si') {
    return json({ error: 'COBROS_REALES_DESACTIVADOS' }, 403);
  }
  const API = PUBLIC_KEY.startsWith('pub_prod_') ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
  const PRECIOS: Record<string, number> = { villavo: Number(Deno.env.get('PRECIO_VILLAVO_CENTAVOS') ?? 7990000) };

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Quién llama (con su propia sesión)
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: 'SIN_SESION' }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // ---------- Confirmar una transacción con Wompi ----------
  if (body.accion === 'confirmar') {
    const id = String(body.transaccion ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
    if (!id) return json({ error: 'SIN_TRANSACCION' }, 400);
    const r = await fetch(`${API}/transactions/${id}`);
    if (!r.ok) return json({ error: 'WOMPI_NO_RESPONDE' }, 502);
    const tx = (await r.json()).data;
    // Solo se aplica si la referencia es de un pago de quien llama
    const { data: pago } = await admin.from('pagos').select('negocio_id').eq('referencia', tx?.reference ?? '').maybeSingle();
    if (!pago || pago.negocio_id !== user.id) return json({ error: 'NO_ES_TUYO' }, 403);
    const { data, error } = await admin.rpc('aplicar_pago_wompi', {
      p_referencia: tx.reference, p_estado: tx.status, p_wompi_id: tx.id,
      p_metodo: tx.payment_method_type ?? null, p_monto: tx.amount_in_cents, p_moneda: tx.currency,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ estado: tx.status, resultado: data });
  }

  // Freno: máximo 6 intentos de pago por hora por negocio
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const intentos = async () => {
    const { count } = await admin.from('pagos').select('id', { count: 'exact', head: true }).eq('negocio_id', user.id).gte('creado_en', haceUnaHora);
    return count ?? 0;
  };

  // ---------- Pagar un estado de cuenta (cobro por resultados) ----------
  // El valor sale de la base, nunca del navegador: el negocio no puede cambiarlo.
  if (body.liquidacion != null) {
    const liqId = Number(body.liquidacion);
    if (!Number.isInteger(liqId) || liqId <= 0) return json({ error: 'LIQUIDACION_INVALIDA' }, 400);
    // deno-lint-ignore no-explicit-any
    let liq: any = null;
    const r1 = await admin.from('liquidaciones')
      .select('id, negocio_id, referencia, total_cop, pagado_cop, estado').eq('id', liqId).maybeSingle();
    liq = r1.data;
    if (r1.error && /pagado_cop/.test(r1.error.message)) {
      // Sin la migración de abonos: se paga el total
      liq = (await admin.from('liquidaciones').select('id, negocio_id, referencia, total_cop, estado').eq('id', liqId).maybeSingle()).data;
    }
    if (!liq || liq.negocio_id !== user.id) return json({ error: 'NO_ES_TUYO' }, 403);
    if (liq.estado === 'pagada') return json({ error: 'YA_PAGADA' }, 409);
    const saldo = Math.round(Number(liq.total_cop) - Number(liq.pagado_cop ?? 0));
    if (liq.estado !== 'pendiente' || !(saldo > 0)) return json({ error: 'NO_SE_PUEDE_PAGAR' }, 409);
    // Abono: desde $20.000 (o el saldo si es menor) hasta el saldo. Sin monto, se paga todo.
    const MIN_ABONO = 20000;
    let pesos = saldo;
    if (body.monto != null) {
      const m = Math.round(Number(body.monto));
      if (!Number.isFinite(m) || m < Math.min(MIN_ABONO, saldo) || m > saldo) return json({ error: 'MONTO_INVALIDO', saldo, minimo: Math.min(MIN_ABONO, saldo) }, 400);
      pesos = m;
    }
    if ((await intentos()) >= 6) return json({ error: 'DEMASIADOS' }, 429);

    const { data: negocio } = await admin.from('negocios').select('id, nombre, nit, telefono, responsable').eq('id', user.id).maybeSingle();
    if (!negocio) return json({ error: 'NO_ES_NEGOCIO' }, 403);

    const montoLiq = pesos * 100; // pesos -> centavos
    // Referencia única por intento (Wompi no acepta repetirla), empieza por MP- para el webhook
    const referenciaLiq = `${liq.referencia}-${Date.now().toString(36)}`.toUpperCase().slice(0, 64);
    const firmaLiq = await sha256hex(`${referenciaLiq}${montoLiq}COP${INTEGRITY}`);
    const { error: eIns } = await admin.from('pagos').insert({
      negocio_id: user.id, referencia: referenciaLiq, plan: 'liquidacion', liquidacion_id: liq.id, monto_centavos: montoLiq, moneda: 'COP',
    });
    if (eIns) return json({ error: /liquidacion_id|pagos_plan_check/.test(eIns.message) ? 'FALTA_MIGRACION' : eIns.message }, 500);

    return json({
      publicKey: PUBLIC_KEY, reference: referenciaLiq, amountInCents: montoLiq, currency: 'COP', signature: firmaLiq,
      customer: {
        email: user.email ?? '',
        fullName: (negocio.responsable || negocio.nombre || '').slice(0, 80),
        phoneNumber: String(negocio.telefono ?? '').replace(/\D/g, ''),
        legalId: String(negocio.nit ?? '').replace(/\D/g, '').slice(0, 15),
        legalIdType: 'NIT',
      },
    });
  }

  // ---------- Crear un cobro del plan mensual (modelo anterior) ----------
  const plan = String(body.plan ?? 'villavo');
  const monto = PRECIOS[plan];
  if (!monto) return json({ error: 'PLAN_INVALIDO' }, 400);

  const { data: negocio } = await admin.from('negocios').select('id, nombre, nit, telefono, responsable').eq('id', user.id).maybeSingle();
  if (!negocio) return json({ error: 'NO_ES_NEGOCIO' }, 403);

  if ((await intentos()) >= 6) return json({ error: 'DEMASIADOS' }, 429);

  const referencia = `MP-${user.id.slice(0, 8)}-${Date.now().toString(36)}`.toUpperCase();
  const moneda = 'COP';
  const firma = await sha256hex(`${referencia}${monto}${moneda}${INTEGRITY}`);

  const { error } = await admin.from('pagos').insert({ negocio_id: user.id, referencia, plan, monto_centavos: monto, moneda });
  if (error) return json({ error: error.message }, 500);

  return json({
    publicKey: PUBLIC_KEY,
    reference: referencia,
    amountInCents: monto,
    currency: moneda,
    signature: firma,
    customer: {
      email: user.email ?? '',
      fullName: (negocio.responsable || negocio.nombre || '').slice(0, 80),
      phoneNumber: String(negocio.telefono ?? '').replace(/\D/g, ''),
      legalId: String(negocio.nit ?? '').replace(/\D/g, '').slice(0, 15),
      legalIdType: 'NIT',
    },
  });
});
