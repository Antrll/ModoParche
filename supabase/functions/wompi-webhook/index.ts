// =====================================================================
// ModoParche · Edge Function wompi-webhook
//
// Wompi llama aquí cada vez que una transacción cambia de estado
// (evento transaction.updated). Revisamos la firma del evento con el
// secreto de eventos y, si es válida, aplicamos el pago: el plan del
// negocio sube a Parche Villavo por 30 días.
//
// Secretos:
//   WOMPI_EVENTS_SECRET  test_events_... o prod_events_...
//   WOMPI_ENTORNO        opcional: 'test' o 'prod' para rechazar eventos del otro entorno
//
// Desplegar SIN verificación de JWT (Wompi no manda sesión de Supabase):
//   supabase functions deploy wompi-webhook --no-verify-jwt
// URL para Wompi > Desarrolladores > URL de eventos:
//   https://<tu-proyecto>.supabase.co/functions/v1/wompi-webhook
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

async function sha256hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// "transaction.amount_in_cents" -> data.transaction.amount_in_cents
function valor(data: Record<string, unknown>, ruta: string): string {
  const v = ruta.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data);
  return v === undefined || v === null ? '' : String(v);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const SECRETO = Deno.env.get('WOMPI_EVENTS_SECRET') ?? '';
  if (!SECRETO) return new Response('sin configurar', { status: 503 });

  const evento = await req.json().catch(() => null);
  if (!evento || !evento.signature || !evento.data) return new Response('evento invalido', { status: 400 });

  // Firma: SHA256(valores de signature.properties + timestamp + secreto de eventos)
  const props: string[] = Array.isArray(evento.signature.properties) ? evento.signature.properties : [];
  const cadena = props.map((p) => valor(evento.data, p)).join('') + String(evento.timestamp ?? '') + SECRETO;
  const esperado = await sha256hex(cadena);
  if (esperado.toLowerCase() !== String(evento.signature.checksum ?? '').toLowerCase()) {
    return new Response('firma invalida', { status: 401 });
  }

  const entorno = Deno.env.get('WOMPI_ENTORNO');
  if (entorno && evento.environment && evento.environment !== entorno) return new Response('otro entorno');
  if (evento.event !== 'transaction.updated') return new Response('ok');

  const tx = evento.data.transaction ?? {};
  if (!String(tx.reference ?? '').startsWith('MP-')) return new Response('ok'); // no es de ModoParche

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('aplicar_pago_wompi', {
    p_referencia: tx.reference, p_estado: tx.status, p_wompi_id: tx.id,
    p_metodo: tx.payment_method_type ?? null, p_monto: tx.amount_in_cents, p_moneda: tx.currency,
  });
  // Si falla, devolvemos 500 para que Wompi lo reintente
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
});
