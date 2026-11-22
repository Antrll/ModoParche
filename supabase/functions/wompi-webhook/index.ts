// =====================================================================
// ModoParche · Edge Function wompi-webhook
//
// Wompi llama aquí cada vez que una transacción cambia de estado
// (evento transaction.updated). Revisamos la firma del evento con el
// secreto de eventos y, si es válida, aplicamos el pago al estado de cuenta.
//
// Secretos:
//   WOMPI_EVENTS_SECRET  test_events_... o prod_events_...
//   WOMPI_ENTORNO        opcional: 'test' o 'prod' para rechazar eventos del otro entorno.
//                        Si no está, se deduce del secreto (prod_events_ -> prod, test_events_ -> test).
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
  const v = ruta.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? (o as Record<string, unknown>)[k] : undefined), data);
  return v === undefined || v === null ? '' : String(v);
}

// Compara sin revelar por tiempo en qué carácter falla
function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}
// Entorno esperado: el configurado o, si no hay, el que dice el prefijo del secreto
function entornoEsperado(configurado: string | undefined, secreto: string): string | null {
  const c = String(configurado ?? '').trim().toLowerCase();
  if (c === 'prod' || c === 'test') return c;
  if (secreto.startsWith('prod_events_')) return 'prod';
  if (secreto.startsWith('test_events_')) return 'test';
  return null;
}
const OBLIGATORIAS = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
const VENTANA_MS = 72 * 3600_000; // Wompi reintenta hasta por un día

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo no permitido', { status: 405, headers: { Allow: 'POST' } });
  const SECRETO = Deno.env.get('WOMPI_EVENTS_SECRET') ?? '';
  if (!SECRETO) return new Response('sin configurar', { status: 503 });

  const evento = await req.json().catch(() => null);
  if (!evento || !evento.signature || !evento.data) return new Response('evento invalido', { status: 400 });

  // Firma: SHA256(valores de signature.properties + timestamp + secreto de eventos)
  const props: string[] = Array.isArray(evento.signature.properties) ? evento.signature.properties.map(String) : [];
  if (!OBLIGATORIAS.every((c) => props.includes(c))) return new Response('firma incompleta', { status: 401 });
  const cadena = props.map((p) => valor(evento.data, p)).join('') + String(evento.timestamp ?? '') + SECRETO;
  const esperado = await sha256hex(cadena);
  if (!iguales(esperado, String(evento.signature.checksum ?? '').toLowerCase())) {
    return new Response('firma invalida', { status: 401 });
  }
  // El timestamp puede venir en segundos o milisegundos
  const ts = Number(evento.timestamp);
  const ms = ts < 1e12 ? ts * 1000 : ts;
  if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > VENTANA_MS) return new Response('evento vencido', { status: 401 });

  const entorno = entornoEsperado(Deno.env.get('WOMPI_ENTORNO'), SECRETO);
  if (entorno && evento.environment !== entorno) return new Response('otro entorno');
  if (evento.event !== 'transaction.updated') return new Response('ok');

  const tx = evento.data.transaction ?? {};
  if (!String(tx.reference ?? '').startsWith('MP-')) return new Response('ok'); // no es de ModoParche

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('aplicar_pago_wompi', {
    p_referencia: tx.reference, p_estado: tx.status, p_wompi_id: tx.id,
    p_metodo: tx.payment_method_type ?? null, p_monto: tx.amount_in_cents, p_moneda: tx.currency,
  });
  // Si falla, devolvemos 500 para que Wompi lo reintente
  if (error) { console.error('[webhook]', error.message); return new Response('error', { status: 500 }); }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
});
